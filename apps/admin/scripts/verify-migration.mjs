#!/usr/bin/env node
/**
 * Phase 2.6 Seoul 이관 — src/dst 행수 비교로 누락 검증.
 * migrate-data.mjs 실행 후 마지막 확인 용.
 *
 * 실행:
 *   pnpm -F admin exec node scripts/verify-migration.mjs
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SRC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SRC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DST_URL = process.env.NEW_SUPABASE_URL
const DST_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY

const src = createClient(SRC_URL, SRC_KEY)
const dst = createClient(DST_URL, DST_KEY)

const TABLES = [
  'organizations',
  'field_definitions',
  'cases',
  'case_history',
  'app_settings',
  'calculator_items',
  'profiles',
]

async function count(client, table) {
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) return { error: error.message }
  return { count }
}

async function main() {
  console.log(`src: ${SRC_URL}`)
  console.log(`dst: ${DST_URL}\n`)
  console.log('table                  src      dst    diff')
  console.log('--------------------- -----  -----  ------')

  let totalDiff = 0
  for (const t of TABLES) {
    const [s, d] = await Promise.all([count(src, t), count(dst, t)])
    const sVal = s.count ?? `ERR:${s.error?.slice(0, 20)}`
    const dVal = d.count ?? `ERR:${d.error?.slice(0, 20)}`
    const diff = typeof s.count === 'number' && typeof d.count === 'number' ? d.count - s.count : '?'
    if (typeof diff === 'number') totalDiff += Math.abs(diff)
    console.log(`${t.padEnd(22)} ${String(sVal).padStart(5)}  ${String(dVal).padStart(5)}  ${String(diff).padStart(6)}`)
  }
  console.log(`\n총 diff 절대값 합: ${totalDiff}`)
  if (totalDiff === 0) console.log('✓ 모든 테이블 일치')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
