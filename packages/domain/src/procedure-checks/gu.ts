import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readHeartwormEntries,
  readInternalParasiteEntries,
  readKennelCoughEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 괌 (Guam DOAG — Department of Agriculture, Animal Health Division / USDA APHIS) 절차 검증.
 *
 * 출처:
 *  - Guam DOAG Pet Import Brochure (Rev. 2024-08-09) —
 *    https://doag.guam.gov/wp-doag-content/uploads/2025/08/AH-PET-IMPORT-BROCHURE-FINAL-REV08092024.pdf
 *  - Guam DOAG Animal Health/Animal Control — https://doag.guam.gov/animal-health-animal-control/
 *  - Guam CQA Pet Import Requirements — https://cqa.guam.gov/pet-import-requirements-3/
 *  - 9 GAR Animal Regulations — https://guamcourts.gov/compileroflaws/GAR/09GAR/09GAR001-3.pdf
 *
 * ⚠️ 핵심 (한국 = non-exempt):
 *  - 마이크로칩 (ISO 11784/11785 또는 AVID/HomeAgain) ≤ 광견병 1차
 *  - 광견병: 평생 ≥2회 (1차 + 부스터), 1차 ≥생후 3개월(90일), 도즈 간 ≥30일, 1년/3년 라벨
 *  - **RNATT (OIE-FAVN)**: 직전 접종 후 10일+ + ≥0.5 IU/mL (홈 검역 직행은 ≥1.0) + 검체 lab 수령일부터 **120일 후** 도착, 36개월 이내
 *  - 종합백신·켄넬코프: 도착 ≥10일 이전 + 1년 유효
 *  - 내·외부구충 + 심장사상충: 도착 14일 이내(`≤13`) 치료. Revolution 단독 진드기 처치 불가
 *  - 한국 APQA 검역: 출국 10일 이내(보수 ≤9)
 *  - DOAG 서류 도착 10일 이전 수령 (Entry Permit $185~$244)
 *  - 격리 면제 위해 위 모든 조건 충족 (미충족 시 기본 120일 상업 격리)
 *
 * 컨벤션 (다른 국가 룰과 동일):
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "X일 이상/이전/후" → `dep - X ≥ N` (이상 inclusive)
 */

const COUNTRY = 'guam'

function species(caseRow: CaseRow): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return typeof data.species === 'string' ? data.species : ''
}

