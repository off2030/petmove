import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Sentry 수신 검증용 고의 에러 라우트 — GET /api/sentry-test?boom=1
 *
 * 배포 후 Sentry(petmove/portal)에 이벤트가 실제로 도착하는지 확인하는 용도.
 * boom 파라미터 없이 부르면 아무것도 던지지 않고 안내만 반환한다(크롤러·오탐 방지).
 * 민감 정보 없음 — 노출돼도 500 한 번 나는 것 외에 아무 일도 없다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  // 운영 점검 전용 키 — 비밀은 아니고(민감 정보·부작용 없음), 드라이브바이 크롤러가
  // 고의 500 을 반복 유발해 Sentry 쿼터를 태우는 것만 막는 잠금쇠(2026-08-01 리뷰 반영).
  if (url.searchParams.get('boom') === '1' && url.searchParams.get('k') === 'pm-ops') {
    throw new Error(`[sentry-test] portal error pipeline check (${new Date().toISOString()})`)
  }
  return NextResponse.json({ ok: true })
}
