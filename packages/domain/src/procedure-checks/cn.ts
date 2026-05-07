import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  evaluateRabiesAgeConservative,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 중국 (GACC — General Administration of Customs of China, 海关总署) 절차 검증.
 *
 * 한국 = **비지정국** → 광견병 항체검사(RNATT) 필수.
 *  - 지정 19개국 (호주·NZ·미국·일본·홍콩·싱가포르 등) 은 RNATT 면제 + 격리 면제
 *  - 비지정국에서 입국 시: 마이크로칩 + RNATT ≥0.5 IU/ml + 현장검역 합격 → 격리 면제,
 *    미충족 시 GACC 지정 격리시설에서 30일
 *
 * 출처:
 *  - GACC 公告 2019年第5号 — http://www.customs.gov.cn/customs/302249/302266/302267/2167536/index.html
 *  - GACC 채신 실험실 명단 (2025-08-15 갱신) — http://www.customs.gov.cn/dzs/2746776/3323864/index.html
 *
 * ⚠️ 핵심 룰:
 *  - **항체가 ≥ 0.5 IU/ml** (GACC 2019 No.5 제2조 명시)
 *  - **GACC 채신 명단 lab** 발급 보고서 (한국 lab 미포함 → 일본/미국 등 송부)
 *  - **마이크로칩 ISO 11784/11785, 15자리** (제1조 명시)
 *  - **1인당 1회 1마리** 한도 (제1조)
 *  - 입경 14일 이내 임상검사 (해관 답변; 한국 APQA 10일 룰이 더 strict, 보수 ≤9 적용)
 *
 * 운용 룰 (GACC 본문 명문 부재 — 실무·OIE 기반 보수 적용):
 *  - 광견병 1차 ≥ 생후 91일령 (OIE 표준)
 *  - 광견병 2회 접종, 30일~1년 간격, RNATT 충족 위해 사실상 필요
 *  - 1년 라이선스 백신만 인정 (실무 — GACC 본문은 "유효기간 내"만 명시)
 *  - RNATT 유효기간 1년 (실무 — GACC 본문 미명시)
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
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'GACC 2019 No.5 본문 정량 미명시 (OIE 표준 차용) — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요. 출생일에 따라 어느 쪽이 더 엄격한지 달라지므로 AND 결합.',
    severity: 'blocker',
    addedAt: '2026-05-06',
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
    id: 'cn.rabies-2-doses-required',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 2회 접종 (1차 + 부스터)',
    description:
      '광견병 백신은 최소 2회 (1차 + 부스터). 2차는 1차 30일 후 ~ 1년 이내. (GACC 2019 No.5 본문은 횟수 미명시 — RNATT ≥0.5 IU/ml 충족 위해 OIE 표준상 사실상 필요)',
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
      '실무상 면역 유효기간 2년·3년짜리 광견병 백신을 인정하지 않음. valid_until 이 접종일 + 364일(접종일 포함 1년) 초과면 거부. (GACC 본문은 "유효기간 내"만 명시 — 일부 입국항 운용 거부 사례 존재, 보수 적용)',
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
      '최근 광견병 접종의 면역 유효기간이 도착일 이전 만료되지 않아야 함. 만료 시 추가 부스터 필요. (GACC: "유효한 광견병 백신 접종 증명서" 입경일 기준 유효)',
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
      'RNATT 채혈일은 직전 광견병 접종 이후여야 함 (2차 접종 후 시행 권장). (GACC 채신 lab 보고서 표준)',
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
  // (≥0.5 IU/ml 결과치 룰은 의도적 제외 — 검사기관에서 이미 fail 결과 나옴, 시스템 검증 불필요)
  {
    id: 'cn.rnatt-valid-1year-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사 유효기간 1년 — 도착일까지 유효',
    description:
      'RNATT 결과는 채혈일 기준 1년간 유효 (실무 기준). 도착일이 채혈일 + 1년 이내여야 함. (GACC 본문 미명시 — 실무 운용상 1년 한도 보수 적용)',
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
      'GACC: 입경 14일 이내 임상검사. 한국 APQA endorsement는 10일 이내가 더 strict — 보수 ≤9일 적용 (출발 7-9일 전 권장).',
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
