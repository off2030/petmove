import type { ProcedureCheck } from './types'
import {
  addMonths,
  addYears,
  daysBetween,
  matchBannedBreed,
  readBreed,
  readExternalParasiteEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
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
    severity: 'info',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦어요.`,
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
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
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
          message: `1차 접종일(${first.date})이 생후 ${age}일령이에요. 최소 84일령(12주) 이상이어야 해요.`,
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
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const earliest = rabies[0]
      const days = daysBetween(earliest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `광견병 접종(${earliest.date})부터 출국일(${dep})까지 ${days}일이에요. 30일 이상이어야 해요.`,
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
    severity: 'info',
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료돼요.`,
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
    title: '항체 검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (EU Reg 576/2013 Annex IV "at least 30 days after vaccination" 차용)',
    severity: 'info',
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
          problems.push(`채혈일(${t.date}) 이전의 광견병 접종 기록이 없어요.`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date})과 직전 접종일(${latest.date})의 간격이 ${gap ?? '?'}일로 30일 미만이에요.`)
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
    id: 'tr.departure-min-3months-after-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 RNATT 채혈일 3개월(캘린더) 이후 (unlisted 제3국)',
    description:
      '한국 = unlisted third country → EU Reg 576/2013 차용으로 RNATT 채혈 후 최소 3개월 대기. 캘린더 기준 (`addMonths`). 부스터 chain 끊김 없이 유지 시 EU 패턴상 평생 유효이나, 보수적으로 매 RNATT 마다 3개월 적용.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // 가장 오래된 titer 부터 검사 — 채혈+3개월 ≤ 출국 이면 통과
      const sorted = [...titers].sort((a, b) => a.date.localeCompare(b.date))
      const valid = sorted.find((t) => addMonths(t.date, 3) <= dep)
      if (valid) {
        const days = daysBetween(valid.date, dep)
        const earliestDep = addMonths(valid.date, 3)
        return {
          ok: true,
          message: `RNATT(${valid.date}) + 3개월(${earliestDep}) ≤ 출국일(${dep}). 차이 ${days}일.`,
        }
      }

      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const days = daysBetween(newest.date, dep)
      const earliestDep = addMonths(newest.date, 3)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const message =
        days === null
          ? '항체 검사일과 출국일을 확인할 수 없어요.'
          : days < 0
            ? `항체 검사일(${newest.date})이 출국일(${dep})보다 이후예요.`
            : `RNATT(${newest.date})에 3개월을 더한 ${earliestDep}이 출국일(${dep})보다 늦어요. 출국까지 ${days}일로 3개월에 미달해요.`
      return {
        ok: false,
        message,
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'tr.departure-within-12months-of-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 항체 검사 12개월 이내',
    description:
      'RNATT 유효기간 1년 — 출국일이 채혈일 + 1년(364일) 초과 시 재검사 필요. (Tarım Bakanlığı 운용)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return { ok: true, message: `항체 검사(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).` }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const expiry = addYears(newest.date, 1)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `최신 항체 검사(${newest.date})의 유효기간(${expiry})이 출국일(${dep})보다 빨라요. 1년을 초과했어요.`,
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
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 0) {
        return {
          ok: false,
          message: `외부구충(${latest.date})이 출국일(${dep})보다 늦어요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 29) {
        return {
          ok: false,
          message: `외부구충(${latest.date})부터 출국일(${dep})까지 ${diff}일이에요. 출국 포함 30일 이내(29일 전 이후)여야 해요.`,
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
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 0) {
        return {
          ok: false,
          message: `내부구충(${latest.date})이 출국일(${dep})보다 늦어요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 29) {
        return {
          ok: false,
          message: `내부구충(${latest.date})부터 출국일(${dep})까지 ${diff}일이에요. 출국 포함 30일 이내(29일 전 이후)여야 해요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 수입 금지 견종 ──
  {
    id: 'tr.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull, Tosa, Dogo Argentino 등)',
    description:
      '튀르키예 농림부: Pit Bull Terrier, American Staffordshire Terrier, Japanese Tosa, Dogo Argentino, Fila Brasileiro 및 동종 수입 금지.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      if (species && species !== 'dog') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const match = matchBannedBreed(breed, [
        'pit bull', 'pitbull', '핏불',
        'american staffordshire terrier', '아메리칸 스태퍼드셔',
        'staffordshire bull terrier', '스태퍼드셔 불 테리어',
        'tosa', '도사',
        'dogo argentino', '도고 아르헨티노',
        'fila brasileiro', '필라 브라질레이로',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은 튀르키예 수입 금지 견종이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },
]
