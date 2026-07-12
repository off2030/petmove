'use client'

import dynamic from 'next/dynamic'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCases } from './case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { readLastCaseId, readLastDest } from './last-case'
import { TabSkeleton } from './tab-skeleton'

/**
 * 상주(keep-alive) 탭 컨테이너 — 탭 전환 렉의 근본 해결(2026-07-12).
 *
 * 하단 5탭의 루트 화면을 전부 mount 해 두고 전환은 보이기/숨기기만 한다 — 네이티브 앱이
 * 탭 뷰를 메모리에 살려두는 것과 같은 문법. 탭 전환 시 네비게이션·서버 왕복·페이지
 * 재mount·스켈레톤이 전부 사라지고, 각 탭의 스크롤 위치·펼침 상태도 유지된다.
 *
 * 동작 규약:
 *  - 탭 루트 라우트(/cases/<id>/journey·docs, /me, /services, /settings)의 page.tsx 는
 *    null 을 반환한다. 실제 화면은 여기 pane 이 그린다. 이동은 tab-nav 의 pushTab
 *    (pane 이면 history.pushState — Next 가 usePathname 을 동기화).
 *  - 그 외 주소(step·doc 상세, /me/*, /settings/*, /cases 목록…)는 일반 라우트 —
 *    pane 을 전부 숨기고 children(라우트 트리)을 보여준다.
 *  - 숨김은 display:none 이 아니라 visibility:hidden(+absolute 겹침) — display:none 은
 *    브라우저가 스크롤 위치를 버린다. inert 로 포커스·포인터도 차단.
 *  - 첫 진입 성능: 진입 탭만 즉시 mount(SSR 포함 — 첫 페인트는 종전과 동일), 나머지는
 *    로드 안정 후(3초 또는 첫 터치) 300ms 간격으로 백그라운드 예열. 한 번 mount 되면
 *    세션 내내 유지 — "처음엔 빠른데 나중에 느려지는" 만료 구간이 없다.
 *  - 각 pane 이 자기 스크롤 컨테이너를 가진다(종전 main 의 스크롤·패딩을 이관).
 *    iOS 고정바 스크롤 격리(셸 100dvh + 내부만 스크롤)는 그대로 유지된다.
 */

// 라우트별 코드 스플리팅 유지 — page.tsx 가 더는 import 하지 않으므로 여기서 lazy 로.
// (next/dynamic 의 options 는 컴파일러 제약상 반드시 인라인 객체 리터럴이어야 한다.)
const JourneyTab = dynamic(
  () => import('@/components/journey/journey-tab').then((m) => m.JourneyTab),
  { loading: () => <TabSkeleton rows={3} /> },
)
const DocsTab = dynamic(() => import('@/components/cases/docs-tab').then((m) => m.DocsTab), {
  loading: () => <TabSkeleton rows={3} />,
})
const ServicesView = dynamic(
  () => import('@/components/services/services-view').then((m) => m.ServicesView),
  { loading: () => <TabSkeleton rows={3} /> },
)
const SettingsHubView = dynamic(
  () => import('@/components/me/settings-hub-view').then((m) => m.SettingsHubView),
  { loading: () => <TabSkeleton rows={3} /> },
)
const SettingsView = dynamic(
  () => import('@/components/settings/settings-view').then((m) => m.SettingsView),
  { loading: () => <TabSkeleton rows={3} /> },
)

type PaneKey = 'journey' | 'docs' | 'services' | 'me' | 'settings'
const ALL_PANES: PaneKey[] = ['journey', 'docs', 'me', 'services', 'settings']

function paneFromPath(pathname: string): PaneKey | null {
  if (pathname === '/me') return 'me'
  if (pathname === '/services') return 'services'
  if (pathname === '/settings') return 'settings'
  const m = pathname.match(/^\/cases\/([^/]+)\/(journey|docs)\/?$/)
  return m && m[1] !== 'page' ? (m[2] as PaneKey) : null
}

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)\/(?:journey|docs)\/?$/)
  return m && m[1] !== 'page' ? m[1] : null
}

