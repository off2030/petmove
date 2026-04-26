#!/usr/bin/env node
/**
 * One-off: Service role 로 특정 유저 비번 직접 설정.
 * Phase 2.6 이관 후 임시 비번 재생성된 유저용 (recovery 플로우가 아직 없음).
 *
 * 사용:
 *   pnpm -F admin exec node scripts/set-password.mjs <email> <new-password>
 *
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락')
  process.exit(1)
}

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('사용법: node scripts/set-password.mjs <email> <new-password>')
  process.exit(1)
}

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
if (listErr) {
  console.error('listUsers 실패:', listErr.message)
  process.exit(1)
}
const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`유저 없음: ${email}`)
  process.exit(1)
}

const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password })
if (updErr) {
  console.error('updateUserById 실패:', updErr.message)
  process.exit(1)
}

console.log(`✅ ${email} 비번 설정 완료 (id=${user.id})`)
