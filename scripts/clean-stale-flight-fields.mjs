#!/usr/bin/env node
/**
 * 잔재 항공편 데이터 정리 — '귀국 항공편 날짜(return_date)는 있는데 출국편이 없는' 케이스의
 * 항공편 필드(출국·귀국 일체)를 비운다. 과거 여정 teardown 에서 안 지워진 잔재가 다음 여정으로
 * 새어 '일본 수출 동물검역 신청'이 잘못 '예정'으로 뜨는 누수를 정리한다.
 *
 * 안전: 출국편이 하나라도 있으면(=정상 예약) 건드리지 않는다. 백신·항체·검역·내원일 등 비-항공편
 * 필드는 절대 손대지 않는다. top-level + 해당 목적지 by_dest 엔트리의 항공편 키만 비운다.
 *
 *   node scripts/clean-stale-flight-fields.mjs           # dry-run (읽기만)
 *   node scripts/clean-stale-flight-fields.mjs --apply   # 실제 정리
 *
 * env: apps/admin/.env.local 또는 apps/portal/.env.local (Seoul 전용).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
function loadEnv(fp) {
  if (!existsSync(fp)) return {}
  const o = {}
  for (const l of readFileSync(fp, 'utf-8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return o
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

const apply = process.argv.includes('--apply')
console.log(`Mode: ${apply ? 'APPLY (실제 정리)' : 'DRY-RUN (변경 없음)'}\n`)

// 비울 항공편 필드 (출국 + 귀국 + 기록 시각). vet/검역/증명서/백신/항체는 제외.
const FLIGHT_KEYS = [
  'entry_date', 'entry_airport', 'entry_flight_number', 'entry_departure_airport',
  'entry_time', 'entry_transport', 'entry_purpose', 'departure_flight_date',
  'return_date', 'return_flight_number', 'return_departure_airport',
  'return_arrival_airport', 'return_transport', 'flight_info_recorded_at',
]
const FLIGHT_SET = new Set(FLIGHT_KEYS)
const SCOPED = new Set(['vet_visit_date', 'departure_date', 'return_date', 'entry_date', 'departure_flight_date'])
const parseDests = (s) => (s ?? '').split(',').map((t) => t.trim()).filter(Boolean)

function flatten(c, token) {
  const data = c.data ?? {}
  const destObj = data.by_dest?.[token]
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

let fixed = 0
for (const c of cases) {
  // 잔재 판정: 어느 활성 목적지에서든 return_date 가 있는데 출국편이 없으면 대상.
  let isStale = false
  for (const token of parseDests(c.destination)) {
    const flat = flatten(c, token)
    const ret = typeof flat.data.return_date === 'string' && flat.data.return_date.length >= 10
    if (!ret) continue
    const hasOutbound =
      (typeof flat.data.entry_date === 'string' && flat.data.entry_date.length >= 10) ||
      (typeof flat.departure_date === 'string' && flat.departure_date.length >= 10)
    if (!hasOutbound) { isStale = true; break }
  }
  if (!isStale) continue

  const data = { ...(c.data ?? {}) }
  const removedTop = []
  for (const k of FLIGHT_KEYS) {
    if (k in data) { delete data[k]; removedTop.push(k) }
  }
  // by_dest 엔트리 안의 항공편 키도 비움 (다중 목적지 잔재 대비)
  const removedByDest = []
  if (data.by_dest && typeof data.by_dest === 'object') {
    const byDest = {}
    for (const [tok, obj] of Object.entries(data.by_dest)) {
      const next = { ...obj }
      for (const k of Object.keys(next)) {
        if (FLIGHT_SET.has(k)) { delete next[k]; removedByDest.push(`${tok}.${k}`) }
      }
      byDest[tok] = next
    }
    data.by_dest = byDest
  }

  fixed += 1
  console.log(`■ ${c.pet_name ?? '?'} / ${c.customer_name ?? '-'}  [${c.id}]`)
  console.log(`   top-level 비움: ${removedTop.length ? removedTop.join(', ') : '(없음)'}`)
  if (removedByDest.length) console.log(`   by_dest 비움: ${removedByDest.join(', ')}`)
  // departure_date 컬럼은 이미 null 인지 확인 후 같이 null 로(잔재 방어)
  const colNull = c.departure_date == null
  console.log(`   departure_date 컬럼: ${c.departure_date ?? 'null'}${colNull ? '' : ' → null'}`)

  if (apply) {
    const { error: e } = await sb
      .from('cases')
      .update({ data, departure_date: null })
      .eq('id', c.id)
    console.log(e ? `   ✗ ${e.message}` : '   ✓ 적용됨')
  }
  console.log('')
}

console.log(`전체 ${cases.length}건 중 정리 대상 ${fixed}건.`)
console.log(apply ? '완료.' : '--apply 로 실제 정리하세요.')
