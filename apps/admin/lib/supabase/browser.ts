import { createBrowserClient } from '@supabase/ssr'

/**
 * 펫무브워크(admin) 전용 브라우저 Supabase 클라이언트.
 *
 * 공유 `@petmove/auth` 의 supabaseBrowser 와 딱 한 가지가 다르다: **autoRefreshToken: false**.
 * (공유 클라이언트는 다른 곳에서도 쓰일 수 있으므로 건드리지 않고, admin 만 이 로컬 클라이언트로 교체한다.)
 *
 * 왜 끄나 — 토큰 갱신 주체를 "서버(proxy.ts 미들웨어)" 한 곳으로 모으기 위해서다.
 * 회전(refresh token rotation)이 켜진 상태에서 갱신 주체가 둘(서버 + 브라우저)이면,
 * 탭이 오래 백그라운드에 얼어 있다가(대기상태/절전 복귀) 깨어나는 순간 브라우저의 **주기적
 * 자동갱신 타이머**가 어긋난 시점에 발동해 서버 갱신분과 충돌 → 한쪽이 이미 회전된 refresh
 * token 을 제시 → "Already Used" 거부 → 세션 삭제 → 로그아웃. "오래 두었다가 깨우면
 * 로그아웃"의 한 축. (펫무브 portal 에 먼저 적용해 검증된 수정을 admin 에도 동일 적용.)
 *
 * autoRefreshToken: false 는 **주기적 타이머만** 끈다. getSession/getUser/스토리지 호출 시
 * access token 이 만료돼 있으면 그 자리에서(on-demand) 쿠키의 refresh token 으로 갱신하는
 * 동작은 그대로다. 이 on-demand 갱신은 실제 사용 시점(네비게이션·복귀)에만 일어나 서버
 * 갱신과 같은 순간이므로 10초 reuse 창 안에서 안전하다. → 회전은 켜둔 채 충돌만 제거.
 *
 * persistSession 은 기본값(true) 유지 — 서버(SSR)와 쿠키로 세션을 공유해야 하므로 필수.
 */
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: { autoRefreshToken: false },
  },
)
