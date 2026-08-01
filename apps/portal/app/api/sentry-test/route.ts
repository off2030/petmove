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
  if (url.searchParams.get('boom') === '1') {
    throw new Error(`[sentry-test] portal error pipeline check (${new Date().toISOString()})`)
  }
  return NextResponse.json({ ok: true, hint: 'add ?boom=1 to throw a test error' })
}
