/* Petmove Service Worker — 보수적 stale-while-revalidate.
 *
 * 목표:
 *   - 모바일 재방문 / 새로고침 시 페이지 셸과 정적 자산을 캐시에서 즉시 로드.
 *   - API / Server Action 응답은 절대 캐시하지 않음 (실시간 데이터 무결성).
 *
 * 전략:
 *   - GET 정적 자산 (_next/static, /icon.svg 등) → cache-first.
 *   - GET HTML 문서 → network-first (실패 시 cache).
 *   - POST / Server Actions / Supabase → 항상 network 직통.
 */
const VERSION = 'v1'
const STATIC_CACHE = `static-${VERSION}`
const PAGE_CACHE = `page-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // 다른 origin (Supabase, Sentry 등) 은 패스
  if (url.origin !== self.location.origin) return

  // 정적 자산 — cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(?:woff2?|ttf|otf|css|js|png|jpg|jpeg|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE))
    return
  }

  // HTML 문서 — network-first, 실패 시 cache 폴백
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(req, PAGE_CACHE))
  }
})

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch (e) {
    return new Response('offline', { status: 503 })
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch (e) {
    const cached = await cache.match(req)
    if (cached) return cached
    return new Response('offline', { status: 503 })
  }
}
