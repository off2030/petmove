#!/usr/bin/env node
/**
 * Phase 2.6 Seoul 이관 — DB 데이터 복사.
 * 기존(src) 프로젝트의 각 테이블 행을 신규(dst) 로 upsert.
 * 스키마는 이미 적용되어 있어야 함 (schema-consolidated.sql 선행 실행 필요).
 *
 * 실행 순서 보장: organizations → field_definitions → cases → case_history → ...
 * FK 순서를 따라 나열. 각 테이블은 chunk 단위로 upsert (timeout 방지).
 *
 * 실행 전 `.env.local` 에 다음 4종 필요:
 *   NEXT_PUBLIC_SUPABASE_URL        (기존)
 *   SUPABASE_SERVICE_ROLE_KEY       (기존)
 *   NEW_SUPABASE_URL                (신규)
 *   NEW_SUPABASE_SERVICE_ROLE_KEY   (신규)
 *
 * 실행:
 *   pnpm -F admin exec node scripts/migrate-data.mjs
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SRC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SRC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DST_URL = process.env.NEW_SUPABASE_URL
const DST_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY

if (!SRC_URL || !SRC_KEY || !DST_URL || !DST_KEY) {
  console.error(
    'Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

const src = createClient(SRC_URL, SRC_KEY)
const dst = createClient(DST_URL, DST_KEY)

// FK 순서대로 나열 — 선행 테이블이 위
// transform: src 행을 dst 제약에 맞게 정리 (status 레거시 매핑, IDENTITY id 제거 등)
const TABLES = [
  { name: 'organizations', conflict: 'id' },
  { name: 'field_definitions', conflict: 'id' },
  {
    name: 'cases',
    conflict: 'id',
    // 레거시 영문 status 'applied' → '진행중' (신규 프로젝트 제약: 진행중/완료/보류/취소)
    transform: (r) => (r.status === 'applied' ? { ...r, status: '진행중' } : r),
  },
  { name: 'case_history', conflict: 'id' },
  { name: 'app_settings', conflict: 'key' },
  {
    name: 'calculator_items',
    // id 가 GENERATED ALWAYS AS IDENTITY — 명시 삽입 불가. (country,item_name) 유니크로 upsert.
    conflict: 'country,item_name',
    transform: ({ id, ...rest }) => rest,
  },
  { name: 'profiles', conflict: 'id' }, // auth 이관 후
]

const CHUNK = 500

async function fetchAll(client, table) {
  const all = []
  let from = 0
  while (true) {
    const to = from + 999
    const { data, error } = await client
      .from(table)
      .select('*')
      .range(from, to)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function migrateTable(t) {
  let rows
  try {
    rows = await fetchAll(src, t.name)
  } catch (e) {
    // 테이블이 없을 수도 있음 (마이그레이션에 따라)
    console.log(`  [skip] ${t.name}: ${e.message}`)
    return { table: t.name, src: 0, ok: 0, fail: 0 }
  }

  if (rows.length === 0) {
    console.log(`  ${t.name}: 0 rows`)
    return { table: t.name, src: 0, ok: 0, fail: 0 }
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

async function migrate() {
  console.log(`src: ${SRC_URL}`)
  console.log(`dst: ${DST_URL}\n`)

  const summary = []
  for (const t of TABLES) {
    console.log(`→ ${t.name}`)
    const r = await migrateTable(t)
    summary.push(r)
  }

  console.log('\n=== 요약 ===')
  let totalFail = 0
  for (const s of summary) {
    console.log(
      `${s.table.padEnd(22)} src=${String(s.src).padStart(5)}  ok=${String(s.ok).padStart(5)}  fail=${s.fail}`,
    )
    totalFail += s.fail
  }
  if (totalFail > 0) {
    console.log(`\n⚠️  실패 ${totalFail} 건 — 로그 확인 후 재실행 또는 수동 조치`)
    process.exit(1)
  } else {
    console.log('\n✓ 데이터 이관 완료')
  }
}

migrate().catch((e) => {
  console.error(e)
  process.exit(1)
})
