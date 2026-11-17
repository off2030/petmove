import assert from 'node:assert/strict'
import {
  addDays,
  findStepForCheck,
  getTiterLabCodes,
  isJapanTiterLabApproved,
  readJapanTiterEntries,
  resolveCompletedDate,
  resolveDone,
  validateJpEntryDate,
  JAPAN_TITER_LAB_WARNING,
  isJapanTiterLabNotification,
  resolveJapanTiterLabNotification,
  type CaseRow,
} from '../packages/domain/src'
import { JP_CHECKS } from '../packages/domain/src/procedure-checks/jp'
import { buildJourney } from '../apps/portal/lib/journey/scenario'

const krsl = { date: '2026-07-01', lab: 'krsl', value: '4.56' }
const approved = { date: '2026-10-17', lab: 'apqa_seoul', value: '3.46' }
const fixture = (records: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'japan-titer-fixture', destination: '일본', departure_date: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
  data: {
    species: 'dog', microchip_implant_date: '2025-07-04',
    rabies_dates: [{ date: '2026-03-30' }, { date: '2026-07-01' }],
    rabies_titer_records: records, ...extra,
  },
} as unknown as CaseRow)
const run = (id: string, caseRow: CaseRow) => JP_CHECKS.find((check) => check.id === id)!.run!({ caseRow, destination: '일본' })

assert.equal(addDays(approved.date, 180), '2027-04-15')
assert(getTiterLabCodes('japan').includes('rias'))
for (const lab of ['apqa_seoul', 'APQA SEOUL', 'KSVDL-R', 'ksvdl_r', 'RIAS', 'RIASBT', '生物科学安全研究所']) {
  assert.equal(isJapanTiterLabApproved(lab), true, lab)
}
for (const lab of ['krsl', 'APQA HQ', 'apqa_eu', '농림축산검역본부', 'unknown', '', null]) {
  assert.equal(isJapanTiterLabApproved(lab), false, String(lab))
}

for (const records of [[krsl, approved], [approved, krsl]]) {
  const row = fixture(records)
  const before = structuredClone(row)
  assert.equal(buildJourney(row).trip.prep?.label, '27·04·15 입국 가능')
  assert.equal(resolveCompletedDate('has-titer-entry', row), approved.date)
  assert.equal(resolveDone('has-titer-entry', row), true)
  assert.match(validateJpEntryDate('2026-12-28', { data: row.data!, destination: '일본', departureDate: null })!, /2027/)
  assert.equal(validateJpEntryDate('2027-04-15', { data: row.data!, destination: '일본', departureDate: null }), null)
  const december = { ...row, departure_date: '2026-12-28' }
  assert.equal(run('jp.entry-180days-after-titer', december).ok, false)
  assert.equal(run('jp.titer-designated-lab', row).ok, true)
  assert.deepEqual(row, before, 'Calculations must never rewrite lab names or customer records')
}

const invalid = fixture([krsl], { rabies_titer_result_confirmed: true })
assert.equal(readJapanTiterEntries(invalid.data!).length, 0)
assert.equal(resolveDone('has-titer-entry', invalid), false)
assert.equal(resolveCompletedDate('has-titer-entry', invalid), null)
assert.equal(run('jp.titer-designated-lab', invalid).ok, false)
assert.equal(run('jp.titer-designated-lab', invalid).message, JAPAN_TITER_LAB_WARNING)
assert(!buildJourney(invalid).trip.prep?.label.includes('입국 가능'))
assert.equal(findStepForCheck('jp.titer-designated-lab'), 'rabies-titer')

// Saving a result before choosing its lab must not create an unapproved-lab alert.
for (const lab of [null, undefined, '', '  ']) {
  assert.equal(run('jp.titer-designated-lab', fixture([{ ...approved, lab }])).ok, true)
}
assert.equal(run('jp.titer-designated-lab', fixture([])).ok, true)
assert.equal(run('jp.titer-designated-lab', fixture([{ ...approved, date: '' }])).ok, true)
assert.equal(run('jp.titer-designated-lab', fixture([{ ...approved, lab: 'unverified laboratory' }])).ok, false)
assert.deepEqual(run('jp.titer-designated-lab', fixture([{ ...approved, lab: null }, krsl])).offendingPaths, ['rabies_titer_records[1].lab'])

