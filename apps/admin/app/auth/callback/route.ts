import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** next 파라미터 검증 — open redirect 방지. 같은 오리진의 경로만 허용. */
function sanitizeNext(v: string | null): string {
  if (!v) return '/cases'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/cases'
  return v
}

// OAuth redirect 돌아오는 엔드포인트. code → session 교환 후 next 로 이동.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = sanitizeNext(url.searchParams.get('next'))
  const errorDescription = url.searchParams.get('error_description')

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
