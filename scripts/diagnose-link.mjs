#!/usr/bin/env node
// 일회용 진단 스크립트 — portal 로그인 후 /journey 가 비어있는 원인 추적.
// 최근 cases 5건, 최근 portal user 5건, case_customer_links 매핑 상태 출력.
// service-role 키로 RLS 우회. apps/admin/.env.local 자동 로드.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', 'apps', 'admin', '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('missing supabase env')
  process.exit(1)
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log('=== 1. Recent cases (last 5 by created_at) ===')
const { data: cases, error: e1 } = await sb
  .from('cases')
  .select('id, customer_name, destination, data, created_at')
  .order('created_at', { ascending: false })
  .limit(5)
if (e1) console.error('err:', e1)
for (const c of cases ?? []) {
  const dataEmail = (c.data && typeof c.data === 'object') ? c.data.email : null
  console.log(`  case ${c.id.slice(0, 8)}.. | ${c.customer_name} → ${c.destination} | data.email = "${dataEmail}" | ${c.created_at}`)
}

console.log()
console.log('=== 2. Recent auth.users (last 5 by created_at) ===')
const { data: usersRes, error: e2 } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 })
if (e2) console.error('err:', e2)
const recentUsers = (usersRes?.users ?? [])
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  .slice(0, 5)
for (const u of recentUsers) {
  console.log(`  user ${u.id.slice(0, 8)}.. | email = "${u.email}" | provider = ${u.app_metadata?.provider} | ${u.created_at}`)
}

console.log()
console.log('=== 3. case_customer_links (last 10) ===')
const { data: links, error: e3 } = await sb
  .from('case_customer_links')
  .select('*')
  .order('linked_at', { ascending: false, nullsFirst: false })
  .limit(10)
if (e3) console.error('err:', e3)
for (const l of links ?? []) {
  console.log(`  case ${l.case_id.slice(0, 8)}.. ↔ user ${l.user_id.slice(0, 8)}.. via ${l.linked_via} @ ${l.linked_at}`)
}

console.log()
console.log('=== 4. customer_profiles (last 5) ===')
const { data: profiles, error: e4 } = await sb
  .from('customer_profiles')
  .select('user_id, display_name, email_normalized, created_at')
  .order('created_at', { ascending: false })
  .limit(5)
if (e4) console.error('err:', e4)
for (const p of profiles ?? []) {
  console.log(`  profile user ${p.user_id.slice(0, 8)}.. | name = ${p.display_name} | email_normalized = "${p.email_normalized}" | ${p.created_at}`)
}

console.log()
console.log('=== 5. 매칭 검증 — 최근 cases 의 data.email 과 최근 users 의 email 비교 ===')
for (const c of cases ?? []) {
  const ce = c.data?.email
  if (!ce) continue
  const matchExact = recentUsers.find((u) => u.email === ce)
  const matchCI = recentUsers.find((u) => u.email?.toLowerCase() === ce?.toLowerCase())
  console.log(`  case ${c.id.slice(0, 8)} email "${ce}" → exact=${matchExact ? matchExact.id.slice(0, 8) : '∅'} / ci=${matchCI ? matchCI.id.slice(0, 8) : '∅'}`)
}
