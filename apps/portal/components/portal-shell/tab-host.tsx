'use client'

import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCase, useCases } from './case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { readLastCaseId, readLastDest } from './last-case'
import { useNavGuard } from './nav-guard'
import { isSurfacePage } from './surface-page'
import { isShellHref } from './tab-nav'
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

// ── detail 레이어 화면들 — pane 과 달리 진입할 때 mount, 떠나면 unmount (매번 새 상태·맨위 스크롤).
const StepDetailScreen = dynamic(
  () => import('@/components/journey/step-detail-screen').then((m) => m.StepDetailScreen),
  { loading: () => <TabSkeleton rows={3} /> },
)
const DocDetailScreen = dynamic(
  () => import('@/components/cases/doc-detail-screen').then((m) => m.DocDetailScreen),
  { loading: () => <TabSkeleton rows={3} /> },
)
const GuardianEditView = dynamic(
  () => import('@/components/me/guardian-edit-view').then((m) => m.GuardianEditView),
  { loading: () => <TabSkeleton rows={3} /> },
)
const AnimalEditView = dynamic(
  () => import('@/components/me/animal-edit-view').then((m) => m.AnimalEditView),
  { loading: () => <TabSkeleton rows={3} /> },
)
const AccountDeleteView = dynamic(
  () => import('@/components/settings/account-delete-view').then((m) => m.AccountDeleteView),
  { loading: () => <TabSkeleton rows={3} /> },
)
const ComingSoonView = dynamic(
  () => import('@/components/me/coming-soon-view').then((m) => m.ComingSoonView),
  { loading: () => <TabSkeleton rows={3} /> },
)
const CasesHubScreen = dynamic(
  () => import('@/components/cases/cases-hub-screen').then((m) => m.CasesHubScreen),
  { loading: () => <TabSkeleton rows={3} /> },
)
const FeedbackScreen = dynamic(
  () => import('@/components/feedback/feedback-screen').then((m) => m.FeedbackScreen),
  { loading: () => <TabSkeleton rows={3} /> },
)
// 안내(leaf) 페이지 — 정적 데이터 client 화면. 슬러그 명단은 tab-nav 의 SHELL_GUIDE_SLUGS.
const GUIDE_SCREENS: Record<string, ReturnType<typeof dynamic>> = {
  'jp-quarantine-contacts': dynamic(() => import('@/components/guide/jp-quarantine-contacts'), {
    loading: () => <TabSkeleton rows={3} />,
  }),
  'japan-airport-quarantine': dynamic(() => import('@/components/guide/japan-airport-quarantine'), {
    loading: () => <TabSkeleton rows={3} />,
  }),
  'quarantine-stations': dynamic(() => import('@/components/guide/quarantine-stations'), {
    loading: () => <TabSkeleton rows={3} />,
  }),
  'th-aqs-contacts': dynamic(() => import('@/components/guide/th-aqs-contacts'), {
    loading: () => <TabSkeleton rows={3} />,
  }),
}

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

// detail 레이어 판정 — tab-nav 의 isDetailHref 와 같은 명단(한쪽만 고치면 안 됨).
type DetailMatch =
  | { kind: 'step'; caseId: string; stepId: string }
  | { kind: 'doc'; caseId: string; docId: string }
  | { kind: 'guardian' }
  | { kind: 'animal'; caseId: string }
  | { kind: 'account-delete' }
  | { kind: 'cases' }
  | { kind: 'feedback'; caseId: string }
  | { kind: 'guide'; slug: string }

