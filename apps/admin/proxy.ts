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

// 인증은 필요하지만 멤버십 0 인 신규 사용자도 진입 가능한 경로.
// 초대 수락 페이지가 대표적 — 멤버십을 *얻기 위한* 페이지라 게이트로 막으면 데드락.
// /set-password 도 우회 — magic link 가입 직후 멤버십 받기 전 거칠 수 있음.
const NO_MEMBERSHIP_OK_PREFIXES = ['/invite', '/set-password']

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

function bypassMembershipGate(pathname: string) {
  return NO_MEMBERSHIP_OK_PREFIXES.some((p) => pathname.startsWith(p))
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

  // Invite-only 게이트: 멤버십 0 + super_admin 아님 → 차단.
  // 외부인이 OAuth 로 들어와도 빈 화면 대신 /login?error=invite_required 로 보냄.
  // 초대 수락 진행 중인 /invite/* 는 우회.
  if (!bypassMembershipGate(pathname)) {
    const [profRes, memRes] = await Promise.all([
      supabase.from('profiles').select('is_super_admin, password_set').eq('id', user.id).maybeSingle(),
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    const isSuperAdmin = !!profRes.data?.is_super_admin
    const memberCount = memRes.count ?? 0

    // 비밀번호 강제 가드 — magic link 로 가입한 이메일 사용자는 비번 설정 후 진행.
    // OAuth-only (예: Google 만 사용) 가입자는 user.app_metadata.providers 에 'email' 없음 → 우회.
    // /set-password 자체는 NO_MEMBERSHIP_OK_PREFIXES 로 위에서 우회됨.
    const providers: string[] = (user.app_metadata?.providers as string[] | undefined) ?? []
    const isEmailUser = providers.includes('email')
    const passwordSet = (profRes.data as { password_set?: boolean } | null)?.password_set ?? false
    if (isEmailUser && !passwordSet && pathname !== '/set-password') {
      const url = new URL('/set-password', request.url)
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    if (!isSuperAdmin && memberCount === 0) {
      try { await supabase.auth.signOut() } catch { /* ignore */ }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'invite_required')
      const redirectRes = NextResponse.redirect(loginUrl)
      // supabase signOut() 이 만료시킨 cookies 를 redirect 응답에 복사.
      // (NextResponse.next 로 만들어진 `response` 에만 반영돼 있어서 그대로면 cookie 가 안 사라짐)
      response.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value, {
          path: '/',
          expires: new Date(0),
          maxAge: 0,
        })
      })
      return redirectRes
    }
  }

  return response
}

export const config = {
  matcher: [
    // _next, 정적 자산, api 제외
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
