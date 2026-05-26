import type { ProcedureCheck } from './types'
import {
  daysBetween,
  findSameGuardianCases,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
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
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785, 15자리)이 광견병 1차 접종일과 같거나 이전이어야 함. 매 준비 단계마다 칩 스캔 확인 필수. (BAI SPSIC)',
    severity: 'info',
    addedAt: '2026-05-06',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦습니다.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작해야 합니다.',
        offendingPaths: ['microchip_implant_date'],
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
    severity: 'info',
    addedAt: '2026-05-06',
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
    title: '광견병 1차 접종은 출국 21일 이전 완료 (부스터 면제)',
    description:
      'BAI 공식: "initial rabies vaccination should not be less than 14 days prior to application of the SPSIC". SPSIC 신청 ≈ 출국 7-14일 전 → 합산 21일 (dep proxy). **annual booster (2차+) 는 즉시 출국 가능 — BAI 면제** ("animals may be shipped immediately upon vaccination").',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      // BAI: 부스터(2차+) 는 시점 제한 없음 — 단일 도즈(1차)만 21일 검증.
      if (rabies.length >= 2) {
        return { ok: true, message: `광견병 ${rabies.length}회 접종 — 부스터 BAI 면제 (즉시 출국 가능).` }
      }

      const first = rabies[0]
      const days = daysBetween(first.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `1차 접종(${first.date})부터 출국(${dep})까지 ${days}일입니다. 21일 이상이어야 합니다.`,
          fixHint: `출국일을 ${first.date} 기준 21일 이후로 조정하거나 2차(부스터)를 추가 접종하세요 (부스터는 시점 제한이 없습니다).`,
          offendingPaths: ['departure_date', `rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종(${first.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ph.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효 (접종일 포함 1년 = 364일까지)',
    description:
      '최근 광견병 접종 면역 유효기간이 도착일 이전 만료되지 않아야 함. **접종일 포함 1년 = +364일**까지 허용. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear` = +364).',
    severity: 'info',
    addedAt: '2026-05-06',
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
    title: '종합백신 1차 접종은 출국 21일 이전 완료 (부스터 면제)',
    description:
      '종합백신(강아지 DHLPPi / 고양이 FVRCP) 1차 접종이 출국일 기준 21일 이전 완료. **부스터(2차+) 는 즉시 출국 가능 — BAI 면제** (광견병 부스터 면제 정책 동일 적용).',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      // BAI: 부스터(2차+) 는 시점 제한 없음 — 단일 도즈(1차)만 21일 검증.
      if (entries.length >= 2) {
        return { ok: true, message: `종합백신 ${entries.length}회 접종 — 부스터 BAI 면제 (즉시 출국 가능).` }
      }

      const first = entries[0]
      const days = daysBetween(first.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `1차 종합백신(${first.date})부터 출국(${dep})까지 ${days}일입니다. 21일 이상이어야 합니다.`,
          fixHint: `출국일을 ${first.date} 기준 21일 이후로 조정하거나 2차(부스터)를 추가 접종하세요 (부스터는 시점 제한이 없습니다).`,
          offendingPaths: ['departure_date', `general_vaccine_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 종합백신(${first.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ph.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '도착일에 종합백신 면역 유효 (접종일 포함 1년 = 364일까지)',
    description:
      '최근 종합백신 면역 유효기간이 도착일 이전 만료되지 않아야 함. **접종일 포함 1년 = +364일**까지 허용. valid_until 명시 시 그 값, 미명시 시 디폴트 1년 (`addOneYear` = +364).',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
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
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
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
  {
    id: 'ph.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (한국 APQA)',
    description:
      '한국 APQA 검역 endorsement: 출국일 기준 10일 이내(`≤9`). 출발 7-9일 전 권장. (사용자 보수 N-1 적용)',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
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
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit})부터 출국일(${dep})까지 ${diff}일입니다. 10일 이내(9일 전부터)여야 합니다 (한국 APQA).`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정하세요 (출발 7-9일 전 권장).`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
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
    run: ({ caseRow, relatedCases }) => {
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
]
