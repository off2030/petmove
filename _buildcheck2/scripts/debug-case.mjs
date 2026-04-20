#!/usr/bin/env node
/**
 * Debug a specific case: compare what's in the xlsx vs what's in the DB.
 * Usage:
 *   node scripts/debug-case.mjs "오유진" "루이"
 */
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const XLSX_PATH = 'G:/내 드라이브/펫무브워크/Original form.xlsx'
const SHEET_NAME = '구글폼'

const customerSearch = process.argv[2] || '오유진'
const petSearch = process.argv[3] || '루이'

console.log(`Searching for customer="${customerSearch}" pet="${petSearch}"`)
console.log('─'.repeat(60))

// 1) Load xlsx and find matching rows
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(XLSX_PATH)
const ws = wb.getWorksheet(SHEET_NAME)

const HEADERS = {}
for (let c = 1; c <= 50; c++) {
  const v = ws.getCell(1, c).value
  if (v) HEADERS[c] = String(v).trim()
}

const s = (v) => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text).join('').trim()
    if (v.text) return String(v.text).trim()
    if (v.result !== undefined) return String(v.result).trim()
    if (v instanceof Date) return v.toISOString()
  }
  return String(v).trim()
}

const matches = []
for (let r = 2; r <= ws.rowCount; r++) {
  const customer = s(ws.getCell(r, 4).value)
  const pet = s(ws.getCell(r, 10).value)
  if (customer.includes(customerSearch) && pet.includes(petSearch)) {
    matches.push(r)
  } else if (customer === customerSearch) {
    // partial match on customer only
    matches.push(r)
  }
}

console.log(`\nXLSX matches: ${matches.length} row(s)`)
for (const r of matches) {
  console.log(`\n─── XLSX row ${r} ───`)
  for (let c = 1; c <= 50; c++) {
    const header = HEADERS[c] || `col${c}`
    const val = s(ws.getCell(r, c).value)
    if (val) console.log(`  [${c}] ${header} = ${val}`)
  }
}

// 2) Query DB
console.log('\n' + '─'.repeat(60))
console.log('DB lookup:')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const { data, error } = await supabase
  .from('cases')
  .select('*')
  .ilike('customer_name', `%${customerSearch}%`)

if (error) {
  console.error('DB error:', error.message)
  process.exit(1)
}

const dbMatches = data.filter(
  (r) => !petSearch || (r.pet_name && r.pet_name.includes(petSearch)),
)

console.log(`\nDB matches: ${dbMatches.length}`)
for (const row of dbMatches) {
  console.log(`\n─── DB row id=${row.id.slice(0, 8)} ───`)
  console.log(`  microchip       : ${row.microchip ?? '(null)'}`)
  console.log(`  customer_name   : ${row.customer_name}`)
  console.log(`  pet_name        : ${row.pet_name}`)
  console.log(`  destination     : ${row.destination}`)
  console.log(`  status          : ${row.status}`)
  console.log(`  created_at      : ${row.created_at}`)
  console.log(`  data (jsonb):`)
  for (const [k, v] of Object.entries(row.data ?? {})) {
    const display = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '...' : v
    console.log(`    ${k.padEnd(24)}: ${JSON.stringify(display)}`)
  }
}
