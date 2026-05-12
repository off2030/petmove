import { createClient } from '@petmove/auth/server'
import { getMyProfile } from '@/lib/actions/profile'
import { listMyCases } from '@/lib/actions/cases'
import { buildProfileView } from '@/lib/profile/catalog'
import { ProfileView } from '@/components/me/profile-view'

export const dynamic = 'force-dynamic'

/**
 * 내 계정 (/me) — bottom-nav 의 프로필 탭. case-외.
 *
 * 시각: docs/portal-preview/app.jsx 의 `Profile`. Stone 톤.
 * 데이터:
 *   - auth.user → 이메일
 *   - customer_profiles → display_name / phone / preferred_language / marketing_opt_in
 *   - listMyCases() 첫 행 → hero pet 줄 + (Phase 11.1 이후) partner 정보
 */
export default async function MePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [profileResult, casesResult] = await Promise.all([getMyProfile(), listMyCases()])

  const customerProfile = profileResult.ok ? profileResult.value : null
  const cases = casesResult.ok ? casesResult.value : []
  const primaryCase = cases[0] ?? null

  const data = buildProfileView({
    userEmail: user?.email ?? null,
    customerProfile,
    primaryCase,
  })

  return <ProfileView data={data} />
}
