import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  exceedsValidityYears,
  findSameGuardianCases,
  matchBannedBreed,
  readBreed,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 베트남 (DAH — Department of Animal Health, Cục Thú y) 절차 검증.
 *
 * 출처:
 *  - Circular 25/2016/TT-BNNPTNT 제10조 (2016-06-30 시행, 2025-06-24 Circular 28/2025로 일부 개정)
 *  - 미 대사관 베트남 안내 — https://vn.usembassy.gov/wp-content/uploads/sites/124/2024/08/Bring-Pets-to-or-from-Vietnam.pdf
 *  - USDA APHIS Vietnam — https://www.aphis.usda.gov/pet-travel/us-to-another-country-export/pet-travel-us-vietnam
 *  - MOIT 무역포털 — https://vntr.moit.gov.vn/procedures/detail/25
 *
 * 핵심 룰:
 *  - 마이크로칩: ISO 11784/11785 15자리 (DAH/APHIS), 광견병 백신 이전 이식
 *  - 광견병: **생후 3개월 이상(달력)**, 출국 30일 이상~12개월 이내 접종, 출국일 면역 유효
 *    ※ 규정 문구가 "at least 3 months of age" — 일수(90/91일)로 환산하지 않는다.
 *      달력 3개월은 생월에 따라 89~92일이라, 고정 일수 기준이면 11·12·1·2월생이 규정대로
 *      접종해도 입력이 막힌다(2026-07-19 수정). 판정은 date-rules 의 meetsCalendarAge 단일 함수.
 *  - **3년 라이선스 백신 불인정** (DAH 운용 + USDA APHIS + 미 대사관 일치 — Circular 25 본문 1차 명문 미확인)
 *  - 건강증명서 ≤ 출국 10일 이내 (보수 ≤9). 한국 APQA 정부수의관 발급
 *  - 외국인 최대 2마리 (Circular 25 제10조)
 *
 * ⚠️ **사전 신고·수입허가 없음** (2026-07-19 원문 확인으로 정정)
 *   예전 헤더는 "DAH Form 19 Import Permit: 출국 7-10일 전 신청"이라 적혀 있었고 그에 따라
 *   '검역 신청' 카드까지 만들었으나, Circular 25 제10조 원문은 그 반대다:
 *     "The commodity owners shall register the quarantine personally **at the animal quarantine
 *      body at border gate** when carrying along the animals … No more than 02 units … or
 *      **carried along upon traveling**"
 *   → 동반 2마리 이하는 **출국 전 제출이 아니라 도착 공항 검역소에서 현장 등록**한다.
 *   Form 19 는 정식(상업·임시수입) 절차용 서식이라 여행 동반에는 해당 없음.
 *   사용자 실무 관찰("검역 신청하고 가는 사람을 본 적 없다")과도 일치.
 *   → vn-advance-notice 카드·룰·서류·필드 전부 제거. 도착 검역(departure)이 이 절차를 담당.
 *  - Pit Bull, Tosa, Dogo Argentino 등 견종 제한
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: DAH 의무 아님 (APHIS 명기). 한국 귀국용은 별도 흐름
 *  - 도착 후 14일 격리 (요건 미충족 시 또는 입국 거부)
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'vietnam'

export const VN_CHECKS: ProcedureCheck[] = [
  {
    id: 'vn.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (베트남 입국 면제, 한국 수출검역 사실상 필수)',
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
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'vn.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      'DAH/APHIS: "at least 3 months of age" — 달력 3개월 기준. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      // 일수(91일)로 환산하지 않는다 — 달력 3개월은 생월에 따라 89~92일이라, 고정 일수로
      // 보면 11·12·1·2월생이 규정대로 접종해도 위반으로 뜬다(2026-07-19 수정).
      if (!meetsCalendarAge(birth, first.date, 3)) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('3개월'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return {
        ok: true,
        message: `1차 접종일(${first.date}) 생후 3개월(${calendarAgeThreshold(birth, 3)}) 이후.`,
      }
    },
  },
  {
    id: 'vn.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (DAH/APHIS: "at least 30 days ... before the intended date of entry")',
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
    id: 'vn.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (3년 거부)',
    description:
      '광견병 백신 면역 유효기간 1년만 인정. valid_until 이 접종일 + 1년(달력, 그날 포함) 초과면 거부. (DAH 운용 지침: "Vietnam does not recognize the 3-year rabies vaccine" — USDA APHIS, 미 대사관 일치. Circular 25/2016 본문 1차 명문 미확인)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const violations: Array<{ entry: typeof rabies[number]; validUntil: string }> = []
      for (const r of rabies) {
        if (exceedsValidityYears(r.date, r.valid_until)) {
          violations.push({ entry: r, validUntil: resolveValidUntil(r.date, r.valid_until) })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(`rabies_dates[${v.entry.originalIndex}].valid_until`)
          msgs.push('광견병 백신은 면역 유효기간 1년짜리만 인정돼요. 3년 백신은 사용할 수 없어요.')
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 광견병 백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'vn.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
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
          message: msgRabiesExpiredBefore('출국'),
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },
  // ── 수입 금지 견종 ──
  {
    id: 'vn.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull, Tosa, Dogo Argentino 등)',
    description:
      '베트남은 Pit Bull Terrier, Japanese Tosa, Dogo Argentino 등 견종 수입 제한. (Circular 25/2016 + USDA APHIS Vietnam)',
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
        'tosa', '도사',
        'dogo argentino', '도고 아르헨티노',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은(는) 베트남 수입 제한 견종이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 보호자 한도 (외국인 최대 2마리) ──
  {
    id: 'vn.max-2pets-per-guardian',
    country: COUNTRY,
    category: '서류',
    title: '외국인 최대 2마리 한도 (Circular 25/2016 제10조)',
    description:
      'Circular 25/2016/TT-BNNPTNT 제10조: 외국인은 반려 목적으로 최대 2마리까지 동반 가능. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 베트남 목적 케이스 3건 이상 등록 시 경고.',
    severity: 'warning',
    // relatedCases 는 펫무브워크(운영자)만 전달 — 보호자 이름·건수가 필요한 운영자용 룰.
    audience: 'staff',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases, destination }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 > 2) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 베트남 목적 케이스를 ${others.length + 1}건 등록하여 2마리 한도를 초과해요.`,
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 ≤ 2건.' }
    },
  },
  // ── 도착 수입 검역 ──
  {
    id: 'vn.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '베트남 수입 검역일',
    description: '베트남 수입 검역일은 베트남 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-19',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.vn_import_quarantine_date === 'string'
          ? data.vn_import_quarantine_date.slice(0, 10)
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
          message: '베트남 수입 검역일은 베트남 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['vn_import_quarantine_date'],
        }
      }
      return { ok: true, message: `베트남 수입검역일(${raw}) 입국 이후.` }
    },
  },

]
