import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN_FALLBACK } from './lib/sentry-dsn'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? SENTRY_DSN_FALLBACK,
  tracesSampleRate: 0.1,
  // 리플레이는 안 쓴다(개인정보·용량) — 에러 순간만 0.1 로 샘플.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
