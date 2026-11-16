import assert from 'node:assert/strict'
import { philippinesPolicy, preservePhLegacyApprovals, usesPh2027, validPhTiter, assessPhTiters, hasPhParasiteCoverage, getEffectiveVaccineEntries, getStepsForCase, JOURNEY_STEP_CATALOG, getChecksForCountry, resolveCerts, DEFAULT_CERT_CONFIG, resolveRequiredDocs, flattenCaseForDestination, type CaseRow } from '../packages/domain/src/index'

const row = { id: 'test-ph', org_id: 'test', customer_name: 'Test Owner', customer_name_en: 'Test Owner', pet_name: 'Test Pet', pet_name_en: 'Test Pet', microchip: '999000000000001', destination: '필리핀', departure_date: '2027-01-15', updated_at: '2026-11-16T00:00:00Z', data: {
  species: 'cat', trip_type: 'one_way', birth_date: '2025-01-01', microchip_implant_date: '2025-01-01',
  rabies_dates: [{ date: '2026-09-01', valid_until: '3년' }],
  rabies_titer_records: [{ date: '2026-10-05', test_date: '2026-10-12', value: '2.35', lab: 'apqa_seoul', method: 'FAVN' }],
  internal_parasite_dates: [{ date: '2026-11-01', valid_until: '2027-02-01' }],
  external_parasite_dates: [{ date: '2026-11-01', valid_until: '2027-02-01' }],
  import_permit_application_date: '2027-01-01', ph_form1_issue_date: '2026-11-10', ph_form1_endorsed_date: '2026-11-11',
} } as unknown as CaseRow
const before = JSON.stringify(row)
assert.equal(philippinesPolicy(row), '2027')
const old = { ...row, data: { ...row.data, import_permit_application_date: '2026-12-01', ph_spsic_approved_date: '2026-12-05', permit_no: 'OLD' } }
assert.equal(philippinesPolicy(old, null, '2027-01-10'), 'legacy')
assert.equal(philippinesPolicy({ ...row, data: { ...old.data, ph_spsic_approved_date: '2027-01-02' } }), '2027')
assert.equal(philippinesPolicy({ ...old, data: { ...old.data, ph_spsic_approved_date: null, ph_legacy_spsic: true }, updated_at: '2027-01-02' }), 'legacy')
assert.equal(philippinesPolicy({ ...old, data: { ...old.data, ph_spsic_approved_date: null }, updated_at: '2027-01-02' }), 'review')
const multi = { ...row, destination: '일본, 필리핀, 필리핀 (2차)', data: { ...old.data, by_dest: { '필리핀': { ph_spsic_approved_date: '2026-12-05' }, '필리핀 (2차)': { import_permit_application_date: '2027-01-01' } } } }
assert.equal(philippinesPolicy(multi, '필리핀'), 'legacy')
assert.equal(philippinesPolicy(multi, '필리핀 (2차)'), '2027')
assert.equal(usesPh2027(multi, '일본'), false)
assert(validPhTiter(row.data, row.departure_date!))
for (const record of [
  { value: '0.49' }, { value: '<0.5' }, { value: '' }, { method: 'ELISA' }, { lab: 'unknown' }, { date: '2026-09-20' }, { status: 'pending' },
]) {
  const data = { ...row.data, rabies_titer_records: [{ ...(row.data.rabies_titer_records as object[])[0], ...record }] }
  assert(!validPhTiter(data, row.departure_date!), JSON.stringify(record))
}
assert(!validPhTiter({ ...row.data, microchip_implant_date: '2026-10-06' }, row.departure_date!))
const lifetime = { ...row.data, microchip_implant_date: '2022-01-01', rabies_dates: [{ date: '2023-01-01', valid_until: '3년' }, { date: '2026-01-01', valid_until: '3년' }], rabies_titer_records: [{ date: '2023-03-01', value: '0.5', lab: 'krsl', method: 'FAVN' }] }
assert(validPhTiter(lifetime, '2027-01-15'), 'Continuous 3-year vaccines must preserve an old titer')
const broken = { ...lifetime, rabies_dates: [{ date: '2023-01-01', valid_until: '3년' }, { date: '2026-01-02', valid_until: '3년' }] }
assert(!validPhTiter(broken, '2027-01-15'), 'Even one day late invalidates the old titer')
assert(assessPhTiters(broken, '2027-01-15')[0].problems.some(p => p.includes('단절')))
assert(hasPhParasiteCoverage(row.data, 'internal_parasite_dates', '2027-01-01', '2027-01-15'))
assert(!hasPhParasiteCoverage({ ...row.data, internal_parasite_dates: [{ date: '2026-11-01', expiry: '2027-02-01' }] }, 'internal_parasite_dates', '2027-01-01', '2027-01-15'), 'Batch expiry must not stand in for protection')
assert(hasPhParasiteCoverage({ a: [{ date: '2026-10-01', valid_until: '2026-10-31' }, { date: '2026-11-01', valid_until: '2026-11-30' }] }, 'a', '2026-10-20', '2026-11-20'))
const keys = getEffectiveVaccineEntries('필리핀', [], null, row).map(v => v.key)
assert(keys.includes('external_parasite')); assert(!keys.includes('general'))
assert(getEffectiveVaccineEntries('필리핀', [], null, old).some(v => v.key === 'general'))
const steps = getStepsForCase(JOURNEY_STEP_CATALOG, row)
assert(steps.some(s => s.id === 'rabies-titer')); assert(steps.some(s => s.id === 'external-parasite')); assert(!steps.some(s => s.id === 'general-vaccine'))
assert(steps.find(s => s.id === 'rabies-titer')?.description.includes('SPSIC'))
const oldSteps = getStepsForCase(JOURNEY_STEP_CATALOG, old)
assert(oldSteps.some(s => s.id === 'general-vaccine')); assert(!oldSteps.some(s => s.id === 'external-parasite'))
assert(resolveCerts('필리핀', DEFAULT_CERT_CONFIG, 'cat', row).some(c => c.key === 'phForm1'))
assert(!resolveCerts('필리핀', DEFAULT_CERT_CONFIG, 'cat', old).some(c => c.key === 'phForm1'))
assert(resolveRequiredDocs('필리핀', row)?.some(d => d.id === 'ph-form1'))
assert(resolveRequiredDocs('필리핀', row)?.some(d => d.id === 'ph-rabies-titer-result'))
assert(!resolveRequiredDocs('필리핀', old)?.some(d => d.id === 'ph-form1'))
assert.equal(philippinesPolicy({ ...old, data: { ...old.data, import_permit_application_date: '2027-01-01' } }), 'review')
const preserved = preservePhLegacyApprovals(old, { ...old.data, email: 'changed@example.com' })
assert.equal((preserved.by_dest as Record<string, Record<string, unknown>>)['필리핀'].ph_legacy_spsic, true)
assert.equal(preserved.email, 'changed@example.com')
assert.equal(old.data.by_dest, undefined)
assert.equal(philippinesPolicy({ ...row, data: { ...row.data, ph_legacy_spsic: true, import_permit_application_date: null } }), '2027', 'A stale preservation flag must not preserve an unapproved new trip')
const checks = getChecksForCountry('philippines')
const check = (id: string, test = row) => checks.find(c => c.id === id)!.run!({ caseRow: test, destination: '필리핀' })
for (const c of checks.filter(c => c.id.startsWith('ph.new-'))) assert(c.run!({ caseRow: row, destination: '필리핀' }).ok, c.id)
assert(check('ph.new-minimum-age', { ...row, data: { ...row.data, birth_date: '2026-09-01' } }).ok === false)
assert(check('ph.new-minimum-age', { ...row, data: { ...row.data, birth_date: '2026-08-28' } }).ok)
assert(check('ph.new-minimum-age', old).ok)
assert(check('ph.new-rnatt', { ...row, data: { ...row.data, rabies_titer_records: [] } }).ok === false)
assert(check('ph.microchip-before-rabies', { ...row, data: { ...row.data, microchip_implant_date: '2026-09-02' } }).ok, 'New rules permit vaccination before the chip')
assert(check('ph.new-rnatt', { ...row, data: { ...row.data, microchip_implant_date: '2026-10-06' } }).ok === false)
assert.equal(flattenCaseForDestination(multi, '필리핀 (2차)').data.ph_spsic_approved_date, undefined)
assert.equal(JSON.stringify(row), before)
console.log('PASS: PH legacy/new boundaries, scoped trips, RNATT/chain/labs, treatment validity, steps, Form 1 and checks')
