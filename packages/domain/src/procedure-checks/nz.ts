import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import type { VaccineEntry } from './utils'
import {
  addMonths,
  daysBetween,
  readCivEntries,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readHeartwormEntries,
  readInfectiousDiseaseEntries,
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
 * 뉴질랜드 (MPI — Ministry for Primary Industries) 절차 검증.
 *
 * 한국 = **Category 3** (rabies absent or well-controlled).
 * 출처: mpi.govt.nz — "Bringing your dog/cat to New Zealand" Category 3 support docs.
 *
 * ⚠️ 검역 (post-entry quarantine) = 입국 후 최소 10일 (MPI-approved facility).
 *  → 면역 유효기간 룰은 출국 + 10일까지 cover 해야 함.
 *  → `vaccine + 364일 (1년 -1일) ≥ dep + 10` ⇒ `dep - vaccine ≤ 354` (AU 와 동일).
 *
 * 컨벤션 (NZ 전용 — MPI 텍스트 그대로):
 *  - 필수 입력 누락 시 SKIP
 *  - MPI 원문 "in the X days prior to shipment" = 출국 X일 전까지 cover → `dep - date ≤ X`
 *    (예: 30일 → ≤30, 16일 → ≤16, 4일 → ≤4, 2일 → ≤2)
 *    AU/EU/SG 의 N-1 strict 컨벤션과 다름 — MPI Cat3 Cert A 원문 §12·13·14·16·27 의
 *    "in the X days prior" 표현이 경계일(30일 전, 4일 전 등)을 명시 허용하기 때문.
 *  - "이상" 경계는 inclusive (≥6개월 → `addMonths(date, 6) ≤ dep`)
 *  - 종 필터는 run() 안에서 caseRow.data.species 로 가드
 */

const COUNTRY = 'new_zealand'

function species(caseRow: CaseRow): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return typeof data.species === 'string' ? data.species : ''
}

