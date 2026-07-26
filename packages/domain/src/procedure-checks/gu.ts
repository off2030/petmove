import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  addYears,
  daysBetween,
  findRabiesValidityBreaks,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readHeartwormEntries,
  readInternalParasiteEntries,
  readKennelCoughEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import {
  msgImportQuarantineBeforeEntry,
  msgMicrochipBeforeRabies,
  msgRabiesExpiredBefore,
} from './messages'
import { buildDateRuleContext, validateUsDogEntryDate } from '../journey-steps/date-rules'

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
 *  - **RNATT (OIE-FAVN)**: 직전 접종 후 10일+ + ≥0.5 IU/mL (홈 검역 직행은 ≥1.0) + 검체 lab 수령일부터 **120일 후** 도착,
 *    **검사 유효기간 12개월**(2026-07-26 사용자 확정 — 구 "36개월"은 하와이 값 혼입이라 폐기.
 *    www 괌 가이드의 "검사 유효기간은 1년"과 같은 값. 프로파일 titer.entryValidityMonths 가 진실 출처)
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
        message: msgMicrochipBeforeRabies(),
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
    title: '도착일에 광견병 면역 유효 (라벨 유효기간 기준)',
    description:
      '최근 광견병 접종 면역 유효기간이 도착일 이전 만료되지 않아야 함. **괌은 1년 고정이 아니라 백신 라벨(승인 유효기간)을 따른다** — CQA: "administered not more than 365 days prior to the animal\'s release (36 months for approved 3-year vaccines)". 그래서 사용자가 고른 valid_until 을 그대로 쓴다(1·2·3년 모두 선택 가능 — 괌은 RABIES_ONE_YEAR_VALIDITY_DESTINATIONS 에 없다). 미명시 시에만 디폴트 1년. ⛔ 제목·설명을 1년으로 되돌리지 말 것(2026-07-26 — 3년 백신을 1년으로 오해하게 만든다).',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
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

  {
    id: 'gu.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주되고, 괌이 요구하는 "평생 2회"를 다시 쌓아야 한다. 저장 거부(findRabiesChainBreak)와 **같은 판정**이라 짝이 맞는다 — 이 룰이 없으면 저장은 막히는데 펫무브워크에는 끊긴 chain 이 안 보인다(홍콩과 같은 이유로 2026-07-27 추가, 사용자 확정 "체인 유지되어야 해").',
    severity: 'warning',
    addedAt: '2026-07-27',
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
    id: 'gu.departure-within-12months-of-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 항체 검사일 12개월 이내',
    description:
      '항체 검사 유효기간 12개월(프로파일 titer.entryValidityMonths — 사용자 확정 2026-07-26) — 출국일이 채혈일 + 1년을 넘으면 재검사가 필요하다. 1주년 당일까지 인정. 싱가포르 sg.departure-within-12months-of-titer 와 같은 구조. ⚠️ 괌은 채혈 후 120일을 기다려야 해서 **쓸 수 있는 창이 120일~12개월로 좁다** — 대기(gu.rnatt-120days-before-arrival)만 검사하고 상한을 안 보면, 너무 일찍 검사한 케이스가 만료된 채로 통과한다(2026-07-27 카드 문구와 대조하다 발견 — 문구는 "1년간 유효"라고 안내하는데 판정이 없었다).',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return {
          ok: true,
          message: `항체 검사(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).`,
        }
      }
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: '광견병 항체 검사 결과는 12개월간 유효해요. 유효기간이 지나기 전에 출국해야 해요.',
        offendingPaths: offending,
      }
    },
  },

  // ── 앱 여정(2026-07-26 승격) 에서 카드가 지목하는 룰 ──────────────────
  // 위 룰들은 펫무브워크 전용 시절에 만든 것이고, 아래 3건은 고객 카드가 쓰는 요건이다.
  {
    id: 'gu.dog-entry-age-six-months',
    country: COUNTRY,
    category: '일정',
    title: '강아지는 괌 도착일에 생후 6개월 이상',
    description:
      'DOAG 브로슈어 INTERNATIONAL ARRIVALS(2024-08-01 CDC 시행): "Dogs must be at least 6 months of age." 괌은 미국령이라 CDC 연방 규칙을 그대로 받는다. 저장 거부(validateUsDogEntryDate — 미국과 같은 함수)와 같은 판정. 출생일은 못 바꾸니 해소가 날짜 변경뿐이라 blocker.',
    severity: 'blocker',
    addedAt: '2026-07-26',
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      if (ctx.data.species !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      const error = validateUsDogEntryDate(dep, ctx)
      if (!error) return { ok: true, message: `출국일(${dep}) 기준 생후 6개월 이상.` }
      return { ok: false, message: error, offendingPaths: ['birth_date', 'departure_date'] }
    },
  },
  {
    id: 'gu.import-permit-30days-before-arrival',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 서류는 도착 30일 전까지 제출',
    description:
      'DOAG: "All required import documents must be submitted at least 30 days prior to the intended arrival date." 14일 미만이면 처리를 보장하지 않고 장기 계류·입국 거부 위험이 있다(브로슈어 FAQ 는 2~3개월 전 권장). 마감을 놓쳐도 신청 자체는 가능하므로 주의만 — 저장 거부로 올리지 말 것.',
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      const days = daysBetween(filed, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message:
            '괌 도착 30일 전까지 수입 허가 서류를 제출해야 해요. 늦으면 계류가 길어지거나 입국이 거부될 수 있어요.',
          offendingPaths: ['import_permit_application_date', 'departure_date'],
        }
      }
      return { ok: true, message: `제출일(${filed}) → 도착(${dep}): ${days}일 (30일 이상).` }
    },
  },
  {
    id: 'gu.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '괌 수입 검역일은 도착일 이후',
    description:
      '도착 후 지정 검역시설에 입소하는 절차라 입국일보다 빠를 수 없다. 다른 목적지 수입검역일 룰과 같은 구조.',
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const raw = ctx.data.gu_import_quarantine_date
      const q = typeof raw === 'string' ? raw.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q)) return SKIP
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      if (q < dep) {
        return {
          ok: false,
          message: msgImportQuarantineBeforeEntry('괌'),
          offendingPaths: ['gu_import_quarantine_date', 'departure_date'],
        }
      }
      return { ok: true, message: `검역일(${q}) ≥ 도착일(${dep}).` }
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
    description: `${speciesPrefix}최근 ${opts.label} 접종이 출국일 10일 이전 완료 + **1년 = 1주년 당일까지** 유효기간 안. valid_until 명시 시 override.`,
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
