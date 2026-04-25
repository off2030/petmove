import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

// 임시 — Sentry 연동 검증용. 검증 후 삭제.
export async function GET() {
  const err = new Error('[sentry-test] intentional error for Sentry verification')
  Sentry.captureException(err)
  await Sentry.flush(2000)
  return NextResponse.json({
    ok: true,
    sent: true,
    dsn_configured: Boolean(process.env.SENTRY_DSN),
    node_env: process.env.NODE_ENV,
  })
}
