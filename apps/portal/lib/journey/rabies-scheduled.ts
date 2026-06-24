/**
 * 광견병 실제 기록(`rabies_dates`)과 고객 예정(`rabies_dates_scheduled`)의 병합/분리 헬퍼.
 *
 * 원칙 — 저장은 둘로 쪼개되 읽는 쪽을 나눈다:
 *  - 운영자(펫무브워크)·PDF/검역서류·완료판정·절차검증 엔진 → `rabies_dates`(실제, ≤오늘)만.
 *  - 고객 화면(펫무브앱) 표시·검증 → 실제 + 예정을 날짜순으로 합친 뷰.
 *
 * 종합백신(`general_vaccine_dates_scheduled`)·항체검사(`rabies_titer_scheduled`)가 쓰는
 * "미래는 별도 칸" 모델을, 순서(1·2차)·정렬이 얽힌 광견병에 맞게 일반화한 것.
 */

import { todayKst } from '@petmove/domain'

function dateOf(r: unknown): string {
  if (typeof r === 'string') return r.slice(0, 10)
  if (r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string') {
    return ((r as Record<string, unknown>).date as string).slice(0, 10)
  }
  return ''
}

/**
 * `rabies_dates`(실제) + `rabies_dates_scheduled`(예정 미래)를 날짜순으로 합친 raw 배열.
 * 예정 칸이 비어 있으면 `rabies_dates`를 그대로 반환(동작 변화 0). 실제는 모두 ≤오늘, 예정은
 * 모두 >오늘이라 정렬하면 자연히 [실제…, 예정…] 순 — "index 0 = 가장 이른 = 1차" 불변식 유지.
 * 고객 절차검증(합친 caseRow)·예정 배지 계산에 쓴다.
 */
export function mergeRabiesDatesRaw(data: Record<string, unknown> | null | undefined): unknown[] {
  const real = Array.isArray(data?.rabies_dates) ? (data!.rabies_dates as unknown[]) : []
  const sched = Array.isArray(data?.rabies_dates_scheduled)
    ? (data!.rabies_dates_scheduled as unknown[])
    : []
  if (sched.length === 0) return real
  return [...real, ...sched].sort((a, b) => dateOf(a).localeCompare(dateOf(b)))
}

/**
 * 저장 '작업 세트' — 실제(rabies_dates) + '아직 미래(>오늘)인' 예정만 병합(정렬).
 * 도래(≤오늘)한 예정은 제외한다 — 도래분은 보호자의 재입력으로만 실제가 된다(자동 승격 X,
 * 다른 카드의 '예정→도래→재입력'과 동일). 저장 함수가 이 위에서 회차를 편집한 뒤 날짜로 재분리.
 */
export function rabiesSaveWorking(data: Record<string, unknown> | null | undefined): unknown[] {
  const real = Array.isArray(data?.rabies_dates) ? (data!.rabies_dates as unknown[]) : []
  const today = todayKst()
  const sched = (
    Array.isArray(data?.rabies_dates_scheduled) ? (data!.rabies_dates_scheduled as unknown[]) : []
  ).filter((e) => {
    const d = dateOf(e)
    return d.length >= 10 && d > today
  })
  if (sched.length === 0) return real
  return [...real, ...sched].sort((a, b) => dateOf(a).localeCompare(dateOf(b)))
}

/** 회차 목록을 날짜로 실제(≤오늘) / 예정(>오늘)으로 분리. 날짜 순서는 보존. */
export function splitRabiesByDate(entries: unknown[]): { real: unknown[]; scheduled: unknown[] } {
  const today = todayKst()
  const real: unknown[] = []
  const scheduled: unknown[] = []
  for (const e of entries) {
    const d = dateOf(e)
    if (d.length >= 10 && d > today) scheduled.push(e)
    else real.push(e)
  }
  return { real, scheduled }
}
