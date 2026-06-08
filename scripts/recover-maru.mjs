#!/usr/bin/env node
/**
 * 일회성 복구 — 완료 확인 prompt 결함으로 '취소(cancelled)' 처리되며 여정이 제거된 동물 되살리기.
 *
 * markJourneyComplete 결함: 완료/취소 시 destination 토큰을 즉시 제거 + past_journeys 에 요약 push.
 * 'cancelled' 항목은 사용자 의도가 아니므로 → destination·trip_type 복원 + past_journeys 에서 제거.
 * (단일 목적지 케이스는 by_dest 를 안 쓰므로 출국일·검역일 등 top-level 데이터는 살아있다.)
 *
 *   node scripts/recover-maru.mjs           # dry-run (읽기만)
 *   node scripts/recover-maru.mjs --apply   # 실제 복원
 *
 * env: apps/admin/.env.local 또는 apps/portal/.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
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

const apply = process.argv.includes('--apply')
console.log(`Mode: ${apply ? 'APPLY (실제 복원)' : 'DRY-RUN (변경 없음)'}\n`)

const supabase = createClient(url, key, { auth: { persistSession: false } })

const PET = '마루'
const { data: cases, error } = await supabase
  .from('cases')
  .select('id, pet_name, destination, data, updated_at')
  .eq('pet_name', PET)
  .is('deleted_at', null)
if (error) {
  console.error(error.message)
  process.exit(1)
}
console.log(`'${PET}' 케이스 ${cases.length}건\n`)

for (const c of cases) {
  const data = c.data ?? {}
  const past = Array.isArray(data.past_journeys) ? data.past_journeys : []
  const cancelled = past.filter((p) => p?.outcome === 'cancelled')
  console.log(`case ${c.id}  (updated ${c.updated_at})`)
  console.log(`  destination(현재): "${c.destination ?? ''}"`)
  console.log(`  past_journeys: ${JSON.stringify(past)}`)

  if (cancelled.length === 0) {
    console.log('  → 복구할 취소 항목 없음\n')
    continue
  }

  const tokens = (c.destination ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const tripType = { ...(data.trip_type ?? {}) }
  for (const item of cancelled) {
    if (item.destination && !tokens.includes(item.destination)) tokens.push(item.destination)
    if (item.destination) tripType[item.destination] = item.tripType ?? 'round'
  }
  const nextDest = tokens.join(', ')
  const nextPast = past.filter((p) => p?.outcome !== 'cancelled')
  const nextData = { ...data, trip_type: tripType, past_journeys: nextPast }

  console.log(`  → 복원 destination: "${nextDest}"`)
  console.log(`  → past_journeys 에서 cancelled ${cancelled.length}건 제거`)
  if (apply) {
    const { error: updErr } = await supabase
      .from('cases')
      .update({ destination: nextDest, data: nextData })
      .eq('id', c.id)
    console.log(updErr ? `  ✗ ${updErr.message}` : '  ✓ 적용됨')
  }
  console.log('')
}
console.log(apply ? '완료.' : '--apply 로 실제 복원하세요.')
