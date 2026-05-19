'use server'

import { createClient, getCurrentUser } from '@petmove/auth/server'
import { signPreviewToken } from '@petmove/auth/preview-token'

/**
 * 펫무브(portal) 고객앱 미리보기 URL 생성.
 *
 * 케이스 상세의 "고객앱 미리보기" 가 호출 — caseId 에 대한 단기 서명 토큰을 만들어
 * portal 의 /preview/[token] 절대 URL 을 돌려준다. 클라이언트가 iframe 으로 띄운다.
 *
 * 인증: getUser + admin RLS(org_member/super_admin) 로 케이스가 보이는지 확인한 뒤에만
 * 서명한다 — 접근 권한 없는 케이스의 토큰을 만들 수 없도록.
 */
export async function createPortalPreviewUrl(caseId: string): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증이 필요합니다.' }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: '케이스를 찾을 수 없습니다.' }

    // 배포 환경에서는 NEXT_PUBLIC_PORTAL_BASE_URL 필수 — 미설정 시 로컬 dev 포털 포트로 폴백.
    const base =
      process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3002'
    return { ok: true, url: `${base}/preview/${signPreviewToken(caseId)}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
