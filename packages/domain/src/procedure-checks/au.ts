import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  readAustraliaExtra,
  readCivEntries,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readInfectiousDiseaseEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgMicrochipBeforeRabies } from './messages'

/**
 * 호주 (DAFF — Department of Agriculture, Fisheries & Forestry) 절차 검증.
 *
 * 한국 = **Group 3** (rabies-controlled). 특별 검역 절차 적용.
 * 출처: agriculture.gov.au — Group 3 dog/cat step-by-step guide.
 *
 * ⚠️ 검역 (post-entry quarantine) = 입국 후 최소 10일.
 *  → 면역 유효기간 룰은 출국 + 10일까지 cover 해야 함.
 *  → `valid_until ≥ dep + 10일` (디폴트 1년 = 접종일의 1주년 당일까지 유효).
 *
 * 컨벤션: jp/sg/eu 와 동일.
 *  - 필수 입력 누락 시 SKIP
 *  - "X일 이내" 사용자 컨벤션: 경계일 제외 (45일 이내 → ≤ 44, 5일 이내 → ≤ 4)
 *  - "이상" 경계는 inclusive (28일 이상 → ≥ 28)
 *  - 종 필터는 run() 안에서 caseRow.data.species 로 가드
 */

const COUNTRY = 'australia'

function species(caseRow: CaseRow): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return typeof data.species === 'string' ? data.species : ''
}

function isIntact(caseRow: CaseRow): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const sex = typeof data.sex === 'string' ? data.sex : ''
  return sex === 'male' || sex === 'female'
}

