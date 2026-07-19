#!/usr/bin/env node
/**
 * 일회성 백필 — 구 `australia_extra.sample_received_date`(케이스 단위 단일 칸)를
 * `rabies_titer_records[n].received_date`(회차 단위)로 옮긴다.
 *
 * 배경: 접수일 칸은 화면에서 제거됐는데(destination-config australia extraFields) AI 추출은
 * 계속 구 칸에 썼다. 증명서 PDF 만 구 칸을 읽어 "PDF 엔 나오는데 항체검사 팝업은 빈칸" 상태.
 * 저장 위치를 회차 단위로 단일화하면서 기존 데이터도 옮긴다.
 *
 * 대상 회차 = 채혈일이 가장 이른 회차. AU 증명서가 "RNATT 1. Collection date" 로
 * titer_date_asc[0](가장 이른 회차)을 찍으므로 접수일도 같은 회차에 붙어야 짝이 맞는다.
 *
 * 안전 — 아래를 모두 만족할 때만 옮긴다:
 *  - 구 값이 YYYY-MM-DD 형식.
 *  - 항체검사 회차가 1개 이상이고, 그중 채혈일이 있는 회차가 있음.
 *  - 가장 이른 채혈일 <= 구 접수일. **채혈보다 이른 접수일은 물리적으로 불가능**하므로
 *    데이터 오염(다른 케이스 서류 오붙여넣기 등)으로 보고 건너뛴다. 실사 결과 8건 중 4건이
 *    이 경우였고, 그대로 옮기면 호주 180일 대기 검증 기준이 틀어진다.
 *  - 어떤 회차에도 received_date 가 아직 없음 (재실행 안전 + 사람이 넣은 값 보호).
 *
 * 구 값은 지우지 않는다 — 되돌릴 수 있게 남기고, 못 옮긴 케이스는 pdf-fill 의
 * legacy 폴백이 계속 읽어 증명서 출력이 그대로 유지된다.
 *
 * 기본 dry-run. 실제 쓰기는 `--apply` 플래그가 있을 때만.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(f) { if (!existsSync(f)) return {}; const o = {}; for (const l of readFileSync(f, 'utf-8').split('\n')) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, '') } return o }
const env = { ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')), ...process.env }
const APPLY = process.argv.includes('--apply')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

const { data: rows, error } = await sb
  .from('cases')
  .select('id, pet_name, destination, data')
  .not('data->australia_extra', 'is', null)
if (error) { console.error(error.message); process.exit(1) }

const planned = []
const skipped = []

for (const c of rows ?? []) {
  const legacy = c.data?.australia_extra?.sample_received_date
  if (!isDate(legacy)) continue
  const label = `${c.pet_name ?? '(이름없음)'} | ${c.destination ?? '-'}`
  const recs = Array.isArray(c.data?.rabies_titer_records) ? c.data.rabies_titer_records : []

  if (recs.some((r) => r?.received_date)) { skipped.push([label, legacy, '이미 회차에 수령일 있음']); continue }
  if (recs.length === 0) { skipped.push([label, legacy, '항체검사 회차 없음 — 붙일 곳 없음']); continue }

  let idx = -1
  for (let i = 0; i < recs.length; i++) {
    if (!isDate(recs[i]?.date)) continue
    if (idx === -1 || recs[i].date < recs[idx].date) idx = i
  }
  if (idx === -1) { skipped.push([label, legacy, '채혈일 있는 회차 없음']); continue }
  if (recs[idx].date > legacy) {
    skipped.push([label, legacy, `접수일이 채혈일(${recs[idx].date})보다 이름 — 오염 의심`])
    continue
  }

  const next = recs.map((r, i) => (i === idx ? { ...r, received_date: legacy } : r))
  planned.push({ id: c.id, label, legacy, collect: recs[idx].date, idx, next })
}

console.log(`\n=== 옮길 대상 ${planned.length}건 ===`)
for (const p of planned) console.log(`  ✔ ${p.label} | 채혈 ${p.collect} → 접수 ${p.legacy} (회차 #${p.idx})`)
console.log(`\n=== 건너뜀 ${skipped.length}건 (구 칸에 그대로 둠 · PDF 는 폴백으로 정상) ===`)
for (const [label, legacy, why] of skipped) console.log(`  – ${label} | ${legacy} | ${why}`)

if (!APPLY) { console.log('\n[dry-run] 실제로 쓰려면 --apply\n'); process.exit(0) }

let ok = 0
for (const p of planned) {
  // 읽고-쓰는 사이 다른 편집이 끼어들 수 있어 data 전체가 아니라 최신 data 를 다시 읽어 병합.
  const { data: fresh, error: readErr } = await sb.from('cases').select('data').eq('id', p.id).single()
  if (readErr) { console.error(`  ✖ ${p.label}: ${readErr.message}`); continue }
  const recs = Array.isArray(fresh?.data?.rabies_titer_records) ? fresh.data.rabies_titer_records : []
  if (recs.some((r) => r?.received_date)) { console.log(`  – ${p.label}: 그새 값이 생겨 건너뜀`); continue }
  const nextData = { ...fresh.data, rabies_titer_records: recs.map((r, i) => (i === p.idx ? { ...r, received_date: p.legacy } : r)) }
  const { error: upErr } = await sb.from('cases').update({ data: nextData }).eq('id', p.id)
  if (upErr) { console.error(`  ✖ ${p.label}: ${upErr.message}`); continue }
  console.log(`  ✔ ${p.label}`)
  ok++
}
console.log(`\n적용 완료: ${ok}/${planned.length}\n`)
