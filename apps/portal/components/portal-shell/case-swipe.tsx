'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useCases } from './case-data-provider'
import { readLastDest } from './last-case'
import { useNavGuard } from './nav-guard'

/**
 * 좌우 스와이프 = 동물(케이스) 전환. 준비(journey)·서류(docs) 루트에서만, 동물 2마리+.
 * (2026-07-12 사용자 확정 — 옛 탭 스와이프(SwipeTabs)는 전면 제거, 탭은 하단 바 탭으로만.
 *  날씨 앱의 '옆으로 넘기면 다음 도시' 문법 — 여기선 다음 아이. 아바타 탭 전환은 유지.)
 *
 * 옛 탭 스와이프가 "잘 안 먹히던" 원인(60px+ 이동 AND 세로<가로, 1초 제한, 스크롤과 동시
 * 동작)을 갈아엎은 새 제스처:
 *  - 첫 12px 에서 축 판정 — 가로면 세로 스크롤을 잠그고(preventDefault) 손가락을 따라
 *    화면이 실제로 밀린다(저항 0.4, 최대 ±110px). 세로면 이후 완전히 무시(자연 스크롤).
 *  - 커밋 = 70px 이상 끌기 OR 플릭(마지막 표본 속도 0.45px/ms + 30px). 시간 제한 없음.
 *  - 이웃 없는 방향(첫/마지막 아이)은 강한 저항 + 스냅백(고무줄).
 *  - 화면 가장자리 24px 시작은 무시(iOS 백 제스처), input·가로 스크롤러·data-no-swipe 무시.
 *
 * 전환 시 같은 탭 유지: 서류를 보다 넘기면 다음 아이의 서류. 목적지는 케이스별 마지막
 * 활성(?dest, bottom-nav 가 기록) 복원. step 상세 등 서브 경로에선 비활성 — 입력 중
 * 미끄러짐으로 화면이 튀는 사고 방지(옛 SwipeTabs 와 동일한 원칙).
 */

const EDGE_GUARD_PX = 24
const AXIS_LOCK_PX = 12
const AXIS_LOCK_RATIO = 1.2 // 가로 판정: |dx| > |dy| * ratio
const COMMIT_DISTANCE_PX = 70
const FLICK_WINDOW_MS = 120
const FLICK_MIN_VX = 0.45 // px/ms
const FLICK_MIN_DX = 30
const DRAG_RESISTANCE = 0.4
const DRAG_MAX_PX = 110
const END_RESISTANCE = 0.15 // 이웃 없는 방향(고무줄)
const EXIT_SLIDE_PX = 90 // 커밋 시 밀려나가는 거리(새 페이지 fade-up 과 이어짐)

function caseTabFromPath(pathname: string): { caseId: string; tab: 'journey' | 'docs' } | null {
  const m = pathname.match(/^\/cases\/([^/]+)\/(journey|docs)\/?$/)
  return m ? { caseId: m[1], tab: m[2] as 'journey' | 'docs' } : null
}

/** input 등 폼 컨트롤·가로 스크롤러·data-no-swipe 자손에서 시작한 터치는 무시.
 * (행 링크 <a>·버튼은 허용 — 축 판정 후에만 개입하므로 탭과 충돌하지 않는다.) */
