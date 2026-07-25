import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  evaluateRabiesAgeConservative,
  readExternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  type TiterEntry,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 하와이 (HDOA — Hawaii Department of Agriculture, Animal Quarantine Station) 절차 검증.
 *
 * 적용 프로그램: **Direct Airport Release (DAR) & 5-Day-Or-Less** (HNL/Honolulu).
 * 출처: dab.hawaii.gov — Checklist 1 (2018-08-31 갱신, 2026 현재 유효).
 *
 * ⚠️ Hawaii 는 미국 본토 검역 통과 후 별도 검역. 한국발 직항/경유 모두 동일 룰.
 *  → 개·고양이 동일 절차. 종 분기 거의 없음.
 *  → 광견병 백신 = 2회 평생 (1차+부스터). 부스터는 1년 또는 3년 라이선스.
 *  → FAVN 검체 lab 수령일 기준 (AU 와 동일 컨셉, 단 hawaii_extra.sample_received_date 미구현).
 *    → 현재는 채혈일(`rabies_titer_records[].date`) 을 보수 proxy 로 사용.
 *
 * 컨벤션 (NZ 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - "X일 이내" = 출국일 포함 X distinct days → `dep - X ≤ N-1`
 *    (예: 14일 이내 → ≤13)
 *  - "more than X days" = strict > X → ≥ X+1
 *    (예: more than 30 days → ≥31)
 *  - "not less than X days" = inclusive → ≥ X
 *  - departure_date = HI 도착일 proxy (시간대 차 ±1일 무시)
 */

const COUNTRY = 'hawaii'

export const HI_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'hi.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 1차 접종일과 같거나 이전이어야 함. 칩 없거나 스캔 불가 시 120일 검역 강제. (HDOA Step 2 + JP/SG/AU/EU/NZ 와 일관)',
    severity: 'info',
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
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 (보수적 연령 + 2회 평생 + 31일 간격 + 31일 이전 + 미만료) ──
  {
    id: 'hi.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'HDOA 본문 정량 미명시 — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요. (id 는 호환성을 위해 12weeks 유지)',
    severity: 'info',
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
        const reason =
          ev.failedRule === '91days'
            ? `생후 ${ev.ageInDays}일령으로 91일에 미달해요`
            : ev.failedRule === 'calendar3m'
              ? `1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          // 하와이는 최소 접종 연령을 고정하지 않고 백신 라벨을 따른다(HAR §4-29-8.1). 라벨은
          // 제품마다 12주(래비신) / 3개월(디펜서)로 갈리므로, 더 보수적인 3개월(=디펜서 라벨,
          // 91일 AND 캘린더 3개월)을 기준으로 안내한다 — 카드 문구('생후 3개월')와 통일
          // (2026-07-25 사용자 확정). 이러면 어느 백신을 써도 조기접종을 놓치지 않는다.
          message: msgRabiesPrimeMinAge('3개월'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'hi.rabies-2-doses-required',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 평생 2회 이상 접종',
    description:
      '광견병 백신은 평생 최소 2회. 1차 + 부스터 모두 필수. (HDOA: "vaccinated at least twice for rabies in its lifetime")',
    severity: 'info',
    addedAt: '2026-05-06',
    // 접종일이 정보 자체라 날짜 표기 허용(jp.ts 선례).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      if (rabies.length < 2) {
        return {
          ok: false,
          message: `광견병 접종이 1회(${rabies[0].date})만 기록되어 있어요. 2회가 필요해요.`,
          offendingPaths: [`rabies_dates[${rabies[0].originalIndex}].date`],
        }
      }
      return { ok: true, message: `광견병 ${rabies.length}회 기록됨.` }
    },
  },
  {
    id: 'hi.rabies-doses-31days-apart',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 도즈 간 31일 이상 간격 (more than 30 days)',
    description:
      '연속된 광견병 접종 간 간격 ≥31일. (HDOA: "must have been administered more than 30 days apart" → strict >30 = ≥31)',
    severity: 'info',
    addedAt: '2026-05-06',
    // 접종일·간격 일수가 정보 자체라 날짜 표기 허용(jp.ts 선례).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP

      const violations: Array<{ prev: typeof rabies[number]; curr: typeof rabies[number]; gap: number }> = []
      for (let i = 1; i < rabies.length; i++) {
        const prev = rabies[i - 1]
        const curr = rabies[i]
        const gap = daysBetween(prev.date, curr.date)
        if (gap !== null && gap < 31) {
          violations.push({ prev, curr, gap })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(
            `rabies_dates[${v.prev.originalIndex}].date`,
            `rabies_dates[${v.curr.originalIndex}].date`,
          )
          msgs.push(`${v.prev.date}부터 ${v.curr.date}까지 ${v.gap}일이에요. 31일 이상이어야 해요.`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: Array.from(new Set(offending)),
        }
      }
      return { ok: true, message: '모든 인접 광견병 도즈 간 간격 ≥31일.' }
    },
  },
  {
    id: 'hi.rabies-latest-31days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '최근 광견병 접종은 출국(=도착) 31일 이전',
    description:
      '가장 최근 광견병 접종일이 도착일 기준 31일 이전(more than 30 days). 31일 미만 시 도착 후 추가 검역 강제. (HDOA Step 3)',
    severity: 'info',
    addedAt: '2026-05-06',
    // 접종일→출국 경과 일수가 정보 자체라 날짜 표기 허용(jp.ts 선례).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP
      // 항체(FAVN) 검사가 입력돼 있으면 이 룰은 안내하지 않는다 — 채혈은 접종 이후이고 검체
      // 수령 후 30일을 더 기다리므로, 접종+31일은 FAVN 30일 대기에 완전히 포함된다(중복 안내).
      // 항체 미입력 케이스에서만 단독 안전망으로 남는다.
      if (readTiterEntries(caseRow).length > 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 31) {
        return {
          ok: false,
          message: '최근 광견병 접종일로부터 31일이 지나야 입국할 수 있어요.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'hi.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효 (1년/3년 라이선스 모두 cover)',
    description:
      '최근 광견병 접종의 라이선스 booster interval 이 도착일 이전 만료되지 않아야 함. 1년·3년 라이선스 모두 **N주년 당일까지** 유효. valid_until 명시 시 그 값 사용 — 3년 백신은 valid_until 직접 입력 필수. 미명시 시 디폴트 1년 (`addOneYear`). (HDOA: "must not be expired when your pet arrives")',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
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

  // ── FAVN (OIE-FAVN) ──
  // (≥0.5 IU/ml 결과치 룰은 의도적 제외 — 검사기관에서 이미 fail 결과 나옴, 시스템 검증 불필요)
  {
    id: 'hi.favn-sample-30days-to-36months-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: 'FAVN 검체 lab 수령일은 출국 30일 ~ 36개월 전',
    description:
      'HDOA: lab 수령일 다음날부터 30일 이상, 36개월 이내. `rabies_titer_records[].received_date` 우선, 미입력 시 채혈일 fallback (실제 lab 수령일은 며칠 늦으므로 채혈일 proxy 는 less strict — 보수 마진 검토 권고).',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // received_date 우선, 없으면 채혈일 fallback
      const basisOf = (t: TiterEntry) => t.received_date || t.date
      const valid = titers.find((t) => {
        const basis = basisOf(t)
        const days = daysBetween(basis, dep)
        if (days === null) return false
        const upper = addMonths(basis, 36)
        return days >= 30 && upper >= dep
      })
      if (valid) {
        const basis = basisOf(valid)
        const label = valid.received_date ? '검체 수령일' : 'FAVN 채혈일'
        const days = daysBetween(basis, dep)
        return { ok: true, message: `${label}(${basis}) → 출국(${dep}): ${days}일 (30일 이상, 36개월 이내).` }
      }

      // 모두 실패 — 가장 최신 기준 메시지
      const newest = [...titers].sort((a, b) => basisOf(b).localeCompare(basisOf(a)))[0]
      const newestBasis = basisOf(newest)
      const days = daysBetween(newestBasis, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) {
        if (t.received_date) offending.push(`rabies_titer_records[${t.originalIndex}].received_date`)
        else offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      }
      // 하와이 기준일은 '검체가 검사기관에 도착한 날'이고, 앱은 그 날짜를 입력받지 않아
      // 채혈일을 proxy 로만 쓴다 — 계산된 특정 날짜를 단정하지 않고 요건만 forward-looking 으로
      // 안내한다(검사일 기준 아님·2026-07-25 사용자 지정). 상한(36개월)은 재검사 안내.
      const reason =
        days === null
          ? '광견병 항체 검사 날짜를 확인하세요.'
          : days < 0
            ? '광견병 항체 검사일이 입국일보다 늦어요. 날짜를 확인하세요.'
            : days < 30
              ? '광견병 항체 검사 검체가 검사기관에 도착한 날로부터 30일이 지나야 입국할 수 있어요.'
              : '광견병 항체 검사 후 36개월이 지나 재검사가 필요해요.'
      return {
        ok: false,
        message: reason,
        offendingPaths: offending,
      }
    },
  },

  // ── 진드기 ──
  {
    id: 'hi.tick-treatment-within-14days',
    country: COUNTRY,
    category: '구충',
    title: '진드기 처치는 출국 14일 이내 (long-acting product)',
    description:
      '도착일 기준 14일 이내(`≤13`) 장시간 작용 진드기 구제 (Revolution 불가, Frontline/Bravecto 등 tick label 제품). 제품명·날짜는 건강증명서에 기재. (HDOA Step 6: "within 14 days of arrival")',
    severity: 'info',
    addedAt: '2026-05-06',
    // 처치일→출국 경과 일수가 정보 자체라 날짜 표기 허용(jp.ts 4개 룰과 같은 판단).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `진드기 처치일(${latest.date})이 출국일(${dep})보다 늦어요. 날짜를 확인하세요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (days > 13) {
        return {
          ok: false,
          message: `최근 진드기 처치(${latest.date})부터 출국(${dep})까지 ${days}일이에요. 출국일 포함 14일 이내(13일 전부터)여야 해요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 진드기 처치(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },

  // ── 도착 검역 일정 재검증 (jp.*-date-valid / th.import-quarantine-date-valid 와 동일 모델) ──
  {
    id: 'hi.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '하와이 수입 검역일',
    description: '하와이 수입 검역일은 하와이 도착일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-24',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.hi_import_quarantine_date === 'string'
          ? data.hi_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      // departure_date = 하와이 도착일 proxy (hi.ts 컨벤션).
      const dep = readDepartureDate(caseRow, destination)
      if (dep && raw < dep) {
        return {
          ok: false,
          message: '하와이 수입 검역일은 도착일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['hi_import_quarantine_date'],
        }
      }
      return { ok: true, message: `하와이 수입검역일(${raw}) 도착 이후.` }
    },
  },

  // ── 수입신고(AQS 서류 사전 제출) ──
  {
    id: 'hi.import-declaration-10days-before-arrival',
    country: COUNTRY,
    category: '수입신고',
    title: '수입신고 서류는 도착 10일 이상 전 제출',
    description:
      '수입신고 서류(AQS-279·접종증명서·수수료)가 하와이 도착 10일 이상 전에 동물검역소에 접수돼야 공항 인계(DAR) 자격이 돼요. 늦으면 수수료가 오르거나 자격을 잃을 수 있어요. (HDOA Checklist 1 Step 1·7)',
    severity: 'warning',
    addedAt: '2026-07-25',
    // 신고일→도착 경과 일수가 정보 자체라 날짜 표기 허용.
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.hi_import_declaration_date === 'string'
          ? data.hi_import_declaration_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      // departure_date = 하와이 도착일 proxy (hi.ts 컨벤션).
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      const days = daysBetween(raw, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `신고일(${raw})이 도착일(${dep})보다 늦어요. 도착 전에 제출해야 해요.`,
          offendingPaths: ['hi_import_declaration_date'],
        }
      }
      if (days < 10) {
        return {
          ok: false,
          message: `신고일(${raw})이 도착(${dep}) ${days}일 전이에요. 도착 10일 이상 전에 접수돼야 공항 인계(DAR) 자격이 돼요.`,
          offendingPaths: ['hi_import_declaration_date'],
        }
      }
      return { ok: true, message: `신고일(${raw}) → 도착(${dep}): ${days}일.` }
    },
  },

]
