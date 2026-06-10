import {
  buildDateRuleContext,
  validateAdvanceNotification,
  validateJpExportReservationDate,
  validateJpExportVisitDate,
  validateJpImportDate,
  validateKrImportDate,
  validateMicrochipBeforeBooster,
  validateRabiesInterval,
  validateRabiesPrimeAge,
  validateTiterAfterBooster,
  validateTiterWithinChain,
} from '../journey-steps/date-rules'
import { findRabiesChainBreak } from '../journey-steps/rabies-chain'
import type { ProcedureCheck } from './types'
import {
  addDays,
  addYears,
  daysBetween,
  formatKoreanDate,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 일본 수출 관련 절차 검증.
 *
 * 규칙: 필수 입력이 하나라도 누락되면 검증 대상 아님 → skip (ok: true, 색상·알림 없음).
 * 데이터가 들어오면 그때 비로소 평가.
 *
 * 새 체크 추가 방법:
 * 1) 아래 배열에 ProcedureCheck 객체 추가
 * 2) id 는 'jp.' + kebab-case, 전역 유일
 * 3) run 있으면 실제 검증, 없으면 카탈로그 표시만
 * 4) offendingPaths 로 문제 필드 경로를 알려주면 상세페이지에서 색상·툴팁 표시
 */

export const JP_CHECKS: ProcedureCheck[] = [
  {
    id: 'jp.rabies-prime-after-91days-old',
    country: 'japan',
    category: '광견병',
    title: '광견병 백신 타이밍',
    description: '광견병 1차 접종일은 생년월일 기준 91일 이후여야 함.',
    // 1차 입력 시 client 입력 불가, 출생일·1차 수정 후 주의. 일본 기준 91일(목적지별 차이는 후속).
    severity: 'warning',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      // 단일 출처 — client 입력 차단과 같은 함수.
      const msg = validateRabiesPrimeAge(birth, first.date)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: [`rabies_dates[${first.originalIndex}].date`] }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 91일 이후.` }
    },
  },
  {
    id: 'jp.rabies-titer-chain-consistent',
    country: 'japan',
    category: '광견병',
    title: '광견병 항체 검사 일정',
    description:
      '일본은 광견병 1차 + 2차 접종 후 항체 검사(RNATT) 가 필수. 항체 검사가 입력된 상태에서 선행 광견병 접종(1차·2차)이 누락이거나 항체보다 늦으면 주의.',
    // 채혈은 client 에서 입력 차단됨(step-detail-view validateTiterAfterBooster).
    // 이 룰은 앞 단계(1·2차)를 수정해 RNATT 가 어긋나는 경로(client 미차단)를 '주의'로
    // 표면화. 일본은 2차도 필수라 국가 단위에서 처리(NZ/EU/AU/UK 등 1차만 요구하는 국가
    // 에는 해당 국가 파일에 별도 룰을 두면 됨 — country: 'all' 분류 금지).
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow }) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      const rabies = readRabiesEntries(caseRow)
      const titerDate = titers.map((t) => t.date).sort()[0]

      // 시간 순서 위반 — client 입력 차단과 같은 domain 함수(단일 출처).
      const orderMsg = validateTiterAfterBooster(
        rabies.slice(0, 2).map((r) => r.date),
        titerDate,
      )
      if (orderMsg) {
        return { ok: false, message: orderMsg, offendingPaths: ['rabies_titer_records'] }
      }
      // 선행 누락 — 가까운 선행(2차) 우선, 그 다음 1차.
      if (rabies.length < 2) {
        const missing = rabies.length === 0 ? '광견병 1차' : '광견병 2차'
        return {
          ok: false,
          message: `${missing} 정보가 없습니다. 입력하세요.`,
          offendingPaths: ['rabies_titer_records'],
        }
      }
      return { ok: true, message: '항체 검사일이 광견병 백신 이후.' }
    },
  },
  {
    id: 'jp.rabies-prime-booster-interval',
    country: 'japan',
    category: '광견병',
    title: '광견병 백신 타이밍',
    description: '1차·2차 광견병 접종일 간격이 30일 이상이어야 함.',
    // 2차 입력 시점엔 client 입력 차단(step-detail-view getSaveBlockError)이 30일 미만을
    // 막는다. 이 룰은 같은 조건을 매 렌더 재실행해 — 1차를 나중에 수정해 간격이 깨졌을 때
    // 2차 step 에 '주의'로 표면화한다(입력 차단은 1차 수정 경로를 못 잡음).
    severity: 'warning',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const entries = readRabiesEntries(caseRow)
      // 1·2차 둘 다 필요 — 하나라도 없으면 skip
      if (entries.length < 2) return SKIP

      const [first, second] = entries
      // 단일 출처 — client 입력 차단과 같은 함수. 순서·간격 위반 메시지 동일.
      const msg = validateRabiesInterval(first.date, second.date)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: [`rabies_dates[${second.originalIndex}].date`] }
      }
      return { ok: true, message: `1·2차 접종 간격 OK.` }
    },
  },
  {
    id: 'jp.rabies-booster-within-prime-validity',
    country: 'japan',
    category: '광견병',
    title: '백신 유효기간 만료',
    description:
      '2차 광견병 접종은 1차 접종의 면역 유효기간 이내여야 함. 유효기간 경과 후 접종은 추가접종이 아닌 새 기초접종으로 간주됨.',
    // 2차 입력 시 client 차단 + 1차 수정 후 재검증 '주의' (30일 간격 룰과 동일 패턴).
    severity: 'warning',
    addedAt: '2026-05-16',
    run: ({ caseRow }) => {
      const entries = readRabiesEntries(caseRow)
      // 1·2차 둘 다 필요 — 하나라도 없으면 skip
      if (entries.length < 2) return SKIP

      // 단일 출처 — 부스터 chain 검증(findRabiesChainBreak). 1·2차만 보고, 2차가 1차 면역
      // 유효기간(resolveValidUntil) 밖이면 위반. 3차+ 는 jp.rabies-extra-within-previous-validity.
      // 순서(2차 ≥ 1차)는 jp.rabies-prime-booster-interval 이 담당 — 여기선 유효기간 경과만.
      const brk = findRabiesChainBreak(entries.slice(0, 2))
      if (brk && brk.reason === 'expired') {
        return {
          ok: false,
          message: '2차 광견병 백신은 1차 광견병 백신 면역 유효기간 안에 해야 합니다.',
          offendingPaths: [`rabies_dates[${entries[1].originalIndex}].date`],
        }
      }
      return { ok: true, message: '2차 접종이 1차 유효기간 이내.' }
    },
  },
  {
    id: 'jp.rabies-extra-within-previous-validity',
    country: 'japan',
    category: '광견병',
    title: '백신 유효기간 만료',
    description:
      '추가(3차+) 광견병 접종은 직전 광견병 백신의 면역 유효기간 이내여야 함. 유효기간 경과 후 접종은 부스터가 아닌 새 기초접종으로 간주됨.',
    severity: 'info',
    addedAt: '2026-05-24',
    run: ({ caseRow, destination }) => {
      const entries = readRabiesEntries(caseRow)
      // 3차+ 가 있어야 검사 대상.
      if (entries.length < 3) return SKIP

      // 전체 chain 순차 검증(findRabiesChainBreak). 3차+ 에서 끊긴 경우만 — 2차 끊김은
      // jp.rabies-booster-within-prime-validity 담당. (단일 출처: client·B 와 같은 함수.)
      // 순서 위반(too-early)은 입력 단계에서 거부되므로 안내하지 않는다 — 나중에 앞 차수를
      // 수정해 깨지는 '유효기간 경과(expired)'만 '주의'로 표면화. (입력 차단이 못 잡는 경로.)
      const brk = findRabiesChainBreak(entries)
      if (brk && brk.brokenAt >= 3 && brk.reason === 'expired') {
        const broken = entries[brk.brokenAt - 1]
        return {
          ok: false,
          message: `${brk.brokenAt - 1}차 백신 유효기간이 만료된 뒤 ${brk.brokenAt}차를 접종했습니다. 접종일을 확인하세요.`,
          offendingPaths: [`rabies_dates[${broken.originalIndex}].date`],
        }
      }
      return { ok: true, message: '추가 접종이 직전 유효기간 이내.' }
    },
  },
  {
    id: 'jp.microchip-rabies-sequence',
    country: 'japan',
    category: '마이크로칩',
    title: '마이크로칩, 접종, 검사 타이밍',
    description:
      '① 마이크로칩 ≤ 1차 < 2차 ≤ 항체 검사, 또는 ② 1차 < 마이크로칩 ≤ 2차이면서 2차 접종일 = 항체 검사일. 둘 중 하나 충족 필요.',
    // 채혈(항체) 입력 시 client 가 입력 불가로 막고, 입력 후 2차·칩을 수정해 깨지면 이 룰이
    // '주의'로 표면화. 조건 ②(같은 날)는 항체 미입력 시 SKIP 이라 채혈 전(다음 할 일)엔 안 뜸.
    severity: 'warning',
    addedAt: '2026-04-21',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      // 필수: 마이크로칩 + 1·2차 접종 기록
      if (!microchip || rabies.length < 2) return SKIP

      const first = rabies[0]
      const second = rabies[1]
      const titers = readTiterEntries(caseRow)

      // 조건 1: 마이크로칩 ≤ 1차
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 1차 접종(${first.date}).` }
      }

      // 조건 2: 1차 < 마이크로칩 ≤ 2차 AND 2차 == 항체 검사일
      if (microchip <= second.date) {
        // 항체 검사 미입력 → 아직 판정 불가, skip
        if (titers.length === 0) return SKIP
        const matching = titers.find((t) => t.date === second.date)
        if (matching) {
          return {
            ok: true,
            message: `마이크로칩이 1·2차 사이, 2차 접종일과 항체 검사일 동일(${second.date}).`,
          }
        }
        const offending = ['microchip_implant_date']
        for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
        return {
          ok: false,
          message:
            '마이크로칩보다 1차 광견병 백신을 먼저 한 경우, 2차 광견병 백신과 광견병 항체 검사를 같은 날 해야 합니다.',
          offendingPaths: offending,
        }
      }

      // 마이크로칩이 2차보다도 늦음 — client 입력 차단과 같은 domain 함수.
      const chipErr = validateMicrochipBeforeBooster(microchip, second.date)
      if (chipErr) {
        return { ok: false, message: chipErr, offendingPaths: ['microchip_implant_date'] }
      }
      return { ok: true, message: '마이크로칩·접종·검사 타이밍 적합.' }
    },
  },
  {
    id: 'jp.rabies-prime-before-microchip',
    country: 'japan',
    category: '마이크로칩',
    title: '마이크로칩, 접종, 검사 타이밍',
    description:
      '1차 광견병 접종이 마이크로칩 시술보다 앞선 경우 2차 접종을 광견병 항체 검사와 같은 날 받아야 함. 항체 검사 입력 전까지 안내 지속.',
    severity: 'info',
    addedAt: '2026-05-16',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      // 필수: 마이크로칩 시술일 + 1차 접종 기록
      if (!microchip || rabies.length === 0) return SKIP
      // 항체 검사 입력 후에는 jp.microchip-rabies-sequence 가 본 검증 — 사전 안내 종료.
      // (2차 입력만으로는 사라지지 않음 — 보호자가 "2차와 항체 검사를 같은 날" 룰을
      // 잊지 않도록 항체 검사 입력까지 안내 유지.)
      if (readTiterEntries(caseRow).length > 0) return SKIP

      const first = rabies[0]
      if (first.date >= microchip) {
        return { ok: true, message: `1차 접종(${first.date}) ≥ 마이크로칩(${microchip}).` }
      }
      // 마이크로칩 > 1차. 2차도 마이크로칩 전이면 같은 날 룰 적용 불가 — 본 검증
      // ([[jp.microchip-rabies-sequence]])과 동일 메시지로 격상해 항체 입력 전에도 정확히 안내.
      const second = rabies[1]
      if (second && second.date < microchip) {
        return {
          ok: false,
          message: '마이크로칩이 2차 광견병 백신보다 늦습니다. 마이크로칩 삽입일 혹은 접종일을 수정하세요.',
          offendingPaths: [
            'microchip_implant_date',
            `rabies_dates[${first.originalIndex}].date`,
            `rabies_dates[${second.originalIndex}].date`,
          ],
        }
      }
      return {
        ok: false,
        message:
          '마이크로칩보다 1차 광견병 백신을 먼저 한 경우, 2차 광견병 백신과 광견병 항체 검사를 같은 날 해야 합니다.',
        offendingPaths: ['microchip_implant_date', `rabies_dates[${first.originalIndex}].date`],
      }
    },
  },
  {
    id: 'jp.rabies-titer-vs-booster',
    country: 'japan',
    category: '광견병',
    title: '광견병 항체 검사 타이밍',
    description:
      '채혈일은 2차부터 끊김 없이 이어진 부스터 chain 의 면역 유효기간 이내여야 함 (규칙 B).',
    // 채혈 입력 시 client 가 입력 불가로 막고(validateTiterWithinChain 공용), 입력 후 부스터를
    // 수정해 채혈이 유효기간 밖으로 밀려나면 '주의'. 채혈≥2차(규칙 A)는
    // common.rabies-titer-chain-consistent 가 담당 — 여기는 chain 만료(B)만 본다.
    severity: 'warning',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      // 필수: 2차 접종 기록 + 1개 이상의 항체 검사
      if (rabies.length < 2 || titers.length === 0) return SKIP

      // 단일 출처 — client 입력 차단과 같은 함수. boosters = 2차부터(입력 순서).
      const boosters = rabies.slice(1)
      const offendingPaths: string[] = []
      for (const t of titers) {
        if (validateTiterWithinChain(boosters, t.date)) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
        }
      }
      if (offendingPaths.length > 0) {
        return {
          ok: false,
          message: '채혈일이 광견병 백신 면역 유효기간을 벗어났습니다. 접종일, 유효기간, 채혈일을 수정하세요.',
          offendingPaths,
        }
      }
      return { ok: true, message: '항체 검사 시기 적합.' }
    },
  },
  {
    id: 'jp.entry-180days-after-titer',
    country: 'japan',
    category: '광견병',
    title: '일본 입국 타이밍',
    description: '항공편 입국일은 광견병 항체 검사 채혈일로부터 180일이 지난 시점이어야 함.',
    severity: 'warning',
    addedAt: '2026-05-17',
    run: ({ caseRow, destination }) => {
      // 한일 노선 = 출국일이 일본 입국일 — departure_date 사용.
      const entryDate = readDepartureDate(caseRow, destination) ?? ''
      const titers = readTiterEntries(caseRow)
      // 필수: 출국일(=입국일) + 1개 이상의 항체 검사
      if (!entryDate || titers.length === 0) return SKIP

      let best: { titer: (typeof titers)[number]; days: number } | null = null
      for (const t of titers) {
        const days = daysBetween(t.date, entryDate)
        if (days === null) continue
        if (!best || days > best.days) best = { titer: t, days }
      }
      if (best && best.days >= 180) {
        return { ok: true, message: `항체 검사(${best.titer.date}) → 입국일(${entryDate}): ${best.days}일` }
      }
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      if (!best) {
        return { ok: false, message: '항체 검사일과 입국일을 확인할 수 없습니다.', offendingPaths: offending }
      }
      // 입국 가능일 = 채혈일 + 180일. 입국일 < 항체 검사일(시간 역순) 케이스도 같은
      // 메시지로 커버 — earliestKr 가 항체 검사일 + 180일이라 항상 정확.
      const earliestKr = formatKoreanDate(addDays(best.titer.date, 180))
      return {
        ok: false,
        message: `검사일로부터 180일 후에 일본에 입국할 수 있습니다. ${earliestKr} 이후 일본에 입국할 수 있습니다.`,
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'jp.entry-within-2years-of-titer',
    country: 'japan',
    category: '광견병',
    title: '광견병 항체 검사 유효기간 만료',
    description: '항공편 입국일은 광견병 항체 검사 채혈일 포함 2년 이내여야 함 (항체 검사 유효기간).',
    severity: 'warning',
    addedAt: '2026-05-17',
    run: ({ caseRow, destination }) => {
      // 한일 노선 = 출국일이 일본 입국일 — departure_date 사용.
      const entryDate = readDepartureDate(caseRow, destination) ?? ''
      const titers = readTiterEntries(caseRow)
      if (!entryDate || titers.length === 0) return SKIP

      // 입국일 이전에 한 채혈만 그 입국을 보증할 수 있음 — 입국 후(또는 미래) 채혈은
      // 자기 +2년이 당연히 입국일보다 뒤라 '유효'로 오판되므로 t.date <= 입국일 조건 필수.
      const valid = titers.find((t) => t.date <= entryDate && addYears(t.date, 2) >= entryDate)
      if (valid) {
        return {
          ok: true,
          message: `항체 검사(${valid.date}) 유효(${addYears(valid.date, 2)}) ≥ 입국일(${entryDate}).`,
        }
      }
      // 만료일 메시지는 입국일 이전 채혈 중 가장 최근 것의 유효기간(= 현재 유효기간)을 보여준다.
      // 입국 전 채혈이 하나도 없으면 전체 중 가장 최근으로 폴백.
      const prior = titers.filter((t) => t.date <= entryDate)
      const newest = [...(prior.length ? prior : titers)].sort((a, b) => b.date.localeCompare(a.date))[0]
      const validUntilKr = formatKoreanDate(addYears(newest.date, 2))
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `광견병 항체 검사 유효기간이 ${validUntilKr}에 만료됩니다. 일본 입국 전 재검사가 필요합니다.`,
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'jp.advance-notification-40days-before-entry',
    country: 'japan',
    category: '일정',
    title: '사전 신고는 입국 40일 전까지',
    description: '일본 동물검역소 사전 신고(NACCS)는 입국일로부터 40일 이전에 접수되어야 함.',
    severity: 'warning',
    addedAt: '2026-05-17',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const notif =
        typeof data.advance_notification_date === 'string' ? data.advance_notification_date : ''
      // 한일 노선 = 출국일이 일본 입국일.
      const entry = readDepartureDate(caseRow, destination) ?? ''
      // 필수: 사전 신고 신청일 + 출국일(=입국일)
      if (!notif || !entry) return SKIP
      // 단일 출처 — client 입력 차단과 같은 함수.
      const msg = validateAdvanceNotification(notif, entry)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['advance_notification_date', 'departure_date'] }
      }
      return { ok: true, message: '사전 신고 마감 이내.' }
    },
  },
  {
    id: 'jp.rabies-valid-until-on-departure',
    country: 'japan',
    category: '광견병',
    title: '광견병 백신 유효기간 만료',
    description: '입국일에 가장 최근 광견병 접종의 면역 유효기간이 만료되지 않아야 함.',
    severity: 'info',
    addedAt: '2026-04-21',
    run: ({ caseRow, destination }) => {
      // 한일 노선 = 출국일이 일본 입국일 — departure_date 단일 권위.
      const dep = readDepartureDate(caseRow, destination) ?? ''
      const rabies = readRabiesEntries(caseRow)
      // 항체 검사 입력 전에는 입국 시기가 확정되지 않아 평가 불가 — 같은 step(항공권 구매)의
      // jp.entry-* 체크와 동일하게 titer 입력 후에만 평가한다. 그 전의 백신 만료는 항공권
      // 구매 step 이 아니라 '추가 백신' advisory step 이 재접종으로 안내한다.
      if (!dep || rabies.length === 0 || readTiterEntries(caseRow).length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP

      if (validUntil < dep) {
        // 이미 만료(과거)와 입국 전 만료 예정(미래) 분기 — '추가 백신' 카드·situational 과 동일 문구.
        const message =
          validUntil < todayKst()
            ? `광견병 백신 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었습니다. 추가 접종 기록을 입력하세요.`
            : `광견병 백신 유효기간이 ${formatKoreanDate(validUntil)}에 만료됩니다. 만료 전에 추가 접종을 하세요.`
        return {
          ok: false,
          message,
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 입국일(${dep}).` }
    },
  },
  {
    id: 'jp.rabies-validity-expires-soon',
    country: 'japan',
    category: '광견병',
    title: '광견병 백신 유효기간 만료 임박',
    description: '광견병 백신 면역 유효기간이 오늘로부터 30일 이내로 남았을 때 사전 안내.',
    severity: 'info',
    addedAt: '2026-05-21',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination) ?? ''
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      // chain 이 깨진 경우(순서 위반·만료 후 접종)는 jp.rabies-extra-within-previous-validity 가
      // 안내 — '만료 임박' 안내를 중복으로 얹지 않는다.
      if (findRabiesChainBreak(rabies)) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 입국일 전 만료 케이스는 blocker(jp.rabies-valid-until-on-departure)가 잡음 — info 는 SKIP.
      if (dep && validUntil < dep) return SKIP
      // 이미 만료된 경우는 '임박'이 아님 — 타임라인/카드 situational 이 '만료되었습니다'로 안내한다.
      if (validUntil < todayKst()) return SKIP

      // 만료 30일 전부터 사전 안내 — 입국일과 무관하게 오늘 기준. (제목 '만료 임박'과 일치)
      const threshold = addDays(todayKst(), 30)
      if (!threshold || validUntil >= threshold) {
        return { ok: true, message: `만료(${validUntil}) ≥ 오늘+30일.` }
      }
      return {
        ok: false,
        message: `광견병 백신 유효기간이 ${formatKoreanDate(validUntil)}에 만료됩니다. 만료 전에 추가 접종을 하세요.`,
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`],
      }
    },
  },
  {
    id: 'jp.titer-validity-expires-soon',
    country: 'japan',
    category: '광견병',
    title: '광견병 항체 검사 유효기간 만료 임박',
    description: '광견병 항체 검사 유효기간(2년)이 오늘로부터 30일 이내로 남았을 때 사전 안내.',
    severity: 'info',
    addedAt: '2026-05-21',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination) ?? ''
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP

      const latest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const validUntil = addYears(latest.date, 2)
      if (!validUntil) return SKIP
      // 입국일 전 만료 케이스는 blocker(jp.entry-within-2years-of-titer)가 잡음 — info 는 SKIP.
      if (dep && validUntil < dep) return SKIP

      // 만료 30일 전부터 사전 안내 — 입국일과 무관하게 오늘 기준.
      const threshold = addDays(todayKst(), 30)
      if (!threshold || validUntil >= threshold) {
        return { ok: true, message: `만료(${validUntil}) ≥ 오늘+30일.` }
      }
      const offending: string[] = []
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `광견병 항체 검사 유효기간이 ${formatKoreanDate(validUntil)}에 만료됩니다. 만료 전 재검사를 하세요.`,
        offendingPaths: offending,
      }
    },
  },
  // ── 검역·검사 일정 자기 검증 (일본) ────────────────────────────────────
  // 입력 시점 server action 차단과 같은 함수를 재실행 — 앞 단계(항공편 등)를 수정해
  // 이미 입력된 후행 일정이 어긋났을 때 '주의'로 표면화한다.
  {
    id: 'jp.export-quarantine-reservation-date-valid',
    country: 'japan',
    category: '검역',
    title: '일본 수출 동물검역 예약일',
    description: '일본 수출 동물검역 예약일은 일본 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.jp_export_quarantine_date === 'string'
          ? data.jp_export_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateJpExportReservationDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['jp_export_quarantine_date'] }
      }
      return { ok: true, message: `예약일(${raw}) 일본 체류 구간 내.` }
    },
  },
  {
    id: 'jp.export-quarantine-visit-date-valid',
    country: 'japan',
    category: '검역',
    title: '일본 수출 동물검역일',
    description: '일본 수출 동물검역일은 일본 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.jp_export_quarantine_visit_date === 'string'
          ? data.jp_export_quarantine_visit_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateJpExportVisitDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['jp_export_quarantine_visit_date'] }
      }
      return { ok: true, message: `검역일(${raw}) 일본 체류 구간 내.` }
    },
  },
  {
    id: 'jp.import-quarantine-date-valid',
    country: 'japan',
    category: '검역',
    title: '일본 수입 동물검역일',
    description: '일본 수입 동물검역일은 일본 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.jp_import_quarantine_date === 'string'
          ? data.jp_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateJpImportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['jp_import_quarantine_date'] }
      }
      return { ok: true, message: `일본 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'jp.kr-import-quarantine-date-valid',
    country: 'japan',
    category: '검역',
    title: '한국 수입 동물검역일',
    description: '한국 수입 동물검역일은 한국 귀국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kr_import_quarantine_date === 'string'
          ? data.kr_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateKrImportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['kr_import_quarantine_date'] }
      }
      return { ok: true, message: `한국 수입검역일(${raw}) 귀국 이후.` }
    },
  },
]
