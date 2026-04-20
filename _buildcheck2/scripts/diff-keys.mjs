#!/usr/bin/env node
/**
 * Show the diff between:
 *   - keys currently in field_definitions (platform defaults, active)
 *   - keys actually present across all cases.data jsonb columns
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// 1) Current field_definitions keys
const { data: defs, error: defsErr } = await supabase
  .from('field_definitions')
  .select('key, label, type, group_name, display_order')
  .is('org_id', null)
  .eq('is_active', true)
  .order('display_order')

if (defsErr) {
  console.error(defsErr.message)
  process.exit(1)
}

console.log('─'.repeat(70))
console.log('Current field_definitions (platform defaults):')
console.log('─'.repeat(70))
for (const d of defs) {
  console.log(`  ${d.key.padEnd(28)} | ${d.label.padEnd(20)} | ${d.group_name ?? ''}`)
}

// 2) Collect all keys that appear in cases.data
// Need to page through all rows since default is 1000
const allKeys = new Map() // key -> count
let fromIdx = 0
const pageSize = 1000
while (true) {
  const { data: page, error: caseErr } = await supabase
    .from('cases')
    .select('data')
    .range(fromIdx, fromIdx + pageSize - 1)
  if (caseErr) {
    console.error(caseErr.message)
    process.exit(1)
  }
  if (!page || page.length === 0) break
  for (const row of page) {
    const d = row.data ?? {}
    for (const k of Object.keys(d)) {
      allKeys.set(k, (allKeys.get(k) ?? 0) + 1)
    }
  }
  if (page.length < pageSize) break
  fromIdx += pageSize
}

console.log()
console.log('─'.repeat(70))
console.log('Keys actually present in cases.data:')
console.log('─'.repeat(70))
const sortedKeys = [...allKeys.entries()].sort((a, b) => b[1] - a[1])
for (const [k, n] of sortedKeys) {
  console.log(`  ${k.padEnd(28)} | ${String(n).padStart(5)} rows`)
}

// 3) Diff
const defKeys = new Set(defs.map((d) => d.key))
const dataKeys = new Set(allKeys.keys())

const onlyInDefs = [...defKeys].filter((k) => !dataKeys.has(k))
const onlyInData = [...dataKeys].filter((k) => !defKeys.has(k))

console.log()
console.log('─'.repeat(70))
console.log('DIFF: keys in field_definitions but MISSING from every case (broken UI):')
console.log('─'.repeat(70))
for (const k of onlyInDefs) console.log(`  ❌ ${k}`)

console.log()
console.log('─'.repeat(70))
console.log('DIFF: keys in case data but NOT in field_definitions (orphan data):')
console.log('─'.repeat(70))
for (const k of onlyInData) console.log(`  ⚠️  ${k}  (${allKeys.get(k)} rows)`)
