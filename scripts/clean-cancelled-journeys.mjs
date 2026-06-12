#!/usr/bin/env node
/**
 * 취소 비석 정리 — past_journeys 에서 outcome:'cancelled' 항목을 제거한다.
 * 취소=삭제 통일(2026-06) 이후, 그 전에 쌓인 '취소 비석'을 청소하는 일회성 스크립트.
 *
 * - **복구 아님**: destination·trip_type·by_dest 는 건드리지 않는다(여정을 되살리지 않음).
 *   오직 data.past_journeys 에서 cancelled 항목만 빼고, done(완료) 비석은 유지.
 * - 전수 스캔(1000행 상한 우회 위해 페이지네이션).
 *
 *   node scripts/clean-cancelled-journeys.mjs           # dry-run (읽기만)
 *   node scripts/clean-cancelled-journeys.mjs --apply   # 실제 정리
 *
 * env: apps/admin/.env.local 또는 apps/portal/.env.local — Seoul 전용.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {}
  const out = {}
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

const env = {
  ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')),
  ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')),
  ...process.env,
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY env 누락')
  process.exit(1)
}
if (!url.includes('ugywxiyivfzflqkcnqvu')) {
  console.error(`Seoul 프로젝트가 아님: ${url} — 중단`)
  process.exit(1)
}

const apply = process.argv.includes('--apply')
// 특정 케이스만 제한하고 싶을 때: --only=<caseId>[,<caseId>...]
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null

console.log(`Mode: ${apply ? 'APPLY (실제 정리)' : 'DRY-RUN (변경 없음)'}`)
if (onlyIds) console.log(`대상 제한: ${onlyIds.join(', ')}`)
console.log('')

const supabase = createClient(url, key, { auth: { persistSession: false } })

// 전수 페이지네이션
const PAGE = 1000
let from = 0
let all = []
for (;;) {
  const { data, error } = await supabase
    .from('cases')
    .select('id, pet_name, customer_name, destination, data')
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  all = all.concat(data)
  if (data.length < PAGE) break
  from += PAGE
}
console.log(`전수 ${all.length}건 스캔.\n`)

let changed = 0
let removedTotal = 0
for (const c of all) {
  if (onlyIds && !onlyIds.includes(c.id)) continue
  const data = c.data ?? {}
  const past = Array.isArray(data.past_journeys) ? data.past_journeys : []
  const cancelled = past.filter((p) => p?.outcome === 'cancelled')
  if (cancelled.length === 0) continue

  const nextPast = past.filter((p) => p?.outcome !== 'cancelled')
  const nextData = { ...data, past_journeys: nextPast }
  changed += 1
  removedTotal += cancelled.length

  console.log(`■ ${c.pet_name ?? '(이름없음)'} / 보호자 ${c.customer_name ?? '-'}  [case ${c.id}]`)
  console.log(`   취소 비석 제거 ${cancelled.length}건: ${cancelled.map((p) => `${p.destination}(${p.departureDate ?? '미정'})`).join(', ')}`)
  console.log(`   past_journeys: ${past.length}건 → ${nextPast.length}건 (완료 ${nextPast.length}건 유지)`)
  console.log(`   destination("${c.destination ?? ''}")·trip_type·by_dest 는 변경 안 함`)

  if (apply) {
    const { error: updErr } = await supabase
      .from('cases')
      .update({ data: nextData })
      .eq('id', c.id)
    console.log(updErr ? `   ✗ ${updErr.message}` : '   ✓ 적용됨')
  }
  console.log('')
}

console.log(`대상 ${changed}건, 제거할 취소 비석 ${removedTotal}건.`)
console.log(apply ? '완료.' : '미리보기입니다 — 실제 정리하려면 --apply 를 붙이세요.')