export const AU_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'au.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 호환)이 광견병 1차 접종일 이전이어야 함. 시술 후 접종만 인정.',
    severity: 'info',
    addedAt: '2026-05-05',
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
  // (광견병 1차 접종 연령 룰은 호주 DAFF 미명시 — 의도적 제외)
  {
    id: 'au.rabies-valid-through-quarantine',
    country: COUNTRY,
    category: '광견병',
    title: '출국일 + 검역 10일까지 광견병 면역 유효',
    description:
      '입국 후 10일 검역(최소) 종료까지 광견병 면역이 유지되어야 함. `valid_until ≥ dep + 10일`. 디폴트 1년(접종일의 1주년 당일까지). valid_until 명시 시 override.',
    severity: 'info',
    addedAt: '2026-05-05',
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})과 출국일(${dep})의 차이가 ${cushion}일이라 검역 10일을 cover할 수 없어요.`,
          offendingPaths: [
            'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국 + 10일 (cushion ${cushion}일).` }
    },
  },
  {
    id: 'au.titer-min-180days-after-sample-received',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 RNATT 검체 lab 도착일 180일 이후',
    description:
      'RNATT 검체가 DAFF 승인 lab 에 도착한 날부터 180일 의무 대기. 우선순위: rabies_titer_records[].received_date → australia_extra.sample_received_date(legacy) → 채혈일(fallback).',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      const auExtra = readAustraliaExtra(caseRow)
      if (!dep) return SKIP

      // 우선순위:
      //  (1) titer record 내 received_date — 가장 정확한 record-level 데이터
      //  (2) australia_extra.sample_received_date — legacy 단일 필드
      //  (3) 채혈일 fallback — 가장 이른 = 가장 긴 대기 = 가장 유리
      let basis: { kind: 'received_record' | 'received_legacy' | 'sample'; date: string; titerIdx?: number } | null = null
      const receivedRecord = titers.find((t) => t.received_date)
      if (receivedRecord && receivedRecord.received_date) {
        basis = { kind: 'received_record', date: receivedRecord.received_date, titerIdx: receivedRecord.originalIndex }
      } else if (auExtra.sample_received_date) {
        basis = { kind: 'received_legacy', date: auExtra.sample_received_date }
      } else if (titers.length > 0) {
        const earliest = titers.reduce((a, b) => (a.date <= b.date ? a : b))
        basis = { kind: 'sample', date: earliest.date, titerIdx: earliest.originalIndex }
      } else {
        return SKIP
      }

      const days = daysBetween(basis.date, dep)
      if (days === null) return SKIP
      // 정확한 lab 수령일이 있으면 180일, 채혈일 fallback 시 lab 수령은 며칠 후이므로 +7일 마진 적용 → 187일.
      const required = basis.kind === 'sample' ? 187 : 180
      if (days < required) {
        const offendingPaths = ['departure_date']
        if (basis.kind === 'received_record') {
          offendingPaths.push(`rabies_titer_records[${basis.titerIdx}].received_date`)
        } else if (basis.kind === 'received_legacy') {
          offendingPaths.push('australia_extra.sample_received_date')
        } else {
          offendingPaths.push(`rabies_titer_records[${basis.titerIdx}].date`)
        }
        const label = basis.kind === 'sample' ? '채혈일(검체일 미입력 fallback)' : '검체 도착일'
        const reqLabel = basis.kind === 'sample' ? '187일(180+7 보수)' : '180일'
        return {
          ok: false,
          message: `${label}(${basis.date})부터 출국일(${dep})까지 ${days}일이에요. ${reqLabel} 이상이어야 해요.`,
          offendingPaths,
        }
      }
      const label = basis.kind === 'sample' ? '채혈일' : '검체 도착일'
      return { ok: true, message: `${label}(${basis.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'au.titer-within-12months-of-export',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 RNATT 검사일 12개월 이내',
    description:
      'RNATT 결과 유효기간 12개월 — 출국까지 유효해야 함. 채혈일의 1주년 당일까지 인정 (`addYears(titer, 1)` 사용).',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return {
          ok: true,
          message: `RNATT(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).`,
        }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const newestValidUntil = addYears(newest.date, 1)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `최신 RNATT(${newest.date})의 유효기간(${newestValidUntil})이 출국일(${dep})보다 빨라요.`,
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'au.id-verification-before-titer',
    country: COUNTRY,
    category: '마이크로칩',
    title: 'ID 확인은 RNATT 채혈 이전 별도 visit',
    description:
      'DAFF: "Identity verification must occur **prior to** RNATT blood sampling. Cannot be at the same vet visit as the RNATT." 같은 날 시술도 RNATT 무효화. → `id_date < titer_date` 엄격.',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const titers = readTiterEntries(caseRow)
      const auExtra = readAustraliaExtra(caseRow)
      if (!auExtra.id_date || titers.length === 0) return SKIP

      // 모든 titer 가 id_date 이후여야 함
      const violations = titers.filter((t) => t.date <= auExtra.id_date!)
      if (violations.length > 0) {
        const offendingPaths = ['australia_extra.id_date']
        for (const t of violations) offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
        const samplelist = violations.map((t) => t.date).join(', ')
        return {
          ok: false,
          message: `ID 확인일(${auExtra.id_date})이 RNATT 채혈일(${samplelist}) 이전이 아니에요. 같은 날 시술하면 RNATT가 무효가 되어 180일 시계가 재시작돼요.`,
          offendingPaths,
        }
      }
      return { ok: true, message: `ID 확인일(${auExtra.id_date}) < 모든 RNATT 채혈일.` }
    },
  },

  // ── 강아지 전용 ──
  {
    id: 'au.comprehensive-vaccine-valid-through-quarantine',
    country: COUNTRY,
    category: '종합백신',
    title: '출국 + 검역 10일까지 종합백신(DHPP+L) 면역 유효',
    description:
      '강아지 전용. DHPP+L (Lepto 포함) 가 검역 종료까지 유효해야 함. `valid_until ≥ dep + 10일`. 디폴트 1년(1주년 당일까지). valid_until 명시 시 override.',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      const cushion = daysBetween(dep, validUntil)
      if (cushion === null) return SKIP
      if (cushion < 10) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date})의 유효기간(${validUntil})과 출국일(${dep})의 차이가 ${cushion}일이라 검역 10일을 cover할 수 없어요.`,
          offendingPaths: [
            'departure_date',
            `general_vaccine_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국 + 10일.` }
    },
  },
  {
    id: 'au.infectious-disease-test-within-45days',
    country: COUNTRY,
    category: '검사',
    title: '전염병검사는 출국일 45일 이내 (강아지)',
    description:
      '강아지 전용. Brucella canis(intact 한정) + Leishmania infantum + Lepto MAT(종합백신 미완 시) 통합 검사일. 출국일 포함 45일 이내, 45일 전 제외 (`0 ≤ dep - test ≤ 44`).',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInfectiousDiseaseEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      // 가장 최근 검사일 기준
      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `검사일(${latest.date})이 출국일(${dep})보다 늦어요. 날짜를 확인하세요.`,
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`],
        }
      }
      if (days > 44) {
        return {
          ok: false,
          message: `최근 전염병검사(${latest.date})부터 출국일(${dep})까지 ${days}일이에요. 출국일 포함 45일 이내(44일 전 이후)여야 해요.`,
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 전염병검사(${latest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'au.civ-2doses-2weeks-apart-and-valid',
    country: COUNTRY,
    category: '종합백신',
    title: 'CIV(독감) 2회 정확히 14일 간격 + 2차는 출국 14일 전 이상·검역까지 유효',
    description:
      '강아지 전용. CIV 2회 접종, **정확히 14일 간격** (`dose2 - dose1 == 14`). 2차 완료 ≤ 출국 14일 전 (`dep - dose2 ≥ 14`), 검역 종료까지 유효 (`valid_until ≥ dep + 10일`).',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readCivEntries(caseRow)
      if (!dep) return SKIP
      if (entries.length === 0) return SKIP
      if (entries.length < 2) {
        return {
          ok: false,
          message: `CIV가 1회만 기록되어 있어요(${entries[0].date}). 2회 접종이 필요해요.`,
          offendingPaths: [`civ_dates[${entries[0].originalIndex}].date`],
        }
      }

      // 가장 최근 2개 도즈를 기준
      const dose1 = entries[entries.length - 2]
      const dose2 = entries[entries.length - 1]
      const interval = daysBetween(dose1.date, dose2.date)
      const dose2ToDep = daysBetween(dose2.date, dep)
      const dose2ValidUntil = resolveValidUntil(dose2.date, dose2.valid_until)
      const cushion = dose2ValidUntil ? daysBetween(dep, dose2ValidUntil) : null

      const issues: string[] = []
      const offending: string[] = []
      if (interval !== 14) {
        issues.push(`도즈 간격이 ${interval ?? '?'}일이에요. 정확히 14일이어야 해요.`)
        offending.push(`civ_dates[${dose1.originalIndex}].date`, `civ_dates[${dose2.originalIndex}].date`)
      }
      if (dose2ToDep !== null && dose2ToDep < 14) {
        issues.push(`2차 접종부터 출국까지 ${dose2ToDep}일이에요. 14일 이상이어야 해요.`)
        offending.push(`civ_dates[${dose2.originalIndex}].date`)
      }
      if (cushion !== null && cushion < 10) {
        issues.push(`2차 유효기간(${dose2ValidUntil})과 출국일의 차이가 ${cushion}일이라 검역 10일을 cover할 수 없어요.`)
        offending.push(`civ_dates[${dose2.originalIndex}].date`)
      }
      if (issues.length > 0) {
        return {
          ok: false,
          message: issues.join(' / '),
          offendingPaths: Array.from(new Set(offending)),
        }
      }
      return {
        ok: true,
        message: `CIV 1차(${dose1.date}) + 14일 → 2차(${dose2.date}), 2차→출국 ${dose2ToDep}일, 검역 cushion ${cushion}일.`,
      }
    },
  },

  // ── 외부구충 (종 분리) ──
  ...buildExternalParasiteRule('cat', 21, 'au.external-parasite-protocol-cat'),
  ...buildExternalParasiteRule('dog', 30, 'au.external-parasite-protocol-dog'),

  // ── 내부구충 (양종 동일) ──
  {
    id: 'au.internal-parasite-protocol',
    country: COUNTRY,
    category: '구충',
    title: '내부구충 2회 (45일 이내, 14일+ 간격, 2차 5일 이내)',
    description:
      '내부구충 2회 모두 출국 45일 이내 (≤44), 도즈 간격 ≥14일, 2차는 출국 5일 이내 (≤4).',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep) return SKIP
      if (entries.length === 0) return SKIP
      if (entries.length < 2) {
        return {
          ok: false,
          message: `내부구충이 1회만 기록되어 있어요(${entries[0].date}). 2회가 필요해요.`,
          offendingPaths: [`internal_parasite_dates[${entries[0].originalIndex}].date`],
        }
      }

      // 가장 최근 2개 도즈를 검증 대상으로 사용
      const dose1 = entries[entries.length - 2]
      const dose2 = entries[entries.length - 1]
      const dep1 = daysBetween(dose1.date, dep)
      const dep2 = daysBetween(dose2.date, dep)
      const interval = daysBetween(dose1.date, dose2.date)

      const issues: string[] = []
      const offending: string[] = []
      if (dep1 === null || dep1 < 0 || dep1 > 44) {
        issues.push(`1차(${dose1.date})부터 출국까지 ${dep1 ?? '?'}일이에요. 0~44일 범위여야 해요.`)
        offending.push(`internal_parasite_dates[${dose1.originalIndex}].date`)
      }
      if (dep2 === null || dep2 < 0 || dep2 > 4) {
        issues.push(`2차(${dose2.date})부터 출국까지 ${dep2 ?? '?'}일이에요. 0~4일 범위여야 해요.`)
        offending.push(`internal_parasite_dates[${dose2.originalIndex}].date`)
      }
      if (interval === null || interval < 14) {
        issues.push(`도즈 간격이 ${interval ?? '?'}일이에요. 14일 이상이어야 해요.`)
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

  // ── 경고 ──
  {
    id: 'au.continuous-residence-180days',
    country: COUNTRY,
    category: '일정',
    title: '출국 전 180일 승인국 거주 (안내)',
    description:
      'DAFF: 출국 전 180일 동안 승인 국가에서 연속 거주. 시스템에 거주 기록 데이터 없음 → 안내 경고.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: () => ({
      ok: true,
      message: '출국 전 180일 승인국 연속 거주 여부 별도 확인 필요.',
    }),
  },
]

/** 외부구충 룰 빌더. species 필터 + 첫 도즈 ≥ N + 도즈 간 간격 ≤ N + 마지막→출국 ≤ N. */
function buildExternalParasiteRule(
  speciesKey: 'cat' | 'dog',
  maxIntervalDays: number,
  id: string,
): ProcedureCheck[] {
  return [
    {
      id,
      country: COUNTRY,
      category: '구충',
      title:
        speciesKey === 'cat'
          ? '외부구충 (고양이): 첫 도즈 ≥21일 전, 간격 ≤21일, 출국까지 지속'
          : '외부구충 (강아지): 첫 도즈 ≥30일 전, 간격 ≤30일, 출국까지 지속',
      description:
        speciesKey === 'cat'
          ? 'DAFF: 출국 21일 전 시작, 출국일까지 지속. 각 consecutive 도즈 간격 21일 이하 + 마지막 도즈→출국 21일 이하 (continuous protection).'
          : 'DAFF: 출국 30일 전 시작, 출국일까지 지속. 각 consecutive 도즈 간격 30일 이하 + 마지막 도즈→출국 30일 이하.',
      severity: 'info',
      addedAt: '2026-05-05',
      run: ({ caseRow, destination }) => {
        if (species(caseRow) !== speciesKey) return SKIP
        const dep = readDepartureDate(caseRow, destination)
        const entries = readExternalParasiteEntries(caseRow)
        if (!dep || entries.length === 0) return SKIP

        const first = entries[0]
        const firstToDep = daysBetween(first.date, dep)
        const issues: string[] = []
        const offending: string[] = []

        // 첫 도즈 ≥ N 일 전
        if (firstToDep === null || firstToDep < maxIntervalDays) {
          issues.push(`첫 도즈(${first.date})부터 출국까지 ${firstToDep ?? '?'}일이에요. ${maxIntervalDays}일 이상이어야 해요.`)
          offending.push(`external_parasite_dates[${first.originalIndex}].date`)
        }

        // consecutive 도즈 간격 ≤ N
        for (let i = 1; i < entries.length; i++) {
          const prev = entries[i - 1]
          const curr = entries[i]
          const gap = daysBetween(prev.date, curr.date)
          if (gap === null) continue
          if (gap > maxIntervalDays) {
            issues.push(`${prev.date}부터 ${curr.date}까지 도즈 간격이 ${gap}일이에요. ${maxIntervalDays}일 이하여야 해요.`)
            offending.push(
              `external_parasite_dates[${prev.originalIndex}].date`,
              `external_parasite_dates[${curr.originalIndex}].date`,
            )
          }
        }

        // 마지막 도즈 → 출국 ≤ N (continuous protection)
        const last = entries[entries.length - 1]
        const lastToDep = daysBetween(last.date, dep)
        if (lastToDep === null || lastToDep < 0 || lastToDep > maxIntervalDays) {
          issues.push(`마지막(${last.date})부터 출국까지 ${lastToDep ?? '?'}일이에요. 0~${maxIntervalDays}일 범위여야 해요.`)
          offending.push(`external_parasite_dates[${last.originalIndex}].date`)
        }

        if (issues.length > 0) {
          return {
            ok: false,
            message: issues.join(' / '),
            offendingPaths: Array.from(new Set(offending)),
          }
        }
        return {
          ok: true,
          message: `첫(${first.date}) → 마지막(${last.date}) → 출국(${dep}): 모든 간격 ≤${maxIntervalDays}일.`,
        }
      },
    } satisfies ProcedureCheck,
  ]
}
