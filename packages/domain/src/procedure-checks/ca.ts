import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 캐나다 (CFIA — Canadian Food Inspection Agency, CBSA — Canada Border Services Agency) 절차 검증.
 *
 * 출처:
 *  - CFIA "Bringing animals to Canada" — https://inspection.canada.ca/en/importing-food-plants-animals/pets
 *  - CFIA Import Reference Document — https://inspection.canada.ca/en/animal-health/terrestrial-animals/imports/import-policies/general/reference-document
 *  - CBSA Travelling with animals — https://www.cbsa-asfc.gc.ca/services/fpa-apa/animals-animaux-eng.html
 *
 * 핵심 룰:
 *  - 마이크로칩: CFIA 의무 아님 + 마이크로칩↔광견병 순서 규정 없음 → 시스템 검증 제외
 *  - 광견병: 3개월 미만 면제, 3개월 이상 의무 + 도착일 유효 (보수 91일 AND 캘린더 3개월)
 *  - 건강증명서: CFIA 별도 일자 의무 부재. 한국 APQA endorsement 10일 이내 적용 (보수 ≤9)
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: CFIA 입국 의무 아님 (고양이 옵션). 한국 귀국용은 별도 흐름
 *  - 종합백신/구충: CFIA 의무 아님
 *  - 상업용 8개월 미만 강아지(고위험국) 금지: 동적 확인 필요
 *
 * 컨벤션:
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'canada'

export const CA_CHECKS: ProcedureCheck[] = [
  // ── 광견병 ──
  {
    id: 'ca.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'CFIA: 3개월 이상 강아지·고양이는 광견병 백신 의무 (3개월 미만 면제). 보수적으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요. (CFIA Import Reference Document)',
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
            ? `생후 ${ev.ageInDays}일령으로 91일에 미달합니다`
            : ev.failedRule === 'calendar3m'
              ? `접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빠릅니다`
              : `생후 ${ev.ageInDays}일령이며 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빠릅니다`
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 보수적 기준을 충족하지 못합니다. ${reason}.`,
          fixHint: `생후 91일 AND ${ev.calendar3mThreshold}(캘린더 3개월)을 둘 다 충족하는 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'ca.rabies-valid-on-departure',
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep})보다 빨라 만료됩니다.`,
          fixHint: '출국 전 부스터 접종이 필요합니다.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 일정 ──
  {
    id: 'ca.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (보수: 9일 전부터)',
    description:
      '수의사 임상검사·증명서 발급은 출국일(항공기 탑승) 기준 10일 이내(`≤9`). CFIA는 별도 일자 의무 명문 없음 — 한국 APQA endorsement 10일 룰 + 사용자 보수 N-1 적용.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = readVetVisitDate(caseRow, destination) ?? ''
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
          message: `내원일(${visit})부터 출국일(${dep})까지 ${diff}일입니다. 출국일 포함 10일 이내(9일 전 이후)여야 합니다.`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
