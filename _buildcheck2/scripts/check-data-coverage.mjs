#!/usr/bin/env node
/**
 * Diagnostic: how many cases actually have each jsonb field populated?
 * Helps answer "is data missing in DB, or missing in UI?"
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// Fetch everything — 1816 rows is tiny
const { data, error } = await supabase
  .from('cases')
  .select('id, microchip, customer_name, pet_name, data')

if (error) {
  console.error('ERROR:', error.message)
  process.exit(1)
}

console.log(`Total cases: ${data.length}`)
console.log()

const FIELDS = [
  'phone', 'email', 'address_kr', 'address_en', 'address_overseas',
  'birth_date', 'age', 'species', 'breed', 'breed_en', 'sex', 'sex_en',
  'color', 'color_en', 'weight',
  'microchip_check_date',
  'rabies_1', 'rabies_2', 'rabies_3', 'comprehensive', 'civ',
  'rabies_titer_date', 'rabies_titer_value',
  'heartworm', 'infectious_disease',
  'external_parasite_1', 'external_parasite_2', 'external_parasite_3',
  'internal_parasite_1', 'internal_parasite_2',
  'memo',
]

console.log('Field coverage (non-null count):')
console.log('─'.repeat(50))
for (const key of FIELDS) {
  const n = data.filter((r) => {
    const v = (r.data ?? {})[key]
    return v !== null && v !== undefined && v !== ''
  }).length
  const pct = ((n / data.length) * 100).toFixed(1)
  const bar = '█'.repeat(Math.round((n / data.length) * 30))
  console.log(`${key.padEnd(24)} ${String(n).padStart(5)}  ${pct.padStart(5)}%  ${bar}`)
}

// Regular columns
console.log()
console.log('Regular columns:')
console.log('─'.repeat(50))
const microchipCount = data.filter(r => r.microchip).length
const petNameCount = data.filter(r => r.pet_name).length
console.log(`microchip (present)       ${String(microchipCount).padStart(5)}  ${((microchipCount/data.length)*100).toFixed(1)}%`)
console.log(`pet_name (present)        ${String(petNameCount).padStart(5)}  ${((petNameCount/data.length)*100).toFixed(1)}%`)

// Sample: find 정슬아 / 설이 to verify
console.log()
console.log('Sample case (정슬아 / 설이):')
const sample = data.find(r => r.customer_name === '정슬아' && r.pet_name === '설이')
if (sample) {
  console.log(JSON.stringify(sample.data, null, 2).slice(0, 800))
} else {
  console.log('  not found')
}