function detailFromPath(pathname: string): DetailMatch | null {
  if (pathname === '/me/guardian') return { kind: 'guardian' }
  if (pathname === '/settings/account-delete') return { kind: 'account-delete' }
  if (pathname === '/cases') return { kind: 'cases' }
  const guide = pathname.match(/^\/guide\/([^/]+)\/?$/)
  if (guide) return GUIDE_SCREENS[guide[1]] ? { kind: 'guide', slug: guide[1] } : null
  const animal = pathname.match(/^\/me\/animal\/([^/]+)\/?$/)
  if (animal) return { kind: 'animal', caseId: animal[1] }
  const feedback = pathname.match(/^\/cases\/([^/]+)\/feedback\/?$/)
  if (feedback) return { kind: 'feedback', caseId: feedback[1] }
  const caseDetail = pathname.match(/^\/cases\/([^/]+)\/(journey|docs)\/([^/]+)\/?$/)
  if (caseDetail) {
    return caseDetail[2] === 'journey'
      ? { kind: 'step', caseId: caseDetail[1], stepId: caseDetail[3] }
      : { kind: 'doc', caseId: caseDetail[1], docId: caseDetail[3] }
  }
  return null
}

export function TabHost({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { cases } = useCases()

  const activePane = paneFromPath(pathname)
  const detail = activePane ? null : detailFromPath(pathname)
  const detailDest = detail ? searchParams.get('dest') : null
  const urlCaseId = caseIdFromPath(pathname)
  const destInUrl = urlCaseId ? searchParams.get('dest') : null

  // 셸 주소로 가는 모든 <a>/<Link> 클릭을 한 곳에서 가로채 pushState 로 — 타임라인 step 행,
  // 서류 행, 내 정보 카드, 상세의 '뒤로' 링크까지 파일마다 고치지 않고 전부 즉시 전환.
  // capture 단계라 Next Link 의 자체 핸들러보다 먼저 실행되고, preventDefault 를 보면
  // Link 는 네비게이션을 건너뛴다. 새 탭/수식키/download/외부 링크는 건드리지 않는다.
  //
  // 미저장 가드와의 합: 이동은 navGuard.guard() 를 통해서만 — dirty 편집 중이면
  // "저장하지 않고 나갈까요?" confirm 후에만 pushState. nav-guard 자체 클릭 핸들러와는
  // defaultPrevented 로 서로 양보해 어느 쪽이 먼저 등록돼도 confirm 은 한 번만 뜬다.
  const navGuard = useNavGuard()
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const a = t?.closest?.('a')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const href = a.getAttribute('href')
      if (!href || !href.startsWith('/')) return
      if (!isShellHref(href)) return
      e.preventDefault()
      const go = () => {
        // 이미 그 주소면 no-op (같은 탭 재탭 등).
        if (href !== window.location.pathname + window.location.search) {
          window.history.pushState(null, '', href)
        }
      }
      if (navGuard) navGuard.guard(go)
      else go()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [navGuard])

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
        if (cancelled) return
        if (i >= queue.length) {
          // pane 예열이 끝나면 detail 레이어의 무거운 청크(step·doc 상세)도 미리 당겨
          // 온다 — 첫 상세 진입까지 스켈레톤 없이 즉시 뜨게. (mount 는 진입 시에만.)
          void import('@/components/journey/step-detail-screen')
          void import('@/components/cases/doc-detail-screen')
          void import('@/components/me/animal-edit-view')
          // 셸이 못 그리는 서버 페치 페이지(담당 병원·운송)는 라우터 캐시를 미리 데운다
          // — staleTimes(30분) 동안 진입이 즉시. 연락처가 바뀌는 드문 경우는
          // PartnerEditView 가 client 에서 스스로 갱신한다.
          for (const url of ['/me/vet', '/me/agency']) {
            try {
              // @ts-expect-error PrefetchKind enum not publicly exported; runtime 'full' matches.
              router.prefetch(url, { kind: 'full' })
            } catch {
              /* best-effort */
            }
          }
          return
        }
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
      {/* 설정 = 흰 배경(surface) 페이지 — pane 이 스스로 흰색을 칠한다. (구 EditPageShell
          의 main 직접 칠하기 핵은 keep-alive 에서 원복이 안 돼 흰 띠 버그 → 제거됨.) */}
      {shouldRender('settings') && (
        <Pane active={activePane === 'settings'} surface>
          <SettingsView />
        </Pane>
      )}
      {/* detail 레이어 — step·doc 상세, 보호자·동물 편집, 계정 삭제. pane 위에 겹치는
          '푸시된 화면'. key=pathname 으로 진입마다 새 mount (새 상태·맨위 스크롤 = 종전
          라우트 진입과 동일), 떠나면 unmount — 아래 pane 은 스크롤 그대로 대기. */}
      {detail && (
        <Pane key={pathname} active detail surface={isSurfacePage(pathname)}>
          {detail.kind === 'step' && (
            <StepDetailScreen caseId={detail.caseId} stepId={detail.stepId} dest={detailDest} />
          )}
          {detail.kind === 'doc' && (
            <DocDetailScreen caseId={detail.caseId} docId={detail.docId} dest={detailDest} />
          )}
          {detail.kind === 'guardian' && <GuardianDetail />}
          {detail.kind === 'animal' && <AnimalDetail caseId={detail.caseId} />}
          {detail.kind === 'account-delete' && <AccountDeleteView />}
          {detail.kind === 'cases' && <CasesHubScreen />}
          {detail.kind === 'feedback' && (
            <FeedbackScreen
              caseId={detail.caseId}
              dest={searchParams.get('dest')}
              rating={searchParams.get('rating')}
            />
          )}
          {detail.kind === 'guide' &&
            (() => {
              const Guide = GUIDE_SCREENS[detail.slug]
              return Guide ? <Guide /> : null
            })()}
        </Pane>
      )}
      {/* 라우트 children — /me/vet·agency(서버 페치), /cases 목록, guide, feedback 등
          셸이 안 그리는 나머지. 셸 주소에선 children 이 null page 라 숨겨도 잃는 것이 없다. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          overscrollBehaviorY: 'none',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(var(--pm-top-inset) + 48px)',
          paddingBottom: 88,
          // 흰 배경(surface) 라우트는 컨테이너가 스스로 칠한다 — 패딩 영역까지 흰색.
          background: isSurfacePage(pathname) ? 'var(--pm-surface)' : undefined,
          display: activePane || detail ? 'none' : undefined,
          zIndex: activePane || detail ? 0 : 1,
        }}
      >
        {children}
      </div>
    </>
  )
}

/** 보호자 편집 — 구 /me/guardian page 의 빈 케이스 가드 포함. */
function GuardianDetail() {
  const { cases } = useCases()
  if (cases.length === 0) {
    return <ComingSoonView title="보호자" message="먼저 케이스를 등록하세요." />
  }
  return <GuardianEditView />
}

/** 동물 편집 — 구 /me/animal/[caseId] page. 케이스 없으면(삭제 직후 등) /me 로 복귀. */
function AnimalDetail({ caseId }: { caseId: string }) {
  const caseRow = useCase(caseId)
  useEffect(() => {
    if (!caseRow) window.history.replaceState(null, '', '/me')
  }, [caseRow])
  if (!caseRow) return null
  return <AnimalEditView caseRow={caseRow} caseId={caseId} />
}

/** pane/detail 스크롤 컨테이너 — 종전 (authed) layout main 의 스크롤·패딩 문법을 그대로 이관. */
function Pane({
  active,
  detail = false,
  surface = false,
  children,
}: {
  active: boolean
  /** detail 레이어 — 상주 pane 위(zIndex)에 겹치는 푸시 화면. */
  detail?: boolean
  /** 흰 배경(surface) 화면 — 패딩 영역까지 컨테이너가 흰색을 칠한다(isSurfacePage 규칙). */
  surface?: boolean
  children: React.ReactNode
}) {
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
        background: surface ? 'var(--pm-surface)' : undefined,
        // display:none 은 스크롤 위치를 버림 — visibility 로 숨겨 각 탭의 위치 보존.
        visibility: active ? 'visible' : 'hidden',
        zIndex: active ? (detail ? 2 : 1) : 0,
      }}
    >
      {children}
    </div>
  )
}