function startsOnNoSwipeZone(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null
  while (el && el !== document.body) {
    if (el.dataset && el.dataset.noSwipe === 'true') return true
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) {
      return true
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      const cs = window.getComputedStyle(el)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

export function CaseSwipe({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const navGuard = useNavGuard()
  const { cases } = useCases()

  const info = caseTabFromPath(pathname)
  const ids = cases.map((c) => c.id)
  const idx = info ? ids.indexOf(info.caseId) : -1
  const active = !!info && idx !== -1 && ids.length > 1

  const wrapRef = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState(0)
  const [animate, setAnimate] = useState(false)

  // 경로가 바뀌면(전환 완료) 밀림 상태를 즉시 원위치 — 새 페이지는 pm-fade-up 으로 등장.
  useEffect(() => {
    setAnimate(false)
    setDragX(0)
  }, [pathname])

  useEffect(() => {
    const el = wrapRef.current
    if (!active || !el || !info) return

    let start: { x: number; y: number } | null = null
    let locked: 'h' | 'v' | null = null
    let skip = false
    let moves: { x: number; t: number }[] = []

    const hrefFor = (targetId: string) => {
      const dest = readLastDest(targetId)
      return `/cases/${targetId}/${info.tab}${dest ? `?dest=${encodeURIComponent(dest)}` : ''}`
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start = null
        return
      }
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY }
      locked = null
      skip =
        t.clientX < EDGE_GUARD_PX ||
        t.clientX > window.innerWidth - EDGE_GUARD_PX ||
        startsOnNoSwipeZone(e.target)
      moves = [{ x: t.clientX, t: performance.now() }]
    }

    const onMove = (e: TouchEvent) => {
      if (!start || skip || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y

      if (!locked) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return
        locked = Math.abs(dx) > Math.abs(dy) * AXIS_LOCK_RATIO ? 'h' : 'v'
        if (locked === 'v') {
          skip = true // 세로 제스처 확정 — 이후 완전히 무시(자연 스크롤)
          return
        }
      }
      if (locked !== 'h') return

      // 가로 확정 — 세로 스크롤·브라우저 제스처 차단, 손가락 따라 밀기.
      if (e.cancelable) e.preventDefault()
      const now = performance.now()
      moves.push({ x: t.clientX, t: now })
      while (moves.length > 2 && moves[0].t < now - 200) moves.shift()

      const dir = dx < 0 ? 1 : -1
      const hasNeighbor = idx + dir >= 0 && idx + dir < ids.length
      const resist = hasNeighbor ? DRAG_RESISTANCE : END_RESISTANCE
      const eased = Math.max(-DRAG_MAX_PX, Math.min(DRAG_MAX_PX, dx * resist))
      setAnimate(false)
      setDragX(eased)
    }

    const onEnd = (e: TouchEvent) => {
      const s = start
      const wasLocked = locked
      const wasSkip = skip
      const trail = moves
      start = null
      locked = null
      skip = false
      moves = []
      if (!s || wasSkip || wasLocked !== 'h') return

      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - s.x

      // 커밋 판정 — 끌기 거리 또는 플릭 속도.
      let commit = Math.abs(dx) >= COMMIT_DISTANCE_PX
      if (!commit && trail.length >= 2) {
        const last = trail[trail.length - 1]
        let first = trail[0]
        for (let i = trail.length - 1; i >= 0; i--) {
          first = trail[i]
          if (trail[i].t <= last.t - FLICK_WINDOW_MS) break
        }
        const dt = last.t - first.t
        const fdx = last.x - first.x
        if (dt >= 20 && Math.abs(fdx) >= FLICK_MIN_DX && Math.abs(fdx / dt) >= FLICK_MIN_VX) {
          // 플릭 방향과 전체 끌기 방향이 같을 때만.
          if (Math.sign(fdx) === Math.sign(dx)) commit = true
        }
      }

      const dir = dx < 0 ? 1 : -1
      const nextIdx = idx + dir
      if (!commit || nextIdx < 0 || nextIdx >= ids.length) {
        // 스냅백.
        setAnimate(true)
        setDragX(0)
        return
      }

      const proceed = () => {
        // 진행 방향으로 살짝 밀려나가며 전환 — 새 페이지의 fade-up 과 이어진다.
        setAnimate(true)
        setDragX(dir === 1 ? -EXIT_SLIDE_PX : EXIT_SLIDE_PX)
        window.setTimeout(() => router.push(hrefFor(ids[nextIdx])), 90)
      }
      if (navGuard) navGuard.guard(proceed)
      else proceed()
    }

    const onCancel = () => {
      start = null
      locked = null
      skip = false
      moves = []
      setAnimate(true)
      setDragX(0)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    // preventDefault 로 세로 스크롤을 잠가야 하므로 passive:false.
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
    // ids 는 파생 배열이라 join 으로 안정화.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx, ids.join(','), pathname, router, navGuard])

  return (
    <div
      ref={wrapRef}
      style={{
        transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
        transition: animate ? 'transform .18s ease-out' : 'none',
        willChange: active ? 'transform' : undefined,
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}
