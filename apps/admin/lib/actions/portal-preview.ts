'use server'

import { reportActionError } from './_report-error'
import { createClient, getCurrentUser } from '@petmove/auth/server'
import { signPreviewToken } from '@petmove/auth/preview-token'
import { parseDestinations } from '@petmove/domain'

/**
 * 펫무브 앱(portal) 미리보기 URL 생성.
 *
 * 케이스 상세의 "펫무브 앱 미리보기" 가 호출 — caseId 에 대한 단기 서명 토큰을 만들어
 * portal 의 /preview/[token] 절대 URL 을 돌려준다. 클라이언트가 iframe 으로 띄운다.
 *
 * 인증: getUser + admin RLS(org_member/super_admin) 로 케이스가 보이는지 확인한 뒤에만
 * 서명한다 — 접근 권한 없는 케이스의 토큰을 만들 수 없도록.
 *
 * `destination` = 지금 상세에서 보고 있는 여행지(절차정보 탭). portal 은 `?dest=` 로 활성
 * 여행지를 받으므로 그대로 실어 보낸다 — 안 실으면 다중 여행지 케이스가 **항상 첫 여행지**
 * 화면으로 열려, 일본 탭을 보고 있는데 하와이 여정이 떴다(2026-08-21 사용자 발견).
 * 케이스에 실제로 있는 토큰만 통과시킨다(오타·옛 값이면 조용히 무시 → 기존 동작).
 */
export async function createPortalPreviewUrl(
  caseId: string,
  destination?: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증이 필요합니다.' }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('cases')
      .select('id, destination')
      .eq('id', caseId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: '케이스를 찾을 수 없습니다.' }

    const tokens = parseDestinations((data as { destination: string | null }).destination)
    const dest = destination && tokens.includes(destination) ? destination : null

    // 배포 환경에서는 NEXT_PUBLIC_PORTAL_BASE_URL 필수 — 미설정 시 로컬 dev 포털 포트로 폴백.
    const base =
      process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3002'
    const query = dest ? `?dest=${encodeURIComponent(dest)}` : ''
    return { ok: true, url: `${base}/preview/${signPreviewToken(caseId)}${query}` }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'portal-preview.createPortalPreviewUrl') }
  }
}
