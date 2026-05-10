import { redirect, permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * 보호자 토큰 진입 흐름은 portal (apps/portal/app/share/[token]) 로 이전됨 (Phase 11.0.5).
 * 기존 admin 도메인으로 들어오는 링크는 portal 도메인으로 redirect — portal-plan.md §12
 * "한 달 유지" 권고 준수.
 *
 * NEXT_PUBLIC_PORTAL_BASE_URL 가 미설정이면 same-origin path redirect 로 fallback —
 * 단일 도메인 환경(아직 portal 도메인 분리 전) 에서도 안전.
 */
export default async function ShareLinkRedirect({ params }: Props) {
  const { token } = await params
  const base = process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.replace(/\/$/, '') ?? ''
  const target = base ? `${base}/share/${encodeURIComponent(token)}` : `/share/${encodeURIComponent(token)}`
  // 절대 URL 일 때 permanent (외부 도메인 — 검색 엔진/SNS 가 캐시), same-origin 폴백은 일반 redirect.
  if (base) permanentRedirect(target)
  redirect(target)
}
