'use client'

import { buildProfileView } from '@/lib/profile/catalog'
import { ProfileView } from '@/components/me/profile-view'
import { useCases } from '@/components/portal-shell/case-data-provider'

/**
 * 내 계정 (/me) — bottom-nav 의 프로필 탭. Client 컴포넌트.
 *
 * 데이터는 모두 CaseDataProvider 의 Context 에서 — 추가 fetch 없음. 진입 즉시 렌더.
 */
export default function MePage() {
  const { cases, profile, userEmail } = useCases()
  const primaryCase = cases[0] ?? null

  const data = buildProfileView({
    userEmail,
    customerProfile: profile,
    primaryCase,
  })

  return <ProfileView data={data} />
}
