import type { CaseRow } from '../types'
import type { CheckResult, ProcedureCheck } from './types'

/**
 * 일본 수출 관련 절차 검증.
 *
 * 규칙: 필수 입력이 하나라도 누락되면 검증 대상 아님 → skip (ok: true, 색상·알림 없음).
 * 데이터가 들어오면 그때 비로소 평가.
 *
 * 새 체크 추가 방법:
 * 1) 아래 배열에 ProcedureCheck 객체 추가
 * 2) id 는 'jp.' + kebab-case, 전역 유일
 * 3) run 있으면 실제 검증, 없으면 카탈로그 표시만
 * 4) offendingPaths 로 문제 필드 경로를 알려주면 상세페이지에서 색상·툴팁 표시
 */

interface RabiesEntry {
  date: string
  valid_until?: string | null
  originalIndex: number
}

interface TiterEntry {
  date: string
  originalIndex: number
}

function readRabiesEntries(caseRow: CaseRow): RabiesEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data.rabies_dates
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = typeof r === 'string' ? { date: r } : (r as { date?: string; valid_until?: string | null })
      return { date: rec.date ?? '', valid_until: rec.valid_until ?? null, originalIndex }
    })
    .filter((r) => typeof r.date === 'string' && r.date.length >= 10)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function readTiterEntries(caseRow: CaseRow): TiterEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data.rabies_titer_records
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = r as { date?: string | null }
      return { date: rec?.date ?? '', originalIndex }
    })
    .filter((r) => typeof r.date === 'string' && r.date.length >= 10)
}

/** 면역 유효기간 끝 ('YYYY-MM-DD'). valid_until 있으면 그대로, 없으면 date + 1년. */
function resolveValidUntil(date: string, validUntil?: string | null): string {
  return validUntil || addOneYear(date)
}

/**
 * 'YYYY-MM-DD' + N년 유효기간의 **마지막 유효일** 반환.
 * 달력 +N년 후 동일 MM-DD 에서 하루 뺌 (윤년 처리됨).
 * 예: 2026-01-01 +1년 → 2026-12-31, +2년 → 2027-12-31.
 */
