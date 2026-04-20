#!/usr/bin/env node
/**
 * Customer-name-only payment matching v2.
 * Excludes known wrong matches, handles corrections.
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

function normMethod(raw) {
  if (!raw) return null
  const s = String(raw).trim().toLowerCase()
  if (s === '현금' || s === 'cash') return 'cash'
  if (s === '카드' || s === 'card') return 'card'
  if (s === '현금영수증' || s === 'cash(r)') return 'cash_receipt'
  return null
}

// SKIP these rows (wrong customer in Excel, or already handled, or duplicates to handle later)
const SKIP_ROWS = new Set([
  1466, // 티미/이지연 → actually Hyun Joo Stoll (duplicate, handle separately)
  1502, // 티나/이지연 → already matched to Hyun Joo Stoll
  1537, // 티미/이지연 → already matched to Hyun Joo Stoll
])

// Manual corrections: Excel row → { caseId, note }
const MANUAL_OVERRIDES = new Map()

// 몽이/김재환 → 김몽 (but already has ₩100k, skip for now - duplicate)
SKIP_ROWS.add(1776)

// 사모/윤빛나 → 캐리
const carry = allCases.find(c => c.customer_name === '윤빛나' && c.pet_name === '캐리')
if (carry) MANUAL_OVERRIDES.set(1981, carry.id)

// 누리/임윤경 → 그루
const gru = allCases.find(c => c.customer_name === '임윤경' && c.pet_name === '그루')
if (gru) MANUAL_OVERRIDES.set(2139, gru.id)

// 베트남/임한경 → 테리
const terry = allCases.find(c => c.customer_name === '임한경' && c.pet_name === '테리')
if (terry) MANUAL_OVERRIDES.set(1546, terry.id)

// 멕시코/박하향 → 금성
const gold = allCases.find(c => c.customer_name === '박하향' && c.pet_name === '금성')
if (gold) MANUAL_OVERRIDES.set(1887, gold.id)

// 이자/이상훈 → Yza
const yza = allCases.find(c => c.customer_name === '이상훈' && c.pet_name === 'Yza')
if (yza) MANUAL_OVERRIDES.set(1920, yza.id)

// 혜피/신혜리 → 해피
const happy = allCases.find(c => c.customer_name === '신혜리' && c.pet_name === '해피')
if (happy) MANUAL_OVERRIDES.set(1663, happy.id)

// 고냗/차하림 → 고냑
const gonyak = allCases.find(c => c.customer_name === '차하림' && c.pet_name === '고냑')
if (gonyak) MANUAL_OVERRIDES.set(1415, gonyak.id)

// 벗지/인주성 → 벚지
const beotji = allCases.find(c => c.customer_name === '인주성' && c.pet_name === '벚지')
if (beotji) MANUAL_OVERRIDES.set(1759, beotji.id)

// 다케오/권내현 → 타케오
const takeo = allCases.find(c => c.customer_name === '권내현' && c.pet_name === '타케오')
if (takeo) MANUAL_OVERRIDES.set(1553, takeo.id)

function fuzzyPetScore(excelName, dbName) {
  if (!excelName || !dbName) return 0
  const a = excelName.trim(), b = dbName.trim()
  if (a === b) return 100
  const aBase = a.endsWith('이') && a.length > 1 ? a.slice(0, -1) : a
  const bBase = b.endsWith('이') && b.length > 1 ? b.slice(0, -1) : b
  if (aBase === bBase || aBase === b || a === bBase) return 90
  if (b.length > a.length && b.endsWith(a)) return 85
  if (a.length > b.length && a.endsWith(b)) return 85
  if (b.length > aBase.length && b.endsWith(aBase)) return 80
  if (aBase.length > b.length && aBase.endsWith(b)) return 80
  const typoMap = { '매리':'메리','메리':'매리','샘':'쌤','쌤':'샘','블랙펄':'블랙 펠','블랙 펠':'블랙펄','바게라':'바기라','바기라':'바게라','콩주':'공주','공주':'콩주','떡꾹이':'떡국이','떡국이':'떡꾹이','화이트':'파이티','파이티':'화이트','섀도우':'쉐도우','쉐도우':'섀도우' }
  if (typoMap[a] === b || typoMap[b] === a) return 85
  if (a.replace(/\s/g,'') === b.replace(/\s/g,'')) return 90
  if (a.includes(',')) { const parts = a.split(',').map(p=>p.trim()); if (parts.includes(b)) return 75 }
  return 0
}

let matched = 0, skipped = 0

for (let r = 2; r <= ws.rowCount; r++) {
  if (SKIP_ROWS.has(r)) continue

  const rawName = String(ws.getCell(r, 2).value || '').trim()
  const amount = ws.getCell(r, 3).value
  if (!rawName || !amount) continue
  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) continue

  const petName = rawName.includes('/') ? rawName.split('/')[0].trim() : rawName
  const customerHint = rawName.includes('/') ? rawName.split('/')[1].trim() : null
  if (!customerHint) continue

  const method = normMethod(ws.getCell(r, 4).value)

  // Normal pet_name match?
  const normalMatch = allCases.filter(c => c.pet_name === petName)
  if (normalMatch.length > 0) {
    const exact = normalMatch.filter(c => c.customer_name === customerHint)
    if (exact.length > 0) continue
    const unpaid = normalMatch.filter(c => !(c.data ?? {}).payment_amount)
    if (unpaid.length > 0) continue
  }

  // Reverse match?
  const rev = allCases.filter(c => c.customer_name === petName && c.pet_name === customerHint)
  if (rev.length > 0) continue

  // Manual override?
  if (MANUAL_OVERRIDES.has(r)) {
    const caseId = MANUAL_OVERRIDES.get(r)
    const target = allCases.find(c => c.id === caseId)
    if (target && !(target.data ?? {}).payment_amount) {
      if (DRY_RUN) {
        console.log(`  ✓ row${r}: ${rawName} → ${target.pet_name} (${target.customer_name}) ₩${amountNum.toLocaleString()} [manual]`)
      } else {
        const newData = { ...(target.data ?? {}), payment_amount: amountNum }
        if (method) newData.payment_method = method
        const { error } = await sb.from('cases').update({ data: newData }).eq('id', target.id)
        if (!error) console.log(`  적용: ${rawName} → ${target.pet_name} (${target.customer_name}) ₩${amountNum.toLocaleString()}`)
      }
      matched++
      continue
    }
  }

  // Customer-only match
  const custCases = allCases.filter(c => c.customer_name === customerHint)
  if (custCases.length === 0) continue
  const unpaidCust = custCases.filter(c => !(c.data ?? {}).payment_amount)

  // Multi-pet
  const isMultiPet = petName.includes(',')
  if (isMultiPet) {
    const petParts = petName.split(',').map(p => p.trim())
    const matchedPairs = []
    const remaining = [...unpaidCust]
    for (const pp of petParts) {
      let bestIdx = -1, bestScore = 0
      for (let i = 0; i < remaining.length; i++) {
        const sc = fuzzyPetScore(pp, remaining[i].pet_name)
        if (sc > bestScore) { bestScore = sc; bestIdx = i }
      }
      if (bestIdx >= 0 && bestScore >= 70) {
        matchedPairs.push({ case: remaining[bestIdx], excelPet: pp, score: bestScore })
        remaining.splice(bestIdx, 1)
      }
    }
    if (matchedPairs.length === petParts.length) {
      const splitAmount = Math.round(amountNum / petParts.length)
      for (const mp of matchedPairs) {
        if (DRY_RUN) {
          console.log(`  ✓ row${r}: ${mp.excelPet} (from "${rawName}") → ${mp.case.pet_name} (${customerHint}) ₩${splitAmount.toLocaleString()} [score:${mp.score}]`)
        } else {
          const newData = { ...(mp.case.data ?? {}), payment_amount: splitAmount }
          if (method) newData.payment_method = method
          await sb.from('cases').update({ data: newData }).eq('id', mp.case.id)
          console.log(`  적용: ${mp.excelPet} → ${mp.case.pet_name} (${customerHint}) ₩${splitAmount.toLocaleString()}`)
        }
        matched++
      }
      continue
    }
  }

  // Fuzzy match
  let bestCase = null, bestScore = 0
  for (const c of unpaidCust) {
    const sc = fuzzyPetScore(petName, c.pet_name)
    if (sc > bestScore) { bestScore = sc; bestCase = c }
  }

  // Only auto-match score>=70, or single unpaid case
  if (!bestCase && unpaidCust.length === 1) {
    // Single unpaid — skip if names are totally different (score 0)
    // unless it's the only option
    bestCase = unpaidCust[0]
    bestScore = 50
  }

  if (!bestCase || bestScore < 50) {
    skipped++
    if (DRY_RUN) console.log(`  ✗ row${r}: ${rawName} → 매칭 불가`)
    continue
  }

  if (DRY_RUN) {
    console.log(`  ✓ row${r}: ${petName} → ${bestCase.pet_name} (${customerHint}) ₩${amountNum.toLocaleString()} ${method||''} [score:${bestScore}]`)
  } else {
    const newData = { ...(bestCase.data ?? {}), payment_amount: amountNum }
    if (method) newData.payment_method = method
    const { error } = await sb.from('cases').update({ data: newData }).eq('id', bestCase.id)
    if (!error) console.log(`  적용: ${petName} → ${bestCase.pet_name} (${customerHint}) ₩${amountNum.toLocaleString()}`)
  }
  matched++
}

console.log(`\n매칭: ${matched}건 | 불가: ${skipped}건`)
if (DRY_RUN) console.log('DRY-RUN. --dry-run 없이 다시 실행하면 적용.')
