import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase 클라이언트. RLS 우회 필요한 경우에만 사용.
 *
 * 반드시 서버 환경에서만 호출. 사용 시점:
 *   - 토큰 기반 초대 수락 (admin 의 /invite/[token])
 *   - 토큰 기반 anon 진입 (portal 의 /share/[token], /apply)
 *   - 백필·import 스크립트 등 신뢰된 자동화 플로우
 * 사용자 입력 필드는 화이트리스트 검증 후에만 DB 에 주입.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env 누락 — service role client 사용 불가')
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
