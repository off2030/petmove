#!/usr/bin/env node
/**
 * Customer-name-only payment matching.
 * For Excel rows where pet_name didn't match directly,
 * match by customer_name + fuzzy pet name matching.
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

/**
 * Fuzzy pet name matching score. Higher = better match.
 * Returns 0 if no reasonable match.
 */
function fuzzyPetScore(excelName, dbName) {
  if (!excelName || !dbName) return 0
  const a = excelName.trim()
  const b = dbName.trim()
  if (a === b) return 100

  // Strip 이 suffix: 랑이 → 랑, 꿍이 → 꿍
  const aBase = a.endsWith('이') && a.length > 1 ? a.slice(0, -1) : a
  const bBase = b.endsWith('이') && b.length > 1 ? b.slice(0, -1) : b
  if (aBase === bBase) return 90
  if (aBase === b || a === bBase) return 90

  // Surname prefix: 홍삼 → 김홍삼 (DB has surname prepended)
  if (b.length > a.length && b.endsWith(a)) return 85
  if (a.length > b.length && a.endsWith(b)) return 85
  // Also check with 이 stripped
  if (b.length > aBase.length && b.endsWith(aBase)) return 80
  if (aBase.length > b.length && aBase.endsWith(b)) return 80

  // Known similar char pairs (Korean typo patterns)
  const typoMap = {
    '냗': '냑', '냑': '냗',
    '혜': '해', '해': '혜',
    '벗': '벚', '벚': '벗',
    '호주': '호두', '호두': '호주',
    '섀도우': '쉐도우', '쉐도우': '섀도우',
    '순자': '춘자', '춘자': '순자',
    '매리': '메리', '메리': '매리',
    '떡꾹이': '떡국이', '떡국이': '떡꾹이',
    '빽꼼이': '빽꼼', '빽꼼': '빽꼼이',
    '파이티': '화이트', '화이트': '파이티',
    '블랙펄': '블랙 펠', '블랙 펠': '블랙펄',
    '바게라': '바기라', '바기라': '바게라',
    '콩주': '공주', '공주': '콩주',
    '샘': '쌤', '쌤': '샘',
  }
  if (typoMap[a] === b || typoMap[b] === a) return 85

  // Check if one contains the other (partial)
  if (a.length >= 2 && b.includes(a)) return 70
  if (b.length >= 2 && a.includes(b)) return 70

  // Space-insensitive
  if (a.replace(/\s/g, '') === b.replace(/\s/g, '')) return 90

  // Comma-separated multi-pet: "마리, 벨라" matches if all pets found
  if (a.includes(',')) {
    const parts = a.split(',').map(p => p.trim())
    if (parts.includes(b)) return 75
  }

  return 0
}

let matched = 0, skipped = 0, ambiguous = 0

for (let r = 2; r <= ws.rowCount; r++) {
  const rawName = String(ws.getCell(r, 2).value || '').trim()
  const amount = ws.getCell(r, 3).value
  if (!rawName || !amount) continue
  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) continue

  const petName = rawName.includes('/') ? rawName.split('/')[0].trim() : rawName
  const customerHint = rawName.includes('/') ? rawName.split('/')[1].trim() : null
  if (!customerHint) continue

  const method = normMethod(ws.getCell(r, 4).value)

  // Skip if normal pet_name match exists
  const normalMatch = allCases.filter(c => c.pet_name === petName)
  if (normalMatch.length > 0) {
    const exact = normalMatch.filter(c => c.customer_name === customerHint)
    if (exact.length > 0) continue
    const unpaid = normalMatch.filter(c => !(c.data ?? {}).payment_amount)
    if (unpaid.length > 0) continue
  }

  // Skip if reverse match exists
  const rev = allCases.filter(c => c.customer_name === petName && c.pet_name === customerHint)
  if (rev.length > 0) continue

  // Customer-only: find all cases for this customer
  const custCases = allCases.filter(c => c.customer_name === customerHint)
  if (custCases.length === 0) continue

  const unpaidCust = custCases.filter(c => !(c.data ?? {}).payment_amount)

  // Multi-pet Excel entry (e.g., "마리, 벨라/오윤에스")
  const isMultiPet = petName.includes(',')
  if (isMultiPet) {
    const petParts = petName.split(',').map(p => p.trim())
    // Match each part to an unpaid case
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
      // Split amount equally
      const splitAmount = Math.round(amountNum / petParts.length)
      for (const mp of matchedPairs) {
        if (DRY_RUN) {
          console.log(`  ✓ row${r}: ${mp.excelPet} (from "${rawName}") → ${mp.case.pet_name} (${customerHint}) ₩${splitAmount.toLocaleString()} [score:${mp.score}]`)
        } else {
          const newData = { ...(mp.case.data ?? {}), payment_amount: splitAmount }
          if (method) newData.payment_method = method
          const { error } = await sb.from('cases').update({ data: newData }).eq('id', mp.case.id)
          if (!error) console.log(`  적용: ${mp.excelPet} → ${mp.case.pet_name} (${customerHint}) ₩${splitAmount.toLocaleString()}`)
        }
        matched++
      }
      continue
    }
  }

  // Single pet: fuzzy match
  let bestCase = null, bestScore = 0
  for (const c of unpaidCust) {
    const sc = fuzzyPetScore(petName, c.pet_name)
    if (sc > bestScore) { bestScore = sc; bestCase = c }
  }

  // If only 1 unpaid case for customer, match it even with low score
  if (!bestCase && unpaidCust.length === 1) {
    bestCase = unpaidCust[0]
    bestScore = 50
  }

  if (!bestCase) {
    skipped++
    if (DRY_RUN) console.log(`  ✗ row${r}: ${rawName} → 매칭 불가 (미결제 ${unpaidCust.length}건)`)
    continue
  }

  if (DRY_RUN) {
    console.log(`  ✓ row${r}: ${petName} → ${bestCase.pet_name} (${customerHint}) ₩${amountNum.toLocaleString()} ${method||''} [score:${bestScore}]`)
  } else {
    const newData = { ...(bestCase.data ?? {}), payment_amount: amountNum }
    if (method) newData.payment_method = method
    const { error } = await sb.from('cases').update({ data: newData }).eq('id', bestCase.id)
    if (!error) {
      console.log(`  적용: ${petName} → ${bestCase.pet_name} (${customerHint}) ₩${amountNum.toLocaleString()}`)
    } else {
      console.log(`  오류: ${bestCase.pet_name} - ${error.message}`)
    }
  }
  matched++
}

console.log(`\n매칭: ${matched}건 | 불가: ${skipped}건`)
if (DRY_RUN) console.log('DRY-RUN. --dry-run 없이 다시 실행하면 적용.')
