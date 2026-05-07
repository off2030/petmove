import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  readExternalParasiteEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 튀르키예 (Türkiye / Tarım ve Orman Bakanlığı — Ministry of Agriculture & Forestry) 절차 검증.
 *
 * 출처:
 *  - Tarım ve Orman Bakanlığı — https://www.tarimorman.gov.tr/
 *  - 터키 외교부 공관 안내(LA, NY) — https://losangeles-cg.mfa.gov.tr/Mission/ShowInfoNote/410171, https://newyork-cg.mfa.gov.tr/Mission/ShowInfoNote/254102
 *  - CFIA 터키 수출 — https://inspection.canada.ca/en/animal-health/terrestrial-animals/exports/pets/republic-turkiye
 *  - EU Reg. 576/2013 (unlisted third country 차용)
 *
 * 한국 = unlisted third country (EU 분류 차용). RNATT 의무.
 *
 * 핵심 룰:
 *  - 마이크로칩 (ISO 11784/11785) ≤ 광견병 1차
 *  - 광견병: 1차 ≥ 생후 12주(84일, EU Reg 576/2013 일치) + 출국 30일 전 + 출국일 면역 유효
 *  - **RNATT 필수**: 채혈 ≥ 광견병 + 30일, 0.5 IU/ml 이상, 출국 ≤ 채혈 + 1년
 *  - 구충: 외부(진드기) + 내부(촌충) 출국 30일 이내
 *  - 건강증명서: **공식 배서 출국 48시간(2일) 이내** (보수 ≤1) — Tarım Bakanlığı 명시. 임상검사는 96시간 이내(별도)
 *  - 핏불·도사·도고 아르헨티노·필라 등 견종 수입 금지 (추가 권고)
 *
 * 별도 (시스템 검증 제외 또는 추가 권고):
 *  - 종합백신: 권고 (의무 명문 부재)
 *  - **RNATT 후 3개월(90일) 대기** (2025-strict, unlisted): 신규 룰 추가 권고
 *  - 1인 2마리 제한, 도착 공항 수입검역: 사무 절차
 *
 * 컨벤션 (EU 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'turkey'

export const TR_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'tr.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 11784/11785 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (Tarım ve Orman Bakanlığı / EU Reg 576/2013 차용)',
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
    id: 'tr.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. (Tarım ve Orman Bakanlığı / EU Reg 576/2013 동일 기준 — "at least 12 weeks old")',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const age = daysBetween(birth, first.date)
      if (age === null) return SKIP
      if (age < 84) {
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 생후 ${age}일령 — 최소 84일령(12주) 이상 필요.`,
          fixHint: `${birth} 기준 84일 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'tr.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (Tarım ve Orman Bakanlığı: "vaccination certificate must be issued not later than thirty (30) days prior to the entry")',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const earliest = rabies[0]
      const days = daysBetween(earliest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일 — 30일 이상 필요.`,
          fixHint: `광견병 접종을 출국일 ${dep} 기준 30일 이전에 완료하세요.`,
          offendingPaths: [`rabies_dates[${earliest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'tr.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. (Tarım Bakanlığı / EU 표준 — 제조사 라벨 또는 1년)',
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

  // ── RNATT (튀르키예 입국 필수) ──
  {
    id: 'tr.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (EU Reg 576/2013 Annex IV "at least 30 days after vaccination" 차용)',
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
    id: 'tr.departure-within-12months-of-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 항체검사 12개월 이내',
    description:
      'RNATT 유효기간 1년 — 출국일이 채혈일 + 1년(364일) 초과 시 재검사 필요. (Tarım Bakanlığı 운용)',
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

  // ── 구충 ──
  {
    id: 'tr.external-parasite-within-30days',
    country: COUNTRY,
    category: '구충',
    title: '외부구충(진드기)은 출국 포함 30일 이내 (29일 전 이후)',
    description:
      '진드기에 효과적인 외부 기생충 치료제 처치는 출국 포함 30일 이내 = 출국일 기준 29일 전 이후. (Tarım Bakanlığı / EU 표준)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 0) {
        return {
          ok: false,
          message: `외부구충(${latest.date})이 출국일(${dep})보다 늦음.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 29) {
        return {
          ok: false,
          message: `외부구충(${latest.date}) → 출국일(${dep}): ${diff}일 — 출국 포함 30일 이내(≤29일 전) 필요.`,
          fixHint: `외부구충일을 ${dep} 기준 29일 전 이후로 조정 (진드기 효과 제품).`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `외부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'tr.internal-parasite-within-30days',
    country: COUNTRY,
    category: '구충',
    title: '내부구충(촌충)은 출국 포함 30일 이내 (29일 전 이후)',
    description:
      '촌충에 효과적인 내부 구충제 처치는 출국 포함 30일 이내 = 출국일 기준 29일 전 이후. (Tarım Bakanlığı / EU 표준)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 0) {
        return {
          ok: false,
          message: `내부구충(${latest.date})이 출국일(${dep})보다 늦음.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 29) {
        return {
          ok: false,
          message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일 — 출국 포함 30일 이내(≤29일 전) 필요.`,
          fixHint: `내부구충일을 ${dep} 기준 29일 전 이후로 조정 (촌충 효과 제품).`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 일정 ──
  {
    id: 'tr.vet-visit-within-2days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 48시간(2일) 이내',
    description:
      '공식 수의사 배서 발급은 출국일(항공기 탑승) 기준 48시간(2일) 이내. (Tarım Bakanlığı / 외교부 공관: "issued and filled out by the competent official veterinary authority within 2 days before your departure") — 다른 국가(10일)보다 매우 strict. 임상검사 자체는 96시간 이내(별도).',
    severity: 'blocker',
    addedAt: '2026-05-07',
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
      if (diff > 2) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 48시간(2일) 이내 필요.`,
          fixHint: `내원일을 ${dep} 기준 2일 전 이후로 조정.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
