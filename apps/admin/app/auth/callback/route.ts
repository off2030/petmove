import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OAUTH_NEXT_COOKIE = 'pm_oauth_next'

/** next 검증 — open redirect 방지. 같은 오리진의 경로만 허용. */
function sanitizeNext(v: string | null | undefined): string {
  if (!v) return '/cases'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/cases'
  return v
}

// OAuth redirect 돌아오는 엔드포인트. code → session 교환 후 next 로 이동.
// next 는 query string 대신 cookie (pm_oauth_next) 에서 읽음 — Supabase OAuth 의
// redirect_to allowlist 가 query 포함 URL 을 정확 매칭 못 하는 이슈 우회.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const errorDescription = url.searchParams.get('error_description')

  const cookieStore = await cookies()
  const nextFromCookie = cookieStore.get(OAUTH_NEXT_COOKIE)?.value
  const next = sanitizeNext(
    nextFromCookie ? decodeURIComponent(nextFromCookie) : url.searchParams.get('next'),
  )
  // cookie 는 1회용 — 다음 OAuth 로 누적되지 않게 즉시 제거
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
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
