import { NextResponse } from 'next/server'

// 임시 — Sentry 연동 검증용. 검증 후 삭제.
export async function GET() {
  throw new Error('[sentry-test] intentional error for Sentry verification')
  // eslint-disable-next-line no-unreachable
  return NextResponse.json({ ok: true })
}
