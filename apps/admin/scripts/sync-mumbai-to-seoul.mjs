#!/usr/bin/env node
/**
 * Mumbai (src) → Seoul (dst) 증분 데이터 동기화.
 * Phase 2.6 이관 (2026-04-22) 이후 Mumbai 에서 일어난 변경분 + 새로 추가된 테이블을 Seoul 로 옮김.
 *
 * 배경 (2026-04-25): Vercel env 를 Seoul 로 전환했더니 Phase 2.6 이후 추가된 18개 마이그레이션 +
 * Mumbai 에서 변경된 데이터가 Seoul 에 없어서 약품·자동화·프로필이름 등이 빈 화면.
 * Mumbai 는 5월 초 삭제 예정이라 정공법(Seoul 보충) 으로 진행.
 *
 * 실행 절차:
 *   1) Seoul SQL Editor 에서 `seoul-catchup.sql` 전체 붙여넣고 Run
 *      https://supabase.com/dashboard/project/ugywxiyivfzflqkcnqvu/sql/new
 *   2) `pnpm -F admin exec node scripts/sync-mumbai-to-seoul.mjs`
 *   3) petmove.vercel.app 새로고침 → 데이터 정상 표시 확인
 *
 * ⚠️ 선행 조건:
 *   - .env.local 에 NEW_SUPABASE_URL / NEW_SUPABASE_SERVICE_ROLE_KEY (Seoul) 와
 *     NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (Mumbai) 모두 있어야 함
 *   - Step 1 (SQL 적용) 완료된 후에만 이 스크립트 실행
 *
 * 처리 테이블 (FK 순서):
 *   organizations, field_definitions, profiles, memberships,
 *   organization_settings, organization_invites,
 *   org_vaccine_products, org_auto_fill_rules,
 *   cases, case_history, calculator_items, app_settings
 *
 * 약품·자동화 테이블은 Seoul seed 와 충돌 방지를 위해 sync 직전에 delete (Mumbai 가 source of truth).
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SRC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SRC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DST_URL = process.env.NEW_SUPABASE_URL
const DST_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY

if (!SRC_URL || !SRC_KEY || !DST_URL || !DST_KEY) {
  console.error('Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!SRC_URL.includes('jxyalwbstsqpecavqfkb')) {
  console.error(`expected src=Mumbai, got ${SRC_URL}`)
  process.exit(1)
}
if (!DST_URL.includes('ugywxiyivfzflqkcnqvu')) {
  console.error(`expected dst=Seoul, got ${DST_URL}`)
  process.exit(1)
}

const src = createClient(SRC_URL, SRC_KEY)
const dst = createClient(DST_URL, DST_KEY)

const ROJAN = '00000000-0000-0000-0000-000000000001'

// FK 순서 — replaceFirst 는 sync 전 dst 테이블 비우기 (Mumbai 가 진리).
const TABLES = [
  { name: 'organizations',         conflict: 'id' },
  { name: 'field_definitions',     conflict: 'id' },
  { name: 'profiles',              conflict: 'id' },
  { name: 'memberships',           conflict: 'user_id,org_id' },
  { name: 'organization_settings', conflict: 'org_id,key' },
  { name: 'organization_invites',  conflict: 'id', optional: true },
  { name: 'org_vaccine_products',  conflict: 'id', replaceFirst: true },
  { name: 'org_auto_fill_rules',   conflict: 'id', replaceFirst: true },
  {
    name: 'cases',
    conflict: 'id',
    transform: (r) => (r.status === 'applied' ? { ...r, status: '진행중' } : r),
  },
  { name: 'case_history',  conflict: 'id' },
  {
    name: 'calculator_items',
    conflict: 'country,item_name',
    transform: ({ id, ...rest }) => rest,
  },
  { name: 'app_settings', conflict: 'key', optional: true },
]

const CHUNK = 500

async function fetchAll(client, table) {
  const all = []
  let from = 0
  while (true) {
    const to = from + 999
    const { data, error } = await client.from(table).select('*').range(from, to)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function clearDstTable(table) {
  // service role 로 전 행 삭제 (RLS 우회). FK 조심 — replaceFirst 는 leaf 테이블에만.
  const { error } = await dst.from(table).delete().eq('org_id', ROJAN)
  if (error && !error.message.includes('does not exist')) {
    throw new Error(`clear ${table} failed: ${error.message}`)
  }
}

async function syncTable(t) {
  let rows
  try {
    rows = await fetchAll(src, t.name)
  } catch (e) {
    if (t.optional) {
      console.log(`  [skip] ${t.name}: ${e.message}`)
      return { table: t.name, src: 0, ok: 0, fail: 0 }
    }
    throw e
  }

  if (rows.length === 0) {
    console.log(`  ${t.name}: 0 rows (skip)`)
    return { table: t.name, src: 0, ok: 0, fail: 0 }
  }

  if (t.replaceFirst) {
    await clearDstTable(t.name)
    console.log(`  ${t.name}: dst cleared (rojan rows)`)
  }

  const prepared = t.transform ? rows.map(t.transform) : rows

  let ok = 0
  let fail = 0
  for (let i = 0; i < prepared.length; i += CHUNK) {
    const chunk = prepared.slice(i, i + CHUNK)
    const { error } = await dst
      .from(t.name)
      .upsert(chunk, { onConflict: t.conflict, ignoreDuplicates: false })
    if (error) {
      console.error(`  [fail] ${t.name} chunk ${i}: ${error.message}`)
      fail += chunk.length
    } else {
      ok += chunk.length
    }
  }
  console.log(`  ${t.name}: ${ok}/${rows.length} upserted (fail ${fail})`)
  return { table: t.name, src: rows.length, ok, fail }
}

async function main() {
  console.log(`src: ${SRC_URL}`)
  console.log(`dst: ${DST_URL}\n`)

  const summary = []
  for (const t of TABLES) {
    console.log(`→ ${t.name}`)
    const r = await syncTable(t)
    summary.push(r)
  }

  console.log('\n=== 요약 ===')
  let totalFail = 0
  for (const s of summary) {
    console.log(`${s.table.padEnd(24)} src=${String(s.src).padStart(5)}  ok=${String(s.ok).padStart(5)}  fail=${s.fail}`)
    totalFail += s.fail
  }
  if (totalFail > 0) {
    console.log(`\n⚠️  실패 ${totalFail} 건`)
    process.exit(1)
  } else {
    console.log('\n✓ 동기화 완료')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
