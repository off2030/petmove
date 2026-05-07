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
 * 러시아 (Rosselkhoznadzor / EAEU 관세동맹) 절차 검증.
 *
 * 출처:
 *  - Rosselkhoznadzor "О вакцинации против бешенства" — https://fsvps.gov.ru/news/o-vakcinacii-zhivotnyh-protiv-beshenstva-pri-vvoze-sobak-i-koshek/
 *  - Rosselkhoznadzor "Инструкция: как ввезти домашнее животное в Россию" — https://fsvps.gov.ru/puteshestvujushhim-s-pitomcami-vvoz-vyvo/instrukcija-kak-vvezti-domashnee-zhivotnoe-v-rossiju/
 *  - EAEU 결정 No.317 (2010-06-18) 제15장 — https://cis-legislation.com/document.fwx?rgn=31443
 *
 * 핵심 룰:
 *  - 마이크로칩: EAEU 결정 명시 의무 부재. ISO 11784/11785 권장 (실무 표준)
 *  - 광견병: 생후 12주(3개월) 이상 + 출국 30일 이상 ~ 12개월 이내 (Rosselkhoznadzor 명시)
 *  - 광견병 백신 유효: "재접종 주기 12개월 초과 백신도 최종 접종일 기준 12개월 이내" (사실상 1년 룰)
 *  - 종합백신: EAEU 결정 명문 부재 (운용 보수)
 *  - 건강증명서: **EAEU "선적 5일 이내 임상검진" 명시** (보수 ≤4)
 *  - 개인용 1인 2마리 한도 (3마리+ 상업용)
 *
 * RNATT 는 러시아 입국에 면제 (한국 귀국 시 필요하나 별도 워크플로) → 시스템 검증 제외.
 *
 * 컨벤션 (CN/SG 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'russia'

export const RU_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'ru.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. 한국 수출검역(특히 강아지)에서 사실상 필수.',
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
    id: 'ru.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'Rosselkhoznadzor: "вакцинация против бешенства осуществляется начиная с 12-недельного возраста" (12주 이상). 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
    id: 'ru.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (3년 거부)',
    description:
      'Rosselkhoznadzor: "재접종 주기 12개월 초과 백신은 최종 접종일로부터 12개월 이내일 때만 인정". 사실상 1년 룰. valid_until 이 접종일 + 364일(1년) 초과면 거부. (일부 지역지부는 항체검사 첨부 시 3년 인정 사례 — 보수 적용)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const violations: Array<{ entry: typeof rabies[number]; days: number }> = []
      for (const r of rabies) {
        if (!r.valid_until) continue
        const days = daysBetween(r.date, r.valid_until)
        if (days === null) continue
        if (days > 364) {
          violations.push({ entry: r, days })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(`rabies_dates[${v.entry.originalIndex}].valid_until`)
          msgs.push(`${v.entry.date} 백신 유효기간 ${v.days}일 (>364 = 1년 초과 — 3년 백신 거부)`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          fixHint: '1년 라이선스 백신으로 재접종.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 광견병 백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'ru.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. 만료 시 부스터 chain 끊김.',
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

  // ── 종합백신 (광견병과 동일 조건 — 1년 라이선스 + 출국일 유효) ──
  {
    id: 'ru.general-vaccine-required',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종 필수',
    description:
      '종합백신 접종 기록 필요. 강아지: DHPPL+파라인플루엔자 / 고양이: FVRCP. (EAEU 결정 No.317 명시 의무 부재 — 운용 보수)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) {
        return {
          ok: false,
          message: '종합백신 기록 없음.',
          fixHint: '강아지: DHPPL/파라인플루엔자, 고양이: FVRCP 접종 후 등록.',
        }
      }
      return { ok: true, message: `종합백신 ${entries.length}회 기록됨.` }
    },
  },
  {
    id: 'ru.general-vaccine-only-1year',
    country: COUNTRY,
    category: '종합백신',
    title: '1년 라이선스 종합백신만 인정 (3년 거부)',
    description:
      '종합백신 면역 유효기간 1년만 인정 (광견병과 동일 조건). valid_until 이 접종일 + 364일 초과면 거부.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) return SKIP

      const violations: Array<{ entry: typeof entries[number]; days: number }> = []
      for (const e of entries) {
        if (!e.valid_until) continue
        const days = daysBetween(e.date, e.valid_until)
        if (days === null) continue
        if (days > 364) {
          violations.push({ entry: e, days })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(`general_vaccine_dates[${v.entry.originalIndex}].valid_until`)
          msgs.push(`${v.entry.date} 백신 유효기간 ${v.days}일 (>364 = 1년 초과 — 3년 백신 거부)`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          fixHint: '1년 라이선스 백신으로 재접종.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 종합백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'ru.general-vaccine-valid-on-departure',
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
    id: 'ru.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '임상검진은 출국 5일 이내 (보수: 4일 전부터)',
    description:
      'EAEU 결정 No.317 제15장: "клинического осмотра в течение 5 дней перед отправкой" (선적 5일 이내 임상검진). 사용자 보수 N-1 → ≤4 적용. **타국 10일 룰과 다름 — 러시아 특별 규정**.',
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
      if (diff > 4) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 출국일 포함 5일 이내(≤4일 전) 필요 (EAEU).`,
          fixHint: `내원일을 ${dep} 기준 4일 전 이후로 조정. **러시아는 EAEU 5일 룰 적용 — 타국 10일과 다름**.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