const legacyWarning = '일본 지정기관의 항체검사가 필요해요. APQA Seoul·KSVDL-R·RIAS 등 지정기관을 확인하세요. 기존 기록의 기관명만 바꾸면 안 돼요.'
const alert = (warning: string, rest = '') => `검증 실패 알림\n\n고객 · 테스트\n동물 · 테스트\n국가 · 일본\n\n• ${warning}${rest}`
for (const warning of [legacyWarning, JAPAN_TITER_LAB_WARNING]) {
  const content = alert(warning)
  assert.equal(isJapanTiterLabNotification(content), true)
  for (const lab of ['apqa_seoul', 'ksvdl_r', 'rias']) {
    assert.deepEqual(resolveJapanTiterLabNotification(content, fixture([{ ...approved, lab }]).data), {
      resolved: true, resolvedBulletIndexes: [0],
    })
  }
  for (const data of [undefined, {}, fixture([{ ...approved, lab: null }]).data, invalid.data]) {
    assert.equal(resolveJapanTiterLabNotification(content, data), undefined)
  }
  assert.deepEqual(resolveJapanTiterLabNotification(alert(warning, '\n• 다른 경고'), fixture([approved]).data), {
    resolved: false, resolvedBulletIndexes: [0],
  })
  assert.deepEqual(resolveJapanTiterLabNotification(alert(warning, '\n외 2건…'), fixture([approved]).data), {
    resolved: false, resolvedBulletIndexes: [0],
  })
  assert.equal(resolveJapanTiterLabNotification(content.replace('검증 실패 알림', '신규 신청'), fixture([approved]).data), undefined)
}
assert.equal(resolveJapanTiterLabNotification(alert('관계없는 경고'), fixture([approved]).data), undefined)

// An older pending result must not borrow the newer record's passing value/flag.
const pending = fixture([krsl, { ...approved, value: '' }], { rabies_titer_result_confirmed: true })
assert.equal(resolveDone('has-titer-entry', pending), false)
assert.equal(buildJourney(pending).trip.prep?.label, '항체검사 결과 확인 필요')
const olderPending = fixture([{ ...approved, date: '2026-01-01', value: '' }, approved])
assert.equal(buildJourney(olderPending).trip.prep?.label, '27·04·15 입국 가능')
assert.equal(resolveCompletedDate('has-titer-entry', olderPending), approved.date)

// A second approved test does not restart the original approved test's 180-day wait.
const repeat = fixture([{ ...approved, date: '2026-01-01' }, approved, { ...krsl, date: '2026-11-01' }])
assert.equal(validateJpEntryDate('2026-12-28', { data: repeat.data!, destination: '일본', departureDate: null }), null)
assert.equal(run('jp.entry-180days-after-titer', { ...repeat, departure_date: '2026-12-28' }).ok, true)
const failed = fixture([{ ...approved, value: '0.1' }], { rabies_titer_result_confirmed: true })
assert.equal(resolveDone('has-titer-entry', failed), false)
assert(!buildJourney(failed).trip.prep?.label.includes('입국 가능'))
const expired = fixture([{ ...approved, date: '2020-01-01' }, krsl])
assert.equal(buildJourney(expired).trip.prep?.label, '일본용 항체검사 결과 갱신 필요')

// The lab restriction is Japan-specific; preserve another destination's existing interpretation.
assert.equal(resolveDone('has-titer-entry', { ...invalid, destination: '뉴질랜드' }), true)
const multi = { ...fixture([krsl, approved]), destination: '뉴질랜드,일본' }
assert.equal(buildJourney(multi, '일본').trip.prep?.label, '27·04·15 입국 가능')
console.log('PASS: Japan lab eligibility, mixed/reversed records, countdown, completion, date guards, pending/failed results and destination scope')
