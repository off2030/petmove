import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// 인증 게이팅 미들웨어. 공개 경로 외 전부 로그인 필수.
// 세밀한 접근 통제(org 소속 등)는 RLS 가 담당.

const PUBLIC_PREFIXES = [
  '/login',
  '/auth/callback',
  '/logout',
  '/apply',
  '/_next',
  '/favicon',
  '/public',
]

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() 는 내부적으로 refresh 를 시도한다. 구 환경(Mumbai 등)의 stale
  // refresh token 이 쿠키에 남아있으면 "Invalid Refresh Token" 으로 throw 하고
  // Next.js 에러 오버레이가 뜬다. 공개 경로는 auth 체크 자체를 건너뛰고,
  // 보호 경로에서 실패하면 쿠키를 정리하며 /login 으로 보낸다.
  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return response

  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    // stale / invalid refresh token — signOut 으로 쿠키 제거 후 /login
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // _next, 정적 자산, api 제외
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
