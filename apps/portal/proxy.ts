import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Portal 의 인증 미들웨어. admin 의 invite-only 게이트와 다른 점:
//   - 멤버십 체크 없음 — portal 은 보호자(고객) 모두 누구나 가입·로그인 가능
//   - 토큰 기반 anon 진입 (/share/[token]) 은 추후 phase 에서 추가
//
// 현재는 최소한의 세션 refresh 만 수행하고, 보호 경로(/cases, /me, /settings) 는
// 미로그인 시 /login 으로 redirect.

const PUBLIC_PREFIXES = [
  '/login',
  '/auth/callback',
  '/api/auth',  // Naver OAuth 등 자체 라우트 — 미로그인 통과 필요
  '/terms',
  '/privacy',
  '/share',  // 토큰 진입 (Phase 11.0.5 구현 전 까지 page 자체는 없지만 미인증 통과 정의)
  '/preview', // 펫무브워크 "고객앱 미리보기" — admin 서명 토큰으로 진입 (보호자 세션 아님)
  '/offline', // SW 가 install 시 prefetch 해서 오프라인 폴백으로 사용 — 미인증 통과 필수
  '/_next',
  '/favicon',
  '/manifest.webmanifest',
  '/sw.js',
  '/apple-icon',
  '/icon',
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

  const { pathname } = request.nextUrl

  // 루트 페이지는 placeholder 라 미로그인도 통과 (Phase 11.0.7 에서 케이스 목록 또는 marketing 으로 분기).
  if (pathname === '/') return response

  if (isPublic(pathname)) return response

  // 펫무브워크 "고객앱 미리보기" — pm_preview 쿠키가 있으면 통과시킨다. 토큰 자체의
  // 검증은 (authed) layout 이 수행한다 (미들웨어는 Edge 런타임이라 node:crypto 불가).
  // 위조 쿠키는 layout 의 verify 가 실패 → getCurrentUser → /login 으로 떨어지므로 안전.
  if (request.cookies.get('pm_preview')?.value) return response

  // 보호 경로 — getUser() 로 세션 검증.
  // stale refresh token 은 throw → signOut 후 /login 으로 redirect.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
