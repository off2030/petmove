import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 홍콩 (AFCD — Agriculture, Fisheries & Conservation Department) 절차 검증.
 *
 * 출처: petmove 가이드 (https://www.petmove.co.kr/docs/hongkong-pet-travel-guide/)
 *
 * 한국 = Group II (격리 면제, RNATT 면제) — AFCD 분류.
 *
 * 핵심 룰:
 *  - 마이크로칩: ISO 표준, **모든 절차 중 가장 먼저 시행** (필수)
 *  - 광견병: 1차 보수적(91일 AND 캘린더 3개월) + 출국 30일 전 + 1년 유효
 *  - 종합백신: **필수**, 출국 14일 전 + 1년 유효
 *      · 강아지: DHP (distemper/hepatitis/parvo)
 *      · 고양이: FVRCP (panleukopenia/herpesvirus/calicivirus)
 *  - 건강증명서: 출국일 10일 이내
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: 한국 = Group II → 면제 (한국 귀국용은 별도 워크플로)
 *  - 구충: petmove 미명시
 *  - 수입허가증(6개월 유효), 화물 운송 한정: 사무 절차
 *
 * 컨벤션 (BR/MX/RU 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'hongkong'

export const HK_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'hk.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (petmove 가이드: "모든 절차 중 가장 먼저")',
    severity: 'blocker',
    addedAt: '2026-05-07',
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
    id: 'hk.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'petmove 가이드 + AFCD 정량 미명시 — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
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
            ? `생후 ${ev.ageInDays}일령 — 91일 미달`
            : ev.failedRule === 'calendar3m'
              ? `${first.date} < 캘린더 3개월(${ev.calendar3mThreshold})`
              : `생후 ${ev.ageInDays}일령 + ${first.date} < 캘린더 3개월(${ev.calendar3mThreshold})`
        return {
          ok: false,
          message: `1차 접종일(${first.date}) 보수적 기준 미충족 — ${reason}.`,
          fixHint: `생후 91일 AND ${ev.calendar3mThreshold}(캘린더 3개월) 둘 다 충족 이후로 1차 접종일을 조정하세요.`,
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
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (petmove 가이드: "출국 최소 30일 전 접종")',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const earliest = rabies[0]
      const days = daysBetween(earliest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일 — 30일 이상 필요.`,
          fixHint: `광견병 접종을 출국일 ${dep} 기준 30일 이전에 완료하세요.`,
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
    severity: 'blocker',
    addedAt: '2026-05-07',
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
    id: 'hk.general-vaccine-required',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종 필수',
    description:
      '종합백신 접종 기록 필요. 강아지: DHP(distemper/hepatitis/parvo), 고양이: FVRCP(panleukopenia/herpesvirus/calicivirus). (petmove 가이드 명시)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) {
        return {
          ok: false,
          message: '종합백신 기록 없음.',
          fixHint: '강아지: DHP, 고양이: FVRCP 접종 후 등록.',
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
      '종합백신 접종일로부터 출국일까지 최소 14일 경과 필요. (petmove 가이드: "출국 최소 14일 전")',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 14) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date}) → 출국일(${dep}): ${days}일 — 14일 이상 필요.`,
          fixHint: `종합백신을 출국일 ${dep} 기준 14일 이전에 접종하세요.`,
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
    severity: 'blocker',
    addedAt: '2026-05-07',
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
          fixHint: '출국 전 추가 접종 필요.',
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 일정 ──
  {
    id: 'hk.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내',
    description:
      '수의사 임상검사·증명서 발급은 출국일(항공기 탑승) 기준 10일 이내. (petmove 가이드: "출국일 기준 10일 이내")',
    severity: 'blocker',
    addedAt: '2026-05-07',
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
      if (diff > 10) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 10일 이내 필요.`,
          fixHint: `내원일을 ${dep} 기준 10일 전 이후로 조정.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
