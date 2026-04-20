#!/usr/bin/env node
/**
 * Reverse-match payment import:
 * For rows where Excel "petName/customerName" didn't match,
 * try matching where Excel's first part = DB customer_name
 * and Excel's second part = DB pet_name (i.e., names are swapped).
 */
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// Load xlsx
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('C:/Users/off20/Downloads/Data.xlsx')
const ws = wb.worksheets[0]

// Load all cases
const allCases = []
let f = 0
while (true) {
  const { data } = await sb.from('cases').select('id, pet_name, customer_name, data').range(f, f + 999)
  if (!data || !data.length) break
  allCases.push(...data)
  if (data.length < 1000) break
  f += 1000
}

// Normalize payment method
function normMethod(raw) {
  if (!raw) return null
  const s = String(raw).trim().toLowerCase()
  if (s === '현금' || s === 'cash') return 'cash'
  if (s === '카드' || s === 'card') return 'card'
  if (s === '현금영수증' || s === 'cash(r)') return 'cash_receipt'
  return null
}

// Build set of already-matched case IDs (those that already have payment_amount)
// We only want to match cases that DON'T already have payment data
let reverseMatched = 0, skipped = 0

for (let r = 2; r <= ws.rowCount; r++) {
  const rawName = String(ws.getCell(r, 2).value || '').trim()
  const amount = ws.getCell(r, 3).value
  const methodRaw = ws.getCell(r, 4).value

  if (!rawName || !amount) { skipped++; continue }

  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) { skipped++; continue }

  // Only process rows with "/" (pet/customer format)
  if (!rawName.includes('/')) continue

  const partA = rawName.split('/')[0].trim()  // normally pet name
  const partB = rawName.split('/')[1].trim()  // normally customer name

  const method = normMethod(methodRaw)

  // Normal match first — skip if it would match normally
  const normalMatches = allCases.filter(c => c.pet_name === partA)
  if (normalMatches.length > 0) {
    const narrowed = normalMatches.filter(c => c.customer_name === partB)
    if (narrowed.length > 0) continue // normal match exists, skip
    // If there's a pet_name match but no customer narrowing, still skip
    // (these were handled by the original script)
    if (normalMatches.some(c => !(c.data ?? {}).payment_amount)) continue
  }

  // REVERSE match: partA = customer_name, partB = pet_name
  let reverseHits = allCases.filter(c => c.customer_name === partA && c.pet_name === partB)

  if (reverseHits.length === 0) continue

  // Pick one without payment data
  let target = reverseHits.find(c => !(c.data ?? {}).payment_amount)
  if (!target) continue // all already have payment

  if (DRY_RUN) {
    reverseMatched++
    console.log(`  반대매칭: "${partA}/${partB}" → case ${target.id} (pet=${target.pet_name}, customer=${target.customer_name}) ₩${amountNum.toLocaleString()} / ${method}`)
    continue
  }

  const newData = { ...(target.data ?? {}), payment_amount: amountNum }
  if (method) newData.payment_method = method

  const { error } = await sb.from('cases').update({ data: newData }).eq('id', target.id)
  if (!error) {
    reverseMatched++
    console.log(`  반대매칭 적용: "${partA}/${partB}" → ${target.pet_name} (${target.customer_name}) ₩${amountNum.toLocaleString()}`)
  } else {
    console.error(`  오류: ${error.message}`)
  }
}

console.log(`\n반대매칭 성공: ${reverseMatched}`)
if (DRY_RUN) console.log('DRY-RUN. --dry-run 없이 다시 실행하면 적용.')
