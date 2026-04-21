#!/usr/bin/env node
/**
 * Phase 2.6 Seoul 이관 — Auth 유저 재생성.
 * 기존(src) 프로젝트의 auth.users 를 신규(dst) 에 **동일 uuid 로** 재생성.
 * id 를 유지해야 기존 데이터의 profiles / 향후 생기는 FK 가 깨지지 않음.
 * - 임시 랜덤 비번으로 생성 → 각 유저에게 비번 재설정 메일 안내 필요
 * - profiles 는 handle_new_user 트리거가 자동 생성 — 이후 migrate-data.mjs 가 덮어씀
 *
 * 실행 전 `.env.local` 에 다음 4종 필요:
 *   NEXT_PUBLIC_SUPABASE_URL        (기존)
 *   SUPABASE_SERVICE_ROLE_KEY       (기존)
 *   NEW_SUPABASE_URL                (신규)
 *   NEW_SUPABASE_SERVICE_ROLE_KEY   (신규)
 *
 * 실행:
 *   pnpm -F admin exec node scripts/migrate-auth-users.mjs
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

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

function tempPassword() {
  // 24 바이트 → base64url → 32자 내외 — 임시용
  return randomBytes(24).toString('base64url')
}

async function migrate() {
  console.log(`src: ${SRC_URL}`)
  console.log(`dst: ${DST_URL}`)

  // 기존 유저 목록
  const { data: srcList, error: lErr } = await src.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (lErr) throw lErr
  const users = srcList.users
  console.log(`[src] ${users.length} 명 발견`)

  const summary = []

  for (const u of users) {
    console.log(`\n- ${u.email} (id: ${u.id})`)
    const pw = tempPassword()
    const { data: created, error: cErr } = await dst.auth.admin.createUser({
      id: u.id, // ★ 기존 uuid 유지 — FK 보존에 필수
      email: u.email,
      email_confirm: true,
      password: pw,
      user_metadata: u.user_metadata || {},
      app_metadata: u.app_metadata || {},
    })
    if (cErr) {
      console.error(`  [fail] create: ${cErr.message}`)
      summary.push({ email: u.email, status: 'fail', reason: cErr.message })
      continue
    }
    console.log(`  생성 (id 유지): ${created.user.id}`)

    summary.push({
      email: u.email,
      status: 'ok',
      id: created.user.id,
      tempPassword: pw,
    })
  }

  console.log('\n=== 요약 ===')
  for (const s of summary) {
    if (s.status === 'ok') {
      console.log(`[OK]  ${s.email}`)
      console.log(`      임시 비번: ${s.tempPassword}`)
    } else {
      console.log(`[FAIL] ${s.email}  — ${s.reason}`)
    }
  }
  console.log('\n안내:')
  console.log('- 임시 비번을 유저에게 전달해서 로그인 후 즉시 변경하도록 하거나')
  console.log('- Supabase Dashboard → Authentication → Users → 각 유저 … → "Send password recovery" 로 재설정 메일 발송')
  console.log('- is_super_admin 플래그는 다음 단계 migrate-data.mjs (profiles 테이블 이관) 에서 복원됨')
}

migrate().catch((e) => {
  console.error(e)
  process.exit(1)
})
