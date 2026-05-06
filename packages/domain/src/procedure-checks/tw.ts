import type { ProcedureCheck } from './types'
import {
  daysBetween,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 대만 (BAPHIQ — Bureau of Animal and Plant Health Inspection and Quarantine) 절차 검증.
 *
 * 출처: petmove 가이드 (https://www.petmove.co.kr/docs/taiwan-pet-travel-guide/) + 주한국 대만대표부.
 *
 * ⚠️ 핵심:
 *  - 마이크로칩 (ISO 11784/11785 또는 AVID-10/9/15자리) ≤ 광견병 1차
 *  - 광견병: 생후 91일령 이상, 출국 30일 ~ 1년 사이, 불활화 백신만 인정
 *  - **RNATT**: 채혈일부터 **180일 경과 후** 도착, ≥0.5 IU/ml
 *  - 한국 APQA 검역: 출국 10일 이내
 *  - 격리 기본 7일 (수입허가증 20일 전 신청 + RNATT 180일 충족 시 면제 가능)
 *  - 개·고양이 동일 요건
 *
 * 컨벤션 (NZ/HI/CN/TH/PH 와 동일):
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "X일 이상/이전/후" → `dep - X ≥ N` (이상 inclusive)
 */

const COUNTRY = 'taiwan'

export const TW_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'tw.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. ISO 11784/11785 또는 AVID-10/9/15자리 허용. (대만 BAPHIQ)',
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
    id: 'tw.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 91일령 이상',
    description:
      '광견병 1차 접종은 생후 최소 91일 이후 (보수 기준). 불활화(사독) 백신만 인정. (petmove + JP/SG/AU/NZ/CN 와 일관)',
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
      if (age < 91) {
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 생후 ${age}일령 — 최소 91일령 이상 필요.`,
          fixHint: `${birth} 기준 91일 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'tw.rabies-30days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국(=도착) 30일 이전 완료',
    description:
      '가장 최근 광견병 접종이 출국일 기준 30일 이전 완료. (petmove 가이드: "30일~1년 이내 접종")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일 (≥30일 필요).`,
          fixHint: `출국일을 ${latest.date} 기준 30일 이후로 조정하거나 부스터를 더 일찍 접종.`,
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'tw.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효 (접종일 포함 1년 = 364일까지)',
    description:
      '최근 광견병 접종 면역 유효기간이 도착일 이전 만료되지 않아야 함. **접종일 포함 1년 = +364일**까지 허용. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear`).',
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

  // ── RNATT (광견병 항체검사) ──
  {
    id: 'tw.rnatt-after-rabies-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사는 광견병 접종 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종 이후여야 함. (petmove 가이드)',
    severity: 'blocker',
    addedAt: '2026-05-06',
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
        }
      }
      if (problems.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '광견병 접종 이후 채혈하세요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 RNATT 채혈이 광견병 접종 이후.' }
    },
  },
  {
    id: 'tw.rnatt-result-min-0.5',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사 결과 ≥ 0.5 IU/ml',
    description:
      'RNATT 결과 ≥ 0.5 IU/ml. 미달 시 재접종 + 재검사 필요. (petmove 가이드)',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP

      const offending: string[] = []
      const problems: string[] = []
      let anyValid = false
      for (const t of titers) {
        if (t.value === null || t.value === undefined || t.value === '') continue
        const num = parseFloat(String(t.value).replace(/[^\d.]/g, ''))
        if (isNaN(num)) continue
        if (num >= 0.5) {
          anyValid = true
        } else {
          offending.push(`rabies_titer_records[${t.originalIndex}].value`)
          problems.push(`${t.date} 결과 ${num} IU/ml (<0.5)`)
        }
      }
      if (anyValid) {
        return { ok: true, message: '하나 이상의 RNATT 결과가 ≥0.5 IU/ml.' }
      }
      if (problems.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '재접종 후 RNATT 재검사 필요.',
          offendingPaths: offending,
        }
      }
      return SKIP
    },
  },
  {
    id: 'tw.rnatt-180days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: 'RNATT 채혈일부터 180일 경과 후 도착',
    description:
      'RNATT 채혈일로부터 180일 경과 후에 대만 도착해야 함 (격리 면제 핵심 조건). 미충족 시 추가 격리. (petmove + 대만대표부: "채혈일로부터 180일이 경과한 후")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // 가장 이른 채혈 = 가장 긴 대기기간 (가장 유리). 180일 충족하는 것 하나라도 있으면 OK.
      const valid = titers.find((t) => {
        const days = daysBetween(t.date, dep)
        return days !== null && days >= 180
      })
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `RNATT(${valid.date}) → 출국(${dep}): ${days}일 (≥180).` }
      }

      // 모두 실패 — 가장 이른 채혈일 기준 메시지 (가장 유리한 것이 부족)
      const earliest = [...titers].sort((a, b) => a.date.localeCompare(b.date))[0]
      const days = daysBetween(earliest.date, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `RNATT(${earliest.date}) → 출국(${dep}): ${days ?? '?'}일 — 180일 이상 필요.`,
        fixHint: `출국일을 ${earliest.date} 기준 180일 이후로 조정.`,
        offendingPaths: offending,
      }
    },
  },

  // ── 일정 ──
  {
    id: 'tw.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (한국 APQA)',
    description:
      '한국 APQA 검역 endorsement: 출국일 기준 10일 이내(`≤9`). 출발 7-9일 전 권장.',
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
