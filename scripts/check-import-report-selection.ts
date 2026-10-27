/** 신고 탭: 완료된 첫 여행이 새 여행을 가리는 회귀. 합성 데이터만 사용하며 DB에 쓰지 않는다. */
import assert from 'node:assert/strict'
import { getDepartureDate, resolveTabActiveDest, writeByDestValue, type CaseRow } from '../packages/domain/src'
import { autoImportReportDest, IMPORT_REPORT_DEST_KEY, isAutoImportReport, withImportReportDest } from '../apps/admin/lib/import-report-selection'
import { reportCompleteFor, reportSlotStatusFor } from '../apps/admin/lib/report-status'

const first='일본', second='일본 (2차)', countries=['일본','대만']
const row={
  id:'report-journeys-fixture',destination:`${first}, ${second}`,departure_date:'2026-11-02',
  data:{by_dest:{
    [first]:{departure_date:'2026-11-02',return_date:'2026-11-05',advance_notification_date:'2026-07-01',advance_notification_approval_skipped:true,jp_export_quarantine_application_date:'2026-07-01',jp_export_quarantine_reservation_skipped:true},
    [second]:{departure_date:'2026-11-22',return_date:'2026-11-25',entry_date:'2026-11-22',entry_flight_number:'TEST123'},
  }},
} as unknown as CaseRow
const before=structuredClone(row)
assert.equal(reportCompleteFor(row,first),true)
assert.equal(reportCompleteFor(row,second),false)
assert.equal(isAutoImportReport(row,countries),true)
assert.equal(autoImportReportDest(row,countries),second,'완료된 이전 여행보다 미완료 새 여행을 우선한다')
const visible=withImportReportDest(row,countries)
assert.equal(resolveTabActiveDest(visible,IMPORT_REPORT_DEST_KEY),second)
assert.equal(getDepartureDate(visible,second),'2026-11-22')
assert.equal(reportSlotStatusFor(visible,second,'import'),'not_started')
assert.equal(reportSlotStatusFor(visible,second,'export'),'not_started')
assert.deepEqual(row,before,'목록을 읽어도 실제 저장 상태가 바뀌면 안 된다')

const stale={...row,data:{...row.data,[IMPORT_REPORT_DEST_KEY]:first}}
assert.equal(autoImportReportDest(stale,countries),second,'옛 완료 여행 각인이 남아도 새 할 일을 가리지 않는다')
const history=withImportReportDest(stale,countries,first)
assert.equal(resolveTabActiveDest(history,IMPORT_REPORT_DEST_KEY),first,'직접 선택한 이전 완료 내역은 열 수 있다')
assert.equal(reportCompleteFor(history,first),true)
assert.equal(resolveTabActiveDest(withImportReportDest(stale,countries,'삭제한 여행'),IMPORT_REPORT_DEST_KEY),second)

// 1차 신고도 아직 미완료면 수입뿐 아니라 왕복 수출 완료 여부까지 보고 기존 선택을 유지한다.
let unfinished={...stale,data:writeByDestValue(stale.data,first,'jp_export_quarantine_reservation_skipped',null)}
assert.equal(reportCompleteFor(unfinished,first),false)
assert.equal(autoImportReportDest(unfinished,countries),first)
unfinished={...unfinished,data:{...unfinished.data,[IMPORT_REPORT_DEST_KEY]:second}}
assert.equal(autoImportReportDest(unfinished,countries),second)

// 2차 일정이 없으면 완료된 첫 여행을 허위 대기 건으로 바꾸지 않는다.
const unscheduled={...row,data:{...row.data,by_dest:{...row.data.by_dest as Record<string,unknown>,[second]:{}}}}
assert.equal(autoImportReportDest(unscheduled,countries),first)
// 첫 여행에 일정이 없다는 이유로 다른 여행까지 목록에서 빠지지 않는다.
const scheduledSecond={...stale,data:{...stale.data,by_dest:{...row.data.by_dest as Record<string,unknown>,[first]:{}}}}
assert.equal(autoImportReportDest(scheduledSecond,countries),second)

// 명시적 비신고국 선택·삭제된 여행 선택도 신고 대상 여행의 자동 포함을 막지 않는다.
const mixed={...row,destination:'중국, 대만',data:{[IMPORT_REPORT_DEST_KEY]:'중국',by_dest:{중국:{departure_date:'2026-11-02'},대만:{entry_date:'2026-11-23'}}}}
assert.equal(autoImportReportDest(mixed,countries),'대만')
assert.equal(autoImportReportDest({...mixed,data:{...mixed.data,[IMPORT_REPORT_DEST_KEY]:'태국'}},countries),'대만')
assert.equal(autoImportReportDest({...row,destination:'미국',data:{}},countries),null)

// 전부 완료면 저장한 여행을 유지하고, 편도는 수출을 요구하지 않는다.
let done={...stale,data:writeByDestValue(stale.data,second,'advance_notification_approval_skipped',true)}
done={...done,data:writeByDestValue(done.data,second,'advance_notification_date','2026-07-02')}
done={...done,data:writeByDestValue(done.data,second,'jp_export_quarantine_reservation_skipped',true)}
done={...done,data:writeByDestValue(done.data,second,'jp_export_quarantine_application_date','2026-07-02')}
assert.equal(reportCompleteFor(done,second),true)
assert.equal(autoImportReportDest(done,countries),first)
assert.equal(autoImportReportDest({...done,data:{...done.data,[IMPORT_REPORT_DEST_KEY]:second}},countries),second,'마지막 신고를 완료한 뒤에도 방금 처리한 여행을 유지한다')
assert.equal(reportSlotStatusFor(done,first,'import'),'done','2차 변경은 이전 여행 완료 상태와 독립')
assert.equal(reportSlotStatusFor(done,first,'export'),'done')
const oneWay={...done,data:{...done.data,trip_type:{[second]:'one_way'},by_dest:{...done.data.by_dest as Record<string,Record<string,unknown>>,[second]:{...((done.data.by_dest as Record<string,Record<string,unknown>>)[second]),jp_export_quarantine_reservation_skipped:null,jp_export_quarantine_application_date:null}}}}
assert.equal(reportCompleteFor(oneWay,second),true)
console.log('✓ 신고 목록: 새 여행 대기 우선·완료 내역 선택·항공 일정 자동 포함·신고 상태 분리 검증 통과')
