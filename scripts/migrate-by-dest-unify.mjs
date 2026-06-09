#!/usr/bin/env node
/**
 * B 마이그레이션 — destination-scoped top-level 값을 data.by_dest[목적지] 로 이전 (단일도 통일).
 *
 * 배경: docs/destination-scoping-design.md (B안). 코드(저장 게이트 제거 + 읽기 가드)는 먼저 배포됐다고
 *       가정한다. 이 스크립트는 기존 데이터의 top-level 잔존을 by_dest 로 옮겨 단일→다중 전환 누수를
 *       구조적으로 없앤다.
 *
 * 규칙 (케이스마다):
 *   - target = 첫 목적지 토큰. (단일=유일 목적지. 다중=원래 단일 시절 데이터의 주인 = 첫 토큰.)
 *   - scoped DATA 키가 top-level 에 있으면:
 *       · by_dest[target] 에 같은 키가 아직 없을 때만 이동(코드 배포 후 사용자가 먼저 편집한 최신값 보존).
 *       · top-level 에선 항상 삭제 (B: top-level 에 scoped 잔존 없음).
 *   - departure_date 컬럼이 있으면 by_dest[target].departure_date 가 비었을 때만 복사. 컬럼은 유지
 *     (목록 필터·정렬·auto-fill 호환 — 읽기는 다중에서 컬럼 fallback 안 함, 가드로 차단됨).
 *   - 공용/파생 키(vet_visit_confirmed, jp_export_quarantine_reservation_skipped, import_* 등)는 안 건드림.
 *
 * 멱등(idempotent): 두 번 돌려도 안전(2회차엔 top-level 잔존이 없어 무변경).
 *
 *   node scripts/migrate-by-dest-unify.mjs            # dry-run (요약만, 쓰기 X)
 *   node scripts/migrate-by-dest-unify.mjs --apply    # 실제 적용
 *
 * env: apps/admin/.env.local 또는 apps/portal/.env.local
 *   (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — Seoul 전용.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const APPLY = process.argv.includes('--apply')

// DESTINATION_SCOPED_FIELD_KEYS 와 동기 유지 (departure_date 는 컬럼이라 별도 처리 → 제외).
// packages/domain/src/destination-scoped-fields.ts 의 목록과 일치해야 함.
const SCOPED_DATA_KEYS = [
  'vet_visit_date',
  'departure_flight_date',
  'entry_date',
  'entry_airport',
  'entry_flight_number',
  'entry_departure_airport',
  'entry_time',
  'entry_transport',
  'entry_purpose',
  'return_date',
  'return_flight_number',
  'return_departure_airport',
  'return_arrival_airport',
  'return_transport',
  'permit_no',
  'certificate_no',
  'id_date',
  'deworming_time',
  'address_overseas',
  'kr_export_quarantine_date',
  'kr_export_quarantine_confirmed',
  'jp_import_quarantine_date',
  'jp_import_quarantine_confirmed',
  'jp_export_quarantine_visit_date',
  'jp_export_quarantine_visit_confirmed',
  'jp_export_quarantine_application_date',
  'jp_export_quarantine_date',
  'jp_export_quarantine_time',
  'kr_import_quarantine_date',
  'kr_import_quarantine_confirmed',
]

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

/** "일본, 베트남" → ["일본","베트남"]. */
function parseDestinations(s) {
  if (!s || typeof s !== 'string') return []
  return s.split(',').map((t) => t.trim()).filter(Boolean)
}

/** 케이스 1건의 다음 data(변경 시) 계산. 변경 없으면 null. */
function planCase(row) {
  const tokens = parseDestinations(row.destination)
  if (tokens.length === 0) return null
  const target = tokens[0]
  const data = (row.data && typeof row.data === 'object') ? { ...row.data } : {}
  const byDest = (data.by_dest && typeof data.by_dest === 'object') ? { ...data.by_dest } : {}
  const destObj = (byDest[target] && typeof byDest[target] === 'object') ? { ...byDest[target] } : {}

  const movedKeys = []
  let changed = false

  for (const k of SCOPED_DATA_KEYS) {
    if (!(k in data)) continue
    // by_dest[target] 에 아직 없을 때만 이동(최신값 보존). 있으면 top-level 잔존만 제거.
    if (!(k in destObj)) {
      destObj[k] = data[k]
      movedKeys.push(k)
    }
    delete data[k]
    changed = true
  }

  // departure_date 컬럼 → by_dest[target].departure_date (비었을 때만). 컬럼은 유지.
  if (row.departure_date && !('departure_date' in destObj)) {
    destObj.departure_date = row.departure_date
    movedKeys.push('departure_date(col)')
    changed = true
  }

  if (!changed) return null
  byDest[target] = destObj
  data.by_dest = byDest
  return { data, target, movedKeys, multi: tokens.length > 1 }
}

// 전체 케이스 — id, destination, data, departure_date. (페이지네이션: 1000+ 대비)
const PAGE = 1000
let from = 0
let all = []
for (;;) {
  const { data: page, error } = await supabase
    .from('cases')
    .select('id, destination, data, departure_date')
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) {
    console.error('조회 실패:', error.message)
    process.exit(1)
  }
  all = all.concat(page ?? [])
  if (!page || page.length < PAGE) break
  from += PAGE
}

console.log(`총 케이스: ${all.length}`)
console.log(`모드: ${APPLY ? '⚠️  APPLY (실제 쓰기)' : 'DRY-RUN (쓰기 없음)'}`)
console.log('─'.repeat(60))

let touched = 0
let touchedSingle = 0
let touchedMulti = 0
const keyCounts = {}
let applied = 0
let applyErrors = 0
const samples = []

for (const row of all) {
  const plan = planCase(row)
  if (!plan) continue
  touched++
  if (plan.multi) touchedMulti++
  else touchedSingle++
  for (const k of plan.movedKeys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
  if (samples.length < 12) {
    samples.push(`  ${row.id.slice(0, 8)} [${plan.multi ? '다중' : '단일'}] → by_dest[${plan.target}] : ${plan.movedKeys.join(', ') || '(top-level 잔존 정리만)'}`)
  }
  if (APPLY) {
    const { error } = await supabase.from('cases').update({ data: plan.data }).eq('id', row.id)
    if (error) {
      applyErrors++
      console.error(`  ✗ ${row.id}: ${error.message}`)
    } else {
      applied++
    }
  }
}

console.log(`변경 대상 케이스: ${touched}  (단일 ${touchedSingle} / 다중 ${touchedMulti})`)
console.log('이동 키별 건수:')
for (const k of Object.keys(keyCounts).sort((a, b) => keyCounts[b] - keyCounts[a])) {
  console.log(`  ${k}: ${keyCounts[k]}`)
}
console.log('샘플:')
for (const s of samples) console.log(s)
if (APPLY) {
  console.log('─'.repeat(60))
  console.log(`적용 완료: ${applied}  실패: ${applyErrors}`)
} else {
  console.log('─'.repeat(60))
  console.log('DRY-RUN — 실제 적용하려면 --apply 플래그로 다시 실행.')
}
