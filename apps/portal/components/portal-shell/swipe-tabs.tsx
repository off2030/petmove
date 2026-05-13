'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * 4탭(여정/서류/정보/프로필) 좌우 스와이프 내비.
 *
 * - 터치 한 손가락만, 수평 거리 ≥60px, |dy/dx| ≤0.7, 700ms 이내.
 * - 화면 가장자리 28px 이내 시작은 무시 (iOS Safari 백/포워드 제스처 충돌 회피).
 * - 가로 스크롤러(`overflow-x:auto/scroll` + 실제 overflow) 또는 `data-no-swipe="true"` 자손에서 시작한 터치는 무시.
 * - /me 는 case-out 이라 caseId 가 없음 — sessionStorage 에 마지막 caseId 보관해 복귀 시 사용.
 *   fallback 은 /cases (1건이면 자동 redirect, 2건+ 면 목록).
 * - 인접 탭은 router.prefetch 해 전환을 즉시화. BottomNav 의 `<Link>` 자동 prefetch 와 동일한 효과.
 */

const TAB_ORDER = ['journey', 'docs', 'info', 'me'] as const
type Tab = (typeof TAB_ORDER)[number]

const LAST_CASE_KEY = 'pm.last-case-id'

const MIN_DISTANCE_PX = 60
const MAX_OFF_AXIS_RATIO = 0.7
const MAX_DURATION_MS = 700
const EDGE_GUARD_PX = 28

function currentTab(pathname: string): Tab | null {
  if (pathname === '/me' || pathname.startsWith('/me/')) return 'me'
  const m = pathname.match(/^\/cases\/[^/]+\/(journey|docs|info)(?:\/|$)/)
  return m ? (m[1] as Tab) : null
}

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

function startsOnNoSwipeZone(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null
  while (el && el !== document.body) {
    if (el.dataset && el.dataset.noSwipe === 'true') return true
    if (el.scrollWidth > el.clientWidth + 1) {
      const cs = window.getComputedStyle(el)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

function readLastCaseId(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_CASE_KEY)
  } catch {
    return null
  }
}

function hrefFor(tab: Tab, caseId: string | null): string {
  if (tab === 'me') return '/me'
  const id = caseId ?? readLastCaseId()
  if (!id) return '/cases'
  return `/cases/${id}/${tab}`
}

export function SwipeTabs({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const tab = currentTab(pathname)
  const caseId = caseIdFromPath(pathname)

  useEffect(() => {
    if (!caseId) return
    try {
      window.sessionStorage.setItem(LAST_CASE_KEY, caseId)
    } catch {
      /* ignore */
    }
  }, [caseId])

  useEffect(() => {
    if (!tab) return
    const idx = TAB_ORDER.indexOf(tab)
    for (const offset of [-1, 1]) {
      const ni = idx + offset
      if (ni < 0 || ni >= TAB_ORDER.length) continue
      try {
        router.prefetch(hrefFor(TAB_ORDER[ni], caseId))
      } catch {
        /* prefetch 는 best-effort */
      }
    }
  }, [tab, caseId, router])

  const startRef = useRef<{ x: number; y: number; t: number; skip: boolean } | null>(null)

  useEffect(() => {
    if (!tab) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        startRef.current = null
        return
      }
      const t = e.touches[0]
      const nearEdge =
        t.clientX < EDGE_GUARD_PX || t.clientX > window.innerWidth - EDGE_GUARD_PX
      startRef.current = {
        x: t.clientX,
        y: t.clientY,
        t: performance.now(),
        skip: nearEdge || startsOnNoSwipeZone(e.target),
      }
    }

    const onEnd = (e: TouchEvent) => {
      const s = startRef.current
      startRef.current = null
      if (!s || s.skip) return
      if (performance.now() - s.t > MAX_DURATION_MS) return

      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y

      if (Math.abs(dx) < MIN_DISTANCE_PX) return
      if (Math.abs(dy) > Math.abs(dx) * MAX_OFF_AXIS_RATIO) return

      const dir = dx < 0 ? 1 : -1
      const idx = TAB_ORDER.indexOf(tab)
      const next = idx + dir
      if (next < 0 || next >= TAB_ORDER.length) return

      router.push(hrefFor(TAB_ORDER[next], caseId))
    }

    const onCancel = () => {
      startRef.current = null
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [tab, caseId, router])

  return <>{children}</>
}
