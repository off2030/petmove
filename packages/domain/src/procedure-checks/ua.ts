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
 * 우크라이나 (State Service of Ukraine on Food Safety & Consumer Protection) 절차 검증.
 *
 * 출처: petmove 가이드 (https://www.petmove.co.kr/docs/ukraine-pet-travel-guide/)
 *  — "공식 자료/관련 기관 웹사이트 부재 — 사례 기반"
 *
 * 추가 출처 (공식·실무 자료):
 *  - visitukraine.today, pettravel.com, USDA/APHIS Ukraine guide
 *  - 우크라이나 SSUFSCP는 EU listed third country 룰을 사실상 차용 (EU와 거의 동일)
 *
 * 핵심 룰 (공식 우선):
 *  - 마이크로칩: ISO 표준, **모든 절차 중 가장 먼저** (필수)
 *  - 광견병: 1차 보수적(91일 AND 캘린더 3개월) + 출국일 면역 유효(1년)
 *  - **RNATT 필수**: 채혈 ≥ 광견병 + 30일 + 출국 ≥ RNATT + 3개월 + 12개월 유효
 *
 * 별도 (시스템 검증 제외):
 *  - 종합백신/구충: petmove·공식 미명시
 *  - RNATT 결과치 ≥0.5 IU/ml: 검사기관 fail 처리, 시스템 검증 불필요 (전 국가 일관)
 *  - 광견병 백신 후 21일 wait (출국 룰): petmove 추정·공식 미확인 → 룰 제외
 *  - 건강증명서 시점: petmove "48시간 권장"·공식 미명시 → 룰 제외
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
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (petmove 가이드: "모든 절차 중 가장 먼저")',
    severity: 'blocker',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦음.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작 필요.',
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
      '우크라이나 공식 자료/관련 기관 웹사이트 부재 — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요. (petmove 가이드 "생후 12주" 기재되어 있으나 공식 미확인이라 보수적 채택. id 는 호환성을 위해 12weeks 유지)',
    severity: 'blocker',
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
            ? `생후 ${ev.ageInDays}일령 — 91일 미달`
            : ev.failedRule === 'calendar3m'
              ? `${first.date} < 캘린더 3개월(${ev.calendar3mThreshold})`
              : `생후 ${ev.ageInDays}일령 + ${first.date} < 캘린더 3개월(${ev.calendar3mThreshold})`
        return {
          ok: false,
          message: `1차 접종일(${first.date}) 보수적 기준 미충족 — ${reason}.`,
          fixHint: `생후 91일 AND ${ev.calendar3mThreshold}(캘린더 3개월) 둘 다 충족 이후로 1차 접종일을 조정하세요.`,
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
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. (petmove 가이드: "유효기간 1년")',
    severity: 'blocker',
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
          message: `최근 접종(${latest.date}) 유효기간(${validUntil}) < 출국일(${dep}) — 만료.`,
          fixHint: '출국 전 부스터 접종 필요.',
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
    severity: 'blocker',
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
          problems.push(`채혈일(${t.date}) 이전 광견병 접종 기록 없음`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈(${t.date}) - 직전접종(${latest.date}) = ${gap ?? '?'}일 (<30일)`)
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
      'RNATT 채혈일로부터 출국일까지 최소 3개월 경과 필요. (petmove 가이드: "출국일 기준 최소 3개월 전") — 캘린더 기준(`addMonths`).',
    severity: 'blocker',
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
        message: `최신 항체검사(${newest.date}) — 출국 가능일(${requiredDate}) > 출국일(${dep}).`,
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
      'RNATT 유효기간 1년 — 출국일이 채혈일 + 1년(364일) 초과 시 재검사 필요. (petmove 가이드: "유효기간 1년")',
    severity: 'blocker',
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
        message: `최신 항체검사(${newest.date}) 유효기간(${expiry}) < 출국일(${dep}) — 1년 초과.`,
        fixHint: '재검사 또는 출국일을 채혈일 + 1년 이내로 조정.',
        offendingPaths: offending,
      }
    },
  },

]
