/* Petmove Service Worker — 보수적 stale-while-revalidate + push 수신.
 *
 * 캐시 전략:
 *   - GET 정적 자산 (_next/static, /icon.svg 등) → cache-first.
 *   - GET HTML 문서 → network-first (실패 시 cache, 캐시도 없으면 /offline 폴백).
 *   - POST / Server Actions / Supabase → 항상 network 직통.
 *
 * Push:
 *   - 'push' event → 알림 표시 (payload: { title, body, url, tag })
 *   - 'notificationclick' event → 해당 URL 열기 (이미 열린 탭이면 focus)
 *   - 발송 인프라(VAPID, web-push, push_subscriptions 테이블)는 별도 작업.
 */
const VERSION = 'v4'
const STATIC_CACHE = `static-${VERSION}`
const PAGE_CACHE = `page-${VERSION}`
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // 오프라인 폴백 페이지 미리 캐싱 — 실패해도 SW 활성화는 진행.
      try {
        const cache = await caches.open(STATIC_CACHE)
        await cache.add(OFFLINE_URL)
      } catch {
        /* ignore — offline 라우트가 아직 없거나 네트워크 불가 */
      }
      await self.skipWaiting()
    })(),
  )
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
    // 캐시도 없을 때 — 오프라인 폴백 페이지
    const staticCache = await caches.open(STATIC_CACHE)
    const offline = await staticCache.match(OFFLINE_URL)
    if (offline) return offline
    return new Response('offline', { status: 503 })
  }
}

// ─── Push 알림 수신 ──────────────────────────────────────────────────
// payload 예시: { title: "새 메시지", body: "...", url: "/messages/123", tag: "msg-123" }
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: '펫무브워크', body: event.data.text() }
  }
  const title = payload.title || '펫무브워크'
  const options = {
    body: payload.body || '',
    icon: '/icon',
    badge: '/icon',
    // tag 동일하면 같은 알림 갱신 (중복 알림 방지)
    tag: payload.tag || 'default',
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 알림 탭 → 관련 URL 열기. 이미 열린 탭 있으면 focus + 네비게이션.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(url)
            } catch {
              /* cross-origin 등 navigate 실패 시 그냥 focus 만 */
            }
          }
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url)
      }
    })(),
  )
})
