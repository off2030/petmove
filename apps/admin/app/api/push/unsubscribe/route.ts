import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 디바이스의 endpoint 로 push_subscriptions 에서 행 제거.
// RLS 가 user_id = auth.uid() 를 강제하므로 본인 행만 삭제 가능.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { endpoint?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const endpoint = body.endpoint
  if (typeof endpoint !== 'string' || !endpoint) {
    return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
