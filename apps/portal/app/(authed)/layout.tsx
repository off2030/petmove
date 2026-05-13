import { redirect } from 'next/navigation'
import { createAdminClient } from '@petmove/auth'
import { createClient } from '@petmove/auth/server'
import { BottomNav } from '@/components/portal-shell/bottom-nav'
import { SwipeTabs } from '@/components/portal-shell/swipe-tabs'
import { TopBar } from '@/components/portal-shell/top-bar'
import { autoLinkCasesByEmail } from '@/lib/supabase/customer'

export const dynamic = 'force-dynamic'

/**
 * 인증된 보호자 셸. 4탭 (여정/서류/정보/프로필) 공통 레이아웃.
 * 여정/서류/정보 는 케이스 컨텍스트 안 (`/cases/[id]/`), 프로필은 `/me` (case 외).
 *
 * - 미로그인 시 /login 으로 리다이렉트 (proxy.ts 가 1차 방어, 여기서 2차 안전망).
 * - 매 진입마다 autoLinkCasesByEmail 재호출 — admin 에서 이메일이 추가/변경되면
 *   portal 다음 진입에서 즉시 case_customer_links 동기화. idempotent (PK 충돌 무시).
 *   실패해도 화면 자체는 정상 렌더 (best-effort).
 * - 하단 BottomNav 고정. 본문 paddingBottom 으로 nav 만큼 공간 확보.
 * - 배경은 Stone 베이지 (Calm 톤). 화면별 컴포넌트가 같은 색을 풀-블리드 사용.
 */
export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    user = null
  }
  if (!user) redirect('/login?next=/cases')

  try {
    const admin = createAdminClient()
    await autoLinkCasesByEmail(admin, user)
  } catch {
    /* best-effort — 실패해도 화면 그대로 */
  }

  return (
    <div
      style={{
        background: '#F5EFE8',
        color: '#2A2620',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopBar />
      <main
        style={{
          flex: 1,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 44px)',
          paddingBottom: 88,
        }}
      >
        <SwipeTabs>{children}</SwipeTabs>
      </main>
      <BottomNav />
    </div>
  )
}
