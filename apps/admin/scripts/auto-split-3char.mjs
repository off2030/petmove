#!/usr/bin/env node
/**
 * Auto-split remaining unsplit English names using the rule:
 *   "한글 이름이 3자 → 첫 글자가 반드시 성"
 *
 * Strategy:
 *   1. Space-separated: try each word against Korean surname list
 *   2. Concatenated: try prefix AND suffix matching against surname list
 *   3. Also apply manual corrections passed as overrides
 *
 * Usage:
 *   node scripts/auto-split-3char.mjs --dry-run
 *   node scripts/auto-split-3char.mjs
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')

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
  'JE','JEH','MYUNG','MYEONG','SOHN','OK','PAENG','BONG',
  'CHEON','CHUN','TANG','YOOK','YUK','MAENG','IN','RHA',
  'EO','WON','PENG','ON',
])

const SURNAMES_BY_LENGTH = [...KOREAN_SURNAMES].sort((a, b) => b.length - a.length)

function isSurname(word) {
  return KOREAN_SURNAMES.has(word.toUpperCase())
}

function trySplit(en, koreanName) {
  const trimmed = en.trim()
  if (!trimmed) return null

  // Only process 3-char Korean names (guaranteed: first char = surname)
  const is3char = koreanName && koreanName.trim().length === 3

  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',')
    return { last: last.trim(), first: rest.join(',').trim(), method: 'comma' }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  const upper = trimmed.toUpperCase()

  // Space-separated
  if (parts.length >= 2) {
    // Try first word as surname
    if (isSurname(parts[0])) {
      return { last: parts[0], first: parts.slice(1).join(' '), method: 'word-first' }
    }
    // Try last word as surname
    if (isSurname(parts[parts.length - 1])) {
      return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' '), method: 'word-last' }
    }
    // Try any middle word (rare but possible)
    for (let i = 1; i < parts.length - 1; i++) {
      if (isSurname(parts[i])) {
        const last = parts[i]
        const first = [...parts.slice(0, i), ...parts.slice(i + 1)].join(' ')
        return { last, first, method: 'word-mid' }
      }
    }
    // 3-char Korean name but no surname match in words → still uncertain
    if (is3char) {
      // Assume Korean order: first word = last name (even if not in surname list)
      return { last: parts[0], first: parts.slice(1).join(' '), method: '3char-assume-first' }
    }
    return null
  }

  // Single word (concatenated)
  if (parts.length === 1 && trimmed.length > 2) {
    // Prefix match (longest surname first)
    for (const surname of SURNAMES_BY_LENGTH) {
      if (upper.startsWith(surname) && upper.length > surname.length + 1) {
        return {
          last: trimmed.slice(0, surname.length),
          first: trimmed.slice(surname.length),
          method: 'prefix',
        }
      }
    }
    // Suffix match (for reversed concatenations like "DAHYUNHAN", "EUNBILee")
    for (const surname of SURNAMES_BY_LENGTH) {
      if (upper.endsWith(surname) && upper.length > surname.length + 1) {
        return {
          last: trimmed.slice(trimmed.length - surname.length),
          first: trimmed.slice(0, trimmed.length - surname.length),
          method: 'suffix',
        }
      }
    }
  }

  return null
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

// Filter to unsplit only
const unsplit = all.filter(r => {
  const en = (r.customer_name_en ?? '').trim()
  if (!en) return false
  const d = r.data ?? {}
  return !d.customer_last_name_en && !d.customer_first_name_en
})

console.log(`미분리 ${unsplit.length}건 중 3자 한글이름 자동 분리 시도`)
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`)
console.log()

const splits = []
const remaining = []

for (const row of unsplit) {
  const ko = (row.customer_name ?? '').trim()
  const en = (row.customer_name_en ?? '').trim()
  const result = trySplit(en, ko)

  if (result && result.first) {
    splits.push({ id: row.id, ko, en, last: result.last, first: result.first, method: result.method, data: row.data })
  } else {
    remaining.push({ ko, en })
  }
}

console.log(`자동 분리 가능: ${splits.length}건`)
console.log(`남은 미분리:     ${remaining.length}건`)
console.log()

// Show samples
console.log('━━━ 분리 적용할 것 (처음 20) ━━━')
for (const s of splits.slice(0, 20)) {
  console.log(`  ${s.ko.padEnd(10)} "${s.en.padEnd(22)}" → ${s.last.padEnd(12)} / ${s.first}  [${s.method}]`)
}
if (splits.length > 20) console.log(`  ... 외 ${splits.length - 20}건`)

console.log()
console.log('━━━ 남은 미분리 (전체) ━━━')
for (const r of remaining) {
  console.log(`  ${r.ko.padEnd(10)} "${r.en}"`)
}

if (DRY_RUN) {
  console.log(`\nDRY-RUN 완료. --dry-run 없이 다시 실행하면 ${splits.length}건 적용.`)
  process.exit(0)
}

// Apply
console.log(`\n${splits.length}건 적용 중...`)
let ok = 0, err = 0
for (const s of splits) {
  const newData = { ...(s.data ?? {}), customer_last_name_en: s.last, customer_first_name_en: s.first }
  const { error } = await supabase.from('cases').update({ data: newData }).eq('id', s.id)
  if (error) { err++; if (err <= 3) console.error(`  ERROR: ${error.message}`) }
  else ok++
}

console.log(`완료: 성공 ${ok} / 실패 ${err} / 남은 미분리 ${remaining.length}`)
