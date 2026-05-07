import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 이스라엘 (Veterinary Services & Animal Health, Ministry of Agriculture) 절차 검증.
 *
 * 출처:
 *  - gov.il "Importing Dogs" — https://www.gov.il/en/pages/importdogs
 *  - gov.il "Import Dogs Policy" — https://www.gov.il/en/Departments/General/importdogs
 *  - gov.il MOAG Pro 126 — https://www.gov.il/en/departments/policies/moag-pro-126
 *  - gov.il "Rabies Lab" — https://www.gov.il/en/pages/rabies-lab-meda
 *
 * 한국 = 광견병 위험국가 (이스라엘 분류). RNATT 의무.
 *
 * 핵심 룰:
 *  - 마이크로칩 (ISO 11784/11785) ≤ 광견병 1차
 *  - 광견병: 1차 12주 이상(보수 91일 AND 캘린더 3개월) + 출국 30일 전 + 출국일 면역 유효
 *  - **RNATT 필수**: 채혈 ≥ 광견병 + 30일, 0.5 IU/ml 이상, EU/WOAH 인증 lab
 *  - **입국 시 만 4개월(약 17주) 이상**, 동물 소유 90일 이상 (trafficking 방지)
 *  - 건강증명서: 출국 10일 이내 (보수 ≤9). 민간 수의사 검진 + 정부 수의관 배서
 *  - 출국 48시간 전 Ben Gurion 검역소 사전 통보
 *  - 3마리 이상 동반 시 사전 Import License 필수 (1974 동물질병규칙)
 *  - Pitbull, Argentine Dogo, Fila Brasileiro, Tosa, Staffordshire, Rottweiler 등 견종 수입 금지
 *
 * 별도 (시스템 검증 제외):
 *  - 종합백신/구충: gov.il 의무 명문 부재
 *  - 부스터 chain 유지 시 wait period 15일 단축: 정확한 chain 추적 불가 → 보수적으로 30일 단일 적용
 *  - RNATT 입국 후 추가 대기 없음 (EU/일본과 다름)
 *
 * 컨벤션 (UA/RU/MX 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'israel'

export const IL_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'il.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 11784/11785 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (gov.il 수의국 — 비ISO 칩 시 자체 리더기 동반)',
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
    id: 'il.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'gov.il 수의국: "12주 이상 접종" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
    id: 'il.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종 후 대기 (1차/chain끊김 30일, chain 유효 부스터 15일)',
    description:
      '최근 광견병 접종 후 출국까지 대기 — chain 유효한 부스터 = 15일, 1차 또는 chain 끊김 후 재접종 = 30일. (gov.il: 1차 후 30일, 연속 부스터 14일 단축 가능). chain 유효성 = 직전 접종 valid_until 이내 후속 접종.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      // chain 유효 = 직전 접종이 있고 그 valid_until 이내에 latest 접종됨
      let isBoosterWithChain = false
      if (rabies.length >= 2) {
        const prev = rabies[rabies.length - 2]
        const prevValidUntil = resolveValidUntil(prev.date, prev.valid_until)
        isBoosterWithChain = !!prevValidUntil && latest.date <= prevValidUntil
      }
      const requiredDays = isBoosterWithChain ? 15 : 30
      const label = isBoosterWithChain ? 'chain 유효 부스터' : '1차 또는 chain 끊김'

      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < requiredDays) {
        return {
          ok: false,
          message: `최근 접종(${latest.date}, ${label}) → 출국일(${dep}): ${days}일 — ${requiredDays}일 이상 필요.`,
          fixHint: `광견병 접종을 출국일 ${dep} 기준 ${requiredDays}일 이전에 완료하세요.`,
          offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}, ${label}) → 출국일(${dep}): ${days}일 (≥${requiredDays}일).` }
    },
  },
  {
    id: 'il.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. (gov.il 수의국: 백신 in-force 상태 필수)',
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

  // ── RNATT (이스라엘 입국 필수) ──
  {
    id: 'il.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (gov.il: "rabies neutralizing antibody titer ... taken at least 30 days after vaccination")',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offending: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date}) 이전 광견병 접종 기록 없음`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈(${t.date}) - 직전접종(${latest.date}) = ${gap ?? '?'}일 (<30일)`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '채혈일을 직전 광견병 접종일로부터 30일 이후로 조정하세요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '항체검사 시기 적합 (30일 경과).' }
    },
  },

  // ── 일정 ──
  {
    id: 'il.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (보수: 9일 전부터)',
    description:
      'gov.il: "health check and Israeli specific health certificate signed by a private vet and endorsed by a government vet within ten days prior to arrival" — 사용자 보수 N-1 → ≤9 적용.',
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
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 출국일 포함 10일 이내(≤9일 전) 필요.`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