export const NZ_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'nz.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 1차 접종일 이전이어야 함. 모든 검사·접종·시술 전 칩 verify 필수. (MPI Category 3 OVD)',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦습니다.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작해야 합니다.',
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'nz.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 3개월령(캘린더) 이상',
    description:
      '광견병 1차 접종은 생년월일 기준 캘린더 3개월(`addMonths(birth, 3)`) 이후. (MPI: "at least three months old" — 월 단위 명시이므로 일수 근사 대신 정확한 캘린더 월 계산.)',
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
          message: `1차 접종일(${first.date})이 3개월령(${earliestValid}) 이전입니다. 생후 ${age ?? '?'}일입니다.`,
          fixHint: `${birth} 기준 3개월(${earliestValid}) 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) ≥ 3개월령(${earliestValid}). 생후 ${age}일.` }
    },
  },
  {
    id: 'nz.rabies-valid-through-quarantine',
    country: COUNTRY,
    category: '광견병',
    title: '출국일 + 검역 10일까지 광견병 면역 유효',
    description:
      '입국 후 10일 검역(최소) 종료까지 광견병 면역이 유지되어야 함. `valid_until ≥ dep + 10일`. 디폴트 1년 (`addYears -1일`) → `dep - rabies ≤ 354일`. valid_until 명시 시 override. (MPI: "no more than 12 months prior to travel" + 10-day quarantine)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      const cushion = daysBetween(dep, validUntil)
      if (cushion === null) return SKIP
      if (cushion < 10) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})과 출국일(${dep})의 차이가 ${cushion}일이라 검역 10일을 cover할 수 없습니다.`,
          fixHint: '출국 전 추가 접종이 필요합니다. 만료 후 접종은 1차로 간주되어 RNATT 재검사가 필요합니다.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국 + 10일 (cushion ${cushion}일).` }
    },
  },
  {
    id: 'nz.rabies-primary-min-6months-before',
    country: COUNTRY,
    category: '광견병',
    title: '1차 접종(primary)은 출국일 6개월 이전',
    description:
      '1차 접종(primary)인 경우 출국일 6개월 이전이어야 함. 부스터(booster, 직전 접종 만료 전 추가 접종)에는 미적용. (MPI: primary "no less than 6 months ... prior to travel"). 단일 접종 = 1차로 간주.',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      // 단일 접종 = 1차. 다회 접종은 booster chain 으로 간주 — 별도 chain 룰에서 검사.
      if (rabies.length > 1) {
        return { ok: true, message: '복수 접종 기록 — booster chain 으로 평가 (이 룰 적용 제외).' }
      }

      const primary = rabies[0]
      const earliestValidDep = addMonths(primary.date, 6)
      if (earliestValidDep <= dep) {
        const days = daysBetween(primary.date, dep)
        return { ok: true, message: `1차 접종(${primary.date}) + 6개월(${earliestValidDep}) ≤ 출국일(${dep}). ${days}일 경과.` }
      }
      const days = daysBetween(primary.date, dep)
      return {
        ok: false,
        message: `1차 접종(${primary.date}) + 6개월(${earliestValidDep})이 출국일(${dep})보다 늦습니다. ${days}일밖에 되지 않습니다.`,
        fixHint: `출국일을 ${earliestValidDep} 이후로 조정하세요. RNATT는 별도로 3개월 대기가 필요합니다.`,
        offendingPaths: ['departure_date', `rabies_dates[${primary.originalIndex}].date`],
      }
    },
  },
  {
    id: 'nz.rabies-booster-chain-intact',
    country: COUNTRY,
    category: '광견병',
    title: '부스터 chain 끊김 없음 (직전 접종 만료 전 부스터)',
    description:
      '각 부스터 접종은 직전 접종의 유효기간 만료 전이어야 함. 만료 후 접종은 1차로 간주(primary 6-12개월 룰 적용). (MPI: "must be administered before the previous rabies vaccination has expired")',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP

      const breaks: Array<{ prev: typeof rabies[number]; curr: typeof rabies[number]; prevValid: string }> = []
      for (let i = 1; i < rabies.length; i++) {
        const prev = rabies[i - 1]
        const curr = rabies[i]
        const prevValidUntil = resolveValidUntil(prev.date, prev.valid_until)
        if (curr.date > prevValidUntil) {
          breaks.push({ prev, curr, prevValid: prevValidUntil })
        }
      }
      if (breaks.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const b of breaks) {
          offending.push(
            `rabies_dates[${b.prev.originalIndex}].date`,
            `rabies_dates[${b.curr.originalIndex}].date`,
          )
          msgs.push(`${b.curr.date} 접종이 직전 접종(${b.prev.date})의 유효기간(${b.prevValid}) 만료 후에 이루어져 1차로 간주됩니다.`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          fixHint: '만료 후 접종은 primary 로 취급되어 6-12개월 대기 + RNATT 재검사가 필요합니다.',
          offendingPaths: Array.from(new Set(offending)),
        }
      }
      return { ok: true, message: '모든 부스터가 직전 접종 만료 전 시점.' }
    },
  },
  // ── RNATT (광견병 항체검사) ──
  {
    id: 'nz.rnatt-3to24months-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: 'RNATT 채혈은 출국일 3~24개월 전',
    description:
      'RNATT 채혈일이 출국일로부터 최소 3개월, 최대 24개월 이내여야 함. (MPI: "not less than 3 months and not more than 24 months prior to departing")',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // 가장 유리한 채혈 = 3~24개월 범위 안에 들어가는 것. 하나라도 통과하면 OK.
      const valid = titers.find((t) => {
        const lower = addMonths(t.date, 3)
        const upper = addMonths(t.date, 24)
        return lower <= dep && upper >= dep
      })
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `RNATT(${valid.date}) → 출국일(${dep}): ${days}일 (3-24개월 범위 안).` }
      }

      // 모두 실패 — 가장 최신 기준 메시지
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const lower = addMonths(newest.date, 3)
      const upper = addMonths(newest.date, 24)
      const days = daysBetween(newest.date, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const reason =
        days === null
          ? '날짜 형식이 올바르지 않습니다.'
          : days < 0
            ? `채혈일(${newest.date})이 출국일(${dep}) 이후입니다.`
            : lower > dep
              ? `RNATT(${newest.date}) + 3개월(${lower})이 출국일(${dep})보다 늦어 3개월에 미달합니다.`
              : `RNATT(${newest.date}) + 24개월(${upper})이 출국일(${dep})보다 빨라 24개월을 초과하므로 재검사가 필요합니다.`
      return {
        ok: false,
        message: reason,
        fixHint: `출국일을 ${lower} ~ ${upper} 범위로 조정하거나 RNATT 재검사를 하세요.`,
        offendingPaths: offending,
      }
    },
  },
  // (≥0.5 IU/ml 결과치 룰은 의도적 제외 — 검사기관에서 이미 fail 결과 나옴, 시스템 검증 불필요)

  // ── 강아지 전용: 9개월 ──
  {
    id: 'nz.dog-min-9months-on-departure',
    country: COUNTRY,
    category: '일정',
    title: '출국일 시점 강아지 9개월 이상',
    description:
      '강아지 전용. 출국일 기준 만 9개월 이상이어야 함. (MPI: "be 9 months of age or older on the date of travel")',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      if (!dep || !birth) return SKIP

      const earliestDep = addMonths(birth, 9)
      if (earliestDep <= dep) {
        return { ok: true, message: `생년월일(${birth}) + 9개월(${earliestDep}) ≤ 출국일(${dep}).` }
      }
      return {
        ok: false,
        message: `생년월일(${birth}) + 9개월(${earliestDep})이 출국일(${dep})보다 늦어 9개월에 미달합니다.`,
        fixHint: `출국일을 ${earliestDep} 이후로 조정하세요.`,
        offendingPaths: ['departure_date', 'birth_date'],
      }
    },
  },

  // ── 일정 ──
  {
    id: 'nz.vet-visit-within-2days-of-departure',
    country: COUNTRY,
    category: '일정',
    title: '최종 임상검사(내원일)는 출국 2일 이내',
    description:
      '최종 pre-export 임상검사는 출국 2일 이내(`0 ≤ dep - visit ≤ 2`). 외부기생충·전염병·CTVT(intact 강아지) 검사 + 2차 구충 동시 진행. (MPI Cat3 Cert A §27: "In the two days prior to shipment, I examined the animal(s)" — 2일 전 진찰을 명시 허용.)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = readVetVisitDate(caseRow, destination) ?? ''
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
      if (diff > 2) {
        return {
          ok: false,
          message: `내원일(${visit})부터 출국일(${dep})까지 ${diff}일입니다. 출국 2일 이내(2일 전 이후)여야 합니다.`,
          fixHint: `내원일을 ${dep} 기준 2일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 구충 ──
  {
    id: 'nz.internal-parasite-protocol',
    country: COUNTRY,
    category: '구충',
    title: '내부구충 2회 (1차 30일 이내, 2차 4일 이내, 14일+ 간격)',
    description:
      '내부구충 2회: 1차 출국 30일 이내(`≤30`) + 2차 출국 4일 이내(`≤4`), 도즈 간격 ≥14일(2주). nematodes + cestodes 효과 제품. (MPI Cat3 Cert A §12: 1st "in the 30 days prior", 2nd "in the four days prior", "at least two weeks" apart)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep) return SKIP
      if (entries.length === 0) return SKIP
      if (entries.length < 2) {
        return {
          ok: false,
          message: `내부구충이 1회만 기록되어 있습니다(${entries[0].date}). 2회가 필요합니다.`,
          fixHint: '14일 이상 간격으로 2차를 추가하세요 (2차는 출국 4일 이내).',
          offendingPaths: [`internal_parasite_dates[${entries[0].originalIndex}].date`],
        }
      }

      const dose1 = entries[entries.length - 2]
      const dose2 = entries[entries.length - 1]
      const dep1 = daysBetween(dose1.date, dep)
      const dep2 = daysBetween(dose2.date, dep)
      const interval = daysBetween(dose1.date, dose2.date)

      const issues: string[] = []
      const offending: string[] = []
      if (dep1 === null || dep1 < 0 || dep1 > 30) {
        issues.push(`1차(${dose1.date})부터 출국까지 ${dep1 ?? '?'}일입니다. 출국 30일 이내(0~30일 범위)여야 합니다.`)
        offending.push(`internal_parasite_dates[${dose1.originalIndex}].date`)
      }
      if (dep2 === null || dep2 < 0 || dep2 > 4) {
        issues.push(`2차(${dose2.date})부터 출국까지 ${dep2 ?? '?'}일입니다. 출국 4일 이내(0~4일 범위)여야 합니다.`)
        offending.push(`internal_parasite_dates[${dose2.originalIndex}].date`)
      }
      if (interval === null || interval < 14) {
        issues.push(`도즈 간격이 ${interval ?? '?'}일입니다. 14일 이상이어야 합니다.`)
        offending.push(
          `internal_parasite_dates[${dose1.originalIndex}].date`,
          `internal_parasite_dates[${dose2.originalIndex}].date`,
        )
      }
      if (issues.length > 0) {
        return { ok: false, message: issues.join(' / '), offendingPaths: Array.from(new Set(offending)) }
      }
      return {
        ok: true,
        message: `1차(${dose1.date}) → 2차(${dose2.date}): 간격 ${interval}일, 2차→출국 ${dep2}일.`,
      }
    },
  },
  {
    id: 'nz.external-parasite-protocol',
    country: COUNTRY,
    category: '구충',
    title: '외부구충 2회 (1차 30일 이내, 2차 2일 이내, 14일+ 간격)',
    description:
      '외부구충 2회: 1차 출국 30일 이내(`≤30`) + 2차 출국 2일 이내(`≤2`), 도즈 간격 ≥14일(2주). ticks + fleas 효과 제품. (MPI Cat3 Cert A §13: 1st "in the 30 days prior", 2nd "in the two days prior", "at least two weeks" apart)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep) return SKIP
      if (entries.length === 0) return SKIP
      if (entries.length < 2) {
        return {
          ok: false,
          message: `외부구충이 1회만 기록되어 있습니다(${entries[0].date}). 2회가 필요합니다.`,
          fixHint: '14일 이상 간격으로 2차를 추가하세요 (2차는 출국 2일 이내).',
          offendingPaths: [`external_parasite_dates[${entries[0].originalIndex}].date`],
        }
      }

      const dose1 = entries[entries.length - 2]
      const dose2 = entries[entries.length - 1]
      const dep1 = daysBetween(dose1.date, dep)
      const dep2 = daysBetween(dose2.date, dep)
      const interval = daysBetween(dose1.date, dose2.date)

      const issues: string[] = []
      const offending: string[] = []
      if (dep1 === null || dep1 < 0 || dep1 > 30) {
        issues.push(`1차(${dose1.date})부터 출국까지 ${dep1 ?? '?'}일입니다. 출국 30일 이내(0~30일 범위)여야 합니다.`)
        offending.push(`external_parasite_dates[${dose1.originalIndex}].date`)
      }
      if (dep2 === null || dep2 < 0 || dep2 > 2) {
        issues.push(`2차(${dose2.date})부터 출국까지 ${dep2 ?? '?'}일입니다. 출국 2일 이내(0~2일 범위)여야 합니다.`)
        offending.push(`external_parasite_dates[${dose2.originalIndex}].date`)
      }
      if (interval === null || interval < 14) {
        issues.push(`도즈 간격이 ${interval ?? '?'}일입니다. 14일 이상이어야 합니다.`)
        offending.push(
          `external_parasite_dates[${dose1.originalIndex}].date`,
          `external_parasite_dates[${dose2.originalIndex}].date`,
        )
      }
      if (issues.length > 0) {
        return { ok: false, message: issues.join(' / '), offendingPaths: Array.from(new Set(offending)) }
      }
      return {
        ok: true,
        message: `1차(${dose1.date}) → 2차(${dose2.date}): 간격 ${interval}일, 2차→출국 ${dep2}일.`,
      }
    },
  },

  // ── 강아지 전용: 심장사상충 ──
  {
    id: 'nz.heartworm-treatment-within-4days',
    country: COUNTRY,
    category: '구충',
    title: '심장사상충 예방 투약은 출국 4일 이내 (강아지)',
    description:
      '강아지 전용. 출국 4일 이내(`≤4`) 등록 예방약 투약 (또는 sustained-release injection). (MPI Cat3 Cert A §14(a): "in the four days prior to the date of shipment")',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readHeartwormEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `심장사상충 투약일(${latest.date})이 출국일(${dep})보다 늦습니다.`,
          offendingPaths: [`heartworm_dates[${latest.originalIndex}].date`],
        }
      }
      if (days > 4) {
        return {
          ok: false,
          message: `최근 심장사상충 투약(${latest.date})부터 출국일(${dep})까지 ${days}일입니다. 출국 4일 이내(4일 전 이후)여야 합니다.`,
          fixHint: `투약일을 ${dep} 기준 4일 전 이후로 조정하세요.`,
          offendingPaths: [`heartworm_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 심장사상충 투약(${latest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },

  // ── 강아지 전용: 전염병검사 ──
  {
    id: 'nz.infectious-disease-test-within-16days',
    country: COUNTRY,
    category: '검사',
    title: '전염병검사는 출국 16일 이내 (강아지)',
    description:
      '강아지 전용. Babesia gibsoni (IFAT/ELISA) + Brucella canis (RSAT/TAT/CPAg-AGID) 검사가 출국 16일 이내(`≤16`). (MPI Cat3 Cert A §16~21: "negative result in the 16 days prior to the date of shipment"). 단일 검체일에 통합 처리됨.',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInfectiousDiseaseEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `검사일(${latest.date})이 출국일(${dep})보다 늦습니다.`,
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`],
        }
      }
      if (days > 16) {
        return {
          ok: false,
          message: `최근 전염병검사(${latest.date})부터 출국일(${dep})까지 ${days}일입니다. 출국 16일 이내(16일 전 이후)여야 합니다.`,
          fixHint: `검사일을 ${dep} 기준 16일 전 이후로 다시 실시하세요.`,
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 전염병검사(${latest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },

  // ── 종합·켄넬코프 (출국 14일 이전 + 검역 10일 cushion) ──
  buildAnnualVaccineRule({
    id: 'nz.general-vaccine-14to364days',
    label: '종합백신',
    dataKey: 'general_vaccine_dates',
    reader: readGeneralVaccineEntries,
    dogOnly: false,
  }),
  buildAnnualVaccineRule({
    id: 'nz.kennel-cough-14to364days',
    label: '켄넬코프',
    dataKey: 'kennel_cough_dates',
    reader: readKennelCoughEntries,
    dogOnly: true,
    sourceNote: '(MPI 의무 아님 — 계류장 입소 시 1회 접종 요구.)',
  }),

  // ── CIV (강아지 한정, 1회 접종 — 계류장 요구사항) ──
  buildAnnualVaccineRule({
    id: 'nz.civ-1dose-14days',
    label: 'CIV(개 독감)',
    dataKey: 'civ_dates',
    reader: readCivEntries,
    dogOnly: true,
    sourceNote: '(MPI Cert §26 은 백신 의무 X — 21일 격리/관찰만. 계류장 입소 시 1회 접종 요구.)',
  }),

  // ── 안내(경고) ──
  {
    id: 'nz.continuous-residence-6months',
    country: COUNTRY,
    category: '일정',
    title: '출국 전 6개월 승인국 거주 (안내)',
    description:
      'MPI: 출국 전 6개월간 승인 국가 연속 거주(또는 since birth). 시스템에 거주 기록 데이터 없음 → 안내 경고.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: () => ({
      ok: true,
      message: '출국 전 6개월 승인국 연속 거주(또는 since birth) 여부 별도 확인 필요.',
    }),
  },
]

/**
 * 종합·독감·켄넬코프 공통 룰 빌더.
 * - 최근 접종 ≥ 출국 14일 전 (`dep - latest ≥ 14`)
 * - 검역 종료까지 면역 유효 (`valid_until ≥ dep + 10일` cushion, 디폴트 1년 = `dep - latest ≤ 354`)
 * - dogOnly = true 시 강아지에만 적용 (고양이는 SKIP)
 * - 1회 접종으로 충분 (다회 접종 시 가장 최근 도즈 기준)
 *
 * MPI: "검역기간 종료 시점까지 유효" — PEQ 10일 cushion 적용. 광견병 룰과 통일.
 */
function buildAnnualVaccineRule(opts: {
  id: string
  label: string
  dataKey: 'general_vaccine_dates' | 'civ_dates' | 'kennel_cough_dates'
  reader: (cr: CaseRow) => VaccineEntry[]
  dogOnly: boolean
  sourceNote?: string
}): ProcedureCheck {
  const speciesNote = opts.dogOnly ? ' (강아지)' : ''
  const speciesPrefix = opts.dogOnly ? '강아지 전용. ' : ''
  const sourceSuffix = opts.sourceNote ? ` ${opts.sourceNote}` : ''
  return {
    id: opts.id,
    country: COUNTRY,
    category: '종합백신',
    title: `${opts.label} 출국 14일 이전 + 검역 10일 cover${speciesNote}`,
    description: `${speciesPrefix}최근 ${opts.label} 접종이 출국일 14일 이전 + 검역(10일) 종료까지 면역 유효 (cushion ≥10일). 1회 접종으로 충분. 디폴트 1년 → \`dep - vacc ≤ 354\`. valid_until 명시 시 override.${sourceSuffix}`,
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
        return { ok: false, message: '날짜 형식이 올바르지 않습니다.', offendingPaths: [`${opts.dataKey}[${latest.originalIndex}].date`] }
      }
      if (toDep < 0) {
        issues.push(`최근 접종(${latest.date})이 출국일(${dep})보다 늦습니다.`)
      } else if (toDep < 14) {
        issues.push(`최근 접종(${latest.date})부터 출국까지 ${toDep}일입니다. 14일 이상이어야 합니다.`)
      }
      if (validUntil) {
        const cushion = daysBetween(dep, validUntil)
        if (cushion === null || cushion < 10) {
          issues.push(`유효기간(${validUntil})과 출국일(${dep})의 차이가 ${cushion ?? '?'}일이라 검역 10일을 cover할 수 없습니다.`)
        }
      }
      if (issues.length > 0) {
        return {
          ok: false,
          message: issues.join(' / '),
          fixHint: '부스터를 추가하거나 출국일을 조정하여 출국 14일 전 + 검역 10일까지 유효하도록 하세요.',
          offendingPaths: ['departure_date', `${opts.dataKey}[${latest.originalIndex}].date`],
        }
      }
      return {
        ok: true,
        message: `최근 접종(${latest.date}) → 출국(${dep}): ${toDep}일, 유효기간 ${validUntil} (검역 cushion OK).`,
      }
    },
  }
}
