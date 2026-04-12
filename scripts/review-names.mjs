#!/usr/bin/env node
/**
 * Output all uncertain name splits for manual review.
 * Includes improved prefix-matching for concatenated names (e.g., "LEEJUNGKYU").
 * Outputs JSON for easy processing.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const KOREAN_SURNAMES = new Set([
  'KIM','LEE','YI','RHEE','LI','PARK','PAK','CHOI','CHOE','CHOY',
  'JUNG','JEONG','CHUNG','CHEONG','KANG','GANG','CHO','JO',
  'YUN','YOON','YOUN','JANG','CHANG','LIM','IM','YIM','LEEM',
  'HAN','OH','O','SEO','SUH','SHIN','SIN','SHINN','KWON','GWON',
  'HWANG','AHN','AN','SONG','SUNG','YU','YOO','YOU','RYU','RYOO',
  'HONG','MOON','MUN','YANG','SON','BAE','BAI','PAE',
  'BAEK','BACK','PAEK','HEO','HUR','HUH','HO','NAM',
  'SIM','SHIM','NO','NOH','ROH','HA','JEON','CHON','JUN',
  'KWAK','GWAK','SEONG','CHA','GU','KOO','KU','GOO',
  'MIN','JIN','NA','RA','WOO','WU','OO','YEON',
  'WANG','GO','KO','GOH','KOH','JI','CHI','PYO',
  'DO','DOH','BYUN','BYEON','PYUN','EOM','UM','OHM',
  'TAE','MA','CHU','JOO','JU','BOK','BAN','PAN','SA',
  'DONG','PIL','GIL','WEE','WI','YEOM','YUM',
  'SEOL','SUL','BANG','PANG','MOK','KONG','GONG',
  'JE','JEH','MYUNG','MYEONG','SOHN',
  'CHEON','CHUN','TANG','YOOK','YUK','MAENG','IN','RHA',
])

// Sort longest first for prefix matching
const SURNAMES_BY_LENGTH = [...KOREAN_SURNAMES].sort((a, b) => b.length - a.length)

function isSurname(word) {
  return KOREAN_SURNAMES.has(word.toUpperCase())
}

function trySplitConcatenated(en) {
  const upper = en.toUpperCase()
  for (const surname of SURNAMES_BY_LENGTH) {
    if (upper.startsWith(surname) && upper.length > surname.length + 1) {
      // Preserve original casing
      const last = en.slice(0, surname.length)
      const first = en.slice(surname.length)
      return { last, first }
    }
  }
  return null
}

function smartSplit(en, koreanName) {
  const trimmed = en.trim()
  if (!trimmed) return null

  // Comma → confident (already handled in main script)
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',')
    return { last: last.trim(), first: rest.join(',').trim(), type: 'comma' }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)

  // Single word → try prefix matching
  if (parts.length === 1) {
    const prefix = trySplitConcatenated(trimmed)
    if (prefix) {
      return { last: prefix.last, first: prefix.first, type: 'prefix' }
    }
    return { last: trimmed, first: '', type: 'single' }
  }

  // Multi-word → try surname matching
  const firstIs = isSurname(parts[0])
  const lastIs = isSurname(parts[parts.length - 1])

  if (parts.length === 2) {
    if (firstIs && !lastIs) return { last: parts[0], first: parts[1], type: 'first-surname' }
    if (!firstIs && lastIs) return { last: parts[1], first: parts[0], type: 'last-surname' }
    if (firstIs && lastIs) return { last: parts[0], first: parts[1], type: 'both-surname' }
    return { last: parts[0], first: parts[1], type: 'no-match' }
  }

  // 3+ words
  if (firstIs && !lastIs) return { last: parts[0], first: parts.slice(1).join(' '), type: 'first-surname-multi' }
  if (!firstIs && lastIs) return { last: parts[parts.length-1], first: parts.slice(0,-1).join(' '), type: 'last-surname-multi' }
  return { last: parts[0], first: parts.slice(1).join(' '), type: 'multi-unclear' }
}

// ─── Main ───
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const all = []
let from = 0
while (true) {
  const { data, error } = await supabase.from('cases').select('id, customer_name, customer_name_en, data').range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}

// Filter to ones that DON'T have split names yet
const needsSplit = all.filter(r => {
  const en = (r.customer_name_en ?? '').trim()
  if (!en) return false
  const d = r.data ?? {}
  return !d.customer_last_name_en && !d.customer_first_name_en
})

console.log(`총 미분리: ${needsSplit.length}건`)
console.log()

const items = needsSplit.map((r, i) => {
  const en = r.customer_name_en.trim()
  const split = smartSplit(en, r.customer_name)
  return {
    idx: i + 1,
    id: r.id,
    ko: r.customer_name,
    en,
    last: split?.last ?? '',
    first: split?.first ?? '',
    type: split?.type ?? 'unknown',
  }
})

// Output in batches of 20
const BATCH = 20
for (let i = 0; i < items.length; i += BATCH) {
  const batch = items.slice(i, i + BATCH)
  console.log(`━━━ ${i+1}~${i+batch.length} / ${items.length} ━━━`)
  for (const item of batch) {
    const arrow = item.first ? `→ 성: ${item.last.padEnd(12)} 이름: ${item.first}` : `→ (분리불가)`
    console.log(`${String(item.idx).padStart(3)}. ${item.ko.padEnd(10)} "${item.en.padEnd(20)}" ${arrow}  [${item.type}]`)
  }
  console.log()
}
