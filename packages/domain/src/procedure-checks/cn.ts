import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 중국 (GACC — General Administration of Customs of China) 절차 검증.
 *
 * 한국 = **비지정 국가** → 광견병 항체검사(RNATT) 필수.
 *  - 지정 19개국 (호주·NZ·미국 등) 은 항체검사 면제 + 격리 면제
 *  - 비지정국에서 입국 시: 요건 충족 → 격리 면제, 미충족 → 최대 30일 격리
 *
 * 출처: GACC + petmove 가이드 (https://www.petmove.co.kr/docs/china-pet-travel-guide/)
 *
 * ⚠️ 핵심 차별 룰:
 *  - **1년 라이선스 광견병 백신만 인정** (2년·3년 백신 거부)
 *  - RNATT 유효기간 = 채혈일 기준 1년 (도착일까지 유효)
 *  - 1인당 1마리 제한 (시스템 검증 대상 아님)
 *  - 도시별 격리 운영 차이 (베이징=검역소, 상하이=7일 검역소+23일 자택) — info
 *
 * 컨벤션 (NZ/HI 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "이상" 경계 inclusive (`addYears(date, 1) ≥ dep`)
 */

const COUNTRY = 'china'

export const CN_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'cn.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785, 15자리)이 광견병 1차 접종일과 같거나 이전이어야 함. 칩 미이식 또는 규격 미충족 시 30일 격리. (강아지는 한국 동물등록 별도 필수)',
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
    id: 'cn.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 91일령 이상',
    description:
      '광견병 1차 접종은 생후 최소 91일 이후. (petmove 가이드 + JP/SG/AU/NZ 와 일관 기준)',
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
    id: 'cn.rabies-2-doses-required',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 2회 접종 (1차 + 부스터)',
    description:
      '광견병 백신은 최소 2회 (1차 + 부스터). 2차는 1차 30일 후 ~ 1년 이내. (petmove 가이드)',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      if (rabies.length < 2) {
        return {
          ok: false,
          message: `광견병 1회만 기록됨(${rabies[0].date}) — 2회 필요.`,
          fixHint: '30일 후 2차(부스터) 접종.',
          offendingPaths: [`rabies_dates[${rabies[0].originalIndex}].date`],
        }
      }
      return { ok: true, message: `광견병 ${rabies.length}회 기록됨.` }
    },
  },
  {
    id: 'cn.rabies-doses-30days-to-1year-apart',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 도즈 간격 30일 이상 ~ 1년 이내',
    description:
      '연속된 광견병 접종 간 간격: 직전 접종 30일 이후 + 직전 접종 유효기간(1년) 이내. 1년 초과 시 부스터 chain 끊김 (1차로 간주).',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP

      const issues: string[] = []
      const offending: string[] = []
      for (let i = 1; i < rabies.length; i++) {
        const prev = rabies[i - 1]
        const curr = rabies[i]
        const gap = daysBetween(prev.date, curr.date)
        const prevValidUntil = resolveValidUntil(prev.date, prev.valid_until)
        if (gap === null) continue
        if (gap < 30) {
          issues.push(`${prev.date} → ${curr.date}: ${gap}일 (≥30일 필요)`)
          offending.push(
            `rabies_dates[${prev.originalIndex}].date`,
            `rabies_dates[${curr.originalIndex}].date`,
          )
        }
        if (curr.date > prevValidUntil) {
          issues.push(`${curr.date} 가 직전(${prev.date}) 유효기간(${prevValidUntil}) 만료 후 — 부스터 chain 끊김`)
          offending.push(
            `rabies_dates[${prev.originalIndex}].date`,
            `rabies_dates[${curr.originalIndex}].date`,
          )
        }
      }
      if (issues.length > 0) {
        return {
          ok: false,
          message: issues.join(' / '),
          fixHint: '도즈 간격은 30일 이상 ~ 직전 접종 유효기간 이내.',
          offendingPaths: Array.from(new Set(offending)),
        }
      }
      return { ok: true, message: '모든 인접 광견병 도즈 간격 적합 (30일 이상 ~ 1년 이내).' }
    },
  },
  {
    id: 'cn.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (2년/3년 거부)',
    description:
      '중국은 면역 유효기간 2년·3년짜리 광견병 백신을 인정하지 않음. valid_until 이 접종일 + 364일(접종일 포함 1년) 초과면 거부. (petmove 가이드: "면역 유효기간 2년 혹은 3년짜리 광견병 예방접종은 인정하지 않으며")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const violations: Array<{ entry: typeof rabies[number]; days: number }> = []
      for (const r of rabies) {
        if (!r.valid_until) continue // valid_until 미입력은 디폴트 1년(+364) → OK
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
          msgs.push(`${v.entry.date} 백신 유효기간 ${v.days}일 (>364 = 1년 초과 — 2/3년 백신 거부)`)
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
    id: 'cn.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 도착일 이전 만료되지 않아야 함. 만료 시 추가 부스터 필요. (petmove 가이드: "도착일 이전에 면역 유효기간이 만료되는 경우 추가 접종")',
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
          fixHint: '출국 전 부스터 접종 필요. 만료 후 접종은 1차로 간주.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── RNATT (광견병 항체검사) ──
  {
    id: 'cn.rnatt-after-rabies-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사는 광견병 접종 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종 이후여야 함 (2차 접종 후 시행 권장). (petmove 가이드)',
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
    id: 'cn.rnatt-result-min-0.5',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사 결과 ≥ 0.5 IU/ml',
    description:
      'RNATT 결과 ≥0.5 IU/ml. 미달 시 재접종 + 재검사 필요.',
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
    id: 'cn.rnatt-valid-1year-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사 유효기간 1년 — 도착일까지 유효',
    description:
      'RNATT 결과는 채혈일 기준 1년간 유효. 도착일이 채혈일 + 1년(365일) 이내여야 함. (petmove 가이드: "유효기간: 채혈일 기준 1년")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `RNATT(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}). ${days}일 경과.` }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const expiry = addYears(newest.date, 1)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `최신 RNATT(${newest.date}) 유효기간(${expiry}) < 출국일(${dep}) — 1년 초과.`,
        fixHint: '재검사 또는 출국일을 채혈일 + 1년 이내로 조정.',
        offendingPaths: offending,
      }
    },
  },

  // ── 일정 ──
  {
    id: 'cn.vet-visit-within-10days',
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
