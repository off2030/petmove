import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@petmove/auth'
import { getCurrentUser } from '@petmove/auth/server'
import { verifyPreviewToken } from '@petmove/auth/preview-token'
import type { CaseRow } from '@petmove/domain'
import { BottomNav } from '@/components/portal-shell/bottom-nav'
import { CaseDataProvider } from '@/components/portal-shell/case-data-provider'
import { SwipeTabs } from '@/components/portal-shell/swipe-tabs'
import { TopBar } from '@/components/portal-shell/top-bar'
import { listMyCases } from '@/lib/actions/cases'
import { getMyProfile } from '@/lib/actions/profile'

export const dynamic = 'force-dynamic'

/**
 * 인증된 보호자 셸. 4탭 (일정/서류/정보/프로필) 공통 레이아웃.
 *
 * 일반 진입: getUser + listMyCases + getMyProfile (모두 RLS 위 단일 쿼리). CaseDataProvider
 * 가 cases + profile 을 client Context 로 공유 — 모든 탭 페이지가 추가 fetch 없이 메모리에서
 * 조회. Provider 는 (authed) 세션 동안 한 번만 마운트되어 Realtime 구독도 한 번만.
 *
 * 미리보기 진입: 펫무브워크 "고객앱 미리보기" 가 심은 pm_preview 쿠키가 유효하면, 보호자
 * 세션 없이 service-role 로 해당 케이스 한 건만 읽어 같은 셸을 읽기 전용으로 렌더한다.
 * 입력 폼은 <fieldset disabled> 로 일괄 비활성 — 네비게이션(<a>)은 그대로 동작한다.
 */
export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const previewToken = (await cookies()).get('pm_preview')?.value
  const previewPayload = previewToken ? verifyPreviewToken(previewToken) : null

  if (previewPayload) {
    const caseRow = await loadPreviewCase(previewPayload.caseId)
    return (
      <CaseDataProvider
        initialCases={caseRow ? [caseRow] : []}
        initialProfile={null}
        userEmail={null}
        previewMode
      >
        <Shell preview>{children}</Shell>
      </CaseDataProvider>
    )
  }

  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/cases')

  const [casesResult, profileResult] = await Promise.all([listMyCases(), getMyProfile()])
  const cases = casesResult.ok ? casesResult.value : []
  const profile = profileResult.ok ? profileResult.value : null

  return (
    <CaseDataProvider
      initialCases={cases}
      initialProfile={profile}
      userEmail={user.email ?? null}
    >
      <Shell>{children}</Shell>
    </CaseDataProvider>
  )
}

/** pm_preview 토큰의 caseId 로 케이스 한 건을 service-role 로 읽는다 (보호자 RLS 우회). */
async function loadPreviewCase(caseId: string): Promise<CaseRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .is('deleted_at', null)
    .maybeSingle()
  return (data as CaseRow | null) ?? null
}

function Shell({
  children,
  preview = false,
}: {
  children: React.ReactNode
  preview?: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--pm-bg)',
        color: 'var(--pm-ink)',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopBar />
      <main
        style={{
          flex: 1,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)',
          paddingBottom: 88,
        }}
      >
        <SwipeTabs>
          {preview ? (
            // 미리보기: 입력 폼(input/textarea/select/button)을 일괄 비활성 — 읽기 전용.
            // <a> 네비게이션(탭·단계 이동)은 form control 이 아니라 영향 없음.
            <fieldset
              disabled
              style={{ display: 'contents', border: 0, margin: 0, padding: 0, minInlineSize: 0 }}
            >
              {children}
            </fieldset>
          ) : (
            children
          )}
        </SwipeTabs>
      </main>
      <BottomNav />
    </div>
  )
}
