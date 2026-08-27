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

// 'guide_link' = 다른 글에서 운송업체 안내 페이지로 들어온 클릭. 업체를 지목하지 않는다.
const EVENTS = new Set(['impression', 'tel', 'mail', 'web', 'guide_link'])
// 'www-article' = 홈페이지 글 본문의 링크. 어느 글인지는 stepId(글 슬러그)로 가른다 —
//   링크가 늘 때마다 source 를 늘리면 집계 축이 쪼개진다.
const SOURCES = new Set(['www-quote', 'www-article'])
const SLUGS = new Set(['petairline', 'worldpettour'])

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return new Response(null, { status: 204 })

    const body = (await req.json()) as {
      event?: string
      source?: string
      /** 출처 글 슬러그. 어느 글에서 눌렀는지 가르는 값. */
      stepId?: string | null
      partnerSlug?: string | null
    }
    const event = body.event ?? ''
    const source = body.source ?? ''
    if (!EVENTS.has(event) || !SOURCES.has(source)) return new Response(null, { status: 204 })

    // 테이블 제약: impression·guide_link 는 업체를 지목하지 않고, 나머지는 반드시 알려진 업체.
    const partnerless = event === 'impression' || event === 'guide_link'
    const slug = partnerless ? null : (body.partnerSlug ?? '')
    if (!partnerless && !SLUGS.has(slug as string)) return new Response(null, { status: 204 })

    await fetch(`${url}/rest/v1/outbound_clicks`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event,
        source,
        partner_slug: slug,
        step_id: typeof body.stepId === 'string' ? body.stepId.slice(0, 80) : null,
      }),
    })
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 204 })
  }
}
