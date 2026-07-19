import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgGeneralVaccineExpiredBefore, msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 홍콩 (AFCD — Agriculture, Fisheries & Conservation Department) 절차 검증.
 *
 * 출처:
 *  - AFCD Group II 페이지 — https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/qua_ie_ipab_idc_Group_II.html
 *  - DC-02v05 Group II Terms (Jun-2025) — https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/files/DC_02v05_Terms_for_import_G2_Jun25B.pdf
 *  - VC-DC2 Health Certificate (Oct-2025) — https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/files/VC_DC2_Oct_25E.pdf
 *
 * 한국 = Group II (38개국 명단 명시 포함). 격리 면제, RNATT 면제 가능.
 *
 * 핵심 룰:
 *  - 마이크로칩: ISO 11784/11785 또는 AVID 호환 (DC-02v05 명시)
 *  - 광견병: "at least 90 days old" (보수 91일 AND 캘린더 3개월) + 출국 30일 전 + 1년 유효
 *  - 종합백신: **필수**, 출국 14일 전 + 1년 유효
 *      · 강아지: DHP (Distemper, Infectious Canine Hepatitis, Parvovirus)
 *      · 고양이: Feline Panleukopenia + Feline Respiratory Disease (FVRCP)
 *  - 건강증명서(VC-DC2): 출국일 14일 이내. 한국 APQA 10일 + 사용자 보수 N-1 → ≤9 적용
 *  - 거주 요건: 한국에서 출국 전 180일 이상 연속 거주 (또는 출생 이후)
 *
 * 별도 (시스템 검증 제외 또는 추가 권고):
 *  - RNATT: Group II 면제 (한국 귀국용은 별도 워크플로)
 *  - 내·외부 기생충: 출국 14일 이내 처치 (VC-DC2 명시 의무) — 신규 룰 추가 권고
 *  - Special Permit (Form AF240, 6개월 유효): 사무 절차
 *
 * 컨벤션 (BR/MX/RU 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
 */

const COUNTRY = 'hongkong'

export const HK_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'hk.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      'ISO 11784/11785 또는 AVID 호환 마이크로칩이 광견병 접종일과 같거나 이전이어야 함. 칩 이전 접종은 추적 불가로 무효 — 칩 이후 접종이 1건이라도 있으면 그 접종부터 유효 기록으로 인정. (AFCD DC-02v05: "implanted with a microchip ... compliant with ISO or AVID standards")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP

      // 칩 이후(같은 날 포함) 접종이 1건이라도 있으면 충족 — 그 접종부터 유효 면역 기록.
      const valid = rabies.find((r) => microchip <= r.date)
      if (valid) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 광견병 접종(${valid.date}).` }
      }
      const last = rabies[rabies.length - 1]
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'hk.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'AFCD DC-02v05: "the animal was at least 90 days old when it was vaccinated" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
              ? `${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 ${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('91일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'hk.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (AFCD DC-02v05: "vaccinated against rabies not less than 30 days ... prior to export")',
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
    id: 'hk.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함.',
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

  // ── 종합백신 ──
  {
    id: 'hk.general-vaccine-required',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종 필수',
    description:
      '종합백신 접종 기록 필요. 강아지: DHP (Distemper, Infectious Canine Hepatitis, Parvovirus), 고양이: Feline Panleukopenia + Feline Respiratory Disease (FVRCP). (AFCD DC-02v05 / VC-DC2 명시)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) {
        return {
          ok: false,
          message: '종합백신 기록이 없어요.',
        }
      }
      return { ok: true, message: `종합백신 ${entries.length}회 기록됨.` }
    },
  },
  {
    id: 'hk.general-vaccine-14days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신은 출국일 14일 이상 전 접종',
    description:
      '종합백신 접종일로부터 출국일까지 최소 14일 경과 필요. (AFCD: "vaccinated ... not less than 14 days and not more than 1 year before importation")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 14) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date})부터 출국일(${dep})까지 ${days}일이에요. 14일 이상이어야 해요.`,
          offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'hk.general-vaccine-valid-on-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '출국일에 종합백신 면역 유효',
    description:
      '최근 종합백신의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: msgGeneralVaccineExpiredBefore('출국'),
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },
]
