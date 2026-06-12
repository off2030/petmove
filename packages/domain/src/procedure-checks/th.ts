import {
  buildDateRuleContext,
  validateKrImportDate,
  validateThImportPermitDate,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  daysBetween,
  matchBannedBreed,
  readBreed,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 태국 (DLD — Department of Livestock Development, กรมปศุสัตว์) 절차 검증.
 *
 * 출처:
 *  - DLD AQS-Suvarnabhumi 공식 안내 — http://aqs-suvarn-dld.go.th/wp/en/import-en/importation-of-pet-dog-and-cat/
 *  - 태국 외교부(MFA) 공식 PDF (Revised 30 Jan 2025) —
 *    https://image.mfa.go.th/mfa/0/91fPdh6NtO/About-Thailand/Bringing_Pets_to_Thailand/All_Airports_-_Instructions_for_Bringing_Dog-Cat-Rabbit_into_Thailand_from_the_USA_(Revised_30Jan2025).pdf
 *  - DLD AQI 영문 PDF — https://aqi.dld.go.th/webnew/images/stories/document/data-import-export/importation_eng.pdf
 *
 * ⚠️ 핵심:
 *  - **광견병 접종 출발 21일 전 완료** (1차 또는 단절 시; 유효 부스터 면제) + 생후 12주(84일) 이상
 *  - 종합백신 (개 DHPPL / 고양이 Panleukopenia 포함 FVRCP) 출발 21일 전 완료
 *  - **광견병 항체 검사 (RNATT)**: 태국 입국엔 비필수 (한국 귀국용은 별도 흐름)
 *  - R7 import permit: 출발 7영업일 ~ 60일 전 신청, 60일 유효 (별도 데이터 추적 미구현 → info)
 *  - 한국 APQA 검역: 출국 10일 이내 (보수 ≤9). DLD 자체 일자 명문 없음.
 *  - 핏불 계열 수입 금지
 *
 * 컨벤션 (NZ/HI/CN 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "X일 이전" / "X일 전" → `dep - X ≥ N` (이상 inclusive)
 */

const COUNTRY = 'thailand'

export const TH_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'th.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 1차 접종일과 같거나 이전이어야 함. 입국 시 칩 번호와 서류 일치 검증. (DLD 표준)',
    severity: 'warning',
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
    id: 'th.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. 불활화(사독) 또는 재조합 백신만 인정. (DLD 공식: "at least 3 months old or 12 weeks or 84 days at time of administered")',
    severity: 'warning',
    addedAt: '2026-05-06',
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
          message: `1차 접종일(${first.date})이 생후 ${age}일령입니다. 최소 84일령(12주) 이상이어야 합니다.`,
          fixHint: `${birth} 기준 84일 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'th.rabies-21days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국(=도착) 21일 이전 완료',
    description:
      '가장 최근 광견병 접종이 도착일 기준 21일 이전 완료. (DLD: "primary or discontinuity vaccination must wait for 21 days before departure. Valid booster vaccination, waiting period not required" — 보수적으로 모든 경우 21일 적용)',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})부터 출국(${dep})까지 ${days}일입니다. 21일 이상이어야 합니다.`,
          fixHint: `출국일을 ${latest.date} 기준 21일 이후로 조정하거나 부스터를 더 일찍 접종하세요.`,
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'th.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear`).',
    severity: 'warning',
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료됩니다.`,
          fixHint: '출국 전 부스터 접종이 필요합니다.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 종합백신 ──
  {
    id: 'th.general-vaccine-required',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종 필수',
    description:
      'DLD: 강아지 DHPPL (Distemper/Hepatitis/Parvo/Lepto/Parainflu) / 고양이 FVRCP (Panleukopenia 포함) 의무. (DLD: "Animals must be vaccinated ... against Rabies, Distemper, Hepatitis, Parvo and Leptospirosis for dogs, and Rabies and Feline Panleukopenia for cats")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) {
        return {
          ok: false,
          message: '종합백신 기록이 없습니다. DLD 의무 사항입니다.',
          fixHint: '강아지는 DHPPL, 고양이는 FVRCP(Panleukopenia 포함) 접종 후 등록하세요.',
        }
      }
      return { ok: true, message: `종합백신 ${entries.length}회 기록됨.` }
    },
  },
  {
    id: 'th.general-vaccine-21days-before-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 출국(=도착) 21일 이전 완료',
    description:
      '종합백신(강아지 DHPPL / 고양이 Panleukopenia 포함 FVRCP) 가장 최근 접종이 도착일 기준 21일 이전 완료. (DLD: 광견병과 동일 21일 룰 적용 — 1차/단절 시. 유효 부스터 면제하나 보수적으로 모든 경우 적용)',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date})부터 출국(${dep})까지 ${days}일입니다. 21일 이상이어야 합니다.`,
          fixHint: `출국일을 ${latest.date} 기준 21일 이후로 조정하거나 부스터를 더 일찍 접종하세요.`,
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'th.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '도착일에 종합백신 면역 유효',
    description:
      '최근 종합백신 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년.',
    severity: 'warning',
    addedAt: '2026-05-06',
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
          message: `최근 종합백신(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료됩니다.`,
          fixHint: '출국 전 부스터 접종이 필요합니다.',
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 수입 금지 견종 ──
  {
    id: 'th.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull 계열)',
    description:
      '태국은 American Pit Bull Terrier, American Staffordshire Terrier 등 핏불 계열 수입 금지. (DLD/태국 정부)',
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
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은 태국 수입이 금지되어 있습니다 (매치: ${match}).`,
          fixHint: '태국 내 사육은 합법이나 수입은 법으로 금지되어 있습니다.',
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 수입 허가 ──
  {
    id: 'th.import-permit-9days-before-entry',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청 마감 (입국 7영업일 전)',
    description:
      '수입 허가 신청일은 태국 입국일 기준 최소 7영업일(달력일 최소 9일) 이전이어야 함. 입력 시 차단(validateThImportPermitDate)과 같은 함수 — 항공편 수정 후 어긋난 케이스를 주의로 표면화. (DLD: at least 7 business days prior to departure)',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed =
        typeof data.import_permit_application_date === 'string'
          ? data.import_permit_application_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const msg = validateThImportPermitDate(filed, entry)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date', 'entry_date'],
        }
      }
      return { ok: true, message: entry ? `신청일(${filed}) 입국(${entry}) 9일 이전.` : `신청일(${filed}) 입력됨 (입국일 미입력).` }
    },
  },

  // ── 검역 일정 재검증 — 입력 차단과 같은 규칙을 매 렌더 재실행 (jp.*-date-valid 와 동일 모델) ──
  {
    id: 'th.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '태국 수입 동물검역일',
    description: '태국 수입 동물검역일은 태국 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.th_import_quarantine_date === 'string'
          ? data.th_import_quarantine_date.slice(0, 10)
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
          message: '태국 수입 동물검역일은 태국 입국일보다 빠를 수 없습니다.',
          offendingPaths: ['th_import_quarantine_date'],
        }
      }
      return { ok: true, message: `태국 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'th.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '태국 수출 동물검역일',
    description: '태국 수출 동물검역일은 태국 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.th_export_quarantine_date === 'string'
          ? data.th_export_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const ret =
        typeof ctx.data.return_date === 'string' && ctx.data.return_date.length >= 10
          ? ctx.data.return_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '태국 수출 동물검역일은 태국 입국일보다 빠를 수 없습니다.',
          offendingPaths: ['th_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '태국 수출 동물검역일은 한국 귀국일보다 늦을 수 없습니다.',
          offendingPaths: ['th_export_quarantine_date'],
        }
      }
      return { ok: true, message: `태국 수출검역일(${raw}) 태국 체류 구간 내.` }
    },
  },
  {
    id: 'th.kr-import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '한국 수입 동물검역일',
    description: '한국 수입 동물검역일은 한국 귀국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kr_import_quarantine_date === 'string'
          ? data.kr_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateKrImportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['kr_import_quarantine_date'] }
      }
      return { ok: true, message: `한국 수입검역일(${raw}) 귀국 이후.` }
    },
  },
]
