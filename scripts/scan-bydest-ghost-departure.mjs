#!/usr/bin/env node
/**
 * 스캔 — "삭제가 안 되는" 출국일 유령값 탐지.
 *
 * 시그니처: data.by_dest[token].departure_date 에 값이 있는데, 같은 token 기준 권위 소스가
 *   비어있어 화면에는 by_dest 값이 표시되지만 삭제(컬럼만 비움)로는 안 지워지는 상태.
 *
 * 분류:
 *   GHOST_SINGLE : 단일 목적지 + 컬럼(departure_date) 비었는데 by_dest[유일목적지].departure_date 값 있음.
 *                  → 컬럼이 지워졌으나 by_dest 유령 잔존. (테디 케이스 시그니처)
 *   DRIFT_SINGLE : 단일 목적지 + 컬럼 값 != by_dest[유일목적지].departure_date 값 (둘 다 값 있음, 불일치).
 *   GHOST_MULTI  : 다중 목적지 + 특정 token 의 by_dest.departure_date 값 있음 (참고용 — 다중은 컬럼 fallback 안 함).
 *
 * 형제(같은 보호자) 컨텍스트도 같이 출력 — co_progress 누수 여부 판단용.
 *
 *   node scripts/scan-bydest-ghost-departure.mjs           # 리포트만
 *   node scripts/scan-bydest-ghost-departure.mjs --apply   # GHOST_SINGLE 의 by_dest 유령값 제거(null)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const APPLY = process.argv.includes('--apply')
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
if (!url || !key) { console.error('env 누락'); process.exit(1) }
if (!url.includes('ugywxiyivfzflqkcnqvu')) { console.error(`Seoul 아님: ${url}`); process.exit(1) }
const supabase = createClient(url, key, { auth: { persistSession: false } })

function parseDest(s) {
  if (!s || typeof s !== 'string') return []
  return s.split(',').map((t) => t.trim()).filter(Boolean)
}

const PAGE = 1000
let from = 0, all = []
for (;;) {
  const { data: page, error } = await supabase
    .from('cases')
    .select('id, pet_name, customer_name, microchip, destination, departure_date, data')
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) { console.error(error.message); process.exit(1) }
  all = all.concat(page ?? [])
  if (!page || page.length < PAGE) break
  from += PAGE
}

// 보호자 키 (이메일 우선 + 이름+전화)
function guardian(c) {
  const d = c.data ?? {}
  const email = String(d.email ?? '').trim().toLowerCase()
  const phone = String(d.phone ?? '').replace(/\D/g, '')
  const name = String(c.customer_name ?? '').trim()
  return { email, phone, name }
}
function isSibling(a, b) {
  if (a.email && b.email && a.email === b.email) return true
  return !!a.name && !!a.phone && a.name === b.name && a.phone === b.phone
}

const ghostSingle = [], driftSingle = [], ghostMulti = []
for (const c of all) {
  const d = c.data ?? {}
  const byDest = (d.by_dest && typeof d.by_dest === 'object') ? d.by_dest : null
  if (!byDest) continue
  const tokens = parseDest(c.destination)
  for (const [token, obj] of Object.entries(byDest)) {
    if (!obj || typeof obj !== 'object') continue
    const bd = obj.departure_date
    if (typeof bd !== 'string' || !bd) continue // null sentinel/빈값은 정상
    const single = tokens.length === 1
    if (single) {
      if (!c.departure_date) ghostSingle.push({ c, token, bd })
      else if (c.departure_date !== bd) driftSingle.push({ c, token, bd, col: c.departure_date })
    } else {
      ghostMulti.push({ c, token, bd })
    }
  }
}

function sibInfo(c) {
  const g = guardian(c)
  if (!g.email && !(g.name && g.phone)) return '(매칭키 없음)'
  const sibs = all.filter((o) => o.id !== c.id && isSibling(g, guardian(o)))
  return sibs.map((s) => `${s.pet_name}[col=${s.departure_date ?? '∅'}]`).join(', ') || '(형제 없음)'
}

function dump(title, arr) {
  console.log(`\n### ${title} — ${arr.length}건 ###`)
  for (const { c, token, bd, col } of arr) {
    console.log(`  ${c.pet_name} / ${c.customer_name} (chip ${c.microchip ?? '∅'})`)
    console.log(`    id=${c.id}  dest="${c.destination}"`)
    console.log(`    컬럼=${col ?? '∅'}  by_dest[${token}].departure_date=${bd}`)
    console.log(`    형제: ${sibInfo(c)}`)
  }
}

console.log(`총 케이스: ${all.length}  (by_dest 보유 분석)`)
console.log(`모드: ${APPLY ? '⚠️ APPLY' : 'DRY-RUN'}`)
dump('GHOST_SINGLE (컬럼 비었는데 by_dest 값 — 삭제 안 됨 시그니처)', ghostSingle)
dump('DRIFT_SINGLE (컬럼≠by_dest 불일치)', driftSingle)
dump('GHOST_MULTI (다중 목적지 by_dest 값 — 참고)', ghostMulti)

if (APPLY && ghostSingle.length > 0) {
  // 백업
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = ghostSingle.map(({ c }) => ({ id: c.id, data: c.data }))
  writeFileSync(path.join(ROOT, `scripts/backup-ghost-departure-${stamp}.json`), JSON.stringify(backup, null, 2))
  let ok = 0, fail = 0
  for (const { c, token } of ghostSingle) {
    const d = { ...(c.data ?? {}) }
    const byDest = { ...d.by_dest }
    const obj = { ...byDest[token] }
    delete obj.departure_date // 유령값 완전 제거 (컬럼이 이미 비어있으므로 미입력 상태로 환원)
    byDest[token] = obj
    d.by_dest = byDest
    const { error } = await supabase.from('cases').update({ data: d }).eq('id', c.id)
    if (error) { fail++; console.error(`  ✗ ${c.id}: ${error.message}`) } else ok++
  }
  console.log(`\nGHOST_SINGLE 복구 — 성공 ${ok} / 실패 ${fail}`)
} else if (!APPLY) {
  console.log('\nDRY-RUN — --apply 로 GHOST_SINGLE 복구 실행.')
}
