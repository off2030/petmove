#!/usr/bin/env node
/**
 * Phase 2.6 Seoul 이관 — DB 데이터 JSON 덤프 (롤백 보험).
 * `backups/data-YYYYMMDD-HHMMSS.json` 에 기존 프로젝트의 모든 비즈니스 테이블을 저장.
 * 이관 중 문제 발생 시 이 파일로 상태 확인 / 수동 복원 가능.
 *
 * 실행 전 `.env.local` 에 기존 프로젝트 env 필요:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 실행:
 *   pnpm -F admin exec node scripts/dump-data.mjs
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

dotenv.config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const client = createClient(URL, KEY)

const TABLES = [
  'organizations',
  'field_definitions',
  'cases',
  'case_history',
  'app_settings',
  'calculator_items',
  'profiles',
]

async function fetchAll(table) {
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

async function main() {
  const out = { dumpedAt: new Date().toISOString(), source: URL, tables: {} }
  for (const t of TABLES) {
    try {
      const rows = await fetchAll(t)
      out.tables[t] = rows
      console.log(`  ${t}: ${rows.length}`)
    } catch (e) {
      console.log(`  [skip] ${t}: ${e.message}`)
      out.tables[t] = { error: e.message }
    }
  }

  // backups 디렉토리는 레포 루트에 있음 — 스크립트는 apps/admin 에서 실행되므로 ../../
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const dir = resolve(process.cwd(), '../../backups')
  mkdirSync(dir, { recursive: true })
  const path = resolve(dir, `data-${ts}.json`)
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8')
  console.log(`\n저장: ${path}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
