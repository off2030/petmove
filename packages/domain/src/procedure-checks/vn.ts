import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  evaluateRabiesAgeConservative,
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
 *  - 광견병: 생후 90일 이상, 출국 30일 이상~12개월 이내 접종, 출국일 면역 유효
 *  - **3년 라이선스 백신 불인정** (DAH 운용 + USDA APHIS + 미 대사관 일치 — Circular 25 본문 1차 명문 미확인)
 *  - 건강증명서 ≤ 출국 10일 이내 (보수 ≤9). 한국 APQA 정부수의관 발급
 *  - DAH Form 19 (Appendix V) Import Permit: 처리 5근무일, 출국 7-10일 전 신청
 *  - 외국인 최대 2마리 (Circular 25 제10조)
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦어요. 날짜를 확인하세요.`,
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'vn.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'DAH/APHIS: "at least 3 months of age" — 보수적으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
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
            ? `생후 ${ev.ageInDays}일령으로 91일에 미달해요`
            : ev.failedRule === 'calendar3m'
              ? `1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 보수적 기준을 충족하지 않아요. ${reason}.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
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
          msgs.push(`${v.entry.date} 백신의 면역 유효기간(${v.validUntil})이 1년(${addYears(v.entry.date, 1)})을 넘어요. 3년 백신은 인정되지 않아요.`)
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료돼요.`,
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
]
