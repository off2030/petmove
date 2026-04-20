#!/usr/bin/env node
/**
 * Backfill payment dates from Data.xlsx col1 into existing payments array.
 * Matches by same logic as original import (pet_name + customer hint).
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

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('C:/Users/off20/Downloads/Data.xlsx')
const ws = wb.worksheets[0]

const allCases = []
let f = 0
while (true) {
  const { data } = await sb.from('cases').select('id, pet_name, customer_name, data').range(f, f + 999)
  if (!data || !data.length) break
  allCases.push(...data)
  if (data.length < 1000) break
  f += 1000
}

// Build a map: caseId → Excel date(s) from matching rows
// We need to re-run the same matching logic to find which Excel row → which case

function normMethod(raw) {
  if (!raw) return null
  const s = String(raw).trim().toLowerCase()
  if (s === '현금' || s === 'cash') return 'cash'
  if (s === '카드' || s === 'card') return 'card'
  if (s === '현금영수증' || s === 'cash(r)') return 'cash_receipt'
  return null
}

function parseExcelDate(val) {
  if (!val) return null
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  const dateMatch = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (dateMatch) return `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`
  return null
}

// For each case with payments, find the matching Excel row and grab the date
// Strategy: match by amount + case identity (pet_name or customer_name)

// Build case lookup
const caseById = new Map(allCases.map(c => [c.id, c]))

// Collect: caseId → [{amount, date}] from Excel
const casePaymentDates = new Map() // caseId → Map<amount, date>

for (let r = 2; r <= ws.rowCount; r++) {
  const dateVal = parseExcelDate(ws.getCell(r, 1).value)
  const rawName = String(ws.getCell(r, 2).value || '').trim()
  const amount = Number(ws.getCell(r, 3).value)

  if (!rawName || !amount || !Number.isFinite(amount) || amount <= 0) continue
  if (!dateVal) continue

  const petName = rawName.includes('/') ? rawName.split('/')[0].trim() : rawName
  const customerHint = rawName.includes('/') ? rawName.split('/')[1].trim() : null

  // Find matching case (same logic as original import)
  let matches = allCases.filter(c => c.pet_name === petName)
  if (customerHint && matches.length > 1) {
    const n = matches.filter(c => c.customer_name === customerHint)
    if (n.length > 0) matches = n
  }

  // Also try fuzzy customer match (same as customer-match-v2)
  if (matches.length === 0 && customerHint) {
    // Reverse match
    matches = allCases.filter(c => c.customer_name === petName && c.pet_name === customerHint)
  }
  if (matches.length === 0 && customerHint) {
    // Customer-only fuzzy
    const custCases = allCases.filter(c => c.customer_name === customerHint)
    if (custCases.length > 0) {
      // Try to find by amount match in payments
      for (const c of custCases) {
        const payments = (c.data ?? {}).payments
        if (Array.isArray(payments) && payments.some(p => p.amount === amount)) {
          matches = [c]
          break
        }
      }
    }
  }

  if (matches.length === 0) continue

  // Find the case that has this amount in payments
  for (const c of matches) {
    const payments = ((c.data ?? {}).payments) ?? []
    if (!Array.isArray(payments)) continue
    const hasAmount = payments.some(p => p.amount === amount && !p.date)
    if (hasAmount) {
      if (!casePaymentDates.has(c.id)) casePaymentDates.set(c.id, [])
      casePaymentDates.get(c.id).push({ amount, date: dateVal })
      break
    }
  }
}

// Apply dates
let updated = 0
for (const [caseId, datePairs] of casePaymentDates) {
  const c = caseById.get(caseId)
  if (!c) continue
  const payments = [...((c.data ?? {}).payments ?? [])]
  let changed = false

  for (const { amount, date } of datePairs) {
    // Find first payment with this amount and no date
    const idx = payments.findIndex(p => p.amount === amount && !p.date)
    if (idx >= 0) {
      payments[idx] = { ...payments[idx], date }
      changed = true
    }
  }

  if (!changed) continue

  if (DRY_RUN) {
    updated++
    if (updated <= 10) {
      console.log(`  ${c.pet_name} (${c.customer_name}):`, payments.map(p => `₩${p.amount.toLocaleString()} ${p.date||'no-date'}`).join(', '))
    }
  } else {
    const newData = { ...(c.data ?? {}), payments }
    const { error } = await sb.from('cases').update({ data: newData }).eq('id', caseId)
    if (!error) updated++
    else console.error(`  오류: ${c.pet_name} - ${error.message}`)
  }
}

console.log(`\n날짜 업데이트: ${updated}건`)
if (DRY_RUN) console.log('DRY-RUN. --dry-run 없이 다시 실행하면 적용.')
