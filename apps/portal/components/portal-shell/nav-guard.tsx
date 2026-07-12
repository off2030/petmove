'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@petmove/ui'

/**
 * 미저장 변경 가드 — 편집 화면에서 저장 없이 다른 화면으로 넘어가려 할 때
 * "저장하지 않고 나갈까요?" 를 묻고, 사용자가 동의해야 떠나게 한다.
 *
 * 동작 범위(앱 안에서 화면을 떠나는 모든 경로):
 *  1) 화면 안의 링크(<a>/Next <Link>) 클릭 — 뒤로(← 내 정보)·하단 탭·상단 ⚙ 등. (캡처 단계에서 가로채 차단)
 *  2) 좌우 스와이프 동물 전환 — CaseSwipe 가 guard() 로 router.push 를 감싼다.
 *  3) 브라우저/안드로이드 뒤로가기(popstate) — dirty 동안 sentinel 한 칸을 history 에 심어 잡는다.
 *  4) 새로고침·앱 종료·외부 이동(beforeunload) — 브라우저 기본 경고.
 *
 * 편집 화면은 useUnsavedGuard(dirty) 한 줄로 자신의 dirty 를 등록한다. 화면이 언마운트되거나
 * 저장이 끝나 dirty=false 가 되면 가드는 자동 해제된다.
 */

interface NavGuardValue {
  /** 현재 화면의 미저장 변경 여부 등록. */
  setDirty: (dirty: boolean) => void
  /** 프로그램적 내비게이션 가드 — dirty 면 confirm 후 통과 시에만 proceed 실행. */
  guard: (proceed: () => void) => void
}

const NavGuardContext = createContext<NavGuardValue | null>(null)

const LEAVE_PROMPT = {
  message: '저장하지 않고 나갈까요?',
  description: '편집한 내용이 아직 저장되지 않았어요. 이 화면을 떠나면 변경 사항이 사라집니다.',
  okLabel: '나가기',
  cancelLabel: '계속 편집',
  variant: 'destructive' as const,
}

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const confirm = useConfirm()
  const dirtyRef = useRef(false)
  // history 에 심은 sentinel 한 칸이 살아있는지 — 중복 push 방지.
  const sentinelRef = useRef(false)

  const setDirty = useCallback((dirty: boolean) => {
    if (dirtyRef.current === dirty) return
    dirtyRef.current = dirty
    if (dirty) {
      // dirty 진입 시 history 에 sentinel 한 칸 — 뒤로가기를 여기서 잡는다.
      if (!sentinelRef.current && typeof window !== 'undefined') {
        try {
          window.history.pushState({ __pmNavGuard: true }, '')
          sentinelRef.current = true
        } catch {
          /* history 접근 불가(SSR 등) — 무시 */
        }
      }
    } else {
      // 깨끗해지면 다음 dirty 진입 때 새 sentinel 을 심을 수 있게 표식만 해제.
      // (남은 sentinel 은 popstate 핸들러가 투명하게 건너뛴다.)
      sentinelRef.current = false
    }
  }, [])

  const guard = useCallback(
    (proceed: () => void) => {
      if (!dirtyRef.current) {
        proceed()
        return
      }
      void (async () => {
        const ok = await confirm(LEAVE_PROMPT)
        if (ok) {
          dirtyRef.current = false
          sentinelRef.current = false
          proceed()
        }
      })()
    },
    [confirm],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ── (1) 링크 클릭 가로채기 (캡처 단계 — Next Link 핸들러보다 먼저) ──
    function onClick(e: MouseEvent) {
      if (!dirtyRef.current) return
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const a = target?.closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href) return
      if (a.target && a.target !== '_self') return // _blank 등 새 창
      if (a.hasAttribute('download')) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return // 외부 링크
      // 같은 페이지(경로+쿼리 동일) 이동은 실제 화면 전환이 아님 — 통과.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      e.preventDefault()
      e.stopPropagation()
      void (async () => {
        const ok = await confirm(LEAVE_PROMPT)
        if (ok) {
          dirtyRef.current = false
          sentinelRef.current = false
          router.push(url.pathname + url.search + url.hash)
        }
      })()
    }

    // ── (3) 뒤로가기(popstate) ──
    function onPopState(e: PopStateEvent) {
      if (dirtyRef.current) {
        // 뒤로가기로 sentinel 칸을 빠져나옴 — 일단 confirm 동안 화면에 다시 머물도록 sentinel 재삽입.
        try {
          window.history.pushState({ __pmNavGuard: true }, '')
        } catch {
          /* 무시 */
        }
        void (async () => {
          const ok = await confirm(LEAVE_PROMPT)
          if (ok) {
            dirtyRef.current = false
            sentinelRef.current = false
            // 재삽입한 sentinel + 원래 화면 칸을 건너뛰어 실제 이전 화면으로.
            window.history.go(-2)
          }
        })()
        return
      }
      // dirty 아님 — 남아있는 stale sentinel 위에 떨어지면 투명하게 한 칸 더 뒤로.
      const st = e.state as { __pmNavGuard?: boolean } | null
      if (st && st.__pmNavGuard) {
        try {
          window.history.back()
        } catch {
          /* 무시 */
        }
      }
    }

    // ── (4) 새로고침·종료·외부 이동 ──
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [confirm, router])

  const value = useMemo<NavGuardValue>(() => ({ setDirty, guard }), [setDirty, guard])

  return <NavGuardContext.Provider value={value}>{children}</NavGuardContext.Provider>
}

/** 프로그램적 내비게이션 가드가 필요한 곳(예: CaseSwipe)에서 사용. provider 밖이면 null. */
export function useNavGuard(): NavGuardValue | null {
  return useContext(NavGuardContext)
}

/** 편집 화면이 자신의 dirty 를 가드에 등록 — 화면 언마운트·저장 완료 시 자동 해제. */
export function useUnsavedGuard(dirty: boolean) {
  const ctx = useContext(NavGuardContext)
  useEffect(() => {
    ctx?.setDirty(dirty)
    return () => ctx?.setDirty(false)
  }, [dirty, ctx])
}
