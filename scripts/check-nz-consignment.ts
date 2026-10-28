/** Offline regressions: destination input fields and the actual certificate header sources. */
import assert from 'node:assert/strict'
import {
  getEffectiveExtraFieldEntries, flattenCaseForDestination, readEffectiveExtraValue,
  DESTINATION_SCOPED_FIELD_KEYS, type CaseRow,
} from '../packages/domain/src'
import { nzImporterName, nzArrivalPort } from '../apps/admin/lib/pdf-nz-consignment'

for (const destination of ['뉴질랜드', '뉴질랜드(구)']) {
  const keys = getEffectiveExtraFieldEntries(destination, null).map(f => f.key)
  for (const key of ['nz_importer_name', 'address_overseas', 'entry_airport']) {
    assert.ok(keys.includes(key), `${destination}: ${key} must be editable`)
    assert.ok(DESTINATION_SCOPED_FIELD_KEYS.has(key), `${key} must belong to a trip`)
  }
}
const row = {
  destination: '뉴질랜드, 뉴질랜드 (2차)', customer_name_en: 'Legacy Owner',
  data: {
    customer_first_name_en: 'ALICE', customer_last_name_en: 'KIM',
    co_owner: { first_name_en: 'CHARLES', last_name_en: 'LEE' },
    nz_importer_name: 'Stale Importer', address_overseas: 'Stale address', entry_airport: 'AKL',
    by_dest: {
      '뉴질랜드': { nz_importer_name: 'FIRST IMPORTER', address_overseas: 'Christchurch home', entry_airport: 'AKL' },
      '뉴질랜드 (2차)': { nz_importer_name: 'SECOND IMPORTER', address_overseas: 'Auckland home', entry_airport: 'CHC' },
    },
  },
} as unknown as CaseRow
const before = structuredClone(row)
for (const [destination, name, port] of [
  ['뉴질랜드', 'FIRST IMPORTER', 'Auckland Airport (AKL)'],
  ['뉴질랜드 (2차)', 'SECOND IMPORTER', 'Christchurch Airport (CHC)'],
]) {
  const flat = flattenCaseForDestination(row, destination)
  assert.equal(nzImporterName(flat, flat.data!), name)
  assert.equal(readEffectiveExtraValue(row.data, 'nz_importer_name', destination), name)
  assert.equal(nzArrivalPort(flat.data!.entry_airport), port, 'The airport, not the address, determines port of arrival')
}
assert.deepEqual(row, before, 'Reading a certificate must not modify the stored case')
row.data!.by_dest = { '뉴질랜드 (2차)': { nz_importer_name: null, address_overseas: null, entry_airport: null } }
const blank = flattenCaseForDestination(row, '뉴질랜드 (2차)')
assert.equal(nzImporterName(blank, blank.data!), 'ALICE KIM / CHARLES LEE', 'Preserve the previous owner fallback')
assert.equal(blank.data!.address_overseas, undefined)
assert.equal(nzArrivalPort(blank.data!.entry_airport), '')
assert.equal(nzArrivalPort('Auckland International Airport'), 'Auckland Airport (AKL)')
assert.equal(nzArrivalPort('CHC'), 'Christchurch Airport (CHC)')
assert.equal(nzArrivalPort(' 오클랜드 '), 'Auckland Airport (AKL)')
assert.equal(nzArrivalPort('Christchurch Airport (CHC)'), 'Christchurch Airport (CHC)')
assert.equal(nzArrivalPort(undefined), '')
assert.equal(nzArrivalPort('Custom arrival port'), 'Custom arrival port')
console.log('✓ NZ fields, per-trip importer/address, owner fallback, airport formatting and missing values')
