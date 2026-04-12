#!/usr/bin/env node
/**
 * Split customer_name_en into customer_last_name_en + customer_first_name_en
 * in cases.data jsonb.
 *
 * Strategy:
 *   1. Comma format ("KIM, NAMHEE") → split on comma. Confident.
 *   2. Space format → match against Korean surname romanization list.
 *      If first word is a surname → LAST FIRST order.
 *      If last word is a surname → FIRST LAST order.
 *   3. No match / single word / no space → uncertain, needs manual review.
 *
 * Usage:
 *   node scripts/split-names.mjs --dry-run   # preview only
 *   node scripts/split-names.mjs             # actually update DB
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')

// ──────────────────────────────────────────────────────────────────────
// Korean surname romanization lookup (~130 common surnames, all variants)
// ──────────────────────────────────────────────────────────────────────
const KOREAN_SURNAMES = new Set([
  // Top surnames with all known romanization variants
  'KIM', 'LEE', 'YI', 'RHEE', 'LI',
  'PARK', 'PAK', 'BALK',
  'CHOI', 'CHOE', 'CHOY',
  'JUNG', 'JEONG', 'CHUNG', 'CHEONG',
  'KANG', 'GANG',
  'CHO', 'JO',
  'YUN', 'YOON', 'YOUN',
  'JANG', 'CHANG',
  'LIM', 'IM', 'YIM', 'LEEM',
  'HAN',
  'OH', 'O',
  'SEO', 'SUH', 'SUH',
  'SHIN', 'SIN', 'SHINN',
  'KWON', 'GWON',
  'HWANG',
  'AHN', 'AN',
  'SONG', 'SUNG',
  'YU', 'YOO', 'YOU', 'RYU', 'RYOO',
  'HONG',
  'MOON', 'MUN',
  'YANG',
  'SON',
  'BAE', 'BAI', 'PAE',
  'BAEK', 'BACK', 'PAEK',
  'HEO', 'HUR', 'HUH', 'HO',
  'NAM',
  'SIM', 'SHIM',
  'NO', 'NOH', 'ROH',
  'HA',
  'JEON', 'CHON', 'JUN',
  'KWAK', 'GWAK',
  'SEONG', 'SUNG',
  'CHA',
  'GU', 'KOO', 'KU', 'GOO',
  'MIN',
  'JIN',
  'NA', 'RA',
  'WOO', 'WU', 'OO',
  'YEON', 'YOUN',
  'WANG',
  'GO', 'KO', 'GOH', 'KOH',
  'JI', 'CHI',
  'PYO',
  'DO', 'DOH',
  'BYUN', 'BYEON', 'PYUN',
  'EOM', 'UM', 'OHM',
  'TAE',
  'MA',
  'CHU', 'JOO', 'JU',
  'BOK',
  'BAN', 'PAN',
  'SA',
  'DONG',
  'PIL',
  'GIL',
  'WEE', 'WI',
  'YEOM', 'YUM',
  'SEOL', 'SUL',
  'BANG', 'PANG',
  'MOK',
  'KONG', 'GONG',
  'JE', 'JEH',
  'MYUNG', 'MYEONG',
  'SOHN',
  'CHEON', 'CHUN',
  'TANG',
  'JANG',
  'YOOK', 'YUK',
  'MAENG',
  'IN',
  'JANG',
  'RHA',
  'NISHIMURA', // common Japanese surname — won't match Korean
])

function isSurname(word) {
  return KOREAN_SURNAMES.has(word.toUpperCase())
}

// ──────────────────────────────────────────────────────────────────────
// Split logic
// ──────────────────────────────────────────────────────────────────────

function splitName(en) {
  const trimmed = en.trim()
  if (!trimmed) return null

  // 1. Comma format: "KIM, NAMHEE" or "Kwon, Ji Hyun"
  if (trimmed.includes(',')) {
    const commaIdx = trimmed.indexOf(',')
    const last = trimmed.slice(0, commaIdx).trim()
    const first = trimmed.slice(commaIdx + 1).trim()
    if (last && first) {
      return { last, first, method: 'comma', confident: true }
    }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)

  // Single word — can't split
  if (parts.length < 2) {
    return { last: trimmed, first: '', method: 'single', confident: false }
  }

  // 2-word name
  if (parts.length === 2) {
    const firstIsSurname = isSurname(parts[0])
    const lastIsSurname = isSurname(parts[1])

    if (firstIsSurname && !lastIsSurname) {
      // Korean order: LAST FIRST (e.g., "KIM NAMHEE")
      return { last: parts[0], first: parts[1], method: 'surname-first', confident: true }
    }
    if (!firstIsSurname && lastIsSurname) {
      // Western order: FIRST LAST (e.g., "Seulah Jeong")
      return { last: parts[1], first: parts[0], method: 'surname-last', confident: true }
    }
    if (firstIsSurname && lastIsSurname) {
      // Both match — ambiguous. Assume Korean order (more common in this dataset).
      return { last: parts[0], first: parts[1], method: 'both-surname', confident: false }
    }
    // Neither matches — unknown order
    return { last: parts[0], first: parts[1], method: 'no-surname-match', confident: false }
  }

  // 3+ word name
  const firstIsSurname = isSurname(parts[0])
  const lastIsSurname = isSurname(parts[parts.length - 1])

  if (firstIsSurname && !lastIsSurname) {
    // "KIM HA YOUNG" → last=KIM, first=HA YOUNG
    return { last: parts[0], first: parts.slice(1).join(' '), method: 'surname-first-multi', confident: true }
  }
  if (!firstIsSurname && lastIsSurname) {
    // "Yon Joo Kim" → last=Kim, first=Yon Joo
    return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' '), method: 'surname-last-multi', confident: true }
  }
  // Ambiguous or no match
  return {
    last: parts[0],
    first: parts.slice(1).join(' '),
    method: 'multi-uncertain',
    confident: false,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// Fetch all cases
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('cases')
    .select('id, customer_name, customer_name_en, data')
    .range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}

console.log('━'.repeat(60))
console.log(`Split customer_name_en → last / first`)
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`)
console.log(`Total cases: ${all.length}`)
console.log('━'.repeat(60))

const results = { confident: [], uncertain: [], empty: [], skipped: [] }

for (const row of all) {
  const en = (row.customer_name_en ?? '').trim()
  if (!en) {
    results.empty.push(row)
    continue
  }
  // Skip if already split
  const d = row.data ?? {}
  if (d.customer_last_name_en || d.customer_first_name_en) {
    results.skipped.push(row)
    continue
  }

  const split = splitName(en)
  if (!split) { results.empty.push(row); continue }

  const entry = {
    id: row.id,
    customer_name: row.customer_name,
    en,
    last: split.last,
    first: split.first,
    method: split.method,
    confident: split.confident,
    data: row.data,
  }

  if (split.confident) {
    results.confident.push(entry)
  } else {
    results.uncertain.push(entry)
  }
}

console.log(`\n확실한 분리 : ${results.confident.length}건`)
console.log(`불확실       : ${results.uncertain.length}건`)
console.log(`비어있음     : ${results.empty.length}건`)
console.log(`이미 분리됨  : ${results.skipped.length}건`)

// Show uncertain list
if (results.uncertain.length > 0) {
  console.log(`\n━━━ 불확실한 분리 (수동 확인 필요) ━━━`)
  for (const u of results.uncertain) {
    console.log(`  ${u.customer_name.padEnd(8)} "${u.en}" → 성: "${u.last}" / 이름: "${u.first}"  [${u.method}]`)
  }
}

// Show sample confident
console.log(`\n━━━ 확실한 분리 샘플 (처음 10건) ━━━`)
for (const c of results.confident.slice(0, 10)) {
  console.log(`  ${c.customer_name.padEnd(8)} "${c.en}" → 성: "${c.last}" / 이름: "${c.first}"  [${c.method}]`)
}

if (DRY_RUN) {
  console.log(`\nDRY-RUN 완료. --dry-run 없이 다시 실행하면 DB에 반영됩니다.`)
  console.log(`확실한 ${results.confident.length}건만 자동 반영됩니다. 불확실 ${results.uncertain.length}건은 건너뜁니다.`)
  process.exit(0)
}

// Apply confident splits only
console.log(`\n${results.confident.length}건 자동 분리 적용 중...`)
let ok = 0
let err = 0
for (const c of results.confident) {
  const newData = {
    ...((c.data ?? {})),
    customer_last_name_en: c.last,
    customer_first_name_en: c.first,
  }
  const { error } = await supabase
    .from('cases')
    .update({ data: newData })
    .eq('id', c.id)
  if (error) {
    err++
    if (err <= 3) console.error(`  ERROR ${c.id}: ${error.message}`)
  } else {
    ok++
  }
}

console.log(`\n완료: 성공 ${ok} / 실패 ${err} / 불확실(건너뜀) ${results.uncertain.length}`)
console.log(`불확실 ${results.uncertain.length}건은 웹앱에서 직접 수정하거나 추후 스크립트로 처리하세요.`)
