/** 같은 국가의 두 여행: 기존 정보 보존, 일정·신고·첨부 분리, 국가 규칙과 복원 회귀. DB 미사용. */
import assert from 'node:assert/strict'
import {
  attachmentInDestinationScope,
  buildCaseJourneyContext,
  canonicalDestinations,
  captureJourneySnapshot,
  DEFAULT_CERT_CONFIG,
  destinationCountry,
  destinationEnglish,
  DESTINATION_SCOPED_FIELD_KEYS,
  deriveReportSlotStatus,
  findDestinationKey,
  flattenCaseForDestination,
  getDepartureDate,
  getChecksForCountry,
  isRabiesFreeOrigin,
  matchesDestinationKey,
  nextDestinationVisit,
  planCaseDestinationAddition,
  planJourneyRestore,
  planReportSlotWrite,
  preserveLegacyJapanReportSignals,
  readByDestValue,
  resolveCerts,
  resolveInspectionLabs,
  resolveReportBinding,
  writeByDestValue,
  type CaseRow,
} from '../packages/domain/src'
import { clearLegacyReportStatusForStep } from '../packages/domain/src/journey-steps/report-slots'

const first = '일본'
const second = '일본 (2차)'
const original = {
  id: 'repeat-journey-fixture', destination: first, departure_date: '2026-11-03',
  data: {
    species: 'dog', return_date: '2026-11-07', entry_flight_number: 'KE701',
    advance_notification_date: '2026-10-01', advance_notification_approval_skipped: true,
    jp_export_quarantine_application_date: '2026-10-02', jp_export_quarantine_reservation_skipped: true,
    rabies_dates: [{ date: '2026-01-01' }],
    documents: [
      { id: 'approval-first', stepId: 'advance-notification', destination: first },
      { id: 'legacy-export', stepId: 'jp-export-quarantine' },
    ],
  },
} as unknown as CaseRow
const before = structuredClone(original)
const addition = planCaseDestinationAddition(original, first, '2026-10-26')
assert(addition.ok)
assert.equal(addition.token, second)
assert.equal(addition.destination, `${first}, ${second}`)
assert.deepEqual(original, before, '추가 계획이 원본 객체를 변경하면 안 된다')
let row = { ...original, destination: addition.destination, data: addition.data }
let firstView = flattenCaseForDestination(row, first)
let secondView = flattenCaseForDestination(row, second)
assert.equal(firstView.departure_date, '2026-11-03')
assert.equal(firstView.data.return_date, '2026-11-07')
assert.equal(firstView.data.entry_flight_number, 'KE701')
assert.equal(deriveReportSlotStatus(firstView, first, 'import'), 'done')
assert.equal(deriveReportSlotStatus(firstView, first, 'export'), 'done')
assert.equal(secondView.departure_date, null)
assert.equal(secondView.data.return_date, undefined)
assert.equal(deriveReportSlotStatus(secondView, second, 'import'), 'not_started')
assert.equal(deriveReportSlotStatus(secondView, second, 'export'), 'not_started')
assert.deepEqual(secondView.data.rabies_dates, original.data.rabies_dates, '접종 기록은 동물 단위 공유')

// 두 여행이 같은 달이어도 각각의 입출국일·항공편·신고 날짜로 저장한다.
for (const [key, value] of Object.entries({
  departure_date: '2026-11-20', return_date: '2026-11-23', entry_flight_number: 'KE703',
  advance_notification_date: '2026-10-15',
})) row = { ...row, data: writeByDestValue(row.data, second, key, value) }
const binding = resolveReportBinding(second, 'import')
assert(binding)
const patch = planReportSlotWrite(binding, 'done', flattenCaseForDestination(row, second).data, '2026-10-26')
for (const [key, value] of Object.entries(patch)) row = { ...row, data: writeByDestValue(row.data, second, key, value) }
firstView = flattenCaseForDestination(row, first)
secondView = flattenCaseForDestination(row, second)
assert.equal(firstView.data.advance_notification_date, '2026-10-01')
assert.equal(secondView.data.advance_notification_date, '2026-10-15')
assert.equal(getDepartureDate(row, first), '2026-11-03')
assert.equal(getDepartureDate(row, second), '2026-11-20')
assert.equal(firstView.data.return_date, '2026-11-07')
assert.equal(secondView.data.return_date, '2026-11-23')
assert.equal(secondView.data.entry_flight_number, 'KE703')
assert.deepEqual(flattenCaseForDestination(secondView, second), secondView,
  '서류·검증에서 같은 뷰를 다시 평탄화해도 두 번째 여행의 값을 지우면 안 된다')
assert.equal(deriveReportSlotStatus(secondView, second, 'import'), 'done')
row = { ...row, data: writeByDestValue(row.data, second, 'advance_notification_approval_skipped', null) }
assert.equal(deriveReportSlotStatus(flattenCaseForDestination(row, second), second, 'import'), 'in_progress')
assert.equal(deriveReportSlotStatus(flattenCaseForDestination(row, first), first, 'import'), 'done')
const advanceDeadline = getChecksForCountry('japan').find(c => c.id === 'jp.advance-notification-40days-before-entry')
assert(advanceDeadline?.run)
assert.equal(advanceDeadline.run({ caseRow: row, destination: second }).ok, false,
  '신고 마감 검증도 2차의 신청일과 출국일을 읽어야 한다')
