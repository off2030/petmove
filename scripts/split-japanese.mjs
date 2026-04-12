#!/usr/bin/env node
/**
 * Split Japanese names: detect surname by matching against known Japanese
 * surname list. Handles both Japanese order (SURNAME GIVEN) and Western
 * order (Given Surname) by checking which word is the surname.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const JP_SURNAMES = new Set([
  'HOSHINO','TSUJI','YAMABE','TOMANO','YAMAMOTO','SHIMADA','KOGA',
  'TSURUMI','KANNO','UEDA','TANI','OYAZATO','KAKUDA','KURABE',
  'KITAMURA','NAGAO','MURANAKA','AKIYAMA','ISHII','WATANABE',
  'MARUYAMA','KONDO','KOYAMA','TAKAHASHI','SAWAI','HIRAYU','MUKAI',
  'NISHIMURA','SUZUKI','TANAKA','SATO','NAKAMURA','KOBAYASHI',
  'MATSUDA','OSO',
])

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

const unsplit = all.filter(r => {
  const en = (r.customer_name_en ?? '').trim()
  if (!en) return false
  const d = r.data ?? {}
  return !d.customer_last_name_en && !d.customer_first_name_en
})

// Find Japanese names by checking if any word matches JP_SURNAMES
const jpCases = []
for (const r of unsplit) {
  const en = (r.customer_name_en ?? '').trim()
  const parts = en.split(/\s+/).filter(Boolean)
  if (parts.length < 2) continue

  let surnameIdx = -1
  for (let i = 0; i < parts.length; i++) {
    if (JP_SURNAMES.has(parts[i].toUpperCase())) {
      surnameIdx = i
      break
    }
  }
  if (surnameIdx < 0) continue

  const last = parts[surnameIdx]
  const first = parts.filter((_, i) => i !== surnameIdx).join(' ')
  jpCases.push({ id: r.id, ko: r.customer_name, en, last, first, data: r.data })
}

console.log(`일본인 이름 ${jpCases.length}건 분리:`)
for (const j of jpCases) {
  console.log(`  ${j.ko.padEnd(12)} "${j.en}" → 성: ${j.last} / 이름: ${j.first}`)
}

console.log(`\n적용 중...`)
let ok = 0, err = 0
for (const j of jpCases) {
  const newData = { ...(j.data ?? {}), customer_last_name_en: j.last, customer_first_name_en: j.first }
  const { error } = await supabase.from('cases').update({ data: newData }).eq('id', j.id)
  if (error) { err++ } else { ok++ }
}
console.log(`완료: 성공 ${ok} / 실패 ${err}`)
