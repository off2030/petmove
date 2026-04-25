import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// Naver OAuth 시작 — authorize URL 로 redirect.
// CSRF 방지: state = random nonce, cookie 에도 저장 후 callback 에서 비교.
// next 는 별도 cookie 로 callback 까지 전달.

export const dynamic = 'force-dynamic'

function sanitizeNext(v: string | null): string {
  if (!v) return '/cases'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/cases'
  return v
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = sanitizeNext(url.searchParams.get('next'))

  const clientId = process.env.NAVER_CLIENT_ID
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/login?error=naver_not_configured', url.origin),
    )
  }

  const state = randomBytes(16).toString('hex')
  const redirectUri = `${url.origin}/api/auth/naver/callback`

  const naverUrl = new URL('https://nid.naver.com/oauth2.0/authorize')
  naverUrl.searchParams.set('response_type', 'code')
  naverUrl.searchParams.set('client_id', clientId)
  naverUrl.searchParams.set('redirect_uri', redirectUri)
  naverUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(naverUrl)
  const cookieStore = await cookies()
  cookieStore.set({
    name: 'pm_naver_state',
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  cookieStore.set({
    name: 'pm_naver_next',
    value: next,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
