#!/usr/bin/env node
/**
 * 읽기 전용 스캔 — '귀국 항공편 날짜(return_date)는 있는데 출국편이 없는' 잔재 케이스 탐지.
 * 이 상태면 portal 여정에서 '일본 수출 동물검역 신청'이 잘못 '예정'으로 뜬다(잔재 누수 버그).
 *
 *   node scripts/scan-stale-return-date.mjs
 *
 * 쓰기 없음. env: apps/admin/.env.local 또는 apps/portal/.env.local (Seoul 전용).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
function loadEnv(fp) {
  if (!existsSync(fp)) return {}
  const out = {}
  for (const line of readFileSync(fp, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
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
if (!url || !key) { console.error('env 누락'); process.exit(1) }
if (!url.includes('ugywxiyivfzflqkcnqvu')) { console.error(`Seoul 아님: ${url}`); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const SCOPED = new Set(['vet_visit_date', 'departure_date', 'return_date', 'entry_date', 'departure_flight_date'])
function parseDests(s) { return (s ?? '').split(',').map((t) => t.trim()).filter(Boolean) }

// flattenCaseForDestination 재현 (단일/다중 분기)
function flatten(c, token) {
  const data = c.data ?? {}
  const byDest = data.by_dest
  const destObj = byDest?.[token]
  const isMulti = parseDests(c.destination).length > 1
  if (!isMulti && !destObj) return { departure_date: c.departure_date, data: { ...data } }
  const nextData = { ...data }
  delete nextData.by_dest
  let nextDep = c.departure_date
  if (isMulti) {
    const obj = destObj ?? {}
    for (const k of SCOPED) {
      if (k === 'departure_date') continue
      const has = Object.prototype.hasOwnProperty.call(obj, k)
      const v = has ? obj[k] : undefined
      if (!has || v === null || v === undefined) delete nextData[k]
      else nextData[k] = v
    }
    nextDep = typeof obj.departure_date === 'string' && obj.departure_date ? obj.departure_date : null
  } else {
    for (const k of Object.keys(destObj)) {
      if (!SCOPED.has(k)) continue
      const v = destObj[k]
      if (k === 'departure_date') nextDep = typeof v === 'string' && v ? v : null
      else if (v === null || v === undefined) delete nextData[k]
      else nextData[k] = v
    }
  }
  return { departure_date: nextDep, data: nextData }
}

const cases = []
const PAGE = 1000
for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb
    .from('cases')
    .select('id, pet_name, customer_name, destination, departure_date, data')
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) { console.error(error.message); process.exit(1) }
  cases.push(...data)
  if (data.length < PAGE) break
}

let hits = 0
for (const c of cases) {
  const tripTypes = (c.data ?? {}).trip_type ?? {}
  for (const token of parseDests(c.destination)) {
    const flat = flatten(c, token)
    const ret = typeof flat.data.return_date === 'string' && flat.data.return_date.length >= 10 ? flat.data.return_date : ''
    if (!ret) continue
    const hasOutbound =
      (typeof flat.data.entry_date === 'string' && flat.data.entry_date.length >= 10) ||
      (typeof flat.departure_date === 'string' && flat.departure_date.length >= 10)
    if (hasOutbound) continue // 정상(출국+귀국 모두 있음)
    // 귀국일만 있고 출국편 없음 = 잔재
    hits += 1
    const tt = tripTypes[token] ?? '(단일)'
    console.log(`■ ${c.pet_name ?? '?'} / ${c.customer_name ?? '-'}  [${c.id}]`)
    console.log(`   목적지 "${token}" (${tt})  return_date=${ret}  출국편=없음  ← 잔재`)
  }
}
console.log(`\n전체 ${cases.length}건 스캔. 잔재(return_date만 있고 출국편 없음) ${hits}건.`)
console.log('읽기 전용 — 변경 없음.')
