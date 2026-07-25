import type { ProcedureCheck } from './types'
import { buildDateRuleContext, validateTiterAfterBooster, validateTiterWithinChain } from '../journey-steps/date-rules'
import { findRabiesChainBreak } from '../journey-steps/rabies-chain'
import {
  addDays,
  addYears,
  daysBetween,
  evaluateRabiesAgeConservative,
  exceedsValidityYears,
  findRabiesValidityBreaks,
  findSameGuardianCases,
  formatKoreanDate,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore } from './messages'

/**
 * 중국 (GACC — General Administration of Customs of China, 海关总署) 절차 검증.
 *
 * 한국 = **비지정국** → 광견병 항체 검사(RNATT) 필수.
 *  - 지정 19개국 (호주·NZ·미국·일본·홍콩·싱가포르 등) 은 RNATT 면제 + 격리 면제
 *  - 비지정국에서 입국 시: 마이크로칩 + RNATT ≥0.5 IU/ml + 현장검역 합격 → 격리 면제,
 *    미충족 시 GACC 지정 격리시설에서 30일
 *
 * 출처:
 *  - GACC 公告 2019年第5号 — http://www.customs.gov.cn/customs/302249/302266/302267/2167536/index.html
 *  - GACC 채신 실험실 명단 (2025-08-15 갱신) — http://www.customs.gov.cn/dzs/2746776/3323864/index.html
 *
 * ⚠️ 핵심 룰:
 *  - **항체가 ≥ 0.5 IU/ml** (GACC 2019 No.5 제2조 명시)
 *  - **GACC 채신 명단 lab** 발급 보고서 — 농림축산검역본부·코미팜혈청연구소 모두 인정
 *    (2026-07-19 사용자 확인. 이전 주석은 '한국 lab 미포함 → 일본/미국 송부'라고 단정했으나
 *     사실과 달라 정정. 검사기관 선택지는 titer-labs.ts 기본값을 그대로 쓴다.)
 *  - **마이크로칩 ISO 11784/11785, 15자리** (제1조 명시)
 *  - **1인당 1회 1마리** 한도 (제1조)
 *  - 입경 14일 이내 임상검사 (해관 답변; 한국 APQA 10일 룰이 더 strict, 보수 ≤9 적용)
 *
 * 운용 룰 (GACC 본문 명문 부재 — 실무·OIE 기반 보수 적용):
 *  - 광견병 1차 ≥ 생후 91일령 (OIE 표준)
 *  - 광견병 2회 접종, 30일~1년 간격, RNATT 충족 위해 사실상 필요
 *  - 1년 라이선스 백신만 인정 (실무 — GACC 본문은 "유효기간 내"만 명시)
 *  - RNATT 유효기간 1년 (실무 — GACC 본문 미명시)
 *
 * 컨벤션 (NZ/HI 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "이상" 경계 inclusive (`addYears(date, 1) ≥ dep` — 1주년 당일까지 유효)
 */

const COUNTRY = 'china'

