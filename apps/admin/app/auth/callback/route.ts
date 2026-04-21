import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// OAuth redirect 돌아오는 엔드포인트. code → session 교환 후 next 로 이동.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/cases'
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
