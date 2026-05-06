import type { ProcedureCheck } from './types'
import {
  daysBetween,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 필리핀 (BAI — Bureau of Animal Industry) 절차 검증.
 *
 * 출처: petmove 가이드 (https://www.petmove.co.kr/docs/ph/) + 한국 BAI 안내.
 *
 * ⚠️ 핵심:
 *  - 마이크로칩 (ISO 11784/11785) ≤ 광견병 1차
 *  - 광견병: 생후 12주(84일) 이상, 출발 14일 이전 완료, 1년 유효
 *  - 종합백신 (개 DHLPPi / 고양이 FVRCP): 출발 14일 이전 완료, 1년 유효
 *  - 내부구충: 출발 7-91일 사이 치료 (SPSIC 신청 기준 — dep proxy)
 *  - 출국 시 만 4개월 이상 (SPSIC 신청 자격)
 *  - 한국 APQA 검역: 출국 10일 이내
 *  - SPSIC import permit: 출발 1-2주 전 신청, 60일 유효 (별도 데이터 추적 미구현 → info)
 *
 * RNATT: 필리핀 입국엔 비필수 (한국 귀국용은 별도 흐름) → 검증 미적용. TH 와 동일 정책.
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
    id: 'ph.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. (petmove 가이드 + EU 동일 기준)',
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
    id: 'ph.rabies-prime-21days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 출국 21일 이전 완료 (부스터 면제)',
    description:
      'BAI 공식: "initial rabies vaccination should not be less than 14 days prior to application of the SPSIC". SPSIC 신청 ≈ 출국 7-14일 전 → 합산 21일 (dep proxy). **annual booster (2차+) 는 즉시 출국 가능 — BAI 면제** ("animals may be shipped immediately upon vaccination").',
    severity: 'blocker',
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
          message: `1차 접종(${first.date}) → 출국(${dep}): ${days}일 (≥21일 필요).`,
          fixHint: `출국일을 ${first.date} 기준 21일 이후로 조정하거나 2차(부스터) 접종 추가 (부스터는 시점 제한 없음).`,
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
    id: 'ph.general-vaccine-prime-21days-before-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 1차 접종은 출국 21일 이전 완료 (부스터 면제)',
    description:
      '종합백신(강아지 DHLPPi / 고양이 FVRCP) 1차 접종이 출국일 기준 21일 이전 완료. **부스터(2차+) 는 즉시 출국 가능 — BAI 면제** (광견병 부스터 면제 정책 동일 적용).',
    severity: 'blocker',
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
          message: `1차 종합백신(${first.date}) → 출국(${dep}): ${days}일 (≥21일 필요).`,
          fixHint: `출국일을 ${first.date} 기준 21일 이후로 조정하거나 2차(부스터) 접종 추가 (부스터는 시점 제한 없음).`,
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
    id: 'ph.min-120days-on-arrival',
    country: COUNTRY,
    category: '일정',
    title: '출국일 시점 만 120일(약 4개월) 이상',
    description:
      '필리핀 SPSIC 신청 자격: 생후 120일(약 4개월) 이상. (petmove 가이드: "생후 120일 이상의 강아지·고양이만 신청 가능")',
    severity: 'blocker',
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
          message: `생년월일(${birth}) → 출국(${dep}): ${ageOnDep}일령 — 최소 120일령(4개월) 필요.`,
          fixHint: `출국일을 ${birth} 기준 120일 이후로 조정.`,
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
      '한국 APQA 검역 endorsement: 출국일 기준 10일 이내(`≤9`). 출발 7-9일 전 권장. (petmove 가이드 + 한국 검역본부 공통 룰)',
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
]
