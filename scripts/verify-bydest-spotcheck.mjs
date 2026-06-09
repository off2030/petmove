#!/usr/bin/env node
/** 읽기 전용 검증 — 마이그 후 케이스 몇 건의 scoped 데이터 배치를 점검. */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(f) { if (!existsSync(f)) return {}; const o = {}; for (const l of readFileSync(f, 'utf-8').split('\n')) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, '') } return o }
const env = { ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')), ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')), ...process.env }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SCOPED = ['vet_visit_date','departure_flight_date','entry_date','entry_airport','entry_flight_number','entry_departure_airport','entry_time','entry_transport','entry_purpose','return_date','return_flight_number','return_departure_airport','return_arrival_airport','return_transport','permit_no','certificate_no','id_date','deworming_time','address_overseas','kr_export_quarantine_date','kr_export_quarantine_confirmed','jp_import_quarantine_date','jp_import_quarantine_confirmed','jp_export_quarantine_visit_date','jp_export_quarantine_visit_confirmed','jp_export_quarantine_application_date','jp_export_quarantine_date','jp_export_quarantine_time','kr_import_quarantine_date','kr_import_quarantine_confirmed']

const prefixes = process.argv.slice(2)
// 전체 id 만 가볍게 받아 prefix → full uuid 매핑.
const { data: idRows, error: idErr } = await sb.from('cases').select('id')
if (idErr) { console.error(idErr.message); process.exit(1) }
const fullIds = prefixes.map((p) => idRows.find((r) => r.id.startsWith(p))?.id).filter(Boolean)
const { data, error } = await sb.from('cases').select('id, destination, data, departure_date').in('id', fullIds)
if (error) { console.error(error.message); process.exit(1) }
for (const id of prefixes) {
  const row = data.find((r) => r.id.startsWith(id))
  if (!row) { console.log(`\n${id}: (없음)`); continue }
  const d = row.data ?? {}
  const topLevelScoped = SCOPED.filter((k) => k in d)
  const byDest = d.by_dest ?? {}
  console.log(`\n${row.id.slice(0,8)}  목적지="${row.destination}"  컬럼 departure_date=${row.departure_date ?? 'null'}`)
  console.log(`  top-level scoped 잔존: ${topLevelScoped.length ? topLevelScoped.join(', ') : '(없음 ✓)'}`)
  for (const [dest, obj] of Object.entries(byDest)) {
    const keys = Object.keys(obj ?? {})
    console.log(`  by_dest[${dest}]: ${keys.length ? keys.map((k) => `${k}=${JSON.stringify(obj[k])}`).join(', ') : '(빈 칸)'}`)
  }
}
