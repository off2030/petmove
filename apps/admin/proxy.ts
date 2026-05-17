import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// 인증 게이팅 미들웨어. 공개 경로 외 전부 로그인 필수.
// 세밀한 접근 통제(org 소속 등)는 RLS 가 담당.

const PUBLIC_PREFIXES = [
  '/login',
  '/auth/callback',
  '/api/auth',  // OAuth 시작/callback 라우트 — 미로그인 통과
  '/logout',
  '/apply',
  '/invite',  // 미로그인 사용자도 InviteJoin 카드 보고 OAuth/magic link 선택 가능해야 함
  '/share',   // 외부 정보 입력용 매직 링크 — 토큰 게이팅, 비인증 통과
  '/_next',
  '/favicon',
  '/public',
  '/manifest.webmanifest',  // PWA manifest — 미로그인에도 brower 가 fetch
  '/sw.js',  // Service Worker — origin scope 등록 위해 미로그인 통과 필요
  '/apple-icon',  // app/apple-icon.tsx 동적 생성 — iOS 홈 화면 아이콘 (확장자 없어 matcher 통과)
  '/icon',  // app/icon.tsx 동적 생성 — 일반 favicon/Android 아이콘 PNG
  '/offline',  // SW 가 install 시 prefetch 해서 오프라인 폴백으로 사용 — 미인증 통과 필수
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

/**
 * 최상위 문서 내비게이션(주소창 입력·새로고침·링크 클릭 → 전체 페이지 로드)인지 판별.
 *
 * 인증 실패 시 redirect 를 *문서 내비게이션에만* 내보내기 위한 게이트.
 * 서버액션 POST 의 redirect 는 Next 라우터가 내비게이션으로 따라가, SPA 가
 * /login 으로 갔다 되돌아오며 (dashboard) 레이아웃이 리마운트 → 화면 상태가
 * 통째로 소실된다(상세페이지가 메모리 상태라 목록으로 튕김). RSC·prefetch·fetch 도 동일.
 *
 * Sec-Fetch-Mode 는 브라우저가 강제 부착하는 헤더(JS 위조 불가). 구형 브라우저로
 * 헤더가 없으면 RSC/서버액션을 명시 제외 후 Accept 로 폴백.
 */
function isDocumentNavigation(request: NextRequest): boolean {
  const mode = request.headers.get('sec-fetch-mode')
  if (mode) return mode === 'navigate'
  if (request.headers.get('rsc') === '1') return false
  if (request.headers.has('next-action')) return false
  return request.headers.get('accept')?.includes('text/html') ?? false
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
  if (isPublic(pathname)) return response

  // getUser() 는 내부적으로 refresh 를 시도하며, stale/경쟁 refresh token 으로
  // throw 할 수 있다 — 이는 "미인증"이 아니라 일시적 실패일 수 있다. 따라서 throw 시
  // signOut() 으로 세션을 파괴하지 않는다(네트워크 블립에 멀쩡한 세션이 날아가는 것
  // 방지). throw 든 user=null 이든 아래 단일 분기에서 처리한다.
  let user = null
  try {
    user = (await supabase.auth.getUser()).data.user
  } catch {
    /* 일시적 실패 가능 — user=null 로 두고 아래 공통 처리 */
  }

  // 인증 실패 처리. redirect 는 *문서 내비게이션에만* — 일시적 실패였다면 /login 이
  // 재검증 후 next 로 되돌려보낸다(전체 로드라 잃을 SPA 상태가 없다). 서버액션·RSC 등
  // 백그라운드 요청은 redirect 없이 통과 — 라우터가 redirect 를 내비게이션으로 따라가며
  // 생기는 "상세페이지 → 홈 튕김"을 차단한다. 데이터 노출 없음: 실제 경계는 RLS.
  if (!user) {
    if (!isDocumentNavigation(request)) return response
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 멤버십·비번 게이트도 redirect 를 내보내므로 동일 원칙 — 문서 내비게이션이 아니면
  // 게이트 자체를 건너뛴다(불필요한 DB 조회 2건도 절약). user 는 위에서 확정됨.
  if (!isDocumentNavigation(request)) return response

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

    // 비밀번호 강제 가드 — magic link 만 가입한 사용자는 비번 설정 후 진행.
    // OAuth provider (google/naver/kakao) 도 가지고 있으면 우회 — 그쪽으로 매번 로그인 가능.
    // /set-password 자체는 NO_MEMBERSHIP_OK_PREFIXES 로 위에서 우회됨.
    const providers: string[] = (user.app_metadata?.providers as string[] | undefined) ?? []
    const hasOnlyEmailProvider = providers.length > 0 && providers.every((p) => p === 'email')
    const passwordSet = (profRes.data as { password_set?: boolean } | null)?.password_set ?? false
    if (hasOnlyEmailProvider && !passwordSet && pathname !== '/set-password') {
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
    // _next 빌드 산출물·favicon·정적 이미지만 제외. /api/* 는 의도적으로 포함 —
    // /api/auth/* (OAuth 시작/callback) 가 PUBLIC_PREFIXES 통과해야 미로그인
    // 사용자도 도달 가능하기 때문. 그 외 보호된 API 도 동일 게이트로 처리.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|otf|woff|woff2|ttf)$).*)',
  ],
}
