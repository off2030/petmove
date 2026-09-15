/**
 * 운송업체 안내 접점의 기록 수집구 — 화면을 떠나는 클릭 전용.
 *
 * 왜 서버 액션(logOutbound)이 아니라 라우트인가: 안내 페이지로 이동하는 버튼은 누르는
 * 즉시 화면이 바뀐다. 서버 액션은 라우터 전환에 묶여 있어 이동이 먼저 일어나면 요청이
 * 사라진다 — 실제로 2026-08-27 에 카드 버튼으로 안내 페이지까지 들어간 기록(app-guide
 * 노출) 2건이 남아 있는데 그 클릭(guide_link)은 한 건도 안 찍혔다. sendBeacon 은 화면이
 * 바뀌어도 전송이 보장되므로 이동을 동반하는 클릭은 전부 이 길로 보낸다.
 *
 * 노출(impression)은 이동이 없어 서버 액션 그대로 둔다(lib/actions/outbound.ts).
 */

import { logOutbound, type LogOutboundInput } from '@/lib/actions/outbound'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<LogOutboundInput>
    if (!body?.event || !body?.source) return new Response(null, { status: 204 })
    // 검증·저장 규칙은 서버 액션과 한 벌 — 화이트리스트가 두 군데로 갈라지지 않게.
    await logOutbound({
      event: body.event,
      source: body.source,
      stepId: body.stepId ?? null,
      partnerSlug: body.partnerSlug ?? null,
      destination: body.destination ?? null,
      caseId: body.caseId ?? null,
    })
  } catch {
    /* 기록 실패가 이동을 막지 않는다 */
  }
  return new Response(null, { status: 204 })
}
