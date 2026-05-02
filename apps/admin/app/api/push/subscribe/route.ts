import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PushSubscription.toJSON() 결과 + userAgent 받아 push_subscriptions 에 upsert.
// endpoint 로 onConflict 해서 같은 디바이스 재구독 시 토큰 갱신.

export const dynamic = 'force-dynamic'

interface SubscribeBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: SubscribeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { endpoint, keys, userAgent } = body
  if (
    typeof endpoint !== 'string' ||
    !endpoint ||
    typeof keys?.p256dh !== 'string' ||
    typeof keys?.auth !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
