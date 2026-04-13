#!/usr/bin/env node
/**
 * Migrate fixed 1st/2nd/3rd schedule fields to arrays.
 *
 * rabies_1/2/3         → rabies_dates: [...]
 * civ                  → civ_dates: [...]
 * external_parasite_1/2/3 → external_parasite_dates: [...]
 * internal_parasite_1/2   → internal_parasite_dates: [...]
 * rabies_titer_test_date + rabies_titer + rabies_titer_lab → rabies_titer_records: [{date,value,lab}]
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const allCases = []
let f = 0
while (true) {
  const { data } = await sb.from('cases').select('id, pet_name, customer_name, data').range(f, f + 999)
  if (!data || !data.length) break
  allCases.push(...data)
  if (data.length < 1000) break
  f += 1000
}

const OLD_KEYS = [
  'rabies_1', 'rabies_2', 'rabies_3',
  'civ',
  'external_parasite_1', 'external_parasite_2', 'external_parasite_3',
  'internal_parasite_1', 'internal_parasite_2',
  'rabies_titer_test_date', 'rabies_titer', 'rabies_titer_lab',
]

let migrated = 0, skipped = 0, errors = 0

for (const c of allCases) {
  const d = { ...(c.data ?? {}) }

  // Check if any old keys exist
  const hasOld = OLD_KEYS.some(k => d[k] != null && d[k] !== '')
  // Check if already migrated
  const hasNew = d.rabies_dates || d.civ_dates || d.external_parasite_dates || d.internal_parasite_dates || d.rabies_titer_records
  if (!hasOld && !hasNew) { skipped++; continue }
  if (hasNew && !hasOld) { skipped++; continue } // already done

  let changed = false

  // 1. Rabies dates
  if (!d.rabies_dates) {
    const dates = [d.rabies_1, d.rabies_2, d.rabies_3].filter(Boolean)
    if (dates.length > 0) { d.rabies_dates = dates; changed = true }
  }
  delete d.rabies_1; delete d.rabies_2; delete d.rabies_3

  // 2. CIV dates
  if (!d.civ_dates) {
    if (d.civ) { d.civ_dates = [d.civ]; changed = true }
  }
  delete d.civ

  // 3. External parasite dates
  if (!d.external_parasite_dates) {
    const dates = [d.external_parasite_1, d.external_parasite_2, d.external_parasite_3].filter(Boolean)
    if (dates.length > 0) { d.external_parasite_dates = dates; changed = true }
  }
  delete d.external_parasite_1; delete d.external_parasite_2; delete d.external_parasite_3

  // 4. Internal parasite dates
  if (!d.internal_parasite_dates) {
    const dates = [d.internal_parasite_1, d.internal_parasite_2].filter(Boolean)
    if (dates.length > 0) { d.internal_parasite_dates = dates; changed = true }
  }
  delete d.internal_parasite_1; delete d.internal_parasite_2

  // 5. Rabies titer records
  if (!d.rabies_titer_records) {
    const hasAny = d.rabies_titer_test_date || d.rabies_titer || d.rabies_titer_lab
    if (hasAny) {
      d.rabies_titer_records = [{
        date: d.rabies_titer_test_date || null,
        value: d.rabies_titer || null,
        lab: d.rabies_titer_lab || null,
      }]
      changed = true
    }
  }
  delete d.rabies_titer_test_date; delete d.rabies_titer; delete d.rabies_titer_lab

  if (!changed && !hasOld) { skipped++; continue }

  if (DRY_RUN) {
    migrated++
    if (migrated <= 5) {
      const summary = []
      if (d.rabies_dates) summary.push(`광견병:${d.rabies_dates.length}`)
      if (d.civ_dates) summary.push(`CIV:${d.civ_dates.length}`)
      if (d.external_parasite_dates) summary.push(`외부:${d.external_parasite_dates.length}`)
      if (d.internal_parasite_dates) summary.push(`내부:${d.internal_parasite_dates.length}`)
      if (d.rabies_titer_records) summary.push(`항체:${d.rabies_titer_records.length}`)
      console.log(`  ${c.pet_name} (${c.customer_name}): ${summary.join(', ')}`)
    }
    continue
  }

  const { error } = await sb.from('cases').update({ data: d }).eq('id', c.id)
  if (error) { errors++; console.error(`  오류: ${c.pet_name} - ${error.message}`) }
  else migrated++
}

console.log(`\n총 케이스: ${allCases.length}`)
console.log(`마이그레이션: ${migrated}`)
console.log(`건너뜀: ${skipped}`)
if (errors) console.log(`오류: ${errors}`)
if (DRY_RUN) console.log('\nDRY-RUN. --dry-run 없이 다시 실행하면 적용.')
