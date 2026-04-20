#!/usr/bin/env node
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

// Match by pet_name
let matched = 0, skipped = 0, notFound = 0, alreadyHas = 0

for (let r = 2; r <= ws.rowCount; r++) {
  const rawName = String(ws.getCell(r, 2).value || '').trim()
  const amount = ws.getCell(r, 3).value
  const methodRaw = ws.getCell(r, 4).value

  if (!rawName || !amount) { skipped++; continue }

  // Extract pet name (before /) and optional customer name (after /)
  const petName = rawName.includes('/') ? rawName.split('/')[0].trim() : rawName
  const customerHint = rawName.includes('/') ? rawName.split('/')[1].trim() : null

  const method = normMethod(methodRaw)
  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) { skipped++; continue }

  // Find matching case(s) by pet_name, optionally narrow by customer name
  let matches = allCases.filter(c => c.pet_name === petName)
  if (customerHint && matches.length > 1) {
    const narrowed = matches.filter(c => c.customer_name === customerHint)
    if (narrowed.length > 0) matches = narrowed
  }

  if (matches.length === 0) {
    notFound++
    continue
  }

  // If multiple matches, pick the one WITHOUT payment data already
  let target = matches.find(c => !(c.data ?? {}).payment_amount)
  if (!target) {
    // All already have payment, pick the first
    target = matches[0]
    alreadyHas++
    continue // skip if already has payment
  }

  if (DRY_RUN) {
    matched++
    if (matched <= 10) console.log(`  ${petName} → ₩${amountNum.toLocaleString()} / ${method}`)
    continue
  }

  const newData = { ...(target.data ?? {}), payment_amount: amountNum }
  if (method) newData.payment_method = method

  const { error } = await sb.from('cases').update({ data: newData }).eq('id', target.id)
  if (!error) matched++
}

console.log(`총 행: ${ws.rowCount - 1}`)
console.log(`매칭 성공: ${matched}`)
console.log(`이미 결제정보 있음: ${alreadyHas}`)
console.log(`케이스 못 찾음: ${notFound}`)
console.log(`건너뜀 (빈 값): ${skipped}`)
if (DRY_RUN) console.log('\nDRY-RUN. --dry-run 없이 다시 실행하면 적용.')
