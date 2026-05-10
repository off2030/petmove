import { redirect, permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * 신규 신청 흐름은 portal (apps/portal/app/apply) 로 이전됨 (Phase 11.0.6).
 * 기존 admin URL 로 진입한 사용자는 portal 로 redirect — portal-plan.md §12 권고.
 *
 * NEXT_PUBLIC_PORTAL_BASE_URL 가 미설정이면 same-origin path redirect.
 */
export default async function ApplyRedirect() {
  const base = process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.replace(/\/$/, '') ?? ''
  const target = base ? `${base}/apply` : '/apply'
  if (base) permanentRedirect(target)
  redirect(target)
}
