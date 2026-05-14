import { redirect } from 'next/navigation'
import { getCurrentUser } from '@petmove/auth/server'
import { BottomNav } from '@/components/portal-shell/bottom-nav'
import { CaseDataProvider } from '@/components/portal-shell/case-data-provider'
import { SwipeTabs } from '@/components/portal-shell/swipe-tabs'
import { TopBar } from '@/components/portal-shell/top-bar'
import { listMyCases } from '@/lib/actions/cases'
import { getMyProfile } from '@/lib/actions/profile'

export const dynamic = 'force-dynamic'

/**
 * 인증된 보호자 셸. 4탭 (여정/서류/정보/프로필) 공통 레이아웃.
 *
 * 서버 fetch 는 최소 — getUser + listMyCases + getMyProfile (모두 RLS 위 단일 쿼리).
 * autoLinkCasesByEmail 은 auth callback 에서만 (가입 직후) — 매 레이아웃 렌더링마다 100-300ms
 * 추가되는 비용을 제거. 기존 사용자에게 admin 이 새 케이스를 link 한 경우는 Realtime push +
 * focus refetch 가 커버.
 *
 * CaseDataProvider 가 cases + profile 을 client Context 로 공유 — 모든 탭 페이지(/me 포함)가
 * 추가 fetch 없이 메모리에서 조회. Provider 는 (authed) 세션 동안 한 번만 마운트되어 Realtime
 * 구독도 한 번만.
 */
export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/cases')

  const [casesResult, profileResult] = await Promise.all([listMyCases(), getMyProfile()])
  const cases = casesResult.ok ? casesResult.value : []
  const profile = profileResult.ok ? profileResult.value : null

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
        <CaseDataProvider
          initialCases={cases}
          initialProfile={profile}
          userEmail={user.email ?? null}
        >
          <SwipeTabs>{children}</SwipeTabs>
        </CaseDataProvider>
      </main>
      <BottomNav />
    </div>
  )
}
