#!/usr/bin/env node
/**
 * 기존 케이스 ↔ 보호자 자동 매칭 백필.
 *
 * portal 의 case_customer_links 는 보통 가입 시점 autoLinkCasesByEmail 로 채워지지만,
 * portal 출시 전 admin 에 이미 쌓인 케이스 + portal 후 가입한 사용자 매칭은
 * 가입 시점에만 일어남. 이 스크립트는 이미 가입된 사용자의 이메일과 일치하는 케이스를
 * 일괄 백필.
 *
 * 모드:
 *   --dry-run (기본): 매칭 결과만 출력, DB 변경 없음
 *   --apply:        실제 case_customer_links 에 INSERT
 *
 * 사용:
 *   node scripts/backfill-case-customer-links.mjs           # dry-run
 *   node scripts/backfill-case-customer-links.mjs --apply   # 실제 적용
 *
 * 필요 env (apps/portal/.env.local 또는 admin/.env.local 에서 자동 로드):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// .env 로드 (간단 파서 — 외부 dotenv 의존 회피)
function loadEnv(filePath) {
  if (!existsSync(filePath)) return {}
  const out = {}
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, k, v] = m
    out[k] = v.replace(/^['"]|['"]$/g, '')
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

const apply = process.argv.includes('--apply')
console.log(`Mode: ${apply ? 'APPLY (실제 INSERT)' : 'DRY-RUN (변경 없음)'}\n`)

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 1) 모든 customer_profiles 조회 — email_normalized 로 cases 매칭할 후보군
const { data: profiles, error: pErr } = await admin
  .from('customer_profiles')
  .select('user_id, email_normalized, display_name')
  .not('email_normalized', 'is', null)
if (pErr) {
  console.error('customer_profiles 조회 실패:', pErr.message)
  process.exit(1)
}

console.log(`customer_profiles 후보: ${profiles.length}명\n`)

let totalMatched = 0
let totalNewLinks = 0

for (const p of profiles) {
  const email = p.email_normalized
  if (!email) continue

  // 2) 이 이메일과 일치하는 cases
  const { data: cases, error: cErr } = await admin
    .from('cases')
    .select('id, customer_name, pet_name')
    .filter('data->>email', 'eq', email)
  if (cErr) {
    console.error(`cases 조회 실패 (${email}):`, cErr.message)
    continue
  }
  if (!cases?.length) continue

  // 3) 이미 링크돼 있는지 확인
  const caseIds = cases.map((c) => c.id)
  const { data: existingLinks } = await admin
    .from('case_customer_links')
    .select('case_id')
    .eq('user_id', p.user_id)
    .in('case_id', caseIds)
  const existingSet = new Set((existingLinks ?? []).map((l) => l.case_id))

  const newCases = cases.filter((c) => !existingSet.has(c.id))
  if (newCases.length === 0) continue

  totalMatched++
  totalNewLinks += newCases.length

  console.log(`  ${p.display_name ?? '(no name)'} <${email}>`)
  for (const c of newCases) {
    console.log(`    + ${c.id} — ${c.customer_name} / ${c.pet_name ?? '(no pet)'}`)
  }

  // 4) APPLY 모드면 실제 INSERT
  if (apply) {
    const rows = newCases.map((c) => ({
      case_id: c.id,
      user_id: p.user_id,
      linked_via: 'email-match',
    }))
    const { error: iErr } = await admin
      .from('case_customer_links')
      .upsert(rows, { onConflict: 'case_id,user_id', ignoreDuplicates: true })
    if (iErr) {
      console.error(`  ! INSERT 실패: ${iErr.message}`)
    }
  }
}

console.log(
  `\n요약: ${totalMatched}명의 보호자에 신규 ${totalNewLinks}건 링크 ${apply ? '적용됨' : '발견 (apply X)'}.`,
)
if (!apply && totalNewLinks > 0) {
  console.log('실제 적용: node scripts/backfill-case-customer-links.mjs --apply')
}
