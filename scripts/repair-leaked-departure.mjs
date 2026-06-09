#!/usr/bin/env node
/**
 * 일회성 복구 — co_progress by_dest 누수로 형제 출국일이 들어간 케이스 2건 정리.
 *
 *   테디(c56d74e4…) : 단일 일본. 컬럼 비었고 by_dest[일본].departure_date=2026-07-21(형제 모카값).
 *                      → by_dest[일본].departure_date 제거 (미입력 환원).
 *   오냥(3e1fb714…) : 단일 일본. 컬럼=2026-05-19(본인값)인데 by_dest[일본]={entry_date,departure_date:2026-07-15}
 *                      = 형제 호두 by_dest 통째 누수. → by_dest[일본] 의 누수 키 제거 → 컬럼(2026-05-19)로 fallback.
 *
 * 백업 후 적용. 멱등.
 *   node scripts/repair-leaked-departure.mjs            # dry-run
 *   node scripts/repair-leaked-departure.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const APPLY = process.argv.includes('--apply')
function loadEnv(f){if(!existsSync(f))return{};const o={};for(const l of readFileSync(f,'utf-8').split('\n')){const m=l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(m)o[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}return o}
const env={...loadEnv(path.join(ROOT,'apps/admin/.env.local')),...loadEnv(path.join(ROOT,'apps/portal/.env.local')),...process.env}
if(!env.NEXT_PUBLIC_SUPABASE_URL.includes('ugywxiyivfzflqkcnqvu')){console.error('Seoul 아님');process.exit(1)}
const supabase=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

// 케이스별 제거할 by_dest 누수 키.
const TARGETS = [
  { id: 'c56d74e4-a8bc-4a9d-a582-eb596d99b65d', token: '일본', drop: ['departure_date'] },           // 테디
  { id: '3e1fb714-e1e2-454c-ad7e-87c98e7c2088', token: '일본', drop: ['departure_date', 'entry_date'] }, // 오냥
]

const { data: rows, error } = await supabase
  .from('cases').select('id, pet_name, destination, departure_date, data')
  .in('id', TARGETS.map((t) => t.id))
if (error) { console.error(error.message); process.exit(1) }

const backup = []
const updates = []
for (const t of TARGETS) {
  const row = rows.find((r) => r.id === t.id)
  if (!row) { console.log(`✗ ${t.id} 없음`); continue }
  const d = { ...(row.data ?? {}) }
  const byDest = { ...(d.by_dest ?? {}) }
  const obj = { ...(byDest[t.token] ?? {}) }
  const before = JSON.stringify(obj)
  for (const k of t.drop) delete obj[k]
  byDest[t.token] = obj
  d.by_dest = byDest
  console.log(`\n${row.pet_name} (${row.id})`)
  console.log(`  컬럼 departure_date=${row.departure_date ?? '∅'}`)
  console.log(`  by_dest[${t.token}] 전: ${before}`)
  console.log(`  by_dest[${t.token}] 후: ${JSON.stringify(obj)}`)
  backup.push({ id: row.id, data: row.data })
  updates.push({ id: row.id, data: d })
}

if (APPLY) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(path.join(ROOT, `scripts/backup-repair-leaked-${stamp}.json`), JSON.stringify(backup, null, 2))
  for (const u of updates) {
    const { error: e } = await supabase.from('cases').update({ data: u.data }).eq('id', u.id)
    console.log(e ? `✗ ${u.id}: ${e.message}` : `✓ ${u.id} 적용`)
  }
} else {
  console.log('\nDRY-RUN — --apply 로 적용.')
}
