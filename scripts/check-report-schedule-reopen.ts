/** 실제 고객 데이터·DB 쓰기 없이 신고 숨김 복원과 목록 포함 규칙을 검증한다. */
import assert from 'node:assert/strict'
import { reopenReportForNewSchedule, writeByDestValue, type CaseRow } from '../packages/domain/src'
import { isAutoImportReport } from '../apps/admin/lib/import-report-selection'
import { hasReportSchedule, reportSlotStatusFor } from '../apps/admin/lib/report-status'

const today = '2026-10-30'
const base = {
  destination: '일본', departure_date: '2026-12-01',
  data: { import_report_dismissed: true, import_report_manual: false,
    by_dest: { 일본: { departure_date: '2026-12-01', departure_flight_date: '2026-12-01', entry_date: '2026-12-01', advance_notification_date: '2026-09-01', advance_notification_approval_skipped: true } },
    documents: [{ name: 'synthetic-certificate.pdf' }], memo: 'keep',
  },
} as unknown as CaseRow
const savedBefore = structuredClone(base)
function changed(key: string, value: unknown, destination = '일본') {
  return { ...base, data: writeByDestValue(base.data, destination, key, value) }
}
function visible(row: CaseRow) {
  return isAutoImportReport(row, ['일본']) && row.data?.import_report_dismissed !== true
}
assert(!visible(base))
for (const key of ['departure_date', 'departure_flight_date', 'entry_date', 'vet_visit_date', 'vet_visit_date_scheduled']) {
  const after = changed(key, '2026-12-21')
  const reopened = reopenReportForNewSchedule(base, after, today)
  const view = { ...after, data: reopened }
  assert.equal(reopened.import_report_dismissed, undefined, key)
  assert(visible(view), key)
  assert.deepEqual(reopened.by_dest, after.data.by_dest, '진행 상태·기존 여행 내용은 보존')
  assert.deepEqual(reopened.documents, base.data.documents, '서류 보존')
  assert.equal(reportSlotStatusFor(view, '일본', 'import'), 'done', '복원 자체는 기존 완료 상태를 바꾸지 않는다')
}
for (const value of ['2026-12-01', null, '', '2026-10-01', '2026-13-40', '2026-11-31']) {
  const after = changed('departure_date', value)
  assert.equal(reopenReportForNewSchedule(base, after, today), after.data, `재저장/삭제/과거/잘못된 날짜: ${value}`)
}
const unrelated = { ...base, data: { ...base.data, memo: 'edited' } }
assert.equal(reopenReportForNewSchedule(base, unrelated, today), unrelated.data)
const noOp = { ...base, data: structuredClone(base.data) }
assert.equal(reopenReportForNewSchedule(base, noOp, today), noOp.data)
const notHidden = { ...base, data: { ...base.data, import_report_dismissed: false } }
assert.equal(reopenReportForNewSchedule(notHidden, changed('entry_date', '2026-12-21'), today).import_report_dismissed, true, '숨김이 아닌 원본에 복원 부수효과를 만들지 않는다')

// 이전 값이 비었거나 이미 지난 경우도 새 출국일이 있으면 복원한다(컬럼·legacy 경로).
const legacy = { ...base, departure_date: null, data: { import_report_dismissed: true } } as CaseRow
const newColumn = { ...legacy, departure_date: '2026-12-21' }
assert(visible({ ...newColumn, data: reopenReportForNewSchedule(legacy, newColumn, today) }))
const oldTrip = { ...legacy, departure_date: '2026-07-21' }
assert.equal(reopenReportForNewSchedule(oldTrip, { ...oldTrip, departure_date: '2026-12-21' }, today).import_report_dismissed, undefined)
const noColumnSync = { ...legacy, data: { ...legacy.data, entry_date: '2026-12-21' } }
assert(visible({ ...noColumnSync, data: reopenReportForNewSchedule(legacy, noColumnSync, today) }))

// 같은 국가 2차 여행은 독립 슬롯의 새 날짜로 복원. 날짜 없는 추가는 전역 잔존값을 무시한다.
const multi = { ...base, destination: '일본, 일본 (2차)' }
const unscheduled = { ...multi, data: { ...multi.data, entry_date: '2026-12-25' } }
assert.equal(reopenReportForNewSchedule(multi, unscheduled, today), unscheduled.data)
const second = { ...multi, data: writeByDestValue(multi.data, '일본 (2차)', 'entry_date', '2026-12-25') }
assert(visible({ ...second, data: reopenReportForNewSchedule(multi, second, today) }))
assert.equal(reportSlotStatusFor(second, '일본', 'import'), 'done')
assert.equal(reportSlotStatusFor(second, '일본 (2차)', 'import'), 'not_started')
const newSecond = { ...second }
assert.equal(reopenReportForNewSchedule(base, newSecond, today).import_report_dismissed, undefined)
const invalidScope = { ...multi, data: writeByDestValue(multi.data, '삭제된 여행', 'entry_date', '2026-12-25') }
assert.equal(reopenReportForNewSchedule(multi, invalidScope, today), invalidScope.data)
const scheduledVisit = { ...legacy, data: writeByDestValue(legacy.data, '일본', 'vet_visit_date_scheduled', '2026-12-20') }
assert(hasReportSchedule(scheduledVisit, '일본'), '예정 내원일도 실제 내원일과 동일하게 일정으로 인식')
assert(visible({ ...scheduledVisit, data: reopenReportForNewSchedule(legacy, scheduledVisit, today) }))
assert.deepEqual(base, savedBefore, '원본은 변경하지 않는다')
console.log('Report schedule changes, dismissal preservation, shared-form snapshots and repeated journeys: passed')
