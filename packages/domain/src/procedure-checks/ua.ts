import type { ProcedureCheck } from './types'
import {
  addMonths,
  addYears,
  daysBetween,
  evaluateRabiesAgeConservative,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

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
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
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
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦습니다.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작해야 합니다.',
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
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
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
            ? `생후 ${ev.ageInDays}일령으로 91일에 미달합니다`
            : ev.failedRule === 'calendar3m'
              ? `${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빠릅니다`
              : `생후 ${ev.ageInDays}일령이며 ${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빠릅니다`
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 보수적 기준을 충족하지 못합니다. ${reason}.`,
          fixHint: `생후 91일 AND ${ev.calendar3mThreshold}(캘린더 3개월)을 모두 충족한 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'ua.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. (SSUFSCP: 1차 접종은 출국 30일~12개월 이내)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료됩니다.`,
          fixHint: '출국 전 부스터 접종이 필요합니다.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── RNATT (우크라이나 입국 필수) ──
  {
    id: 'ua.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (공식 가이드: "blood sample should be taken at least 30 days after the rabies vaccine" — EU 동일 패턴)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offending: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date}) 이전의 광견병 접종 기록이 없습니다.`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date})과 직전 접종일(${latest.date})의 간격이 ${gap ?? '?'}일로 30일 미만입니다.`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '채혈일을 직전 광견병 접종일로부터 30일 이후로 조정하세요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '항체검사 시기 적합 (30일 경과).' }
    },
  },
  {
    id: 'ua.departure-min-3months-after-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 항체검사 3개월 이후',
    description:
      'RNATT 채혈일로부터 출국일까지 최소 3개월 경과 필요. (SSUFSCP: "принаймні за три місяці до дати видачі сертифіката") — 캘린더 기준(`addMonths`).',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addMonths(t.date, 3) <= dep)
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `항체검사(${valid.date}) → 출국일(${dep}): ${days}일 (≥3개월).` }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const requiredDate = addMonths(newest.date, 3)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `최신 항체검사(${newest.date}) 기준 출국 가능일(${requiredDate})이 출국일(${dep})보다 늦습니다.`,
        fixHint: '출국일을 채혈일 + 3개월 이후로 조정하거나 더 이른 항체검사가 필요합니다.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'ua.departure-within-12months-of-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 항체검사 12개월 이내',
    description:
      'RNATT 유효기간 1년 — 출국일이 채혈일 + 1년(364일) 초과 시 재검사 필요. (SSUFSCP 실무 운용 — 부스터 chain 끊김 없을 시 EU 패턴상 평생 유효 가능, 보수적으로 1년 적용)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return { ok: true, message: `항체검사(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).` }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const expiry = addYears(newest.date, 1)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `최신 항체검사(${newest.date})의 유효기간(${expiry})이 출국일(${dep})보다 빠릅니다. 1년을 초과했습니다.`,
        fixHint: '재검사를 받거나 출국일을 채혈일 + 1년 이내로 조정하세요.',
        offendingPaths: offending,
      }
    },
  },

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
    run: ({ caseRow }) => {
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
          problems.push(`RNATT(${t.date}) 항체가가 ${t.value}로 0.5 IU/ml 미만입니다.`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '항체가는 0.5 IU/ml 이상이어야 하며, 미달 시 재접종 후 재검사가 필요합니다.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 RNATT 항체가 ≥ 0.5 IU/ml.' }
    },
  },

  // ── 일정 ──
  {
    id: 'ua.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (보수: 9일 전부터)',
    description:
      'SSUFSCP: "Ветеринарний сертифікат… дійсний протягом 10 днів з дати видачі" — 사용자 보수 N-1 → ≤9 적용.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (!dep || !visit) return SKIP

      const diff = daysBetween(visit, dep)
      if (diff === null) {
        return { ok: false, message: '날짜 형식이 올바르지 않습니다.', offendingPaths: ['vet_visit_date'] }
      }
      if (diff < 0) {
        return {
          ok: false,
          message: `내원일(${visit})이 출국일(${dep})보다 늦습니다.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit})부터 출국일(${dep})까지 ${diff}일입니다. 출국일 포함 10일 이내(9일 전 이후)여야 합니다.`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
