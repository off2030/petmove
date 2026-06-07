#!/usr/bin/env node
/**
 * case.data.rabies_dates 에 date 없는 phantom 슬롯이 있는 케이스 점검 / 정리.
 *
 * 분류:
 *   - 앞/중간 빈칸: 유효 접종 앞이나 사이에 빈 슬롯 (밀꾸 타입). 타임라인이 뒤 회차를
 *     앞 회차로 오독하는 원인 — 심각.
 *   - 끝 빈칸만: 배열 끝에 date 없는 잔여물. admin 모달 빈 카드 원인.
 *
 * 정리(--apply)는 portal 통일 저장과 동일 로직: filter(hasValidDate) + 날짜순 정렬.
 * 빈 슬롯을 제거하고 뒤 회차를 당겨 "index 0 = 가장 이른 = 1차" 불변식으로 압축한다.
 *
 * Usage:
 *   cd apps/admin && node scripts/check-rabies-phantom.mjs           # 점검 (read-only)
 *   cd apps/admin && node scripts/check-rabies-phantom.mjs --apply   # 압축 정리 반영
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const hasValidDate = (r) =>
  r && typeof r === 'object' && typeof r.date === 'string' && r.date.length >= 10

// portal/admin 의 normalizeRabiesOrder 와 동일 — all-dated 일 때만 날짜순 안정 정렬.
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

console.log('Project:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log(`Mode: ${APPLY ? 'APPLY (압축 정리 반영)' : '점검 (read-only)'}`)
console.log('─'.repeat(60))

const { count, error: cErr } = await supabase
  .from('cases')
  .select('id', { count: 'exact', head: true })
if (cErr) {
  console.error('DB count error:', cErr.message)
  process.exit(1)
}

let data = []
const pageSize = 1000
for (let from = 0; from < (count ?? 0); from += pageSize) {
  const to = Math.min(from + pageSize - 1, count - 1)
  const { data: page, error } = await supabase
    .from('cases')
    .select('id, customer_name, pet_name, data')
    .range(from, to)
  if (error) {
    console.error('DB error:', error.message)
    process.exit(1)
  }
  data = data.concat(page)
}

let scanned = 0
const leading = [] // 앞/중간 빈칸 (밀꾸 타입)
const trailing = [] // 끝 빈칸만

for (const row of data) {
  const arr = row.data?.rabies_dates
  if (!Array.isArray(arr) || arr.length === 0) continue
  scanned++
  const recs = arr.map((it) => (typeof it === 'string' ? { date: it } : it))
  const validFlags = recs.map(hasValidDate)
  const validCount = validFlags.filter(Boolean).length
  if (validCount === recs.length) continue // phantom 없음

  const firstValidIdx = validFlags.indexOf(true)
  const lastValidIdx = validFlags.lastIndexOf(true)
  const hasGapBeforeOrBetween =
    firstValidIdx > 0 ||
    (firstValidIdx >= 0 && validFlags.slice(firstValidIdx, lastValidIdx + 1).some((v) => !v))

  const display = recs.map((r) => (hasValidDate(r) ? r.date : '(빈)')).join(', ')
  const compacted = normalizeRabiesOrder(recs.filter(hasValidDate))
  const after = compacted.map((r) => r.date).join(', ') || '(없음)'
  const entry = { row, display, after, compacted }
  if (hasGapBeforeOrBetween) leading.push(entry)
  else trailing.push(entry)
}

const processList = async (title, list) => {
  console.log(`\n[${title}] ${list.length}건`)
  for (const c of list) {
    console.log(`● ${c.row.customer_name ?? '?'} / ${c.row.pet_name ?? '?'} (${c.row.id.slice(0, 8)})`)
    console.log(`  현재  : [${c.display}]`)
    console.log(`  압축후: [${c.after}]`)
    if (APPLY) {
      const nextData = { ...c.row.data }
      if (c.compacted.length === 0) delete nextData.rabies_dates
      else nextData.rabies_dates = c.compacted
      const { error } = await supabase.from('cases').update({ data: nextData }).eq('id', c.row.id)
      if (error) console.log(`  ✗ 실패: ${error.message}`)
      else console.log('  ✓ 압축 완료')
    }
  }
}

await processList('앞/중간 빈칸 — 타임라인 오독 유발 (밀꾸 타입)', leading)
await processList('끝 빈칸만 — admin 빈 카드', trailing)

console.log('\n' + '─'.repeat(60))
console.log(`rabies_dates 보유: ${scanned}건`)
console.log(
  `phantom 있음: ${leading.length + trailing.length}건 (앞/중간 ${leading.length} · 끝 ${trailing.length})`,
)
if (!APPLY && leading.length + trailing.length > 0) {
  console.log('→ 정리하려면 --apply 로 다시 실행하세요.')
}
