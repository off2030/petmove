#!/usr/bin/env node
/**
 * One-off migration: Original form.xlsx (sheet "구글폼") -> Supabase cases table
 *
 * Usage:
 *   node scripts/import-xlsx.mjs --dry-run          # preview, no writes
 *   node scripts/import-xlsx.mjs                    # actually insert
 *   node scripts/import-xlsx.mjs --limit 10         # only first 10 rows
 *   node scripts/import-xlsx.mjs --file "path.xlsx" # custom file path
 *
 * Env vars required (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local (dotenv defaults to .env; we use .env.local for Next.js convention)
dotenv.config({ path: '.env.local' })

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_XLSX_PATH = 'G:/내 드라이브/펫무브워크/Original form.xlsx'
const SHEET_NAME = '구글폼'
const ORG_ID = '00000000-0000-0000-0000-000000000001'
const BATCH_SIZE = 200

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const DRY_RUN = args.includes('--dry-run')
const LIMIT = parseInt(getArg('--limit', '0'), 10) || Infinity
const XLSX_PATH = getArg('--file', DEFAULT_XLSX_PATH)

// 1-indexed column -> field key
// Regular columns on cases: microchip, destination, customer_name, customer_name_en,
//                           pet_name, pet_name_en
// Timestamp: goes to cases.created_at
// Everything else: goes into cases.data
const COLS = {
  1: 'timestamp',
  2: 'microchip',
  3: 'destination',
  4: 'customer_name',
  5: 'customer_name_en',
  6: 'address_kr',
  7: 'address_en',
  8: 'phone',
  9: 'email',
  10: 'pet_name',
  11: 'pet_name_en',
  12: 'birth_date',
  13: 'species_raw',
  14: 'breed',
  15: 'breed_en',
  16: 'sex_raw',
  17: 'sex_en',
  18: 'color',
  19: 'color_en',
  20: 'weight',
  21: 'microchip_check_date',
  22: 'rabies_1',
  23: 'rabies_2',
  24: 'rabies_3',
  25: 'rabies_titer_date',
  26: 'rabies_titer_value',
  27: 'comprehensive',
  28: 'civ',
  29: 'external_parasite_1',
  30: 'external_parasite_2',
  31: 'external_parasite_3',
  32: 'internal_parasite_1',
  33: 'internal_parasite_2',
  34: 'heartworm',
  35: 'infectious_disease',
  36: 'address_overseas',
  37: 'age',
  38: 'memo_1',
  39: 'memo_2',
  40: 'memo_3',
}

const DATE_KEYS = new Set([
  'birth_date',
  'microchip_check_date',
  'rabies_1', 'rabies_2', 'rabies_3',
  'rabies_titer_date',
  'comprehensive', 'civ',
  'external_parasite_1', 'external_parasite_2', 'external_parasite_3',
  'internal_parasite_1', 'internal_parasite_2',
  'heartworm', 'infectious_disease',
])

// ──────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ──────────────────────────────────────────────────────────────────────────────

function asString(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    // ExcelJS sometimes returns rich text or hyperlink objects
    if (v.richText) return v.richText.map(r => r.text).join('')
    if (v.text) return String(v.text)
    if (v.result !== undefined) return String(v.result)
    if (v instanceof Date) return v.toISOString()
  }
  return String(v).trim()
}

function nonEmpty(v) {
  const s = asString(v)
  return s && s.length > 0 ? s : null
}

// Parse a cell into YYYY-MM-DD (or null)
function normDate(v) {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return formatDate(v)
  }
  if (typeof v === 'number') {
    // Excel serial date (1900 epoch)
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (isNaN(d.getTime())) return null
    return formatDate(d)
  }
  const s = asString(v)
  if (!s) return null
  // Try ISO-like first
  let d = new Date(s)
  if (!isNaN(d.getTime()) && s.match(/\d{4}/)) return formatDate(d)
  // Try "2018. 7. 14" or "2018.7.14"
  const m1 = s.match(/^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/)
  if (m1) {
    d = new Date(+m1[1], +m1[2] - 1, +m1[3])
    if (!isNaN(d.getTime())) return formatDate(d)
  }
  // Try "5-13-2024" (M-D-Y, Google Forms default)
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m2) {
    d = new Date(+m2[3], +m2[1] - 1, +m2[2])
    if (!isNaN(d.getTime())) return formatDate(d)
  }
  return null
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normTimestamp(v) {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000)
    return new Date(ms).toISOString()
  }
  const s = asString(v)
  if (!s) return null
  // "5-13-2024 18:05:51" (M-D-Y H:M:S)
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m) {
    const d = new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0))
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function normSpecies(raw) {
  const s = asString(raw)
  if (!s) return null
  if (s.includes('개') || /dog/i.test(s)) return 'dog'
  if (s.includes('고양이') || /cat/i.test(s)) return 'cat'
  return null
}

function normSex(raw) {
  const s = asString(raw)
  if (!s) return null
  if (s.includes('중성화')) return s.includes('암') ? 'spayed_female' : 'neutered_male'
  if (/spayed/i.test(s)) return 'spayed_female'
  if (/neutered/i.test(s)) return 'neutered_male'
  if (s === '수컷' || /^male$/i.test(s)) return 'male'
  if (s === '암컷' || /^female$/i.test(s)) return 'female'
  return null
}

function normNumber(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(asString(v))
  return Number.isFinite(n) ? n : null
}

// ──────────────────────────────────────────────────────────────────────────────
// Row -> case record
// ──────────────────────────────────────────────────────────────────────────────

function rowToCase(row, rowNumber) {
  const raw = {}
  for (const [col, key] of Object.entries(COLS)) {
    raw[key] = row.getCell(Number(col)).value
  }

  const microchip = nonEmpty(raw.microchip)
  const customer_name = nonEmpty(raw.customer_name)

  // Skip only if the row is truly useless. A row without a microchip is still
  // valuable if a customer name is present (chip can be filled in later).
  if (!customer_name) {
    return { skip: true, reason: 'missing customer_name', rowNumber }
  }

  const created_at = normTimestamp(raw.timestamp)

  // Merge memos with blank separator, dropping empties
  const memo = [raw.memo_1, raw.memo_2, raw.memo_3]
    .map(nonEmpty)
    .filter(Boolean)
    .join('\n\n') || null

  // Build the data jsonb object
  const data = {}
  const put = (k, v) => { if (v !== null && v !== undefined && v !== '') data[k] = v }

  put('phone', nonEmpty(raw.phone))
  put('email', nonEmpty(raw.email))
  put('address_kr', nonEmpty(raw.address_kr))
  put('address_en', nonEmpty(raw.address_en))
  put('address_overseas', nonEmpty(raw.address_overseas))
  put('birth_date', normDate(raw.birth_date))
  put('age', nonEmpty(raw.age))
  put('species', normSpecies(raw.species_raw))
  put('breed', nonEmpty(raw.breed))
  put('breed_en', nonEmpty(raw.breed_en))
  put('sex', normSex(raw.sex_raw))
  put('sex_en', nonEmpty(raw.sex_en))
  put('color', nonEmpty(raw.color))
  put('color_en', nonEmpty(raw.color_en))
  put('weight', normNumber(raw.weight))

  // All date-step fields
  for (const k of DATE_KEYS) {
    if (k === 'birth_date') continue // already handled above
    put(k, normDate(raw[k]))
  }

  put('rabies_titer_value', nonEmpty(raw.rabies_titer_value))
  put('memo', memo)

  return {
    skip: false,
    record: {
      org_id: ORG_ID,
      microchip,               // may be null
      microchip_extra: [],     // filled later via UI; nothing in source sheet
      customer_name,
      customer_name_en: nonEmpty(raw.customer_name_en),
      pet_name: nonEmpty(raw.pet_name),
      pet_name_en: nonEmpty(raw.pet_name_en),
      destination: nonEmpty(raw.destination),
      status: '신규',
      data,
      ...(created_at ? { created_at } : {}),
    },
    rowNumber,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━'.repeat(60))
  console.log('PetMove xlsx import')
  console.log('━'.repeat(60))
  console.log(`File     : ${XLSX_PATH}`)
  console.log(`Sheet    : ${SHEET_NAME}`)
  console.log(`Mode     : ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE (writes to DB)'}`)
  console.log(`Limit    : ${LIMIT === Infinity ? 'none' : LIMIT}`)
  console.log(`Batch    : ${BATCH_SIZE}`)
  console.log('━'.repeat(60))

  // Load env and create client (skip if dry-run needs no DB)
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!DRY_RUN) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('ERROR: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
      process.exit(1)
    }
  }
  const supabase = DRY_RUN
    ? null
    : createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // Load workbook
  console.log('Loading workbook...')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(XLSX_PATH)
  const ws = wb.getWorksheet(SHEET_NAME)
  if (!ws) {
    console.error(`ERROR: sheet "${SHEET_NAME}" not found. Available:`, wb.worksheets.map(w => w.name))
    process.exit(1)
  }
  console.log(`Sheet loaded: ${ws.rowCount} rows × ${ws.columnCount} cols`)

  // Parse rows
  const records = []
  const skipped = []
  const seenMicrochips = new Map() // microchip -> row number (for in-file dedup)
  let processed = 0

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
    if (processed >= LIMIT) break
    processed++
    const row = ws.getRow(rowNumber)
    const result = rowToCase(row, rowNumber)
    if (result.skip) {
      skipped.push({ rowNumber, reason: result.reason })
      continue
    }
    // In-file dedup by microchip. Null microchips are never "duplicates" of
    // each other - each anonymous case gets its own row.
    if (result.record.microchip) {
      const existing = seenMicrochips.get(result.record.microchip)
      if (existing !== undefined) {
        skipped.push({ rowNumber, reason: `duplicate of row ${existing}: ${result.record.microchip}` })
        continue
      }
      seenMicrochips.set(result.record.microchip, rowNumber)
    }
    records.push(result.record)
  }

  console.log('━'.repeat(60))
  console.log(`Parsed    : ${records.length} records`)
  console.log(`Skipped   : ${skipped.length} rows`)
  console.log(`Processed : ${processed} rows`)
  console.log('━'.repeat(60))

  if (skipped.length > 0) {
    console.log('First 10 skipped rows:')
    for (const s of skipped.slice(0, 10)) {
      console.log(`  row ${s.rowNumber}: ${s.reason}`)
    }
    if (skipped.length > 10) console.log(`  ... and ${skipped.length - 10} more`)
    console.log()
  }

  if (records.length > 0) {
    console.log('Sample (first 2 parsed records):')
    for (const r of records.slice(0, 2)) {
      console.log(JSON.stringify(r, null, 2))
    }
    console.log()
  }

  if (DRY_RUN) {
    console.log('DRY-RUN complete. No data was written.')
    console.log('Re-run without --dry-run to actually insert.')
    return
  }

  // Safety: refuse to run on a non-empty cases table unless --force given.
  // Otherwise re-running this script would create duplicates for the rows
  // without microchip (null values do not collide in a unique index).
  const FORCE = args.includes('--force')
  const { count: existingCount, error: countErr } = await supabase
    .from('cases')
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    console.error(`ERROR checking cases row count: ${countErr.message}`)
    process.exit(1)
  }
  if (existingCount && existingCount > 0 && !FORCE) {
    console.error(`ERROR: cases table already contains ${existingCount} rows.`)
    console.error(`Refusing to import on top of existing data — null-microchip rows`)
    console.error(`would be duplicated on every run.`)
    console.error('')
    console.error('Options:')
    console.error('  1. Truncate and re-import:')
    console.error('       - In Supabase SQL editor:  truncate table cases;')
    console.error('       - Then:                    npm run import:run')
    console.error('  2. Force anyway (risk duplicates): add --force flag')
    process.exit(1)
  }

  // Plain insert (not upsert): simpler, since unique constraint on microchip
  // doesn't help us dedup null rows anyway. We already deduped in-memory above.
  console.log(`Inserting ${records.length} records in batches of ${BATCH_SIZE}...`)
  let inserted = 0
  let errored = 0
  const errors = []
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(records.length / BATCH_SIZE)
    const { error } = await supabase.from('cases').insert(batch)
    if (error) {
      errored += batch.length
      errors.push({ batch: batchNum, message: error.message })
      console.error(`  batch ${batchNum}/${totalBatches}: ERROR ${error.message}`)
    } else {
      inserted += batch.length
      process.stdout.write(`  batch ${batchNum}/${totalBatches} ok (+${batch.length} = ${inserted})       \r`)
    }
  }
  console.log()
  console.log('━'.repeat(60))
  console.log(`Insert complete`)
  console.log(`  OK       : ${inserted}`)
  console.log(`  Errors   : ${errored}`)
  console.log(`  Skipped  : ${skipped.length}`)
  console.log('━'.repeat(60))
  if (errors.length > 0) {
    console.log('\nFirst errors:')
    for (const e of errors.slice(0, 5)) console.log(`  batch ${e.batch}: ${e.message}`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
