#!/usr/bin/env node
/**
 * Final batch: split all remaining ~90 unsplit English names.
 * Includes explicit overrides for flips, Spanish double surnames,
 * and user-specified manual corrections.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

// ─── Explicit overrides keyed by customer_name_en (trimmed, case-sensitive) ───
// Format: { last, first } — null means skip (보류)
const OVERRIDES = {
  // User manual corrections (single-word splits)
  'LENGYOUHORNG':        { last: 'LENG', first: 'YOUHORNG' },
  'CUI':                 null, // 보류
  'QUANQIMING':          { last: 'QUAN', first: 'QIMING' },
  'RIOCK':               { last: 'RI', first: 'OCK' },
  'ZHENGHUILING':        { last: 'ZHENG', first: 'HUILING' },

  // Western names: last word = surname (flip from default)
  'Emilie Mallett':       { last: 'Mallett', first: 'Emilie' },
  'Kristine Larson':      { last: 'Larson', first: 'Kristine' },
  'William Stewart':      { last: 'Stewart', first: 'William' },
  'SAMANTHA MOLDOVAN':    { last: 'MOLDOVAN', first: 'SAMANTHA' },
  'Peter Daniel Withers': { last: 'Withers', first: 'Peter Daniel' },
  'Julie Louise Greenway':{ last: 'Greenway', first: 'Julie Louise' },
  'MELODY ZHANG':         { last: 'ZHANG', first: 'MELODY' },
  'BEVIN BREH HARRIS':    { last: 'HARRIS', first: 'BEVIN BREH' },
  'EMMA LOUIS GORDON CAMPBELL': { last: 'CAMPBELL', first: 'EMMA LOUIS GORDON' },
  'Robin John Dewsbury Parson': { last: 'Parson', first: 'Robin John Dewsbury' },
  'Taishir Barkhas':      { last: 'Barkhas', first: 'Taishir' },
  'Marie Gwennaëlle Morgane Clolus': { last: 'Clolus', first: 'Marie Gwennaëlle Morgane' },
  'Jovan Hendrik de Bruyn': { last: 'de Bruyn', first: 'Jovan Hendrik' },
  'Ksenia Getman':        { last: 'Getman', first: 'Ksenia' },
  'Whitecage Perry Levine': { last: 'Levine', first: 'Whitecage Perry' },
  'Tayla Janelle Koopman': { last: 'Koopman', first: 'Tayla Janelle' },
  'Elena Ermolina':       { last: 'Ermolina', first: 'Elena' },
  'DAVID THOMAS BARKER':  { last: 'BARKER', first: 'DAVID THOMAS' },
  'JONATHAN MEJIA':       { last: 'MEJIA', first: 'JONATHAN' },
  'PICHANA PIRAVEJ':      { last: 'PIRAVEJ', first: 'PICHANA' },
  'Milena Beliaikina':    { last: 'Beliaikina', first: 'Milena' },
  'Paloma Navarro':       { last: 'Navarro', first: 'Paloma' },
  'Elisabeth COSTA':      { last: 'COSTA', first: 'Elisabeth' },
  'Lijun Zhang':          { last: 'Zhang', first: 'Lijun' },
  'Yong Newkirk':         { last: 'Newkirk', first: 'Yong' },
  'Elizabeth Aaron Butt':  { last: 'Butt', first: 'Elizabeth Aaron' },
  'Ossipov Maxim':        { last: 'Ossipov', first: 'Maxim' },
  'Miyake Atsuko':        { last: 'Miyake', first: 'Atsuko' },

  // Spanish double surnames
  'RESTREPO ALONSO SILVANA':    { last: 'RESTREPO ALONSO', first: 'SILVANA' },
  'SALAME CANO MARIA JESUS':    { last: 'SALAME CANO', first: 'MARIA JESUS' },
  'Nora yazmin rodriguez luna':  { last: 'rodriguez luna', first: 'Nora yazmin' },
  'Camila Lopez Ardila':         { last: 'Lopez Ardila', first: 'Camila' },
  'Saira Carlota Siclla Avendano': { last: 'Siclla Avendano', first: 'Saira Carlota' },

  // French (surname first)
  'Brunet Marie Anne Cassandre': { last: 'Brunet', first: 'Marie Anne Cassandre' },
  'Leroy Romane Rolande Yvette': { last: 'Leroy', first: 'Romane Rolande Yvette' },

  // Thai
  'Uanob Miss Nopparada':  { last: 'Uanob', first: 'Nopparada' },

  // Other specific
  'Scott Hogie Donald':     { last: 'Scott', first: 'Hogie Donald' },
  'Leszek Anthony Chee Keong': { last: 'Leszek', first: 'Anthony Chee Keong' },
  'Mardin Najat Abdalrahman':  { last: 'Mardin', first: 'Najat Abdalrahman' },
  'SOLIEV SALOKHIDDIN AYYUBKHON UGLI': { last: 'SOLIEV', first: 'SALOKHIDDIN AYYUBKHON UGLI' },
  'ALGAZLAN ABDULLAH ALI A': { last: 'ALGAZLAN', first: 'ABDULLAH ALI A' },
  'Luis Alejandro Felix Calzado': { last: 'Felix Calzado', first: 'Luis Alejandro' },
  'Bac Jessy Laurent':      { last: 'Bac', first: 'Jessy Laurent' },
  'Porter Jed Grant':       { last: 'Porter', first: 'Jed Grant' },

  // Already reviewed previously (from batches 1-60)
  'MOTOYOSHI  SHINOBU':    { last: 'MOTOYOSHI', first: 'SHINOBU' },
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

const unsplit = all.filter(r => {
  const en = (r.customer_name_en ?? '').trim()
  if (!en) return false
  const d = r.data ?? {}
  return !d.customer_last_name_en && !d.customer_first_name_en
})

console.log(`미분리: ${unsplit.length}건`)

let applied = 0, skipped = 0, err = 0

for (const row of unsplit) {
  const en = (row.customer_name_en ?? '').trim()

  // Check explicit override
  const override = OVERRIDES[en]
  if (override === null) {
    skipped++
    console.log(`  SKIP: "${en}" (보류)`)
    continue
  }

  let last, first

  if (override) {
    last = override.last
    first = override.first
  } else {
    // Default: first word = surname (works for Chinese, Russian, Asian, most remaining)
    const parts = en.split(/\s+/).filter(Boolean)
    if (parts.length < 2) {
      skipped++
      console.log(`  SKIP: "${en}" (1단어, 오버라이드 없음)`)
      continue
    }
    last = parts[0]
    first = parts.slice(1).join(' ')
  }

  const newData = { ...(row.data ?? {}), customer_last_name_en: last, customer_first_name_en: first }
  const { error } = await supabase.from('cases').update({ data: newData }).eq('id', row.id)
  if (error) {
    err++
    console.error(`  ERROR ${row.id}: ${error.message}`)
  } else {
    applied++
  }
}

console.log(`\n완료: 적용 ${applied} / 보류 ${skipped} / 실패 ${err}`)
