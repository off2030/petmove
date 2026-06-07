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
  '/apply/',  // 조직별 공개 신청폼 (/apply/<slug>) — 병원 손님이 로그인 없이 작성.
              // 슬래시 포함이라 직영 '/apply'(정확히) 는 매칭 안 됨 → 직영은 로그인 유지.
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

/**
 * 세션 검증 실패가 "일시 오류"(네트워크 끊김·서버 5xx·타임아웃·절전 복귀 직후)인지 판별.
 *
 * true 면 세션을 건드리지 않고 통과시켜 불필요한 강제 로그아웃을 막는다 (페이지의
 * getCurrentUser 가 한 번 더 검증하므로 보안 우회는 아님).
 *
 * false = 진짜 인증 실패: 세션 없음(AuthSessionMissingError) 또는 토큰 폐기/무효
 * (AuthApiError, 보통 status 400/401/403). 이때만 /login 으로 보낸다.
 *
 * 과거엔 둘을 구분 못 해 일시 오류에도 로그인 화면으로 쫓아내, "오래 두었다 새로고침하면
 * 로그아웃" 버그의 한 축이었다.
 */
function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: string; status?: number }
  if (e.name === 'AuthSessionMissingError') return false
  if (typeof e.status === 'number' && e.status >= 400 && e.status < 500) return false
  // 그 외(네트워크 끊김·타임아웃·5xx·status 없음)는 일시 오류로 간주 — 세션 유지.
  return true
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
  //
  // getUser() 는 만료된 access token 을 refresh token 으로 자동 갱신한다(성공 시 setAll 로
  // 새 쿠키를 response 에 심음). 갱신이 실패하는 경우는 둘로 갈린다:
  //   (a) 일시 오류 — 네트워크 끊김·서버 5xx·절전 복귀 직후. 곧 회복되고 세션은 멀쩡.
  //   (b) 진짜 무효 — 세션 없음·refresh token 폐기. 로그인 필요.
  // (a) 는 통과시키고(세션 유지), (b) 만 /login 으로 보낸다. signOut() 은 호출하지 않는다
  // — 일시 오류를 영구 로그아웃으로 만들고, getUser 가 진짜 무효 시엔 이미 쿠키를 정리한다.
  const loginRedirect = () => {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  let result
  try {
    result = await supabase.auth.getUser()
  } catch (err) {
    // getUser 가 던지는 예외는 대개 네트워크 계열 — 일시 오류면 통과(fail-open).
    return isTransientAuthError(err) ? response : loginRedirect()
  }

  if (result.data.user) return response

  // user 없음 — 에러 종류로 분기. 일시 오류면 세션 유지하고 통과.
  return isTransientAuthError(result.error) ? response : loginRedirect()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
