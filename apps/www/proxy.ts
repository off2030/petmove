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

// ── /lab/* 비공개 시안 게이트(키 주소) ───────────────────────────────────
// /lab/...?key=<키> 로 한 번 들어오면 키를 httpOnly 쿠키로 심고 ?key 를 뗀 주소로 보낸다
// (주소창·Referer 에 키가 남지 않게). 이후엔 쿠키만으로 통과. 키·쿠키가 없거나 틀리면 404 —
// 비밀 페이지가 있다는 사실 자체를 드러내지 않는다. 크롤러 예외·레이트리밋보다 먼저 건다.
//
// ⚠️ 저장소가 공개라 키 원문은 코드에 두지 않는다 — SHA-256 해시만. 키는 128비트 무작위라
//    해시에서 되돌릴 수 없다. 키를 바꾸려면 새 키의 해시로 이 값을 교체(기존 쿠키는 즉시 무효).
const LAB_KEY_SHA256 = '29234748df6534073ac3574643f2d7737c81756e7c2c0184db61195273b8fa0f'
const LAB_COOKIE = 'pm_lab'
const LAB_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' }

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function isLabKey(key: string | null | undefined): Promise<boolean> {
  if (!key || key.length > 100) return false
  return (await sha256Hex(key)) === LAB_KEY_SHA256
}

async function labGate(request: NextRequest): Promise<NextResponse> {
  const queryKey = request.nextUrl.searchParams.get('key')
  if (await isLabKey(queryKey)) {
    const clean = request.nextUrl.clone()
    clean.searchParams.delete('key')
    const res = NextResponse.redirect(clean)
    res.cookies.set(LAB_COOKIE, queryKey as string, {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/lab',
      maxAge: 60 * 60 * 24 * 365,
    })
    for (const [k, v] of Object.entries(LAB_HEADERS)) res.headers.set(k, v)
    return res
  }
  if (await isLabKey(request.cookies.get(LAB_COOKIE)?.value)) {
    const res = NextResponse.next()
    for (const [k, v] of Object.entries(LAB_HEADERS)) res.headers.set(k, v)
    return res
  }
  return new NextResponse('Not Found', { status: 404, headers: LAB_HEADERS })
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
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
