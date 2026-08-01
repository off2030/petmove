import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN_FALLBACK } from './lib/sentry-dsn'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? SENTRY_DSN_FALLBACK,
  tracesSampleRate: 0.1,
  // 리플레이 완전 미사용(2026-08-01 번들 점검) — onError 0.1 이라도 리플레이는 "에러 전
  // 화면을 되감기" 위해 처음부터 상시 녹화해야 해서 리플레이 청크가 항상 로드·실행된다
  // (클라이언트 공통 청크의 큰 몫). 개인정보·용량 이유로 안 쓰기로 했으므로 옵션 자체를
  // 제거해 번들에서 떨어뜨린다. 도입하려면 이 주석과 함께 lazy 로드 방식으로.
  enabled: process.env.NODE_ENV === 'production',
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
