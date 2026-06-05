#!/usr/bin/env node
/**
 * 일회성 백필 — case.data.rabies_dates 가 "all-dated 인데 시간순이 아닌" 경우 오름차순 정렬.
 *
 * 배경: admin 카드 편집기·AI 추출이 비순차 배열을 만들면 index 0=1차 불변식이 깨져
 * "광견병 2차가 1차보다 빠릅니다" 오경고가 뜬다. normalizeRabiesOrder 와 동일 규칙:
 *   - 모든 항목이 유효 date(>=10자)일 때만 정렬 (빈/phantom date 있으면 skip — portal sparse 보호)
 *   - 안정 정렬(동일 날짜는 입력순 보존)
 * 재정렬만 하므로 portal(고정 슬롯)·PDF(내부 sortedAsc) 에 무영향.
 *
 * Usage:
 *   node scripts/backfill-rabies-order.mjs           # dry-run (변경 미반영)
 *   node scripts/backfill-rabies-order.mjs --apply    # 실제 반영
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

function normalizeRabiesOrder(records) {
  const allDated = records.every(
    (r) => r && typeof r === 'object' && typeof r.date === 'string' && r.date.length >= 10,
  )
  if (!allDated) return records
  return records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.i - b.i)
    .map((x) => x.r)
}

const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

console.log(`Mode: ${APPLY ? 'APPLY (변경 반영)' : 'DRY-RUN (미반영)'}`)
console.log('─'.repeat(60))

const { data, error } = await supabase
  .from('cases')
  .select('id, customer_name, pet_name, data')

if (error) {
  console.error('DB error:', error.message)
  process.exit(1)
}

let scanned = 0
let fixed = 0

for (const row of data) {
  const arr = row.data?.rabies_dates
  if (!Array.isArray(arr) || arr.length < 2) continue
  // 문자열 배열(legacy)도 객체로 정규화해 비교
  const recs = arr.map((it) => (typeof it === 'string' ? { date: it } : it))
  scanned++
  const sorted = normalizeRabiesOrder(recs)
  if (sameOrder(recs, sorted)) continue // no-op (이미 정렬됐거나 blank 포함이라 skip)

  fixed++
  const before = recs.map((r) => r.date).join(', ')
  const after = sorted.map((r) => r.date).join(', ')
  console.log(`\n● ${row.customer_name ?? '?'} / ${row.pet_name ?? '?'} (id=${row.id.slice(0, 8)})`)
  console.log(`  before: ${before}`)
  console.log(`  after : ${after}`)

  if (APPLY) {
    const nextData = { ...row.data, rabies_dates: sorted }
    const { error: upErr } = await supabase
      .from('cases')
      .update({ data: nextData })
      .eq('id', row.id)
    if (upErr) console.error(`  ✗ update failed: ${upErr.message}`)
    else console.log('  ✓ updated')
  }
}

console.log('\n' + '─'.repeat(60))
console.log(`rabies_dates(2+) 보유 케이스: ${scanned}건`)
console.log(`${APPLY ? '교정' : '교정 대상'}: ${fixed}건`)
if (!APPLY && fixed > 0) console.log('→ 반영하려면 --apply 로 다시 실행하세요.')
