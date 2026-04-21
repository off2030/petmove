import { readFile } from 'node:fs/promises'

const v = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

function lookupByDateRange(list, date) {
  if (!date) return null
  const c = list
    .filter(p => p.expiry && date <= p.expiry)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))
  return c[0] ?? null
}
function lookupExt(species, date) {
  const list = species === 'dog' ? v.parasite_external_dog : v.parasite_external_cat
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  return lookupByDateRange(list, date)
}
function lookupInt(species, date) {
  const list = species === 'dog' ? v.parasite_internal_dog : v.parasite_internal_cat
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  return lookupByDateRange(list, date)
}

const date = '2026-04-15'
for (const sp of ['dog', 'cat']) {
  console.log(`\n=== ${sp.toUpperCase()} @ ${date} ===`)
  console.log('  external:', lookupExt(sp, date))
  console.log('  internal:', lookupInt(sp, date))
}
