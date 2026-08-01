import * as Sentry from '@sentry/nextjs'

/** 서버 액션 catch 공용 — Sentry 보고 후 기존과 동일한 실패 Result 반환. */
export function reportActionError(e: unknown, action: string): string {
  Sentry.captureException(e, { tags: { action } })
  return e instanceof Error ? e.message : String(e)
}
