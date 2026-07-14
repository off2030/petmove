/* Petmove Portal Service Worker — 보수적 stale-while-revalidate + push 수신.
 *
 * 캐시 키 네임스페이스가 admin (`static-v5`, `page-v5`) 과 분리돼 두 앱이 단일
 * 도메인 dev 환경에서 열려도 캐시 충돌 없음. 도메인 분리 후엔 origin 자연 격리.
 *
 * 캐시 전략:
 *   - GET 불변 해시 자산 (_next/static) → cache-first (파일명에 해시라 안전).
 *   - GET 가변 정적 자산 (/destinations 사진·아이콘 등, 파일명 고정) → stale-while-revalidate.
 *     (cache-first 면 파일 내용이 바뀌거나 삭제돼도 옛것을 영영 줌 — 사진 교체가 반영 안 되던 버그.)
 *   - GET HTML 문서 → network-first (실패 시 cache, 캐시도 없으면 /offline 폴백).
 *   - POST / Server Actions / Supabase → 항상 network 직통.
 *
 * ⚠️ 캐시 내용을 바꾸는(사진 교체·삭제 등) 배포에서는 VERSION 을 올려 옛 캐시를 강제 폐기한다.
 */
const VERSION = 'portal-v22'
const STATIC_CACHE = `portal-static-${VERSION}`
const PAGE_CACHE = `portal-page-${VERSION}`
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

  // 불변 해시 자산 (_next/static) — cache-first (파일명 해시라 바뀌면 URL 도 바뀜)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE))
    return
  }

  // 가변 정적 자산 (사진·아이콘 등, 파일명 고정) — stale-while-revalidate
  // 캐시를 즉시 주되 뒤에서 새로 받아 갱신 → 사진 교체·삭제가 다음 로드에 반영된다.
  if (
    url.pathname.startsWith('/destinations/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(?:woff2?|ttf|otf|css|png|jpg|jpeg|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE))
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

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => cached)
  // 캐시가 있으면 즉시 반환하고 갱신은 뒤에서(위 then 이 캐시에 씀). 없으면 네트워크 대기.
  return cached || network
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
    payload = { title: '펫무브', body: event.data.text() }
  }
  const title = payload.title || '펫무브'
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
