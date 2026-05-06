import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
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
} from './utils'

/**
 * 괌 (USDA APHIS / Guam Customs) 절차 검증.
 *
 * 출처: petmove 가이드 (https://www.petmove.co.kr/docs/guam-pet-travel-guide/).
 *
 * ⚠️ 핵심:
 *  - 마이크로칩 (ISO 11784/11785) ≤ 광견병 1차
 *  - 광견병: 평생 ≥2회, 1차 ≥생후 91일, 2차는 1차 + 30일 이후, 1년 유효
 *  - **RNATT**: 2차 접종 후 10일 이상 + ≥0.5 IU/ml + lab 수령일부터 **120일 후** 도착
 *  - 종합백신·켄넬코프: 도착 ≥10일 이전 + 1년 유효
 *  - 내·외부구충 + 심장사상충: 도착 14일 이내(`≤13`) 치료
 *  - 한국 APQA 검역: 출국 10일 이내
 *  - 격리 면제 위해 위 모든 조건 충족 (미충족 시 최대 120일 격리)
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
    severity: 'blocker',
    addedAt: '2026-05-06',
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
    id: 'gu.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 91일령 이상',
    description:
      '광견병 1차 접종은 생후 최소 91일(3개월) 이후. (petmove 가이드: "3개월령 이후")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const age = daysBetween(birth, first.date)
      if (age === null) return SKIP
      if (age < 91) {
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 생후 ${age}일령 — 최소 91일령 이상 필요.`,
          fixHint: `${birth} 기준 91일 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'gu.rabies-2-doses-required',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 평생 2회 이상 접종',
    description:
      '광견병 백신은 평생 최소 2회. 1차 + 2차 모두 필수.',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      if (rabies.length < 2) {
        return {
          ok: false,
          message: `광견병 1회만 기록됨(${rabies[0].date}) — 2회 필요.`,
          fixHint: '30일 후 2차 접종 추가.',
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
      '연속된 광견병 접종 간 간격 ≥30일 (1개월). (petmove 가이드: "1차 광견병 예방접종과 최소 한달 이상의 간격")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
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
          msgs.push(`${v.prev.date} → ${v.curr.date}: ${v.gap}일 (≥30일 필요)`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          fixHint: '도즈 간 최소 30일(1개월) 간격 확보.',
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
    severity: 'blocker',
    addedAt: '2026-05-06',
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

  // ── RNATT ──
  {
    id: 'gu.rnatt-after-rabies-10days',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사는 직전 광견병 접종 후 10일 이상 경과',
    description:
      'RNATT 채혈일은 직전 광견병 접종 후 10일 이상 경과해야 함. (petmove 가이드: "2차 광견병 예방접종 후 10일 이상 지나서 실시")',
    severity: 'blocker',
    addedAt: '2026-05-06',
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
        if (gap === null || gap < 10) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈(${t.date}) - 직전접종(${latest.date}) = ${gap ?? '?'}일 (<10일)`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '직전 광견병 접종 후 10일 이상 경과 후 채혈하세요.',
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
    title: 'RNATT 채혈일부터 120일 경과 후 도착',
    description:
      'RNATT 채혈일(lab 수령일 proxy)로부터 120일 경과 후에 괌 도착해야 함 (격리 면제 핵심 조건). (petmove 가이드: "검사 기관에서 샘플을 받은 날을 기준으로 120일 이후에 괌에 입국")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => {
        const days = daysBetween(t.date, dep)
        return days !== null && days >= 120
      })
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `RNATT(${valid.date}) → 출국(${dep}): ${days}일 (≥120).` }
      }
      const earliest = [...titers].sort((a, b) => a.date.localeCompare(b.date))[0]
      const days = daysBetween(earliest.date, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `RNATT(${earliest.date}) → 출국(${dep}): ${days ?? '?'}일 — 120일 이상 필요.`,
        fixHint: `출국일을 ${earliest.date} 기준 120일 이후로 조정.`,
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

  // ── 일정 ──
  {
    id: 'gu.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (한국 APQA)',
    description:
      '한국 APQA 검역 endorsement: 출국일 기준 10일 이내(`≤9`). 출발 7-9일 전 권장.',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (!dep || !visit) return SKIP

      const diff = daysBetween(visit, dep)
      if (diff === null) {
        return { ok: false, message: '날짜 형식 오류.', offendingPaths: ['vet_visit_date'] }
      }
      if (diff < 0) {
        return {
          ok: false,
          message: `내원일(${visit})이 출국일(${dep})보다 늦음.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 10일 이내(≤9일 전) 필요 (한국 APQA).`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정 (출발 7-9일 전 권장).`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
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
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      if (opts.dogOnly && species(caseRow) !== 'dog') return SKIP
      const dep = caseRow.departure_date
      const entries = opts.reader(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const toDep = daysBetween(latest.date, dep)
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)

      const issues: string[] = []
      if (toDep === null) {
        return { ok: false, message: '날짜 형식 오류.', offendingPaths: [`${opts.dataKey}[${latest.originalIndex}].date`] }
      }
      if (toDep < 0) {
        issues.push(`최근 접종(${latest.date})이 출국일(${dep})보다 늦음`)
      } else if (toDep < 10) {
        issues.push(`최근 접종(${latest.date}) → 출국 ${toDep}일 (≥10일 필요)`)
      }
      if (validUntil && validUntil < dep) {
        issues.push(`유효기간(${validUntil}) < 출국일(${dep}) — 1년 만료`)
      }
      if (issues.length > 0) {
        return {
          ok: false,
          message: issues.join(' / '),
          fixHint: '부스터 추가 또는 출국일 조정 — 출국 10일 이전 ~ 1년 이내.',
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
    description: `${opts.label} 가장 최근 처치가 출국일 14일 이내(\`≤13\`). (petmove 가이드: "괌 도착 14일 이내")`,
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = opts.reader(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `${opts.label}(${latest.date})이 출국일(${dep})보다 늦음.`,
          offendingPaths: [`${opts.dataKey}[${latest.originalIndex}].date`],
        }
      }
      if (days > 13) {
        return {
          ok: false,
          message: `최근 ${opts.label}(${latest.date}) → 출국(${dep}): ${days}일 — 출국 포함 14일 이내(≤13일 전) 필요.`,
          fixHint: `처치일을 ${dep} 기준 13일 전 이후로 조정.`,
          offendingPaths: [`${opts.dataKey}[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 ${opts.label}(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  }
}
