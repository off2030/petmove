#!/usr/bin/env node
/**
 * 일회성 백필 — 다중/단일 목적지 케이스에서 `by_dest[dest].entry_date` 는 있는데
 * `by_dest[dest].departure_date` 가 비어 있는(legacy) 경우, 저장 코드의 불변식
 * (updateFlightFields: departure_date := entry_date) 을 그대로 적용해 채운다.
 *
 * 이유: 출국 전 임상검사·검역 일정 검증(buildDateRuleContext)이 by_dest[dest].departure_date
 * 를 출국일 앵커로 읽는다. 항공권 저장 시점이 옛 코드라 departure_date 가 안 들어간 케이스는
 * 출국일이 비어 보여 '주의'가 누락된다. entry_date(= 도착=같은 날 출국)로 채워 정정.
 *
 * 안전:
 *  - entry_date 가 유효한 날짜(YYYY-MM-DD)일 때만.
 *  - departure_date 가 이미 있으면(빈 문자열 제외) 절대 덮어쓰지 않음.
 *  - 그 목적지 자신의 entry_date 만 사용 — 다른 목적지 값 누수 없음.
 *  - 기본 dry-run. 실제 쓰기는 `--apply` 플래그가 있을 때만.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(f) { if (!existsSync(f)) return {}; const o = {}; for (const l of readFileSync(f, 'utf-8').split('\n')) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, '') } return o }
const env = { ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')), ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')), ...process.env }
const APPLY = process.argv.includes('--apply')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

let from = 0, all = []
for (;;) { const { data, error } = await sb.from('cases').select('id, destination, data').order('id').range(from, from + 999); if (error) { console.error(error.message); process.exit(1) } all = all.concat(data ?? []); if (!data || data.length < 1000) break; from += 1000 }

let planned = 0, casesTouched = 0
for (const r of all) {
  const data = r.data ?? {}
  const bd = data.by_dest
  if (!bd || typeof bd !== 'object') continue
  let changed = false
  const nextBd = { ...bd }
  for (const [dest, o] of Object.entries(bd)) {
    if (!o || typeof o !== 'object') continue
    const entry = o.entry_date
    const dep = o.departure_date
    const depEmpty = dep === undefined || dep === null || dep === ''
    if (isDate(entry) && depEmpty) {
      nextBd[dest] = { ...o, departure_date: entry }
      console.log(`  ${r.id.slice(0, 8)} by_dest[${dest}].departure_date: (없음) → ${entry}`)
      planned++
      changed = true
    }
  }
  if (changed) {
    casesTouched++
    if (APPLY) {
      const nextData = { ...data, by_dest: nextBd }
      const { error } = await sb.from('cases').update({ data: nextData }).eq('id', r.id)
      if (error) { console.error(`  ✖ ${r.id.slice(0, 8)} 쓰기 실패: ${error.message}`); process.exit(1) }
    }
  }
}
console.log(`\n${APPLY ? '적용 완료' : 'DRY-RUN(미적용)'} — 케이스 ${casesTouched}건, 목적지 ${planned}곳`)
if (!APPLY) console.log('실제 적용하려면: node scripts/backfill-bydest-departure.mjs --apply')
