/**
 * 외부 업체 접점(운송업체 견적 페이지)의 노출·클릭 기록 — www 쪽 수집구.
 *
 * apps/www 는 Supabase SDK 를 안 쓴다(의존성 최소). PostgREST 에 fetch 로 직접 INSERT 한다.
 * outbound_clicks 는 RLS 정책이 없는 service-role 전용 테이블이라 서비스 키가 필요하고,
 * 이 라우트는 서버에서만 실행되므로 키가 브라우저로 나가지 않는다.
 *
 * env 가 없으면(로컬 개발·미설정 배포) 조용히 통과시킨다 — 기록이 안 될 뿐, 페이지는 정상.
 * 기록 실패로 사용자의 연락을 막을 이유가 없다.
 */

const EVENTS = new Set(['impression', 'tel', 'mail'])
const SOURCES = new Set(['www-quote'])
const SLUGS = new Set(['petairline', 'worldpettour'])

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return new Response(null, { status: 204 })

    const body = (await req.json()) as {
      event?: string
      source?: string
      partnerSlug?: string | null
    }
    const event = body.event ?? ''
    const source = body.source ?? ''
    if (!EVENTS.has(event) || !SOURCES.has(source)) return new Response(null, { status: 204 })

    // 테이블 제약: impression 은 slug 없음, 클릭은 반드시 알려진 업체.
    const slug = event === 'impression' ? null : (body.partnerSlug ?? '')
    if (event !== 'impression' && !SLUGS.has(slug as string)) return new Response(null, { status: 204 })

    await fetch(`${url}/rest/v1/outbound_clicks`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ event, source, partner_slug: slug }),
    })
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 204 })
  }
}
