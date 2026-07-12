import type { useRouter } from 'next/navigation'

/**
 * 탭(pane) 라우트 판정 + 무(無)네비게이션 전환.
 *
 * 하단 5탭의 루트 화면(준비·서류·맡기기·내 정보·더보기)은 TabHost 가 전부 mount 해 두고
 * 보이기/숨기기만 전환한다. 이 화면들로의 이동은 Next 라우터 네비게이션(서버 RSC 왕복 +
 * 페이지 재mount)이 아니라 history.pushState 로 URL 만 바꾼다 — Next 는 pushState 를
 * 감지해 usePathname/useSearchParams 를 동기화하므로(공식 shallow routing), TabHost·
 * BottomNav·TopBar 가 즉시 반응하고 네트워크·재렌더 비용은 0 에 수렴한다.
 *
 * pane 이 아닌 주소(/cases 목록, step·doc 상세, /me/*, /settings/* 하위)는 pushState 만
 * 하면 화면이 안 바뀌므로(라우트 children 이 그대로) 반드시 router.push 로 진짜 네비게이션.
 */

type AppRouter = ReturnType<typeof useRouter>

export function isPaneHref(href: string): boolean {
  const path = href.split('?')[0]
  if (path === '/me' || path === '/services' || path === '/settings') return true
  return /^\/cases\/[^/]+\/(journey|docs)\/?$/.test(path)
}

/** 하단 탭·스와이프의 이동 — pane 이면 pushState(즉시), 아니면 일반 네비게이션. */
export function pushTab(router: AppRouter, href: string): void {
  if (isPaneHref(href)) window.history.pushState(null, '', href)
  else router.push(href)
}

/** replace 판 — 히스토리에 쌓지 않는 전환(여정 마무리 후 목적지 교체 등). */
export function replaceTab(router: AppRouter, href: string): void {
  if (isPaneHref(href)) window.history.replaceState(null, '', href)
  else router.replace(href)
}