export function TabHost({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { cases } = useCases()

  const activePane = paneFromPath(pathname)
  const urlCaseId = caseIdFromPath(pathname)
  const destInUrl = urlCaseId ? searchParams.get('dest') : null

  // 준비·서류 pane 이 그릴 케이스 — bottom-nav 와 같은 결정 규칙:
  // URL 의 caseId > sessionStorage 마지막 caseId(유효할 때) > 첫 여정 케이스.
  // URL 밖(내 정보 탭 등)에서도 pane 은 마지막 케이스로 계속 서 있어야 복귀가 즉시다.
  const [remembered, setRemembered] = useState<{ id: string; dest: string | null } | null>(null)
  useEffect(() => {
    if (urlCaseId) {
      // bottom-nav 가 sessionStorage 기록을 담당 — 여기선 상태만 동기화.
      setRemembered({ id: urlCaseId, dest: destInUrl ?? readLastDest(urlCaseId) })
    } else {
      const id = readLastCaseId()
      if (id) setRemembered((prev) => (prev?.id === id ? prev : { id, dest: readLastDest(id) }))
    }
  }, [urlCaseId, destInUrl])

  const journeyCases = cases.filter(hasJourney)
  const candidate = urlCaseId ?? remembered?.id ?? null
  const caseValid = candidate !== null && journeyCases.some((c) => c.id === candidate)
  const paneCaseId = caseValid ? candidate : journeyCases[0]?.id ?? null
  const paneDest =
    urlCaseId && paneCaseId === urlCaseId
      ? destInUrl
      : remembered && remembered.id === paneCaseId
        ? remembered.dest
        : null

  // mount 대상 — 진입 pane 은 즉시(SSR 포함), 나머지는 아래 예열 효과가 순차 추가.
  const [mountedPanes, setMountedPanes] = useState<PaneKey[]>(() =>
    activePane ? [activePane] : [],
  )
  useEffect(() => {
    if (!activePane) return
    setMountedPanes((prev) => (prev.includes(activePane) ? prev : [...prev, activePane]))
  }, [activePane])

  // 백그라운드 예열 — case-data-provider 의 prefetch/realtime 과 같은 지연 문법:
  // load 완료 + 3초, 또는 사용자의 첫 터치 중 먼저 오는 쪽. 이후 300ms 간격으로 하나씩.
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let stepTimer: number | undefined

    const warm = () => {
      if (cancelled) return
      const queue = ALL_PANES.filter((k) => !mountedPanes.includes(k))
      let i = 0
      const step = () => {
        if (cancelled || i >= queue.length) return
        const key = queue[i++]
        setMountedPanes((prev) => (prev.includes(key) ? prev : [...prev, key]))
        stepTimer = window.setTimeout(step, 300)
      }
      step()
    }
    const start = () => {
      if (cancelled || timer !== undefined) return
      timer = window.setTimeout(warm, 3000)
    }
    const onInteract = () => {
      if (cancelled) return
      if (timer !== undefined) clearTimeout(timer)
      warm()
    }

    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    window.addEventListener('touchstart', onInteract, { once: true, passive: true })

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      if (stepTimer !== undefined) clearTimeout(stepTimer)
      window.removeEventListener('load', start)
      window.removeEventListener('touchstart', onInteract)
    }
    // 최초 1회만 예열 — mountedPanes 갱신마다 재실행할 필요 없음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shouldRender = (key: PaneKey) => key === activePane || mountedPanes.includes(key)

  return (
    <>
      {shouldRender('journey') && paneCaseId && (
        <Pane active={activePane === 'journey'}>
          {/* key=caseId — 동물 전환 시 이전 아이의 펼침·입력 상태가 새 아이로 새지 않게 remount. */}
          <JourneyTab
            key={paneCaseId}
            caseId={paneCaseId}
            dest={paneDest}
            active={activePane === 'journey'}
          />
        </Pane>
      )}
      {shouldRender('docs') && paneCaseId && (
        <Pane active={activePane === 'docs'}>
          <DocsTab
            key={paneCaseId}
            caseId={paneCaseId}
            dest={paneDest}
            active={activePane === 'docs'}
          />
        </Pane>
      )}
      {shouldRender('me') && (
        <Pane active={activePane === 'me'}>
          <SettingsHubView />
        </Pane>
      )}
      {shouldRender('services') && (
        <Pane active={activePane === 'services'}>
          <ServicesView />
        </Pane>
      )}
      {shouldRender('settings') && (
        <Pane active={activePane === 'settings'}>
          <SettingsView />
        </Pane>
      )}
      {/* 라우트 children — step·doc 상세, /me/*·/settings/* 하위, /cases 목록 등.
          pane 라우트에선 children 이 null page 라 숨겨도 잃는 것이 없다. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          overscrollBehaviorY: 'none',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(var(--pm-top-inset) + 48px)',
          paddingBottom: 88,
          display: activePane ? 'none' : undefined,
          zIndex: activePane ? 0 : 1,
        }}
      >
        {children}
      </div>
    </>
  )
}

/** pane 스크롤 컨테이너 — 종전 (authed) layout main 의 스크롤·패딩 문법을 그대로 이관. */
function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      inert={!active}
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        overscrollBehaviorY: 'none',
        WebkitOverflowScrolling: 'touch',
        paddingTop: 'calc(var(--pm-top-inset) + 48px)',
        paddingBottom: 88,
        // display:none 은 스크롤 위치를 버림 — visibility 로 숨겨 각 탭의 위치 보존.
        visibility: active ? 'visible' : 'hidden',
        zIndex: active ? 1 : 0,
      }}
    >
      {children}
    </div>
  )
}
