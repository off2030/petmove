'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Maximize2, X } from 'lucide-react'
import { TopBar, type TabId } from './topbar'
import { useCases } from '@/components/cases/cases-context'
import { CasesApp } from '@/components/cases/cases-app'
import { SettingsApp } from '@/components/settings/settings-app'
import { CalculatorApp } from '@/components/calculator/calculator-app'
import { AlertsApp } from '@/components/alerts/alerts-app'
import { SuperAdminApp } from '@/components/super-admin/super-admin-app'
import { migrateMyOAuthAvatar } from '@/lib/actions/profile'
import { listMyNotifications, type NotificationRow } from '@/lib/actions/notifications'
import { subscribeRealtime } from '@/lib/realtime/resilient-channel'
import type { SettingsBootstrap } from '@/lib/actions/settings-bootstrap'
import type { OrgSummary, SuperAdminEntry } from '@/lib/actions/super-admin'

const MemoizedCases = memo(CasesApp)
const MemoizedSettings = memo(SettingsApp)
const MemoizedCalculator = memo(CalculatorApp)
const MemoizedAlerts = memo(AlertsApp)
const MemoizedSuperAdmin = memo(SuperAdminApp)

// 펫무브 직영(platform) 고정 UUID. active-org.ts(server-only, next/headers) 를 client 에서
// import 할 수 없어 여기 상수로 둔다.
const PLATFORM_ORG_ID = '00000000-0000-0000-0000-000000000002'

function pathToTab(pathname: string): TabId {
  if (pathname.startsWith('/calculator')) return 'calculator'
  if (pathname.startsWith('/messages')) return 'messages'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/super-admin')) return 'super-admin'
  return 'cases'
}

