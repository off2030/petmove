import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * 첫 로그인 시 customer_profiles row 가 없으면 보호자 본인 정보로 생성.
 * - email_normalized 는 case 매칭 키 (lower)
 * - display_name 은 OAuth provider 가 제공한 이름 또는 이메일 prefix
 *
 * 이 함수는 callback route 에서 session 교환 직후 호출. RLS 의 self_insert
 * 정책으로 본인 user_id row 만 생성 가능.
 */
export async function ensureCustomerProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  // 이미 있으면 no-op
  const { data: existing } = await supabase
    .from('customer_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return

  const email = user.email ?? null
  const emailNormalized = email ? email.toLowerCase() : null
  const metaName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null
  const displayName = metaName ?? (email ? email.split('@')[0] : null)

  await supabase.from('customer_profiles').insert({
    user_id: user.id,
    display_name: displayName,
    email_normalized: emailNormalized,
    // phone 은 사용자가 프로파일에서 직접 입력 (OAuth 가 보장 못 함)
  })
}
