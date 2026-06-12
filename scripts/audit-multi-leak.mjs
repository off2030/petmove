#!/usr/bin/env node
/** 읽기 전용 감사 — 다중 목적지 케이스에서 컬럼/top-level 출국일 누수가 남아있는지 점검.
 *  수정된 getDepartureDate 로직(다중이면 by_dest 만, 없으면 null)을 재현해 각 목적지 출국일을
 *  계산하고, "구 로직이었다면 컬럼을 물려받았을" 목적지를 표시(= 가드가 막은 누수). */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(f) { if (!existsSync(f)) return {}; const o = {}; for (const l of readFileSync(f, 'utf-8').split('\n')) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, '') } return o }
const env = { ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')), ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')), ...process.env }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const parse = (s) => (!s ? [] : s.split(',').map((t) => t.trim()).filter(Boolean))
const byDestDep = (data, dest) => { const o = data?.by_dest?.[dest]; if (!o || !('departure_date' in o)) return undefined; return o.departure_date }

let from = 0, all = []
for (;;) { const { data, error } = await sb.from('cases').select('id, destination, data, departure_date').order('id').range(from, from + 999); if (error) { console.error(error.message); process.exit(1) } all = all.concat(data ?? []); if (!data || data.length < 1000) break; from += 1000 }
const multi = all.filter((r) => parse(r.destination).length > 1)
console.log(`다중 목적지 케이스: ${multi.length}`)
let leakBlocked = 0
for (const row of multi) {
  const toks = parse(row.destination)
  const lines = []
  for (const t of toks) {
    const bd = byDestDep(row.data, t)
    const fixed = typeof bd === 'string' && bd ? bd : null // 수정 로직: by_dest 만
    const oldLeak = (typeof bd === 'string' && bd) ? bd : (row.departure_date ?? null) // 구: 컬럼 fallback
    const blocked = fixed !== oldLeak // 가드가 막은 누수
    if (blocked) leakBlocked++
    lines.push(`    ${t}: by_dest=${bd === undefined ? '(없음)' : JSON.stringify(bd)} → 수정후=${JSON.stringify(fixed)}${blocked ? `  ⛔누수차단(구=${JSON.stringify(oldLeak)})` : ''}`)
  }
  console.log(`  ${row.id.slice(0, 8)} "${row.destination}" 컬럼=${row.departure_date ?? 'null'}`)
  for (const l of lines) console.log(l)
}
console.log(`\n총 누수 차단 목적지 수: ${leakBlocked} (구 로직이었으면 컬럼을 물려받았을 목적지)`)
