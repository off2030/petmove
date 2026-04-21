import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Phase 2: 인증 게이팅 미들웨어.
// AUTH_ENFORCED=true 로 설정될 때만 로그인 강제.
// 설정 전에는 세션 쿠키만 갱신하고 통과시킴 (cutover 이전 안전).
const AUTH_ENFORCED = process.env.AUTH_ENFORCED === 'true'

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

  // 세션 쿠키 갱신 (AUTH_ENFORCED 여부와 무관하게 필요)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!AUTH_ENFORCED) return response

  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return response

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // super_admin 체크
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_super_admin) {
    const denyUrl = new URL('/login', request.url)
    denyUrl.searchParams.set('error', '권한이 없습니다')
    return NextResponse.redirect(denyUrl)
  }

  return response
}

export const config = {
  matcher: [
    // _next, 정적 자산, api 제외
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