export const GU_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'gu.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785) 이 광견병 1차 접종일과 같거나 이전이어야 함.',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦어요. 날짜를 확인하세요.`,
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'gu.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 3개월령(캘린더) 이상',
    description:
      '광견병 1차 접종은 생년월일 기준 캘린더 3개월(`addMonths(birth, 3)`) 이후. (DOAG: "shall not be given less than 3 months of age") 91일 근사 대신 정확한 월 계산.',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const earliestValid = addMonths(birth, 3)
      if (!earliestValid) return SKIP
      const age = daysBetween(birth, first.date)
      if (first.date < earliestValid) {
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 3개월령(${earliestValid}) 이전이에요. 생후 ${age ?? '?'}일이에요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) ≥ 3개월령(${earliestValid}). 생후 ${age}일.` }
    },
  },
  {
    id: 'gu.rabies-2-doses-required',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 평생 2회 이상 접종',
    description:
      '광견병 백신은 평생 최소 2회. 1차 + 2차 모두 필수.',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      if (rabies.length < 2) {
        return {
          ok: false,
          message: `광견병 접종이 1회(${rabies[0].date})만 기록되어 있어요. 2회 이상 접종해야 해요.`,
          offendingPaths: [`rabies_dates[${rabies[0].originalIndex}].date`],
        }
      }
      return { ok: true, message: `광견병 ${rabies.length}회 기록됨.` }
    },
  },
  {
    id: 'gu.rabies-doses-30days-apart',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 도즈 간 30일 이상 간격 (최소 1개월)',
    description:
      '연속된 광견병 접종 간 간격 ≥30일 (1개월). (DOAG Brochure 2024-08-09 운용. 참고: HI는 strict ">30 days = ≥31일"이며 GU 동일 강화 검토 권고)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP

      const violations: Array<{ prev: typeof rabies[number]; curr: typeof rabies[number]; gap: number }> = []
      for (let i = 1; i < rabies.length; i++) {
        const prev = rabies[i - 1]
        const curr = rabies[i]
        const gap = daysBetween(prev.date, curr.date)
        if (gap !== null && gap < 30) {
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
          msgs.push(`${v.prev.date}부터 ${v.curr.date}까지 ${v.gap}일이에요. 30일 이상이어야 해요.`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: Array.from(new Set(offending)),
        }
      }
      return { ok: true, message: '모든 인접 광견병 도즈 간 간격 ≥30일.' }
    },
  },
  {
    id: 'gu.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효 (접종일 포함 1년 = 364일까지)',
    description:
      '최근 광견병 접종 면역 유효기간이 도착일 이전 만료되지 않아야 함. **접종일 포함 1년 = +364일**까지 허용. valid_until 명시 시 그 값, 미명시 시 디폴트 1년 (`addOneYear`).',
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료돼요.`,
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── RNATT ──
  {
    id: 'gu.rnatt-after-rabies-10days',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 직전 광견병 접종 후 10일 이상 경과',
    description:
      'RNATT 채혈일은 직전 광견병 접종 후 10일 이상 경과해야 함. (DOAG: 항체 형성 시간 운용 권장)',
    severity: 'info',
    addedAt: '2026-05-06',
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
          problems.push(`채혈일(${t.date}) 이전에 광견병 접종 기록이 없어요.`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 10) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date})과 직전 접종일(${latest.date}) 간격이 ${gap ?? '?'}일이에요. 10일 이상이어야 해요.`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 RNATT 채혈이 직전 접종 +10일 이상.' }
    },
  },
  {
    id: 'gu.rnatt-120days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: 'RNATT 검체 lab 수령일부터 120일 경과 후 도착',
    description:
      'DOAG: "the day that the laboratory receives the OIE-FAVN sample counts as the first day for the 120-day countdown" — 검체 lab 수령일(`rabies_titer_records[].received_date`) 우선, 미입력 시 채혈일 fallback. 채혈일 proxy 는 lab 수령일보다 며칠 빨라 less strict.',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // received_date 우선, 없으면 채혈일 fallback
      const valid = titers.find((t) => {
        const basis = t.received_date || t.date
        const days = daysBetween(basis, dep)
        return days !== null && days >= 120
      })
      if (valid) {
        const basis = valid.received_date || valid.date
        const label = valid.received_date ? '검체 수령일' : 'RNATT 채혈일'
        const days = daysBetween(basis, dep)
        return { ok: true, message: `${label}(${basis}) → 출국(${dep}): ${days}일 (≥120).` }
      }
      const earliest = [...titers].sort((a, b) => (a.received_date || a.date).localeCompare(b.received_date || b.date))[0]
      const earliestBasis = earliest.received_date || earliest.date
      const days = daysBetween(earliestBasis, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) {
        if (t.received_date) offending.push(`rabies_titer_records[${t.originalIndex}].received_date`)
        else offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      }
      const label = earliest.received_date ? '검체 수령일' : 'RNATT 채혈일'
      return {
        ok: false,
        message: `${label}(${earliestBasis})부터 출국일(${dep})까지 ${days ?? '?'}일이에요. 120일 이상이어야 해요.`,
        offendingPaths: offending,
      }
    },
  },

  // ── 종합백신·켄넬코프 (도착 10일 이전 + 1년 유효) ──
  buildAnnualVaccineRule({
    id: 'gu.general-vaccine-10days-before-arrival',
    label: '종합백신',
    dataKey: 'general_vaccine_dates',
    reader: readGeneralVaccineEntries,
    dogOnly: false,
  }),
  buildAnnualVaccineRule({
    id: 'gu.kennel-cough-10days-before-arrival',
    label: '켄넬코프',
    dataKey: 'kennel_cough_dates',
    reader: readKennelCoughEntries,
    dogOnly: true,
  }),

  // ── 구충·심장사상충 (도착 14일 이내) ──
  buildWithin14DaysRule({
    id: 'gu.internal-parasite-within-14days',
    label: '내부구충',
    dataKey: 'internal_parasite_dates',
    reader: readInternalParasiteEntries,
  }),
  buildWithin14DaysRule({
    id: 'gu.external-parasite-within-14days',
    label: '외부구충',
    dataKey: 'external_parasite_dates',
    reader: readExternalParasiteEntries,
  }),
  buildWithin14DaysRule({
    id: 'gu.heartworm-within-14days',
    label: '심장사상충',
    dataKey: 'heartworm_dates',
    reader: readHeartwormEntries,
  }),
]

