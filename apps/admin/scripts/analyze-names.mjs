#!/usr/bin/env node
/**
 * Analyze customer_name_en patterns to plan auto-split into last/first.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('cases')
    .select('id, customer_name, customer_name_en')
    .range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}

// Categorize patterns
const patterns = {
  empty: [],           // null or empty
  commaFormat: [],     // "KIM, NAMHEE" or "Kwon, Ji Hyun"
  spaceOnly: [],       // "Seulah Jeong" (no comma)
  allCapsSpace: [],    // "CHOI EUNJIN"
  other: [],           // anything weird
}

for (const row of all) {
  const en = (row.customer_name_en ?? '').trim()
  if (!en) {
    patterns.empty.push(row)
    continue
  }
  if (en.includes(',')) {
    patterns.commaFormat.push({ ...row, en })
  } else if (/^[A-Z\s]+$/.test(en) && en.includes(' ')) {
    patterns.allCapsSpace.push({ ...row, en })
  } else if (en.includes(' ')) {
    patterns.spaceOnly.push({ ...row, en })
  } else {
    patterns.other.push({ ...row, en })
  }
}

console.log('━'.repeat(60))
console.log('영문 이름 패턴 분석')
console.log('━'.repeat(60))
console.log(`총 건수          : ${all.length}`)
console.log(`비어있음         : ${patterns.empty.length}`)
console.log(`쉼표 형식        : ${patterns.commaFormat.length}  (예: "KIM, NAMHEE")`)
console.log(`전체 대문자+공백  : ${patterns.allCapsSpace.length}  (예: "CHOI EUNJIN")`)
console.log(`일반 공백 형식    : ${patterns.spaceOnly.length}  (예: "Seulah Jeong")`)
console.log(`기타             : ${patterns.other.length}`)
console.log()

// Show samples of each
function showSamples(label, arr, n = 5) {
  if (arr.length === 0) return
  console.log(`─── ${label} (${arr.length}건, 샘플 ${Math.min(n, arr.length)}개) ───`)
  for (const r of arr.slice(0, n)) {
    console.log(`  "${r.en}"  ←  ${r.customer_name}`)
  }
  console.log()
}

showSamples('쉼표 형식', patterns.commaFormat, 8)
showSamples('전체 대문자+공백', patterns.allCapsSpace, 8)
showSamples('일반 공백 형식', patterns.spaceOnly, 8)
showSamples('기타 (분리 어려움)', patterns.other, 10)

// Test auto-split logic
console.log('━'.repeat(60))
console.log('자동 분리 시뮬레이션')
console.log('━'.repeat(60))

function splitName(en) {
  const trimmed = en.trim()
  // Pattern 1: "LAST, FIRST" or "Last, First Middle"
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',')
    return { last: last.trim(), first: rest.join(',').trim(), method: 'comma' }
  }
  // Pattern 2: "FIRST LAST" (2 words, Western order) or Korean-English "LAST FIRST"
  const parts = trimmed.split(/\s+/)
  if (parts.length === 2) {
    // Heuristic: if ALL CAPS, assume Korean order (LAST FIRST)
    if (/^[A-Z]+$/.test(parts[0]) && /^[A-Z]+$/.test(parts[1])) {
      return { last: parts[0], first: parts[1], method: 'allcaps-2word', uncertain: true }
    }
    // Mixed case: assume Western order (First Last)
    return { last: parts[1], first: parts[0], method: 'space-2word', uncertain: true }
  }
  if (parts.length >= 3) {
    // 3+ words: hard to tell. Assume last word is last name? Or first?
    return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' '), method: 'space-multi', uncertain: true }
  }
  return { last: trimmed, first: '', method: 'single-word', uncertain: true }
}

let confident = 0
let uncertain = 0
const uncertainList = []

for (const cat of [patterns.commaFormat, patterns.allCapsSpace, patterns.spaceOnly, patterns.other]) {
  for (const r of cat) {
    const result = splitName(r.en)
    if (result.uncertain) {
      uncertain++
      uncertainList.push({ name: r.customer_name, en: r.en, ...result })
    } else {
      confident++
    }
  }
}

const total = confident + uncertain
console.log(`확실한 분리 (쉼표 형식) : ${confident}건`)
console.log(`불확실한 분리            : ${uncertain}건`)
console.log(`비어있음 (분리 불필요)    : ${patterns.empty.length}건`)
console.log()

if (uncertainList.length > 0) {
  console.log(`─── 불확실한 분리 목록 (전체 ${uncertainList.length}건) ───`)
  for (const u of uncertainList.slice(0, 30)) {
    console.log(`  "${u.en}" → 성: "${u.last}" / 이름: "${u.first}"  [${u.method}]  ← ${u.name}`)
  }
  if (uncertainList.length > 30) {
    console.log(`  ... 외 ${uncertainList.length - 30}건`)
  }
}
