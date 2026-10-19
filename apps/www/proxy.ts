import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isBlockedCrawler, isSearchCrawler } from '@/lib/crawler-policy'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 120
const MAX_BUCKETS = 10_000

type RateBucket = {
  count: number
  resetAt: number
}

const rateBuckets = new Map<string, RateBucket>()
let requestsSinceCleanup = 0

function getClientIp(request: NextRequest): string | null {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip')

  return forwarded?.split(',')[0]?.trim() || null
}

function cleanupExpiredBuckets(now: number): void {
  requestsSinceCleanup += 1
  if (requestsSinceCleanup < 500 && rateBuckets.size <= MAX_BUCKETS) return

  requestsSinceCleanup = 0
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }

  while (rateBuckets.size > MAX_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value
    if (oldestKey === undefined) break
    rateBuckets.delete(oldestKey)
  }
}

function consumeRateLimit(clientIp: string, now: number): RateBucket {
  cleanupExpiredBuckets(now)

  const current = rateBuckets.get(clientIp)
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
    rateBuckets.set(clientIp, next)
    return next
  }

  current.count += 1
  return current
}

function blockedResponse(status: 403 | 429, retryAfter?: number): NextResponse {
  const response = new NextResponse(
    status === 429 ? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '접근이 제한되었습니다.',
    {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )

  if (retryAfter !== undefined) {
    response.headers.set('Retry-After', String(retryAfter))
  }

  return response
}

// ── /lab/* 비공개 시안 게이트 ─────────────────────────────────────────────
// HTTP Basic 인증(아이디 아무거나, 비밀번호 = LAB_PASSWORD). 크롤러 예외·레이트리밋보다
// **먼저** 건다 — 검색봇 UA 를 흉내 내도 통과하지 못해야 한다.
// env 가 없으면 401 이 아니라 404 — 설정 안 된 배포에서 시안이 열리지도, 존재가 드러나지도 않게.
const LAB_REALM = 'Basic realm="petmove-lab", charset="UTF-8"'

function safeEqual(a: string, b: string): boolean {
  // 길이·내용에 따라 비교 시간이 갈리지 않게 끝까지 돈다.
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

function labGate(request: NextRequest): NextResponse {
  const secret = process.env.LAB_PASSWORD
  const noindex = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' }
  if (!secret) return new NextResponse('Not Found', { status: 404, headers: noindex })

  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0)))
      const password = decoded.slice(decoded.indexOf(':') + 1)
      if (safeEqual(password, secret)) {
        const res = NextResponse.next()
        for (const [k, v] of Object.entries(noindex)) res.headers.set(k, v)
        return res
      }
    } catch {
      /* 깨진 헤더 = 인증 실패로 처리 */
    }
  }
  return new NextResponse('인증이 필요합니다.', {
    status: 401,
    headers: { ...noindex, 'WWW-Authenticate': LAB_REALM, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === '/lab' || request.nextUrl.pathname.startsWith('/lab/')) {
    return labGate(request)
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return NextResponse.next()
  }

  const userAgent = request.headers.get('user-agent') ?? ''

  // robots.txt-compliant crawlers will not request these pages. Returning 403
  // also stops the known agents if they ignore the published policy.
  if (isBlockedCrawler(userAgent)) {
    return blockedResponse(403)
  }

  // Search indexing must not be affected. This is intentionally paired with a
  // recommendation to use Vercel's verified-bot WAF signal in production.
  if (isSearchCrawler(userAgent)) {
    return NextResponse.next()
  }

  const clientIp = getClientIp(request)
  if (!clientIp) {
    // Never group unknown clients into one shared bucket: doing so could block
    // every visitor when an upstream proxy omits forwarding headers.
    return NextResponse.next()
  }

  const now = Date.now()
  const bucket = consumeRateLimit(clientIp, now)
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    return blockedResponse(429, retryAfter)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/guide/:path*', '/docs/:path*', '/blog/:path*', '/contact/:path*', '/lab', '/lab/:path*'],
}
