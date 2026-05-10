import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase 클라이언트. RLS 우회 필요한 경우에만 사용.
 * 토큰 기반 anon 접근 (/share/[token] 등) 에서 case·share-link 직접 조회/수정.
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
