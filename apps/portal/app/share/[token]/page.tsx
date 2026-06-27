import { permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * 정보 입력 폼은 work(펫무브워크, admin) 도메인으로 회귀했다. portal 로 들어온
 * 구 링크(예: petmove.vercel.app/share/<token>)는 work 도메인으로 영구 redirect.
 *
 * 폼은 "스태프가 보내는 정보 수집 폼" 이라 work.petmove.co.kr 이 호스팅한다.
 * 제출 정보는 cases 테이블에 직접 반영되므로 펫무브 앱 연동은 DB 로 그대로 유지.
 *
 * NEXT_PUBLIC_WORK_BASE_URL 우선, 미설정 시 운영 도메인 하드코드 폴백.
 */
export default async function ShareLinkRedirect({ params }: Props) {
  const { token } = await params
  const base =
    process.env.NEXT_PUBLIC_WORK_BASE_URL?.replace(/\/$/, '') || 'https://work.petmove.co.kr'
  permanentRedirect(`${base}/share/${encodeURIComponent(token)}`)
}
