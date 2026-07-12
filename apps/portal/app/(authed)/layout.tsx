import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@petmove/auth'
import { getCurrentUser } from '@petmove/auth/server'
import { verifyPreviewToken } from '@petmove/auth/preview-token'
import type { CaseRow } from '@petmove/domain'
import { BottomNav } from '@/components/portal-shell/bottom-nav'
import { CaseDataProvider } from '@/components/portal-shell/case-data-provider'
import { CaseSwipe } from '@/components/portal-shell/case-swipe'
import { TopBar } from '@/components/portal-shell/top-bar'
import { listMyCases } from '@/lib/actions/cases'
import { ensureMyProfile } from '@/lib/actions/profile'
import { getPartnerOrgsByIds, listAvailableOrgs } from '@/lib/actions/partners'

export const dynamic = 'force-dynamic'

/**
 * 인증된 보호자 셸. 4탭 (일정/서류/서비스/내 정보) 공통 레이아웃.
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
        initialPartners={{ vet: null, transport: null }}
        initialTransportAvailable={false}
        userEmail={null}
        previewMode
      >
        <Shell preview>{children}</Shell>
      </CaseDataProvider>
    )
  }

  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/cases')

  // ensureMyProfile: 프로필 행이 없으면(Apple 로그인이 /auth/callback 을 우회해 생성 안 됨)
  // 진입 시 자가 생성 — 아바타·설정 저장이 "프로파일을 찾을 수 없습니다"로 실패하던 것 해소.
  const [casesResult, profileResult] = await Promise.all([listMyCases(), ensureMyProfile()])
  const cases = casesResult.ok ? casesResult.value : []
  const profile = profileResult.ok ? profileResult.value : null

  // 담당 병원·운송 카드도 첫 진입에 같이 채운다 — cases 에 이미 있는 org_id 로 organizations
  // 한 번만 조회. client useEffect 로 따로 fetch 하던 [내 정보] 병원 카드의 "빈칸→이름→로고"
  // 3단 깜빡임을 없애기 위함. 미연결이면 쿼리 자체를 건너뜀.
  const primary = cases[0] ?? null
  // 담당 운송업체 메뉴는 선택 가능한 운송 조직이 하나라도 있을 때만 노출한다(없으면 빈
  // 선택지를 보여주는 미완성 인상 방지). 카탈로그 유무를 partners 조회와 병렬로 미리 읽어
  // 내려보내, client 에서 따로 fetch 하지 않고 깜빡임 없이 섹션을 숨긴다.
  const [partnersResult, transportOrgsResult] = await Promise.all([
    primary
      ? getPartnerOrgsByIds(primary.org_id ?? null, primary.transport_org_id ?? null)
      : Promise.resolve(null),
    listAvailableOrgs('transport'),
  ])
  const partners = partnersResult?.ok ? partnersResult.value : { vet: null, transport: null }
  const transportAvailable = transportOrgsResult.ok && transportOrgsResult.value.length > 0

  return (
    <CaseDataProvider
      initialCases={cases}
      initialProfile={profile}
      initialPartners={partners}
      initialTransportAvailable={transportAvailable}
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
        // WKWebView 의 루트 문서를 스크롤시키면 iOS rubber-band 중 position:fixed
        // 상·하단 바도 함께 움직여 보인다. 앱 셸은 viewport 에 고정하고 main 만
        // 스크롤시켜 고정 바를 WebView 루트 바운스에서 분리한다.
        height: '100dvh',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopBar />
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehaviorY: 'none',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(var(--pm-top-inset) + 48px)',
          paddingBottom: 88,
        }}
      >
        {/* 좌우 스와이프 = 동물 전환 (준비·서류에서만) — 옛 탭 스와이프는 제거,
            탭 이동은 하단 바 탭으로만 (2026-07-12 사용자 확정). */}
        <CaseSwipe>
          {preview ? (
            // 미리보기: 입력 폼(input/textarea/select)과 액션 버튼만 비활성 — 읽기 전용.
            // 단, '세부 정보' 펼침 토글([data-preview-allow])은 동작을 유지해 내용을 볼 수 있게 한다.
            // (이전엔 <fieldset disabled> 라 내부 <button> 까지 모두 막혀 펼침이 안 됐음.)
            // <a> 네비게이션(탭·단계 이동)은 영향 없음.
            <div className="pm-preview-ro" style={{ display: 'contents' }}>
              {children}
            </div>
          ) : (
            children
          )}
        </CaseSwipe>
      </main>
      <BottomNav />
    </div>
  )
}
