import {
  buildDateRuleContext,
  isValidBooster,
  validateKrImportDate,
  validatePhImportPermitVaccineGap,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  daysBetween,
  findSameGuardianCases,
  readGeneralVaccineEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 필리핀 (BAI — Bureau of Animal Industry) 절차 검증.
 *
 * 출처:
 *  - BAI Pet Import 페이지 — https://www.bai.gov.ph/Stakeholders/PetImport
 *  - BAI MC No. 49 (2022) "Streamlining the SPS Import Clearance for Dogs and Cats" —
 *    https://ww2.bai.gov.ph/media/gwvj4njp/memorandum-circular-no-49-streamlining-the-sps-import-clearance-application-requirements-of-dogs-and-cats-for-one-time-importation-2022.pdf
 *  - BAI Citizen's Charter 2024 (3rd Ed.) — https://ww2.bai.gov.ph/media/bdybdoyx/2024-bai-citizen-s-charter.pdf
 *
 * ⚠️ 핵심:
 *  - 마이크로칩 (ISO 호환) ≤ 광견병 1차 (BAI MC 49)
 *  - 광견병: 생후 12주(84일) 이상, 1차는 SPSIC 신청 14일 전 (≈ 출국 21일 전 합산), 1년 유효, 부스터 즉시 출국 가능
 *  - 종합백신 (개 DHLPPi / 고양이 FVRCP): 1차는 SPSIC 신청 14일 전, 1년 유효, 부스터 즉시 가능
 *  - 내·외부구충: SPSIC 신청 기준 7~91일 (BAI MC 49 명시 의무)
 *  - 출국 시 만 4개월(120일) 이상 (SPSIC 신청 자격)
 *  - 한국 APQA 검역: 출국 10일 이내(보수 ≤9)
 *  - SPSIC import permit: 60일 유효, 1회 3마리 한도
 *
 * RNATT: BAI 입국 의무 아님 (한국 귀국용 별도 흐름) → 검증 미적용.
 *
 * 컨벤션 (NZ/HI/CN/TH 와 동일):
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "X일 이전" / "X일 전" → `dep - X ≥ N` (이상 inclusive)
 */

const COUNTRY = 'philippines'

export const PH_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'ph.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785, 15자리)이 광견병 접종일과 같거나 이전이어야 함. 매 준비 단계마다 칩 스캔 확인 필수. (BAI SPSIC) 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 접종(${first.date}).` }
      }
      return {
        ok: false,
        message: '접종일은 마이크로칩 삽입일 이후여야 합니다.',
        offendingPaths: ['microchip_implant_date', `rabies_dates[${first.originalIndex}].date`],
      }
    },
  },
  {
    id: 'ph.microchip-before-general-vaccine',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 종합백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785, 15자리)이 종합백신 접종일과 같거나 이전이어야 함. 칩으로 식별된 동물의 접종만 인정 — 백신 입력 시 client 차단과 짝, 칩 시술일 수정 후 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const entries = readGeneralVaccineEntries(caseRow)
      if (!microchip || entries.length === 0) return SKIP

      const first = entries[0] // readGeneralVaccineEntries 는 날짜순 정렬 — [0] = 가장 이른 접종.
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 종합백신(${first.date}).` }
      }
      return {
        ok: false,
        message: '접종일은 마이크로칩 삽입일 이후여야 합니다.',
        offendingPaths: ['microchip_implant_date', `general_vaccine_dates[${first.originalIndex}].date`],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'ph.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. (BAI MC 49 — EU Reg 576/2013 동일 기준)',
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
    id: 'ph.rabies-prime-21days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국 21일 이전 완료 (유효 부스터 면제)',
    description:
      'BAI 공식: "initial rabies vaccination should not be less than 14 days prior to application of the SPSIC". SPSIC 신청 ≈ 출국 7-14일 전 → 합산 21일 (dep proxy). **직전 접종 유효기간 내 재접종한 유효 부스터는 면제** ("annual booster, shipped immediately"). 만료 후 재접종(단절)은 새 1차라 21일 적용.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      // 유효 부스터(직전 접종 면역 유효기간 내 재접종)는 21일 면제 — 태국과 동일 기준.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (isValidBooster(data, 'rabies_dates')) {
        return { ok: true, message: '유효 부스터 — 21일 대기 면제.' }
      }

      // 유효 부스터가 아니면(1차·단절) 가장 최근 접종 기준 21일.
      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})부터 출국(${dep})까지 ${days}일입니다. 21일 이상이어야 합니다.`,
          fixHint: `출국일을 ${latest.date} 기준 21일 이후로 조정하세요. (직전 접종 유효기간 내 재접종이면 21일 면제됩니다.)`,
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ph.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효 (접종일 포함 1년 = 364일까지)',
    description:
      '최근 광견병 접종 면역 유효기간이 도착일 이전 만료되지 않아야 함. **접종일 포함 1년 = +364일**까지 허용. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear` = +364).',
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
    id: 'ph.general-vaccine-prime-21days-before-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종은 출국 21일 이전 완료 (유효 부스터 면제)',
    description:
      '종합백신(강아지 DHLPPi / 고양이 FVRCP) 가장 최근 접종이 출국일 기준 21일 이전 완료. **직전 접종 유효기간 내 재접종한 유효 부스터는 면제** (광견병과 동일 기준). 만료 후 재접종(단절)은 새 1차라 21일 적용.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      // 유효 부스터(직전 접종 면역 유효기간 내 재접종)는 21일 면제 — 광견병과 동일 기준.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (isValidBooster(data, 'general_vaccine_dates')) {
        return { ok: true, message: '유효 부스터 — 21일 대기 면제.' }
      }

      // 유효 부스터가 아니면(1차·단절) 가장 최근 접종 기준 21일.
      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date})부터 출국(${dep})까지 ${days}일입니다. 21일 이상이어야 합니다.`,
          fixHint: `출국일을 ${latest.date} 기준 21일 이후로 조정하세요. (직전 접종 유효기간 내 재접종이면 21일 면제됩니다.)`,
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ph.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '도착일에 종합백신 면역 유효 (접종일 포함 1년 = 364일까지)',
    description:
      '최근 종합백신 면역 유효기간이 도착일 이전 만료되지 않아야 함. **접종일 포함 1년 = +364일**까지 허용. valid_until 명시 시 그 값, 미명시 시 디폴트 1년 (`addOneYear` = +364).',
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

  // ── 일정 ──
  {
    id: 'ph.min-120days-on-arrival',
    country: COUNTRY,
    category: '일정',
    title: '출국일 시점 만 120일(약 4개월) 이상',
    description:
      '필리핀 SPSIC 신청 자격: 생후 120일(약 4개월) 이상. (BAI MC 49: "Only dogs and cats that are 120 days and above at the time of SPSIC application")',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      if (!dep || !birth) return SKIP

      const ageOnDep = daysBetween(birth, dep)
      if (ageOnDep === null) return SKIP
      if (ageOnDep < 120) {
        return {
          ok: false,
          message: `생년월일(${birth}) 기준 출국(${dep}) 시점에 ${ageOnDep}일령입니다. 최소 120일령(4개월) 이상이어야 합니다.`,
          fixHint: `출국일을 ${birth} 기준 120일 이후로 조정하세요.`,
          offendingPaths: ['departure_date', 'birth_date'],
        }
      }
      return { ok: true, message: `출국일 시점 ${ageOnDep}일령 (≥120).` }
    },
  },
  // ── 보호자 한도 (1회 3마리) ──
  {
    id: 'ph.max-3pets-per-shipment',
    country: COUNTRY,
    category: '서류',
    title: '1회 수입 한도 3마리 (BAI MC 49)',
    description:
      'BAI MC 49: SPSIC 1회 신청당 최대 3마리. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 필리핀 목적 케이스 4건 이상 등록 시 경고.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases, destination }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 > 3) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 필리핀 목적 케이스를 ${others.length + 1}건 등록하여 1회 3마리 한도를 초과했습니다.`,
          fixHint: 'BAI MC 49에 따라 1회 신청당 최대 3마리까지 가능합니다. 추가 등록은 별도 SPSIC 신청이 필요합니다.',
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 ≤ 3건.' }
    },
  },

  // ── 수입허가(SPSIC) — 백신 14일 후 신청 (부스터 면제) ──
  {
    id: 'ph.import-permit-14days-after-vaccines',
    country: COUNTRY,
    category: '수입허가',
    title: '백신, 수입허가증(SPSIC) 타이밍',
    description:
      'SPSIC 신청은 광견병·종합백신 1차(단일 접종) 기준 14일 이후 — 부스터(2회+)는 BAI 면제. 입력 차단(validatePhImportPermitVaccineGap)과 같은 함수.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const msg = validatePhImportPermitVaccineGap(filed, data)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date'],
        }
      }
      return { ok: true, message: `신청일(${filed}) 백신 접종 14일 이후 (또는 부스터 면제).` }
    },
  },

  // ── 검역 일정 재검증 — 입력 차단과 같은 규칙을 매 렌더 재실행 (jp/th *-date-valid 와 동일 모델) ──
  {
    id: 'ph.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '필리핀 수입 동물검역일',
    description: '필리핀 수입 동물검역일은 필리핀 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ph_import_quarantine_date === 'string'
          ? data.ph_import_quarantine_date.slice(0, 10)
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
          message: '필리핀 수입 동물검역일은 필리핀 입국일보다 빠를 수 없습니다.',
          offendingPaths: ['ph_import_quarantine_date'],
        }
      }
      return { ok: true, message: `필리핀 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'ph.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '필리핀 수출 동물검역일',
    description: '필리핀 수출 동물검역일은 필리핀 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ph_export_quarantine_date === 'string'
          ? data.ph_export_quarantine_date.slice(0, 10)
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
          message: '필리핀 수출 동물검역일은 필리핀 입국일보다 빠를 수 없습니다.',
          offendingPaths: ['ph_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '필리핀 수출 동물검역일은 한국 귀국일보다 늦을 수 없습니다.',
          offendingPaths: ['ph_export_quarantine_date'],
        }
      }
      return { ok: true, message: `필리핀 수출검역일(${raw}) 필리핀 체류 구간 내.` }
    },
  },
  {
    id: 'ph.kr-import-quarantine-date-valid',
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