assert.equal(advanceDeadline.run({ caseRow: row, destination: first }).ok, true,
  '첫 여행의 완료 상태에는 두 번째 여행의 마감 경고가 섞이지 않는다')

// 2차를 국가 규칙에는 일본으로, 데이터에는 독립된 토큰으로 전달한다.
assert.equal(destinationCountry(second), first)
assert.equal(destinationEnglish(second), 'Japan')
assert.equal(findDestinationKey(second), 'japan')
assert(matchesDestinationKey(second, 'japan'))
assert(isRabiesFreeOrigin(second))
assert.equal(buildCaseJourneyContext(row, second).destinationToken, second)
assert.equal(buildCaseJourneyContext(row, second).destinationKey, 'japan')
assert(resolveCerts(second, DEFAULT_CERT_CONFIG, 'dog').some(c => c.key === 'formAC'))
assert.deepEqual(resolveInspectionLabs(second, [{ countries: [first], labs: ['test-lab'] }]), ['test-lab'])
assert.deepEqual(canonicalDestinations(['터키', '튀르키예 (2차)', '터키']), ['튀르키예', '튀르키예 (2차)'])
assert.equal(destinationCountry('뉴질랜드(구)'), '뉴질랜드(구)', '규정 버전을 여행 회차로 오인하면 안 된다')

assert(!attachmentInDestinationScope({ destination: first }, 'advance-notification', second))
assert(!attachmentInDestinationScope({}, 'advance-notification', second))
assert(attachmentInDestinationScope({ destination: first }, 'advance-notification', first))
assert(attachmentInDestinationScope({ destination: first }, 'rabies-titer', second))
assert(attachmentInDestinationScope({ destination: second }, 'advance-notification', second))

// 기존 일본+다른 나라 케이스의 전역 신호는 첫 일본 여행에서 계속 읽힌다.
const legacyMulti = { ...original, destination: '일본, 미국' }
assert.equal(deriveReportSlotStatus(flattenCaseForDestination(legacyMulti, first), first, 'import'), 'done')
assert.equal(flattenCaseForDestination(legacyMulti, '미국').data.advance_notification_date, undefined)
const preserved = preserveLegacyJapanReportSignals(legacyMulti.data, legacyMulti.destination)
for (const key of DESTINATION_SCOPED_FIELD_KEYS) delete preserved[key]
assert.equal(readByDestValue(preserved, first, 'advance_notification_date'), '2026-10-01')
const legacyAddition = planCaseDestinationAddition(legacyMulti, first, '2026-10-26')
assert(legacyAddition.ok)
assert.equal(readByDestValue(legacyAddition.data, first, 'advance_notification_date'), '2026-10-01')
assert.equal(readByDestValue(legacyAddition.data, second, 'advance_notification_date'), undefined)
assert(!planCaseDestinationAddition({ ...row, destination: '일본, 일본 (2차), 미국' }, '일본', '2026-10-26').ok)
assert.equal(nextDestinationVisit(first, ['일본', '일본 (3차)']), '일본 (4차)')
const pastAddition = planCaseDestinationAddition({
  ...original, destination: null, departure_date: null,
  data: { past_journeys: [{ destination: first }], documents: original.data.documents },
}, first, '2026-10-26')
assert(pastAddition.ok)
assert.equal(pastAddition.token, second, '지난 여정의 첨부를 새 여행에 재사용하면 안 된다')

// 첫 여행이 활성 상태여도 보관한 2차 여행은 원래 슬롯으로 복원할 수 있다.
const snapshot = captureJourneySnapshot({ destination: second, data: row.data,
  destinationColumn: row.destination, departureColumn: row.departure_date })
const remaining = structuredClone(row.data)
delete (remaining.by_dest as Record<string, unknown>)[second]
remaining.past_journeys = [{ destination: second, outcome: 'done', snapshot }]
const restored = planJourneyRestore({ ...row, destination: first, data: remaining }, 0)
assert(!('reason' in restored))
assert.equal(getDepartureDate(restored, second), '2026-11-20')
assert.equal(getDepartureDate(restored, first), '2026-11-03')

// 한 여행에서 보호자가 입력해도 다른 여행의 옛 수동 상태를 지우지 않는다.
const legacyFloors = { by_dest: { [first]: { import_import_status: 'done' }, [second]: { import_import_status: 'in_progress' } } }
clearLegacyReportStatusForStep(legacyFloors, 'advance-notification', 'import', second)
assert.equal(legacyFloors.by_dest[first].import_import_status, 'done')
assert.equal(legacyFloors.by_dest[second].import_import_status, null)
console.log('✓ repeat journeys: 일정·신고·첨부 분리, 기존 기록 보존, 국가 규칙·복원 검증 통과')
