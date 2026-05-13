'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { readLastCaseId, writeLastCaseId } from './last-case'

/**
 * 4탭(여정/서류/정보/프로필) 좌우 스와이프 내비.
 *
 * 검출은 두 경로 OR:
 *  1) 거리 기반 — 시작→끝 |dx| ≥60px AND |dy/dx| ≤1.0 (~45°), 1초 이내
 *  2) 플릭 속도 — 마지막 120ms 윈도우에서 |vx| ≥0.5 px/ms AND |fdx| ≥40px AND |vy/vx| ≤0.7
 *
 * (2) 가 있어서 세로 스크롤하다가 끝에서 가로로 flick 해도 잡힘. (1) 단독이었던 v1 에선
 * 누적 dy 때문에 ratio 실패하는 사례가 많았음.
 *
 * - 화면 가장자리 28px 이내 시작은 무시 (iOS Safari 백/포워드 제스처 충돌 회피).
 * - 가로 스크롤러(`overflow-x:auto/scroll` + 실제 overflow) 또는 `data-no-swipe="true"` 자손에서 시작한 터치는 무시.
 * - /me 는 case-out 이라 caseId 가 없음 — sessionStorage 에 마지막 caseId 보관해 복귀 시 사용.
 *   fallback 은 /cases (1건이면 자동 redirect, 2건+ 면 목록).
 * - 인접 탭은 router.prefetch 해 전환을 즉시화. BottomNav 의 `<Link>` 자동 prefetch 와 동일한 효과.
 */

const TAB_ORDER = ['journey', 'docs', 'info', 'me'] as const
type Tab = (typeof TAB_ORDER)[number]

const MIN_DISTANCE_PX = 60
const DIST_OFF_AXIS_RATIO = 1.0 // 거리 기반: |dy/dx| 허용치 (~45°)
const MAX_DURATION_MS = 1000
const EDGE_GUARD_PX = 28

const FLICK_WINDOW_MS = 120
const FLICK_MIN_VX = 0.5 // px/ms (=500 px/s)
const FLICK_MIN_DX = 40 // 플릭 윈도우 내 최소 가로 이동
const FLICK_OFF_AXIS_RATIO = 0.7 // 플릭 기반: |vy/vx| 허용치

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
    writeLastCaseId(caseId)
  }, [caseId])

  useEffect(() => {
    if (!tab) return
    const idx = TAB_ORDER.indexOf(tab)
    for (const offset of [-1, 1]) {
      const ni = idx + offset
      if (ni < 0 || ni >= TAB_ORDER.length) continue
      try {
        // kind: 'full' — dynamic 페이지의 RSC payload 까지 통째 prefetch.
        // 기본 'auto' 는 force-dynamic 에선 사실상 효과 없음.
        // PrefetchKind enum 은 public export 가 아니라 ts-expect-error 로 회피
        // (런타임 string 'full' 이 enum 값과 일치).
        // @ts-expect-error PrefetchKind enum not publicly exported
        router.prefetch(hrefFor(TAB_ORDER[ni], caseId), { kind: 'full' })
      } catch {
        /* prefetch 는 best-effort */
      }
    }
  }, [tab, caseId, router])

  const startRef = useRef<{ x: number; y: number; t: number; skip: boolean } | null>(null)
  const movesRef = useRef<{ x: number; y: number; t: number }[]>([])

  useEffect(() => {
    if (!tab) return

    const onStart = (e: TouchEvent) => {
      movesRef.current = []
      if (e.touches.length !== 1) {
        startRef.current = null
        return
      }
      const t = e.touches[0]
      const now = performance.now()
      const nearEdge =
        t.clientX < EDGE_GUARD_PX || t.clientX > window.innerWidth - EDGE_GUARD_PX
      startRef.current = {
        x: t.clientX,
        y: t.clientY,
        t: now,
        skip: nearEdge || startsOnNoSwipeZone(e.target),
      }
      movesRef.current.push({ x: t.clientX, y: t.clientY, t: now })
    }

    const onMove = (e: TouchEvent) => {
      const s = startRef.current
      if (!s || s.skip) return
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const now = performance.now()
      movesRef.current.push({ x: t.clientX, y: t.clientY, t: now })
      // 200ms 이상 오래된 샘플은 제거 (메모리 + 플릭 윈도우 충분히 커버)
      const cutoff = now - 200
      while (movesRef.current.length > 1 && movesRef.current[0].t < cutoff) {
        movesRef.current.shift()
      }
    }

    const detectDirection = (s: NonNullable<typeof startRef.current>, endX: number, endY: number): number => {
      const dx = endX - s.x
      const dy = endY - s.y

      // (1) 거리 기반
      if (Math.abs(dx) >= MIN_DISTANCE_PX && Math.abs(dy) <= Math.abs(dx) * DIST_OFF_AXIS_RATIO) {
        return dx < 0 ? 1 : -1
      }

      // (2) 플릭 속도 — 마지막 FLICK_WINDOW_MS 윈도우
      const moves = movesRef.current
      if (moves.length < 2) return 0
      const last = moves[moves.length - 1]
      const cutoff = last.t - FLICK_WINDOW_MS
      let first = moves[0]
      for (let i = moves.length - 1; i >= 0; i--) {
        if (moves[i].t <= cutoff) {
          first = moves[i]
          break
        }
        first = moves[i]
      }
      const dt = last.t - first.t
      if (dt < 20) return 0
      const fdx = last.x - first.x
      const fdy = last.y - first.y
      const vx = fdx / dt
      const vy = fdy / dt
      if (
        Math.abs(vx) >= FLICK_MIN_VX &&
        Math.abs(fdx) >= FLICK_MIN_DX &&
        Math.abs(vy) <= Math.abs(vx) * FLICK_OFF_AXIS_RATIO
      ) {
        return vx < 0 ? 1 : -1
      }
      return 0
    }

    const onEnd = (e: TouchEvent) => {
      const s = startRef.current
      startRef.current = null
      const moves = movesRef.current
      movesRef.current = []
      if (!s || s.skip) return
      if (performance.now() - s.t > MAX_DURATION_MS) return

      const t = e.changedTouches[0]
      if (!t) return

      // detectDirection 이 moves 를 참조 — 비우기 전에 복구
      movesRef.current = moves
      const dir = detectDirection(s, t.clientX, t.clientY)
      movesRef.current = []
      if (dir === 0) return

      const idx = TAB_ORDER.indexOf(tab)
      const next = idx + dir
      if (next < 0 || next >= TAB_ORDER.length) return

      router.push(hrefFor(TAB_ORDER[next], caseId))
    }

    const onCancel = () => {
      startRef.current = null
      movesRef.current = []
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [tab, caseId, router])

  return <>{children}</>
}