function addYears(dateStr: string, n: number): string {
  const parts = dateStr.split('-')
  if (parts.length < 3) return ''
  const d = new Date(`${parseInt(parts[0], 10) + n}-${parts[1]}-${parts[2]}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addOneYear(dateStr: string): string {
  return addYears(dateStr, 1)
}

function daysBetween(aISO: string, bISO: string): number | null {
  const a = new Date(aISO).getTime()
  const b = new Date(bISO).getTime()
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

/** 필수 입력이 누락된 경우 사용할 결과 — 통과로 간주해 어떤 표시도 안 함. */
const SKIP: CheckResult = { ok: true, message: '입력 대기 — 검증 대상 아님' }

export const JP_CHECKS: ProcedureCheck[] = [
  {
    id: 'jp.rabies-prime-after-91days-old',
    country: 'japan',
    category: '광견병',
    title: '광견병 1차 접종 생후 91일령 이상',
    description: '광견병 1차 접종일은 생년월일 기준 91일 이후여야 함.',
    severity: 'blocker',
    addedAt: '2026-04-21',
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
    id: 'jp.rabies-prime-booster-interval',
    country: 'japan',
    category: '광견병',
    title: '광견병 1·2차 접종 간격 및 유효기간',
    description:
      '1차·2차 접종일 간격이 30일 이상이어야 하며, 2차 접종은 1차 접종의 면역 유효기간 이내여야 함.',
    severity: 'blocker',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const entries = readRabiesEntries(caseRow)
      // 1·2차 둘 다 필요 — 하나라도 없으면 skip
      if (entries.length < 2) return SKIP

      const [first, second] = entries
      const gap = daysBetween(first.date, second.date)
      const validUntil = first.valid_until || addOneYear(first.date)
      const withinValidity = !!validUntil && validUntil >= second.date
      const gapOk = gap !== null && gap >= 30

      const secondPath = `rabies_dates[${second.originalIndex}].date`

      if (!gapOk && !withinValidity) {
        return {
          ok: false,
          message: `1·2차 간격 ${gap ?? '?'}일 (<30일) 그리고 2차 접종일(${second.date})이 1차 유효기간(${validUntil || '미상'}) 초과.`,
          fixHint: '두 조건 모두 불충족 — 재접종 일정 재검토 필요.',
          offendingPaths: [secondPath],
        }
      }
      if (!gapOk) {
        return {
          ok: false,
          message: `1·2차 접종 간격 ${gap ?? '?'}일 — 최소 30일 이상 필요.`,
          fixHint: '2차 접종일을 1차 접종일 + 30일 이후로 조정.',
          offendingPaths: [secondPath],
        }
      }
      if (!withinValidity) {
        return {
          ok: false,
          message: `2차 접종일(${second.date})이 1차 유효기간(${validUntil || '미상'}) 초과 — 기초접종으로 재시작 필요.`,
          fixHint: '1차 유효기간이 지난 뒤의 접종은 추가접종이 아닌 새로운 기초접종으로 간주됩니다.',
          offendingPaths: [secondPath],
        }
      }
      return {
        ok: true,
        message: `1·2차 간격 ${gap}일, 2차 접종(${second.date})이 1차 유효기간(${validUntil}) 이내.`,
      }
    },
  },
  {
    id: 'jp.microchip-rabies-sequence',
    country: 'japan',
    category: '마이크로칩',
    title: '마이크로칩·광견병 접종·항체검사 순서',
    description:
      '① 마이크로칩 ≤ 1차 < 2차 ≤ 항체검사, 또는 ② 1차 < 마이크로칩 ≤ 2차이면서 2차 접종일 = 항체검사일. 둘 중 하나 충족 필요.',
    severity: 'blocker',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      // 필수: 마이크로칩 + 1·2차 접종 기록
      if (!microchip || rabies.length < 2) return SKIP

      const first = rabies[0]
      const second = rabies[1]
      const titers = readTiterEntries(caseRow)

      // 조건 1: 마이크로칩 ≤ 1차
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 1차 접종(${first.date}).` }
      }

      // 조건 2: 1차 < 마이크로칩 ≤ 2차 AND 2차 == 항체검사일
      if (microchip <= second.date) {
        // 항체검사 미입력 → 아직 판정 불가, skip
        if (titers.length === 0) return SKIP
        const matching = titers.find((t) => t.date === second.date)
        if (matching) {
          return {
            ok: true,
            message: `마이크로칩이 1·2차 사이, 2차 접종일과 항체검사일 동일(${second.date}).`,
          }
        }
        const offending = ['microchip_implant_date']
        for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
        return {
          ok: false,
          message: `마이크로칩이 1차(${first.date}) 이후라면 2차 접종일(${second.date})과 항체검사일이 같아야 함.`,
          fixHint: '시술 후 재접종을 2차로 잡고 같은 날 항체검사를 실시하거나, 마이크로칩을 1차 전에 시술하세요.',
          offendingPaths: offending,
        }
      }

      // 마이크로칩이 2차보다도 늦음 → 두 조건 모두 불충족
      return {
        ok: false,
        message: `마이크로칩(${microchip})이 2차 접종일(${second.date})보다 늦음.`,
        fixHint: '시술 후 광견병 2회 접종이 다시 필요합니다.',
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'jp.rabies-titer-vs-booster',
    country: 'japan',
    category: '광견병',
    title: '광견병 항체검사 시기',
    description:
      '채혈일은 2차 접종일과 같거나 이후, 그리고 2차 접종의 면역 유효기간 이내여야 함.',
    severity: 'blocker',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      // 필수: 2차 접종 기록 + 1개 이상의 항체검사
      if (rabies.length < 2 || titers.length === 0) return SKIP

      const second = rabies[1]
      const secondValidUntil = resolveValidUntil(second.date, second.valid_until)

      const offendingPaths: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        const path = `rabies_titer_records[${t.originalIndex}].date`
        if (t.date < second.date) {
          offendingPaths.push(path)
          problems.push(`채혈일(${t.date}) < 2차 접종일(${second.date})`)
        } else if (secondValidUntil && t.date > secondValidUntil) {
          offendingPaths.push(path)
          problems.push(`채혈일(${t.date}) > 2차 유효기간(${secondValidUntil})`)
        }
      }
      if (offendingPaths.length > 0) {
        return { ok: false, message: problems.join(' / '), offendingPaths }
      }
      return { ok: true, message: '항체검사 시기 적합.' }
    },
  },
  {
    id: 'jp.departure-180days-after-titer',
    country: 'japan',
    category: '광견병',
    title: '출국일은 항체검사일 180일 이후',
    description: '출국일은 광견병 항체검사 채혈일로부터 180일이 지난 시점이어야 함.',
    severity: 'blocker',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      // 필수: 출국일 + 1개 이상의 항체검사
      if (!dep || titers.length === 0) return SKIP

      let best: { entry: (typeof titers)[number]; days: number } | null = null
      for (const t of titers) {
        const days = daysBetween(t.date, dep)
        if (days === null) continue
        if (!best || days > best.days) best = { entry: t, days }
      }
      if (best && best.days >= 180) {
        return { ok: true, message: `항체검사(${best.entry.date}) → 출국일(${dep}): ${best.days}일` }
      }
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `항체검사일로부터 출국까지 최대 ${best?.days ?? '?'}일 — 180일 이상 필요.`,
        fixHint: '출국일을 채혈일 + 180일 이후로 조정하거나 더 이른 항체검사가 필요합니다.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'jp.vet-visit-within-10days-of-departure',
    country: 'japan',
    category: '일정',
    title: '내원일은 출국일 10일 이내',
    description: '내원일은 출국일 포함 10일 이내여야 함 (출국일 9일 전 ~ 출국일).',
    severity: 'blocker',
    addedAt: '2026-04-21',
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
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 출국일 포함 10일 이내 필요.`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'jp.departure-within-2years-of-titer',
    country: 'japan',
    category: '광견병',
    title: '출국일은 항체검사일 2년 이내',
    description: '광견병 항체검사 유효기간은 2년 — 출국일이 검사일 + 2년을 넘지 않아야 함.',
    severity: 'blocker',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 2) >= dep)
      if (valid) {
        return {
          ok: true,
          message: `항체검사(${valid.date}) 유효(${addYears(valid.date, 2)}) ≥ 출국일(${dep}).`,
        }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const newestValidUntil = addYears(newest.date, 2)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `최신 항체검사(${newest.date}) 유효기간(${newestValidUntil}) < 출국일(${dep}).`,
        fixHint: '재검사 또는 출국일을 검사일 + 2년 이내로 조정하세요.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'jp.rabies-valid-until-on-departure',
    country: 'japan',
    category: '광견병',
    title: '출국일 시점 광견병 면역 유효',
    description: '출국일에 가장 최근 광견병 접종의 면역 유효기간이 만료되지 않아야 함.',
    severity: 'blocker',
    addedAt: '2026-04-21',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      // 필수: 출국일 + 1개 이상의 접종 기록
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP

      if (validUntil < dep) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 이전에 만료.`,
          fixHint: '출국 전 추가 접종이 필요합니다.',
          offendingPaths: [
            'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },
]
