import type { ProcedureCheck } from './types'
import {
  daysBetween,
  matchBannedBreed,
  readBreed,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
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
 *  - **광견병 항체검사 (RNATT)**: 태국 입국엔 비필수 (한국 귀국용은 별도 흐름)
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
    severity: 'blocker',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦음.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작 필요.',
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
    severity: 'blocker',
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
          message: `1차 접종일(${first.date})이 생후 ${age}일령 — 최소 84일령(12주) 이상 필요.`,
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
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일 (≥21일 필요).`,
          fixHint: `출국일을 ${latest.date} 기준 21일 이후로 조정하거나 부스터를 더 일찍 접종.`,
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
    severity: 'blocker',
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
          message: `최근 접종(${latest.date}) 유효기간(${validUntil}) < 출국일(${dep}) — 만료.`,
          fixHint: '출국 전 부스터 접종 필요.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 종합백신 ──
  {
    id: 'th.general-vaccine-21days-before-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 출국(=도착) 21일 이전 완료',
    description:
      '종합백신(강아지 DHPPL / 고양이 Panleukopenia 포함 FVRCP) 가장 최근 접종이 도착일 기준 21일 이전 완료. (DLD: 광견병과 동일 21일 룰 적용 — 1차/단절 시. 유효 부스터 면제하나 보수적으로 모든 경우 적용)',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date}) → 출국(${dep}): ${days}일 (≥21일 필요).`,
          fixHint: `출국일을 ${latest.date} 기준 21일 이후로 조정하거나 부스터를 더 일찍 접종.`,
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
    severity: 'blocker',
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
          message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) < 출국일(${dep}) — 만료.`,
          fixHint: '출국 전 부스터 접종 필요.',
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 일정 ──
  {
    id: 'th.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (한국 APQA)',
    description:
      'DLD 자체 일자 명문 없음. 한국 APQA 검역 endorsement: 출국일 기준 10일 이내(`≤9`). 출발 7-9일 전 권장. (사용자 보수 N-1 적용)',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (!dep || !visit) return SKIP

      const diff = daysBetween(visit, dep)
      if (diff === null) {
        return { ok: false, message: '날짜 형식 오류.', offendingPaths: ['vet_visit_date'] }
      }
      if (diff < 0) {
        return {
          ok: false,
          message: `내원일(${visit})이 출국일(${dep})보다 늦음.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 10일 이내(≤9일 전) 필요 (한국 APQA).`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정 (출발 7-9일 전 권장).`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 안내(경고) ──
  {
    id: 'th.r7-import-permit-info',
    country: COUNTRY,
    category: '서류',
    title: 'R7 수입허가증 신청 (출발 7영업일 ~ 60일 전)',
    description:
      'DLD R7 import permit 은 출발 최소 7영업일 ~ 최대 60일 전 신청. 발행 후 60일 유효, 처리 1-2주 소요. 시스템에 R7 신청 추적 데이터 없음 → 안내 경고.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: () => ({
      ok: true,
      message: 'R7 수입허가증 신청이 출발 7영업일 이전 완료되었는지 별도 확인 필요.',
    }),
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
    run: ({ caseRow }) => {
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
          message: `견종 "${breed.ko || breed.en}"은 태국 수입 금지 (매치: ${match}).`,
          fixHint: '태국 내 사육은 합법이나 수입은 법으로 금지됨.',
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },
]