export const CN_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'cn.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785, 15자리)이 광견병 1차 접종일과 같거나 이전이어야 함. 칩 미이식 또는 규격 미충족 시 30일 격리. (강아지는 한국 동물등록 별도 필수)',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 1차 접종(${first.date}).` }
      }
      // 고객 노출 문구엔 날짜를 넣지 않는다(일본·태국·필리핀과 동일 방식) — 어느 기록이
      // 문제인지는 offendingPaths 가 해당 입력칸을 짚어준다. 날짜는 ok:true 내부 기록에만.
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'cn.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'GACC 2019 No.5 본문 정량 미명시 (OIE 표준 차용) — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요. 출생일에 따라 어느 쪽이 더 엄격한지 달라지므로 AND 결합.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const ev = evaluateRabiesAgeConservative(birth, first.date)
      if (ev.ageInDays === null) return SKIP
      if (!ev.ok) {
        // 고객 노출 문구엔 날짜·내부용어('보수적 기준')를 넣지 않는다(태국 '생후 84일(12주)'와
        // 동일 형식). 91일과 캘린더 3개월은 출생일에 따라 어느 쪽이 늦은지 달라져 AND 로 보므로
        // 둘 다 적는다 — 한쪽만 적으면 통과한 기준을 보고 왜 주의가 뜨는지 알 수 없다.
        return {
          ok: false,
          message: '광견병 접종은 생후 91일과 3개월이 모두 지난 후에 할 수 있어요.',
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  // cn.rabies-2-doses-required 제거(2026-07-18) — GACC 조문에 횟수 명시 없고, 2차 카드 +
  // cn.rabies-titer-chain-consistent("2차 정보 없어요")로 이미 안내돼 중복(일본과 동일 방식).
  {
    // 30일 최소 간격은 GACC 근거 없는 보수 추정이라 검증하지 않는다(문구도 '명확한 규정은 없지만
    // …좋아요'로 권고 처리). 여기선 '직전 접종 유효기간 이내'(부스터 chain)만 본다 — portal 은
    // 입력 차단이 담당하고, 이 주의는 1차를 나중에 수정해 chain 이 깨진 경우의 backstop.
    id: 'cn.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 부스터는 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 부스터 chain 이 끊겨 1차로 간주.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP

      // 판정은 공용 헬퍼 — 베트남·대만도 같은 함수를 쓴다(2026-07-20 공용화, 무동작 리팩터).
      const offending = findRabiesValidityBreaks(rabies)
      if (offending.length > 0) {
        // 문구는 한 번만 — 끊긴 구간마다 날짜를 나열하면 고객 문구에 날짜가 샌다.
        // 어느 접종 기록이 문제인지는 offendingPaths 가 그 입력칸을 짚는다.
        return {
          ok: false,
          message: '광견병 백신은 직전 접종의 면역 유효기간 안에 다시 접종해야 해요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 인접 광견병 도즈가 직전 접종 유효기간 이내.' }
    },
  },
  {
    id: 'cn.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (2년/3년 거부)',
    description:
      '실무상 면역 유효기간 2년·3년짜리 광견병 백신을 인정하지 않음. valid_until 이 접종일 + 1년(달력, 그날 포함) 초과면 거부. (GACC 본문은 "유효기간 내"만 명시 — 일부 입국항 운용 거부 사례 존재, 보수 적용)',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const violations: Array<{ entry: typeof rabies[number]; validUntil: string }> = []
      for (const r of rabies) {
        // valid_until 미입력은 디폴트 1년 → OK. 명시값만 1년 한도와 비교(exceedsValidityYears).
        if (exceedsValidityYears(r.date, r.valid_until)) {
          violations.push({ entry: r, validUntil: resolveValidUntil(r.date, r.valid_until) })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(`rabies_dates[${v.entry.originalIndex}].valid_until`)
          msgs.push('광견병 백신은 면역 유효기간 1년짜리만 인정돼요. 2년·3년 백신은 사용할 수 없어요.')
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 광견병 백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'cn.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 도착일 이전 만료되지 않아야 함. 만료 시 추가 부스터 필요. (GACC: "유효한 광견병 백신 접종 증명서" 입경일 기준 유효)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-extra-validity-expired '주의'가 담당 — 여기선
      // 아직 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: msgRabiesExpiredBefore('출국'),
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },
  {
    // 일본(jp.rabies-validity-expires-soon)과 동일 — 만료 30일 전부터 추가 접종 사전 안내.
    // 입국 전 만료는 cn.rabies-not-expired-on-arrival, chain 끊김은 아래가 담당.
    id: 'cn.rabies-validity-expires-soon',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 백신 면역 유효기간 만료 임박',
    description: '광견병 백신 면역 유효기간이 오늘로부터 30일 이내로 남았을 때 사전 안내.',
    // 만료 안내는 **날짜가 정보 자체**다(언제까지인지 모르면 안내가 성립 안 함).
    // lint:checks 가 info 도 검사하게 되면서 드러났고, 의도된 예외로 선언한다(2026-07-21).
    allowDate: true,
    severity: 'info',
    addedAt: '2026-07-18',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination) ?? ''
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      if (findRabiesChainBreak(rabies)) return SKIP
      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      if (dep && validUntil < dep) return SKIP
      if (validUntil < todayKst()) return SKIP
      const threshold = addDays(todayKst(), 30)
      if (!threshold || validUntil >= threshold) {
        return { ok: true, message: `만료(${validUntil}) ≥ 오늘+30일.` }
      }
      return {
        ok: false,
        message: `광견병 백신 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료돼요. 만료 전에 추가 접종을 하세요.`,
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`],
      }
    },
  },
  {
    // 일본(jp.rabies-extra-within-previous-validity)과 동일 — 3차+ 접종이 직전 유효기간 밖이면 주의.
    // 2차 끊김은 cn.rabies-booster-within-prime-validity 담당. 순서 위반(too-early)은 입력 차단.
    id: 'cn.rabies-extra-within-previous-validity',
    country: COUNTRY,
    category: '광견병',
    title: '백신 면역 유효기간 만료',
    description:
      '추가(3차+) 광견병 접종은 직전 광견병 백신의 면역 유효기간 이내여야 함. 유효기간 경과 후 접종은 부스터가 아닌 새 기초접종으로 간주됨.',
    severity: 'warning',
    addedAt: '2026-07-18',
    run: ({ caseRow }) => {
      const entries = readRabiesEntries(caseRow)
      if (entries.length < 3) return SKIP
      const brk = findRabiesChainBreak(entries)
      if (brk && brk.brokenAt >= 3 && brk.reason === 'expired') {
        const broken = entries[brk.brokenAt - 1]
        return {
          ok: false,
          message: `${brk.brokenAt - 1}차 백신 면역 유효기간이 만료된 뒤 ${brk.brokenAt}차를 접종했어요. 날짜를 확인하세요.`,
          offendingPaths: [`rabies_dates[${broken.originalIndex}].date`],
        }
      }
      return { ok: true, message: '추가 접종이 직전 유효기간 이내.' }
    },
  },

  // ── RNATT (광견병 항체 검사) ──
  // '채혈은 접종 이후' backstop 은 cn.rabies-titer-chain-consistent(일본과 동일)가 흡수 —
  // 구 cn.rnatt-after-rabies-vaccine(info, "접종 기록이 없어요")은 중복이라 제거(2026-07-18).
  // (≥0.5 IU/ml 결과치 룰은 의도적 제외 — 검사기관에서 이미 fail 결과 나옴, 시스템 검증 불필요)
  {
    id: 'cn.rnatt-valid-1year-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사 유효기간 1년 — 도착일까지 유효',
    description:
      'RNATT 결과는 채혈일 기준 1년간 유효 (실무 기준). 도착일이 채혈일 + 1년 이내여야 함. (GACC 본문 미명시 — 실무 운용상 1년 한도 보수 적용)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `RNATT(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}). ${days}일 경과.` }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const expiry = addYears(newest.date, 1)
      // 이미 만료(오늘 기준)는 cn.rnatt-validity-expired '주의'가 담당 — 여기선 아직 유효한데
      // 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (expiry < todayKst()) return SKIP
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: '광견병 항체 검사는 중국 입국일 기준 1년 이내여야 해요. 유효기간이 지나 다시 검사해야 해요.',
        offendingPaths: offending,
      }
    },
  },
  {
    // '이미 만료(오늘 기준)' 주의 — common.titer-extra-validity-expired 의 중국판. 중국은
    // 추가 검사 카드가 없어(대기·연장 개념 없음 — 만료돼도 아무 때나 재검사해 그 결과로 입국)
    // 본 항체 카드(rabies-titer)에 붙는다. 배선은 destination-overrides 중국 rabies-titer
    // validationIds. (만료 재구성 B, 2026-07-25)
    id: 'cn.rnatt-validity-expired',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 항체 검사 유효기간 만료',
    description:
      'RNATT 결과는 채혈일 기준 1년간 유효 — 오늘 기준 이미 만료면 재검사 필요. 중국은 재검사 후 대기 없이 새 결과로 입국 가능.',
    // 만료 안내는 **날짜가 정보 자체**다(언제 만료됐는지 모르면 안내가 성립 안 함).
    allowDate: true,
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow }) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      const latest = [...titers].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      // 미래(예정) 채혈이 잡혀 있으면 만료 경고 대상 아님(scheduled 병합 뷰).
      if (latest.date > todayKst()) return SKIP
      const validUntil = addYears(latest.date, 1)
      if (!validUntil) return SKIP
      if (validUntil >= todayKst()) {
        return { ok: true, message: `최근 채혈(${latest.date}) 유효기간(${validUntil}) ≥ 오늘.` }
      }
      return {
        ok: false,
        message: `광견병 항체 검사 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 다시 검사해야 해요.`,
        offendingPaths: [`rabies_titer_records[${latest.originalIndex}].date`],
      }
    },
  },
  {
    // 일본(jp.rabies-titer-chain-consistent)과 동일한 backstop — 중국도 2회 접종 후 항체검사라,
    // 항체가 입력된 상태에서 선행 접종(1·2차)이 누락이거나 항체보다 늦으면 주의. 정상 입력은 입력
    // 차단이 막지만, 나중에 접종일을 지워 chain 이 깨지는 경로(입력 차단 미포착)를 표면화한다.
    id: 'cn.rabies-titer-chain-consistent',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 항체 검사 일정',
    description:
      '중국은 광견병 1차 + 2차 접종 후 항체 검사(RNATT)가 필수. 항체 검사가 입력된 상태에서 선행 광견병 접종(1차·2차)이 누락이거나 항체보다 늦으면 주의.',
    severity: 'warning',
    addedAt: '2026-07-18',
    run: ({ caseRow }) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      const rabies = readRabiesEntries(caseRow)
      const titerDate = titers.map((t) => t.date).sort()[0]

      // 시간 순서 위반(채혈 < 1·2차) — client 입력 차단과 같은 domain 함수(단일 출처).
      const orderMsg = validateTiterAfterBooster(
        rabies.slice(0, 2).map((r) => r.date),
        titerDate,
        true, // 2회 접종국 — 메시지를 '2차 접종 후에 받아야 해요'로
      )
      if (orderMsg) {
        return { ok: false, message: orderMsg, offendingPaths: ['rabies_titer_records'] }
      }
      // 선행 누락 — 가까운 선행(2차) 우선, 그 다음 1차.
      if (rabies.length < 2) {
        const missing = rabies.length === 0 ? '광견병 1차' : '광견병 2차'
        return {
          ok: false,
          message: `${missing} 정보가 없어요. 입력하세요.`,
          offendingPaths: ['rabies_titer_records'],
        }
      }
      return { ok: true, message: '항체 검사일이 광견병 백신 이후.' }
    },
  },
  {
    // 일본(jp.rabies-titer-vs-booster)과 동일 — 1차(기준) 채혈이 부스터 chain 의 면역 유효기간을
    // 벗어나면 주의. 정상 입력은 입력 차단(validateTiterWithinChain 공용, validateTiterDate 안)이
    // 막고, 입력 후 부스터를 수정해 채혈이 유효기간 밖으로 밀려난 경우를 표면화하는 backstop.
    id: 'cn.rabies-titer-vs-booster',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 항체 검사 타이밍',
    description:
      '1차(기준) 채혈일은 2차부터 끊김 없이 이어진 부스터 chain 의 면역 유효기간 이내여야 함.',
    severity: 'warning',
    addedAt: '2026-07-18',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      // 필수: 2차 접종 기록 + 1개 이상의 항체 검사
      if (rabies.length < 2 || titers.length === 0) return SKIP

      // 1차(기준) 항체 검사만 본다 — 이 규칙은 '광견병 항체 검사' step 에 매핑되므로.
      const boosters = rabies.slice(1)
      const primary = titers.find((t) => t.originalIndex === 0)
      if (!primary) return SKIP
      if (validateTiterWithinChain(boosters, primary.date)) {
        return {
          ok: false,
          message: '채혈일이 광견병 백신 면역 유효기간을 벗어났어요. 날짜를 확인하세요.',
          offendingPaths: ['rabies_titer_records[0].date'],
        }
      }
      return { ok: true, message: '항체 검사 시기 적합.' }
    },
  },

  // ── 보호자 1인 1마리 한도 (cross-case) ──
  {
    id: 'cn.one-pet-per-guardian',
    country: COUNTRY,
    category: '서류',
    title: '1인당 1회 1마리 한도 (GACC)',
    description:
      'GACC 公告 2019 No.5 제1조: "携带或者托运入境的活动物仅限犬或者猫，每人每次限带1只" — 1인 1회 1마리 한정. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 중국 목적 케이스를 2건 이상 등록하면 경고.',
    severity: 'warning',
    // relatedCases 는 펫무브워크만 전달 — 보호자 이름·건수가 필요한 운영자용 룰.
    audience: 'staff',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases, destination }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length >= 1) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 중국 목적 케이스를 ${others.length + 1}건 등록하여 GACC 1인 1마리 한도를 초과했어요.`,
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '동일 보호자 다중 등록 없음.' }
    },
  },
  // ── 도착 수입 검역 ──
  // 카드(journey-steps 'departure')가 이 룰을 validationIds 로 지목한다. 예전엔 base 카드의
  // jp.import-quarantine-date-valid 를 그대로 물려받아, 중국 케이스에선 검증이 아예 돌지
  // 않았다(룰의 country 가 japan 이라 실행 대상에서 빠짐). 태국·필리핀·EU 와 같은 모양으로 추가.
  {
    id: 'cn.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '중국 수입 검역일',
    description: '중국 수입 검역일은 중국 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-19',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.cn_import_quarantine_date === 'string' ? data.cn_import_quarantine_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '중국 수입 검역일은 중국 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['cn_import_quarantine_date'],
        }
      }
      return { ok: true, message: `중국 수입검역일(${raw}) 입국 이후.` }
    },
  },
  // ── 귀국 전 현지 수출 검역 ──
  // 태국(th)·필리핀(ph) 룰과 같은 모양 — 나라 이름과 필드명만 다르다. 검증 내용은
  // "중국에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다.
  {
    id: 'cn.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '중국 수출 검역일',
    description: '중국 수출 검역일은 중국 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-07-19',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.cn_export_quarantine_date === 'string' ? data.cn_export_quarantine_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const ret =
        typeof ctx.data.return_date === 'string' && ctx.data.return_date.length >= 10
          ? ctx.data.return_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '중국 수출 검역일은 중국 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['cn_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '중국 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['cn_export_quarantine_date'],
        }
      }
      return { ok: true, message: `중국 수출검역일(${raw}) 중국 체류 구간 내.` }
    },
  },
]
