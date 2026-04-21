#!/usr/bin/env node
// Analyze why rows are being skipped from the xlsx import
import ExcelJS from 'exceljs'

const XLSX_PATH = 'G:/내 드라이브/펫무브워크/Original form.xlsx'
const SHEET_NAME = '구글폼'

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(XLSX_PATH)
const ws = wb.getWorksheet(SHEET_NAME)

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

// Counters
let total = 0
let bothEmpty = 0       // no microchip AND no customer_name
let onlyMicrochip = 0   // microchip present, customer_name empty
let onlyCustomer = 0    // customer_name present, microchip empty
let bothPresent = 0     // both present (will try to import)
let allColsEmpty = 0    // literally an empty row

const seen = new Map()
let duplicates = 0

// Sample rows where one is missing
const samples = {
  onlyMicrochip: [],
  onlyCustomer: [],
  bothEmpty: [],
}

for (let r = 2; r <= ws.rowCount; r++) {
  total++
  const row = ws.getRow(r)

  // Check any non-empty cell across 40 cols
  let anyNonEmpty = false
  for (let c = 1; c <= 40; c++) {
    if (s(row.getCell(c).value)) { anyNonEmpty = true; break }
  }
  if (!anyNonEmpty) { allColsEmpty++; continue }

  const microchip = s(row.getCell(2).value)
  const customer_name = s(row.getCell(4).value)
  const pet_name = s(row.getCell(10).value)
  const destination = s(row.getCell(3).value)

  if (!microchip && !customer_name) {
    bothEmpty++
    if (samples.bothEmpty.length < 5) {
      samples.bothEmpty.push({ r, pet_name, destination, cells: [1,2,3,4,5,6,10].map(c => s(row.getCell(c).value)).filter(Boolean) })
    }
    continue
  }
  if (microchip && !customer_name) {
    onlyMicrochip++
    if (samples.onlyMicrochip.length < 5) samples.onlyMicrochip.push({ r, microchip, pet_name, destination })
    continue
  }
  if (!microchip && customer_name) {
    onlyCustomer++
    if (samples.onlyCustomer.length < 5) samples.onlyCustomer.push({ r, customer_name, pet_name, destination })
    continue
  }

  bothPresent++
  if (seen.has(microchip)) { duplicates++ }
  else seen.set(microchip, r)
}

const uniquePresent = bothPresent - duplicates

console.log('━'.repeat(60))
console.log('Skip analysis')
console.log('━'.repeat(60))
console.log(`Total rows                      : ${total}`)
console.log(`  All 40 cols empty             : ${allColsEmpty}  (blank rows)`)
console.log(`  Both microchip & name empty   : ${bothEmpty}  (partial / abandoned)`)
console.log(`  Only microchip (no name)      : ${onlyMicrochip}`)
console.log(`  Only name (no microchip)      : ${onlyCustomer}`)
console.log(`  Both present (importable)     : ${bothPresent}`)
console.log(`    ├─ unique                   : ${uniquePresent}`)
console.log(`    └─ duplicates of earlier    : ${duplicates}`)
console.log('━'.repeat(60))

if (samples.onlyMicrochip.length > 0) {
  console.log('\nSample: only microchip (no customer_name)')
  for (const x of samples.onlyMicrochip) console.log(' ', x)
}
if (samples.onlyCustomer.length > 0) {
  console.log('\nSample: only customer_name (no microchip)')
  for (const x of samples.onlyCustomer) console.log(' ', x)
}
if (samples.bothEmpty.length > 0) {
  console.log('\nSample: both empty but some other cells non-empty')
  for (const x of samples.bothEmpty) console.log(' ', x)
}
