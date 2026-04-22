import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase 클라이언트. RLS 우회 필요한 경우에만 사용.
 * 반드시 서버 환경에서만, 신뢰되는 플로우(토큰 기반 초대 수락 등)에서만 호출.
 * 사용자 입력을 직접 DB 에 주입하지 말 것.
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
