import { todayKst } from './dates'
import { getDepartureDate, getVetVisitDate, readByDestValue } from './destination-scoped-fields'
import { parseDestinations } from './destination-config'
import type { CaseRow } from './types'

type ScheduleRow = Pick<CaseRow, 'data' | 'destination' | 'departure_date'>

/** 신고 목록과 숨김 복원이 같은 여행지 범위·날짜 선택 규칙을 사용한다. */
export function reportScheduleDatesFor(row: ScheduleRow, destination: string | null) {
  const data = row.data ?? {}
  const scopedOnly = !!destination && parseDestinations(row.destination).length > 1
  function read(key: string): string | null {
    const value = readByDestValue(data, destination, key)
    if (typeof value === 'string' && value) return value
    if (scopedOnly) return null
    return typeof data[key] === 'string' && data[key] ? data[key] as string : null
  }
  return {
    departure_date: getDepartureDate(row, destination),
    vet_visit_date: getVetVisitDate(row, destination),
    departure_flight_date: read('departure_flight_date'),
    entry_date: read('entry_date'),
    vet_visit_date_scheduled: read('vet_visit_date_scheduled'),
  }
}

function isUpcomingDate(value: string | null, today: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < today) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * 새 일정 입력·변경 시 케이스의 신고 숨김만 해제한다. 진행상태·첨부는 그대로 둔다.
 * 재저장·삭제·과거 기록 수정은 숨김을 유지한다. 자동채움까지 합산한 최종 저장본에 적용한다.
 * 날짜가 없는 새 목적지는 기존 여행의 전역 잔존값으로 복원하지 않는다.
 */
export function reopenReportForNewSchedule(
  before: ScheduleRow,
  after: ScheduleRow,
  today = todayKst(),
): Record<string, unknown> {
  const next = after.data ?? {}
  if (before.data?.import_report_dismissed !== true || next.import_report_dismissed !== true) return next
  const beforeDestinations = parseDestinations(before.destination)
  const destinations = parseDestinations(after.destination)
  for (const destination of destinations) {
    const previous = reportScheduleDatesFor(before, destination)
    const current = reportScheduleDatesFor(after, destination)
    const isNewDestination = !beforeDestinations.includes(destination)
    for (const key of Object.keys(current) as Array<keyof typeof current>) {
      const date = current[key]
      if (!isUpcomingDate(date, today)) continue
      if (!isNewDestination && date === previous[key]) continue
      // 새 여행지는 명시적으로 그 슬롯에 받은 날짜만 인정한다(단일 목적지 컬럼 잔존 방지).
      if (isNewDestination && readByDestValue(after.data, destination, key) !== date) continue
      const reopened = { ...next }
      delete reopened.import_report_dismissed
      return reopened
    }
  }
  return next
}
