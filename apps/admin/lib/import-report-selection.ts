import { destinationCountry, parseDestinations, resolveTabActiveDest, type CaseRow } from '@petmove/domain'
import { hasReportSchedule, reportCompleteFor } from './report-status'

export const IMPORT_REPORT_DEST_KEY = 'import_report_active_dest'

/**
 * 신고 목록의 기본 여행: 일정이 있는 신고 대상 중 미완료 우선.
 * 저장된 선택이 완료된 여행이어도 새 여행의 할 일을 가리지 않는다.
 * 미완료끼리는 기존 선택을 유지하고, 모두 완료됐으면 이전 선택을 유지한다.
 * 이 선택은 표시용이며 원본 데이터나 신고 상태를 변경하지 않는다.
 */
export function autoImportReportDest(row: CaseRow, countries: string[]): string | null {
  const candidates = parseDestinations(row.destination).filter(
    dest => countries.includes(destinationCountry(dest)) && hasReportSchedule(row, dest),
  )
  const active = (row.data ?? {})[IMPORT_REPORT_DEST_KEY]
  const pending = candidates.filter(dest => !reportCompleteFor(row, dest))
  const choices = pending.length ? pending : candidates
  return typeof active === 'string' && choices.includes(active) ? active : choices[0] ?? null
}

export function isAutoImportReport(row: CaseRow, countries: string[]): boolean {
  return autoImportReportDest(row, countries) !== null
}

/** 사용자가 메뉴에서 고른 여행은 현재 목록 세션에서 우선해 완료 내역도 열어 볼 수 있다. */
export function withImportReportDest(row: CaseRow, countries: string[], selected?: string): CaseRow {
  const dest = selected && parseDestinations(row.destination).includes(selected)
    ? selected
    : autoImportReportDest(row, countries)
  if (!dest || resolveTabActiveDest(row, IMPORT_REPORT_DEST_KEY) === dest) return row
  return { ...row, data: { ...row.data, [IMPORT_REPORT_DEST_KEY]: dest } }
}