export function DashboardShell({
  isSuperAdmin = false,
  userEmail,
  userName = null,
  userAvatarUrl = null,
  currentUserId = null,
  initialSettingsBootstrap = null,
  initialOrgs = [],
  initialSuperAdmins = [],
  activeOrgId = null,
  homeOrg = null,
  initialNotifications = [],
}: {
  isSuperAdmin?: boolean
  userEmail?: string | null
  userName?: string | null
  userAvatarUrl?: string | null
  currentUserId?: string | null
  initialSettingsBootstrap?: SettingsBootstrap | null
  initialOrgs?: OrgSummary[]
  initialSuperAdmins?: SuperAdminEntry[]
  /** 현재 활성 조직 id (impersonation 반영). 조직 스위처·미배정 이동 조건 판별. */
  activeOrgId?: string | null
  /** 본인 home org(원래 소속). 미배정 신청 이동 대상 라벨. */
  homeOrg?: { id: string; name: string } | null
  initialNotifications?: NotificationRow[]
}) {
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<TabId>(() => pathToTab(pathname))
  // 'messages'(알림 탭) 는 항상 프리마운트 — 탭 전환 시 즉시 표시. 보이지는 않음 (display:none).
  const [mounted, setMounted] = useState<Set<TabId>>(() => new Set([activeTab, 'messages']))
  const [notifications, setNotifications] = useState<NotificationRow[]>(initialNotifications)
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(userAvatarUrl ?? null)
  // 우측 하단 플로팅 버튼이 여는 알림 팝업. 알림 탭으로 이동하지 않고 그 자리에서 본다.
  const [alertsPopupOpen, setAlertsPopupOpen] = useState(false)

  // RSC subtree 재요청 (router.refresh() 등) 으로 새 initialNotifications 가 내려오면 동기화.
  // useState 의 초기값은 한 번만 채택되므로 명시적 effect 가 필요.
  useEffect(() => {
    setNotifications(initialNotifications)
  }, [initialNotifications])

  // OAuth 가입 시 박힌 외부 avatar URL(Google CDN 등)을 우리 user-avatars 버킷으로 이전.
  // 이미 우리 버킷이거나 비어있으면 no-op. 한 번 성공하면 DB 가 우리 URL로 갱신되어 이후 무동작.
  useEffect(() => {
    if (!userAvatarUrl) return
    if (userAvatarUrl.includes('/storage/v1/object/public/user-avatars/')) return
    let alive = true
    migrateMyOAuthAvatar()
      .then((r) => {
        if (!alive) return
        if (r.ok) setResolvedAvatarUrl(r.avatar_url)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [userAvatarUrl])

  // Realtime — notifications 테이블만 구독. RLS 가 postgres_changes 에 적용되므로
  // 본인 앞 알림 이벤트만 도달한다.
  useEffect(() => {
    let alive = true
    const refetch = async () => {
      const r = await listMyNotifications()
      if (!alive || !r.ok) return
      setNotifications(r.value)
    }

    // subscribeRealtime 이 setAuth·재연결·토큰갱신을 자체 관리한다.
    // onSubscribed 가 (재)구독 때마다 refetch — 끊긴 동안 놓친 알림 보충.
    const unsubscribe = subscribeRealtime(
      'notifications',
      (channel) =>
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          refetch,
        ),
      () => {
        void refetch()
      },
    )
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const messagesUnread = useMemo(
    () => notifications.reduce((s, n) => s + (n.read_at ? 0 : 1), 0),
    [notifications],
  )

  // Esc 로 알림 팝업 닫기.
  useEffect(() => {
    if (!alertsPopupOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAlertsPopupOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [alertsPopupOpen])

  // PWA 홈 화면 아이콘 뱃지 — iOS 16.4+ / Android Chrome standalone 에서만 실제 표시.
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (messagesUnread > 0) nav.setAppBadge?.(messagesUnread).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [messagesUnread])

  const { selectCase } = useCases()

  // 펫무브 직영 보기(super_admin) 여부 — 상단바 미배정 아이콘 + 목록 행별 "가져오기" 버튼 공통 조건.
  const platformMoveTargetName =
    isSuperAdmin && activeOrgId === PLATFORM_ORG_ID && homeOrg && homeOrg.id !== PLATFORM_ORG_ID
      ? homeOrg.name
      : null

  const handleTabChange = useCallback((tab: TabId) => {
    if (tab === 'cases') selectCase(null)
    setActiveTab(tab)
    setMounted((prev) => {
      if (prev.has(tab)) return prev
      return new Set([...prev, tab])
    })
    window.history.pushState(null, '', `/${tab}`)
  }, [])

  // Handle browser back/forward.
  // Defer state updates to next microtask: openCase()(cases-context) dispatches a
  // synthetic popstate while React may still be mid-render, which otherwise
  // triggers "Cannot update a component while rendering" warning.
  useEffect(() => {
    function onPopState() {
      const tab = pathToTab(window.location.pathname)
      queueMicrotask(() => {
        setActiveTab(tab)
        setMounted((prev) => {
          if (prev.has(tab)) return prev
          return new Set([...prev, tab])
        })
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <>
      {!userName && userEmail && (
        <div className="shrink-0 flex items-center justify-center gap-md px-md py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-300 text-[13px] font-serif">
          <span>
            <span className="italic">프로필 이름이 비어 있어 다른 멤버에게 이메일로 표시됩니다.</span>
          </span>
          <button
            type="button"
            onClick={() => {
              handleTabChange('settings')
              window.history.replaceState(null, '', '/settings#profile')
              window.dispatchEvent(new HashChangeEvent('hashchange'))
            }}
            className="px-2 py-0.5 rounded-full border border-amber-500/50 text-[12px] hover:bg-amber-500/10 transition-colors"
          >
            이름 설정
          </button>
        </div>
      )}
      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isSuperAdmin={isSuperAdmin}
        userEmail={userEmail}
        userName={userName}
        userAvatarUrl={resolvedAvatarUrl}
        messagesUnread={messagesUnread}
        orgs={isSuperAdmin ? initialOrgs.map((o) => ({ id: o.id, name: o.name })) : []}
        activeOrgId={activeOrgId}
        platformMoverActive={platformMoveTargetName !== null}
        platformHomeName={homeOrg?.name ?? ''}
      />
      <main className="peer flex-1 min-w-0 overflow-hidden">
        {mounted.has('cases') && (
          <div className="h-full" style={{ display: activeTab === 'cases' ? 'block' : 'none' }}>
            <MemoizedCases moveTargetName={platformMoveTargetName} />
          </div>
        )}
        {mounted.has('calculator') && (
          <div className="h-full" style={{ display: activeTab === 'calculator' ? 'block' : 'none' }}>
            <MemoizedCalculator />
          </div>
        )}
        {mounted.has('messages') && (
          <div className="h-full" style={{ display: activeTab === 'messages' ? 'block' : 'none' }}>
            <MemoizedAlerts
              notifications={notifications}
              setNotifications={setNotifications}
              isActive={activeTab === 'messages'}
              variant="tab"
            />
          </div>
        )}
{mounted.has('settings') && (
          <div className="h-full" style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <MemoizedSettings
              initialBootstrap={initialSettingsBootstrap}
              superAdminOrgs={initialOrgs}
              superAdminInitialAdmins={initialSuperAdmins}
              userEmail={userEmail}
              currentUserId={currentUserId}
            />
          </div>
        )}
        {isSuperAdmin && mounted.has('super-admin') && (
          <div className="h-full" style={{ display: activeTab === 'super-admin' ? 'block' : 'none' }}>
            <MemoizedSuperAdmin initialOrgs={initialOrgs} initialSuperAdmins={initialSuperAdmins} userEmail={userEmail ?? null} currentUserId={currentUserId} embedded />
          </div>
        )}
      </main>
      {activeTab !== 'messages' && (
        <>
          {/* 알림 팝업 — 플로팅 버튼이 여는 작은 창. 이동 없이 그 자리에서 알림을 본다.
              모바일은 화면에 거의 가득, 데스크톱은 우측 하단 고정 카드. */}
          {alertsPopupOpen && (
            <div
              role="dialog"
              aria-label="알림"
              className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-border/80 bg-[var(--pmw-sage-paper)] shadow-2xl max-md:inset-x-3 max-md:top-3 max-md:bottom-[88px] md:right-6 md:bottom-24 md:w-[380px] md:h-[560px] md:max-h-[calc(100vh-140px)]"
            >
              <div className="shrink-0 flex items-center justify-between px-md h-11 border-b border-border/80">
                <span className="inline-flex items-center gap-2 font-serif text-[15px] font-semibold text-foreground">
                  <Bell size={16} />
                  알림
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAlertsPopupOpen(false)
                      handleTabChange('messages')
                    }}
                    aria-label="전체 화면으로 보기"
                    title="전체 화면으로 보기"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Maximize2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlertsPopupOpen(false)}
                    aria-label="닫기"
                    title="닫기"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <MemoizedAlerts
                  notifications={notifications}
                  setNotifications={setNotifications}
                  isActive
                  variant="popup"
                />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAlertsPopupOpen((v) => !v)}
            aria-label={alertsPopupOpen ? '알림 닫기' : '알림 열기'}
            aria-expanded={alertsPopupOpen}
            title={
              alertsPopupOpen
                ? '알림 닫기'
                : messagesUnread > 0
                  ? `안 읽은 알림 ${messagesUnread}개`
                  : '알림'
            }
            className="fixed bottom-6 right-6 z-50 h-12 w-12 inline-flex items-center justify-center rounded-full border border-border/70 bg-secondary text-secondary-foreground shadow-md hover:bg-accent hover:scale-105 active:scale-95 transition-all max-md:peer-focus-within:hidden"
          >
            {alertsPopupOpen ? <X size={20} /> : <Bell size={20} />}
            {!alertsPopupOpen && messagesUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-destructive text-white font-mono text-[11px] font-semibold leading-none flex items-center justify-center ring-2 ring-background">
                {messagesUnread > 99 ? '99+' : messagesUnread}
              </span>
            )}
          </button>
        </>
      )}
    </>
  )
}