/**
 * 종합백신·켄넬코프 공통 룰 빌더 — 도착 ≥10일 이전 완료 + 1년 유효.
 */
function buildAnnualVaccineRule(opts: {
  id: string
  label: string
  dataKey: 'general_vaccine_dates' | 'kennel_cough_dates'
  reader: (cr: CaseRow) => Array<{ date: string; valid_until?: string | null; originalIndex: number }>
  dogOnly: boolean
}): ProcedureCheck {
  const speciesNote = opts.dogOnly ? ' (강아지)' : ''
  const speciesPrefix = opts.dogOnly ? '강아지 전용. ' : ''
  return {
    id: opts.id,
    country: COUNTRY,
    category: '종합백신',
    title: `${opts.label} 출국 10일 이전 + 1년 유효${speciesNote}`,
    description: `${speciesPrefix}최근 ${opts.label} 접종이 출국일 10일 이전 완료 + **접종일 포함 1년 = +364일** 유효기간 안. valid_until 명시 시 override.`,
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      if (opts.dogOnly && species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = opts.reader(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const toDep = daysBetween(latest.date, dep)
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)

      const issues: string[] = []
      if (toDep === null) {
        return { ok: false, message: '날짜 형식이 올바르지 않아요.', offendingPaths: [`${opts.dataKey}[${latest.originalIndex}].date`] }
      }
      if (toDep < 0) {
        issues.push(`최근 접종일(${latest.date})이 출국일(${dep})보다 늦어요.`)
      } else if (toDep < 10) {
        issues.push(`최근 접종일(${latest.date})부터 출국일까지 ${toDep}일이에요. 10일 이상이어야 해요.`)
      }
      if (validUntil && validUntil < dep) {
        issues.push(`유효기간(${validUntil})이 출국일(${dep}) 전에 만료돼요.`)
      }
      if (issues.length > 0) {
        return {
          ok: false,
          message: issues.join(' / '),
          offendingPaths: ['departure_date', `${opts.dataKey}[${latest.originalIndex}].date`],
        }
      }
      return {
        ok: true,
        message: `최근 접종(${latest.date}) → 출국(${dep}): ${toDep}일, 유효기간 ${validUntil}.`,
      }
    },
  }
}

/**
 * 구충·심장사상충 공통 룰 빌더 — 도착 14일 이내(`≤13`) 치료.
 */
function buildWithin14DaysRule(opts: {
  id: string
  label: string
  dataKey: 'internal_parasite_dates' | 'external_parasite_dates' | 'heartworm_dates'
  reader: (cr: CaseRow) => Array<{ date: string; originalIndex: number }>
}): ProcedureCheck {
  return {
    id: opts.id,
    country: COUNTRY,
    category: '구충',
    title: `${opts.label}은 출국 14일 이내(${'`≤13`'})`,
    description: `${opts.label} 가장 최근 처치가 출국일 14일 이내(\`≤13\`). (DOAG: "treated ... within 14 days of arrival on Guam")`,
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = opts.reader(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `${opts.label}(${latest.date})이 출국일(${dep})보다 늦어요. 날짜를 확인하세요.`,
          offendingPaths: [`${opts.dataKey}[${latest.originalIndex}].date`],
        }
      }
      if (days > 13) {
        return {
          ok: false,
          message: `최근 ${opts.label}(${latest.date})부터 출국일(${dep})까지 ${days}일이에요. 출국일 포함 14일 이내(13일 전부터)여야 해요.`,
          offendingPaths: [`${opts.dataKey}[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 ${opts.label}(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  }
}
