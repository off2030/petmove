import { buildDateRuleContext, violatesRabiesEntryWait } from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  classifyExportQuarantineDate,
  daysBetween,
  evaluateRabiesAgeConservative,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
  findRabiesValidityBreaks,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 우크라이나 (SSUFSCP — State Service of Ukraine on Food Safety & Consumer Protection / Держпродспоживслужба) 절차 검증.
 *
 * 출처:
 *  - SSUFSCP "Вимоги до некомерційного переміщення тварин" — https://dpss.gov.ua/mizhnarodne-spivrobitnictv/veterinariya-ta-bezpechnist/vimogi-do-nekomercijnogo-peremishchennya-tvarin
 *  - SSUFSCP "Ввезення домашніх тварин в Україну" — https://dpss.gov.ua/news/vvezennia-domashnikh-tvaryn-v-ukrainu
 *  - 농업정책식품부 명령 №553 (2018-11-16) — https://zakon.rada.gov.ua/go/z0346-19
 *  - 공식 인증서 PDF — https://dpss.gov.ua/storage/app/sites/12/uploaded-files/zdorovya-dlya-nekomertsiynogo-peremishchennya-sobak-kotiv-ta-domashnikh-tkhoriv-fretok112.pdf
 *
 * 한국 = unlisted third country (EU listed/unlisted 분류 차용). RNATT 의무.
 *
 * 핵심 룰 (SSUFSCP 명시):
 *  - 마이크로칩: ISO 11784 및 11785 표준 (15자리)
 *  - 광견병: 12주 이상 접종 (보수 91일 AND 캘린더 3개월)
 *  - **RNATT 필수**: 채혈 ≥ 광견병 + 30일, 0.5 IU/ml 이상, EU 지정 lab (한국 APQA 등재)
 *  - 출국 ≥ RNATT + 3개월 (캘린더), 채혈 12개월 유효
 *  - 비상업 5마리 이하
 *
 * 별도 (시스템 검증 제외):
 *  - 종합백신/구충: SSUFSCP 비상업 이동 규정상 미명시 (광견병만 의무)
 *  - 에키노코쿠스 구충: 우크라이나 입국 불요 (UK/IE/MT/NO/FI 행만)
 *
 * 컨벤션 (TR/EU 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
 *  - "3개월" = `addMonths(d, 3) <= dep` (캘린더 기준, EU 와 일관)
 */

const COUNTRY = 'ukraine'

export const UA_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'ua.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 11784 및 11785 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (SSUFSCP: "Тварини повинні бути ідентифіковані за допомогою мікрочіпа ... ISO 11784 та 11785")',
    // severity 승격 info→warning(2026-07-21) — 구세대 파일의 잔재였다. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일). 이 룰은 카드에 매핑돼 있어 배지가 카드에 붙는다.
    severity: 'warning',
    addedAt: '2026-05-07',
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

  // ── 광견병 ──
  {
    id: 'ua.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'SSUFSCP: "Вакцинація проти сказу здійснюється починаючи з 12-тижневого віку" (12주부터). 보수 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    // severity 승격 info→warning(2026-07-21) — 구세대 파일의 잔재였다. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일). 이 룰은 카드에 매핑돼 있어 배지가 카드에 붙는다.
    severity: 'warning',
    addedAt: '2026-05-07',
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
              ? `${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 ${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('84일(12주)'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'ua.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-21',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP
      const offending = findRabiesValidityBreaks(rabies)
      if (offending.length > 0) {
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
    id: 'ua.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    // ⚠️ EU 와 같은 구조로 맞췄다(2026-07-21 사용자 지정) — severity 는 warning 이되
    //   포털 표시는 ADVISORY_DEFERRED_CHECKS 로 제외한다(추가 백신 카드 situational 이 안내).
    //   우크라이나 항체검사는 EU 처럼 **조건부 무기한**이라, '접종 이력이 끊기지 않았는가'가
    //   곧 항체 유효성 판정이다. 그래서 이 룰이 EU 의 eu.rabies-valid-until-on-entry 역할을 한다.
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. (SSUFSCP: 1차 접종은 출국 30일~12개월 이내)',
    severity: 'warning',
    addedAt: '2026-05-07',
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

  {
    id: 'ua.rabies-min-21days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 21일 이상 전',
    description:
      'APHIS 우크라이나 안내 — "the pet will be required to wait at least 21 days after vaccination before travel to the Ukraine"(초회 접종 또는 유효기간 경과 후 재접종인 경우). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 21일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 21일이 지나야 우크라이나에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  // ── RNATT (우크라이나 입국 필수) ──
  {
    id: 'ua.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (공식 가이드: "blood sample should be taken at least 30 days after the rabies vaccine" — EU 동일 패턴)',
    // severity 승격 info→warning(2026-07-21) — 구세대 파일의 잔재였다. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일). 이 룰은 카드에 매핑돼 있어 배지가 카드에 붙는다.
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offending: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push('채혈일 이전의 광견병 접종 기록이 없어요.')
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push('광견병 항체 검사는 접종일로부터 30일이 지난 뒤에 받아야 해요.')
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '항체 검사 시기 적합 (30일 경과).' }
    },
  },
  {
    id: 'ua.departure-min-3months-after-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 항체 검사 3개월 이후',
    description:
      'RNATT 채혈일로부터 출국일까지 최소 3개월 경과 필요. (SSUFSCP: "принаймні за три місяці до дати видачі сертифіката") — 캘린더 기준(`addMonths`).',
    // severity 승격 info→warning(2026-07-21) — 구세대 파일의 잔재였다. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일). 이 룰은 카드에 매핑돼 있어 배지가 카드에 붙는다.
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addMonths(t.date, 3) <= dep)
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `항체 검사(${valid.date}) → 출국일(${dep}): ${days}일 (≥3개월).` }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const requiredDate = addMonths(newest.date, 3)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: '항체 검사 채혈일로부터 3개월이 지나야 우크라이나에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: offending,
      }
    },
  },
  // ⚠️ `ua.departure-within-12months-of-titer`(항체 12개월 유효)를 **삭제했다**(2026-07-20 조사).
  //   우크라이나 항체검사는 **조건부 무기한**이다 — "The test result remains valid indefinitely
  //   as long as there has been **no lapse in rabies vaccination coverage** since the date of
  //   the rabies titer test"(APHIS 우크라이나 안내). EU 와 같은 모델이고 프로파일에도
  //   titer.entryValidityMonths: null 로 선언했다.
  //   '12개월'·'3~24개월' 설의 출처는 **폐지된 2004년 명령 71호(z0768-04)** 잔재이고,
  //   553/2018 이 이미 폐지했다. 근거 없이 유효한 항체검사를 만료로 판정하면 재검사를
  //   강요하게 된다(채혈 후 3개월 대기까지 다시 걸려 출국이 분기 단위로 밀린다).
  //   ※ 왕복이면 한국 APQA 의 '채혈일 도착 전 24개월 이내'가 실효적으로 걸리는데,
  //     그건 귀국 방향 공통 룰(common.kr-return-titer-within-2years)이 이미 담당한다.

  // ── 항체가 결과치 ──
  {
    id: 'ua.titer-value-min-0.5iu',
    country: COUNTRY,
    category: '광견병',
    title: 'RNATT 항체가 ≥ 0.5 IU/ml',
    description:
      'SSUFSCP: "перевірений титр антитіл дорівнює або більше ніж 0,5 МО/мл" — 모든 RNATT 결과치가 0.5 IU/ml 이상이어야 함. value 미입력 시 SKIP.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP

      const offending: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        if (!t.value) continue // 미입력은 SKIP
        // 숫자 추출 (예: "0.5", "≥0.5", ">0.5", "0.7 IU/ml")
        const match = t.value.match(/(\d+(?:\.\d+)?)/)
        if (!match) continue
        const num = parseFloat(match[1])
        if (Number.isNaN(num)) continue
        if (num < 0.5) {
          offending.push(`rabies_titer_records[${t.originalIndex}].value`)
          problems.push('광견병 항체가가 0.5 IU/mL 미만이에요.')
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 RNATT 항체가 ≥ 0.5 IU/ml.' }
    },
  },
  // ── 도착 수입 검역 / 현지 수출 검역 (베트남 골격 복제 2026-07-20) ──
  {
    id: 'ua.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '우크라이나 수입 검역일',
    description: '우크라이나 수입 검역일은 우크라이나 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ua_import_quarantine_date === 'string'
          ? data.ua_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '우크라이나 수입 검역일은 우크라이나 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ua_import_quarantine_date'],
        }
      }
      return { ok: true, message: `우크라이나 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'ua.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '우크라이나 수출 검역일',
    description:
      '우크라이나 수출 검역일은 우크라이나 입국일 이후·한국 귀국일 이전이어야 함. "그 나라에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다(판정은 classifyExportQuarantineDate 공용).',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const ret =
        typeof ctx.data.return_date === 'string' && ctx.data.return_date.length >= 10
          ? ctx.data.return_date.slice(0, 10)
          : ''
      const verdict = classifyExportQuarantineDate(data.ua_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: '우크라이나 수출 검역일은 우크라이나 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ua_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: '우크라이나 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ua_export_quarantine_date'],
        }
      }
      return { ok: true, message: `우크라이나 수출검역일 체류 기간 내.` }
    },
  },
]
