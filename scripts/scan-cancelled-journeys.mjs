#!/usr/bin/env node
/**
 * 읽기 전용 스캔 — past_journeys 에 outcome:'cancelled'('취소 비석')이 남아 있는 케이스를 모두 나열.
 * 취소=삭제 통일 후, 기존에 쌓인 취소 비석을 정리하기 전에 무엇이 있는지 확인하는 용도.
 *
 *   node scripts/scan-cancelled-journeys.mjs
 *
 * 쓰기 없음. env: apps/admin/.env.local 또는 apps/portal/.env.local
 * (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — Seoul 전용.
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
// Seoul 가드 — Mumbai 사용 금지.
if (!url.includes('ugywxiyivfzflqkcnqvu')) {
  console.error(`Seoul 프로젝트가 아님: ${url} — 중단`)
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { data: cases, error } = await supabase
  .from('cases')
  .select('id, pet_name, customer_name, destination, data, updated_at')
  .is('deleted_at', null)
if (error) {
  console.error(error.message)
  process.exit(1)
}

let hit = 0
let cancelledTotal = 0
for (const c of cases) {
  const data = c.data ?? {}
  const past = Array.isArray(data.past_journeys) ? data.past_journeys : []
  const cancelled = past.filter((p) => p?.outcome === 'cancelled')
  if (cancelled.length === 0) continue
  hit += 1
  cancelledTotal += cancelled.length
  const done = past.filter((p) => p?.outcome === 'done')
  console.log(`■ ${c.pet_name ?? '(이름없음)'} / 보호자 ${c.customer_name ?? '-'}  [case ${c.id}]`)
  console.log(`   현재 진행 destination: "${c.destination ?? ''}"   (updated ${c.updated_at})`)
  console.log(`   취소 비석 ${cancelled.length}건:`)
  for (const p of cancelled) {
    console.log(`     ✕ ${p.destination ?? '?'}  출국 ${p.departureDate ?? '미정'}  (completed ${p.completedDate ?? '-'})`)
  }
  if (done.length > 0) {
    console.log(`   (완료 비석 ${done.length}건 — 유지: ${done.map((p) => p.destination).join(', ')})`)
  }
  console.log('')
}

console.log(`전체 ${cases.length}건 중 취소 비석 보유 케이스 ${hit}건, 취소 비석 총 ${cancelledTotal}건.`)
console.log('이 스크립트는 읽기만 합니다 — 아무것도 변경하지 않았습니다.')
