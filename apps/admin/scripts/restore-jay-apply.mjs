#!/usr/bin/env node
/**
 * 이효진 / 제이 케이스 수동 복구.
 * 스크린샷 기반으로 rabies_dates 와 rabies_titer_records 만 정정.
 * 백신 batch/product 등은 자동매칭에 맡김.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const CASE_ID = '41fdcb9d-12b2-4893-a5ed-8f5c5386c2e7'

const RABIES_DATES = [
  { date: '2024-01-02' },
  { date: '2024-05-11' },
  { date: '2025-05-03' },
  { date: '2026-05-01' },
]

const RABIES_TITERS = [
  { date: '2024-05-11', value: null, lab: null },
  { date: '2026-05-01', value: null, lab: 'apqa_seoul' },
]

const dryRun = process.argv[2] !== '--apply'

async function main() {
  const { data: row, error } = await sb
    .from('cases')
    .select('id, customer_name, pet_name, data')
    .eq('id', CASE_ID)
    .single()
  if (error) throw error
  if (!row) { console.error('case not found'); process.exit(1) }

  const data = row.data ?? {}
  console.log(`Case ${row.id}  ${row.customer_name} / ${row.pet_name}`)
  console.log('\n— BEFORE —')
  console.log('  rabies_dates:', JSON.stringify(data.rabies_dates))
  console.log('  rabies_titer_records:', JSON.stringify(data.rabies_titer_records))

  const next = { ...data, rabies_dates: RABIES_DATES, rabies_titer_records: RABIES_TITERS }

  console.log('\n— AFTER (제안) —')
  console.log('  rabies_dates:', JSON.stringify(next.rabies_dates))
  console.log('  rabies_titer_records:', JSON.stringify(next.rabies_titer_records))

  if (dryRun) {
    console.log('\n(dry-run) 적용하려면: --apply')
    return
  }

  const { error: upErr } = await sb.from('cases').update({ data: next }).eq('id', CASE_ID)
  if (upErr) throw upErr
  console.log('\n✓ 복구 완료')
}

main().catch(e => { console.error(e); process.exit(1) })
