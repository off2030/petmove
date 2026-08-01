import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN_FALLBACK } from './lib/sentry-dsn'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? SENTRY_DSN_FALLBACK,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
})
