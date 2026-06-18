import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@petmove/auth'
import { createClient } from '@petmove/auth/server'
import { autoLinkCasesByEmail, ensureCustomerProfile } from '@/lib/supabase/customer'

const OAUTH_NEXT_COOKIE = 'pm_oauth_next'

/** next 검증 — open redirect 방지. 같은 오리진 경로만 허용. */
function sanitizeNext(v: string | null | undefined): string {
  if (!v) return '/'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/'
  return v
}

/**
 * Kakao API 직접 조회 — 프로필 사진 URL. 기본 이미지/미설정이면 null.
 * Supabase 가 Kakao 사진을 user_metadata 에 안 넣어주는 경우가 있어 provider_token 으로 직접.
 * best-effort.
 */
async function fetchKakaoProfileImage(providerToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${providerToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as {
      kakao_account?: { profile?: { profile_image_url?: string; is_default_image?: boolean } }
      properties?: { profile_image?: string }
    }
    const prof = j.kakao_account?.profile
    if (prof?.is_default_image) return null
    const u = prof?.profile_image_url ?? j.properties?.profile_image ?? null
    return typeof u === 'string' && /^https:\/\//.test(u) ? u : null
  } catch {
    return null
  }
}

// OAuth/Magic-link redirect 돌아오는 엔드포인트.
//   1. code → session 교환
//   2. customer_profiles row 가 없으면 생성 (보호자 첫 로그인)
//   3. next 로 redirect (cookie 우선, 없으면 query, 없으면 '/')
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const errorDescription = url.searchParams.get('error_description')

  const cookieStore = await cookies()
  const nextFromCookie = cookieStore.get(OAUTH_NEXT_COOKIE)?.value
  const next = sanitizeNext(
    nextFromCookie ? decodeURIComponent(nextFromCookie) : url.searchParams.get('next'),
  )
  if (nextFromCookie) cookieStore.delete(OAUTH_NEXT_COOKIE)

  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription)}`, url.origin),
    )
  }

  if (code) {
    const supabase = await createClient()
    const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      )
    }

    // 첫 로그인이면 customer_profiles 생성. 실패해도 로그인 자체는 성공으로 처리.
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // 카카오는 user_metadata 에 사진이 안 담겨오는 경우가 있어 provider_token 으로 직접 조회.
      // 구글은 user_metadata(avatar_url/picture) 로 충분 → ensureCustomerProfile 내부 처리.
      let kakaoAvatar: string | null = null
      if (user.app_metadata?.provider === 'kakao' && exchangeData.session?.provider_token) {
        kakaoAvatar = await fetchKakaoProfileImage(exchangeData.session.provider_token)
      }
      try { await ensureCustomerProfile(supabase, user, { avatarUrl: kakaoAvatar }) } catch { /* best-effort */ }
      // 자동 매칭 — 보호자 이메일과 일치하는 기존 admin 케이스를 case_customer_links 로 연결.
      // service role 우회 (RLS insert 는 org_member 만 허용이라).
      try {
        const admin = createAdminClient()
        await autoLinkCasesByEmail(admin, user)
      } catch { /* best-effort */ }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
