import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@petmove/auth'
import { ensureCustomerProfile } from '@/lib/supabase/customer'

const OAUTH_NEXT_COOKIE = 'pm_oauth_next'

/** next 검증 — open redirect 방지. 같은 오리진 경로만 허용. */
function sanitizeNext(v: string | null | undefined): string {
  if (!v) return '/'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/'
  return v
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
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      )
    }

    // 첫 로그인이면 customer_profiles 생성. 실패해도 로그인 자체는 성공으로 처리.
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      try { await ensureCustomerProfile(supabase, user) } catch { /* best-effort */ }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
