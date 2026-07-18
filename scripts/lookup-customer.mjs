#!/usr/bin/env node
/** 읽기 전용 — 이메일로 보호자 계정·프로필·케이스 존재 여부 조회 (탈퇴/삭제/미노출 판별용).
 *  사용: node scripts/lookup-customer.mjs <email>
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(f) {
  if (!existsSync(f)) return {}
  const o = {}
  for (const l of readFileSync(f, 'utf-8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return o
}
const env = {
  ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')),
  ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')),
  ...process.env,
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const email = process.argv[2]
if (!email) {
  console.error('사용: node scripts/lookup-customer.mjs <email>')
  process.exit(1)
}

console.log(`조회 대상: ${email}\n`)

// 1) 로그인 계정(profiles)
const { data: prof } = await sb.from('profiles').select('id, email, created_at').eq('email', email)
console.log(`1) profiles (로그인 계정): ${prof?.length ?? 0}건`)
for (const p of prof ?? []) console.log(`   ${p.id.slice(0, 8)}  가입 ${p.created_at?.slice(0, 10)}`)

// 2) 보호자 프로필(customer_profiles)
const { data: cust } = await sb
  .from('customer_profiles')
  .select('id, email, name, phone, created_at')
  .eq('email', email)
console.log(`\n2) customer_profiles (보호자 프로필): ${cust?.length ?? 0}건`)
for (const c of cust ?? [])
  console.log(`   ${c.id.slice(0, 8)}  ${c.name ?? '(이름없음)'}  생성 ${c.created_at?.slice(0, 10)}`)

// 3) 연결된 케이스 — 링크 기준
const ids = (cust ?? []).map((c) => c.id)
if (ids.length) {
  const { data: links } = await sb
    .from('case_customer_links')
    .select('case_id')
    .in('customer_profile_id', ids)
  const caseIds = [...new Set((links ?? []).map((l) => l.case_id))]
  console.log(`\n3) 연결된 케이스: ${caseIds.length}건`)
  if (caseIds.length) {
    const { data: cases } = await sb
      .from('cases')
      .select('id, pet_name, destination, status, org_id, created_at, customer_name')
      .in('id', caseIds)
    for (const c of cases ?? [])
      console.log(
        `   ${c.id.slice(0, 8)}  ${c.pet_name ?? '(무명)'}  목적지=${c.destination ?? '-'}  상태=${c.status ?? '-'}  org=${(c.org_id ?? '').slice(-4)}  생성 ${c.created_at?.slice(0, 10)}`,
      )
  }
} else {
  console.log('\n3) 연결된 케이스: (보호자 프로필이 없어 조회 불가)')
}

// 4) 이름/연락처로도 케이스 탐색 (프로필 링크가 끊긴 경우 대비) — 소프트삭제 포함
const { data: byName } = await sb
  .from('cases')
  .select('id, pet_name, destination, status, org_id, created_at, deleted_at, customer_name, customer_email')
  .eq('customer_email', email)
console.log(`\n4) cases.customer_email 직접 일치(삭제 포함): ${byName?.length ?? 0}건`)
for (const c of byName ?? [])
  console.log(
    `   ${c.id.slice(0, 8)}  ${c.pet_name ?? '(무명)'}  ${c.customer_name ?? ''}  목적지=${c.destination ?? '-'}  생성 ${c.created_at?.slice(0, 10)}  삭제=${c.deleted_at?.slice(0, 10) ?? '-'}`,
  )

// 5) 소프트 삭제된 케이스 전수 — 최근 것 중 이 사람 것이 있는지
const { data: del } = await sb
  .from('cases')
  .select('id, pet_name, destination, customer_name, customer_email, created_at, deleted_at')
  .not('deleted_at', 'is', null)
  .order('deleted_at', { ascending: false })
  .limit(15)
console.log(`\n5) 최근 소프트 삭제된 케이스 ${del?.length ?? 0}건 (전체):`)
for (const c of del ?? [])
  console.log(
    `   ${c.id.slice(0, 8)}  ${c.pet_name ?? '(무명)'}  ${c.customer_name ?? ''} <${c.customer_email ?? '-'}>  삭제 ${c.deleted_at?.slice(0, 16)}`,
  )

// 6) 봇 알림 원문 — 문의 시점의 맥락(목적지·트립)이 남아 있다
const { data: msgs } = await sb
  .from('messages')
  .select('content, created_at')
  .ilike('content', `%${email}%`)
  .order('created_at', { ascending: false })
  .limit(5)
console.log(`\n6) 해당 이메일이 포함된 봇 알림 ${msgs?.length ?? 0}건:`)
for (const m of msgs ?? []) console.log(`   [${m.created_at?.slice(0, 16)}] ${m.content}`)
