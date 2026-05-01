'use client'

import { memo, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { TopBar, type TabId } from './topbar'
import { useCases } from '@/components/cases/cases-context'
import { CasesApp } from '@/components/cases/cases-app'
import { SettingsApp } from '@/components/settings/settings-app'
import { CalculatorApp } from '@/components/calculator/calculator-app'
import { MessagesApp } from '@/components/messages/messages-app'
import { SuperAdminApp } from '@/components/super-admin/super-admin-app'
import { clearImpersonation } from '@/lib/actions/super-admin'
import { migrateMyOAuthAvatar } from '@/lib/actions/profile'
import { listMyConversations } from '@/lib/actions/chat'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { SettingsBootstrap } from '@/lib/actions/settings-bootstrap'
import type { OrgSummary, SuperAdminEntry } from '@/lib/actions/super-admin'
import type { ConversationListItem } from '@/lib/actions/chat'
import type { ExternalLinksConfig } from '@petmove/domain'

const MemoizedCases = memo(CasesApp)
const MemoizedSettings = memo(SettingsApp)
const MemoizedCalculator = memo(CalculatorApp)
const MemoizedMessages = memo(MessagesApp)
const MemoizedSuperAdmin = memo(SuperAdminApp)

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
  impersonation = null,
  initialExternalLinks,
  initialConversations = [],
}: {
  isSuperAdmin?: boolean
  userEmail?: string | null
  userName?: string | null
  userAvatarUrl?: string | null
  currentUserId?: string | null
  initialSettingsBootstrap?: SettingsBootstrap | null
  initialOrgs?: OrgSummary[]
  initialSuperAdmins?: SuperAdminEntry[]
  impersonation?: { orgId: string; orgName: string } | null
  initialExternalLinks: ExternalLinksConfig
  initialConversations?: ConversationListItem[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<TabId>(() => pathToTab(pathname))
  const [mounted, setMounted] = useState<Set<TabId>>(() => new Set([activeTab]))
  const [endingImpersonation, startEndImpersonation] = useTransition()
  const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations)
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(userAvatarUrl ?? null)

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

  // Realtime — 통합 채팅 (1:1/그룹 같은 테이블).
  // RLS 가 postgres_changes 에 적용되므로 본인 참여 대화방 이벤트만 도달.
  useEffect(() => {
    let alive = true
    const refetch = async () => {
      const r = await listMyConversations()
      if (!alive || !r.ok) return
      setConversations(r.value)
    }
    refetch()
    const channel = supabaseBrowser
      .channel('topbar-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, refetch)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_participants' },
        refetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reads' },
        refetch,
      )
      .subscribe()
    return () => {
      alive = false
      void supabaseBrowser.removeChannel(channel)
    }
  }, [])

  const messagesUnread = useMemo(
    () => conversations.reduce((s, c) => s + c.unread_count, 0),
    [conversations],
  )

  const onEndImpersonation = useCallback(() => {
    startEndImpersonation(async () => {
      await clearImpersonation()
      router.refresh()
    })
  }, [router])

  const { selectCase } = useCases()

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
      {impersonation && (
        <div className="shrink-0 flex items-center justify-center gap-md px-md py-1.5 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-700/50 text-amber-900 dark:text-amber-100 text-[13px] font-serif">
          <span>
            <span className="italic">임시 보기 중</span>{' '}
            <span className="font-semibold">{impersonation.orgName}</span>
          </span>
          <button
            type="button"
            onClick={onEndImpersonation}
            disabled={endingImpersonation}
            className="px-2 py-0.5 rounded-full border border-amber-400/60 dark:border-amber-500/40 text-[12px] hover:bg-amber-200/60 dark:hover:bg-amber-800/40 transition-colors disabled:opacity-40"
          >
            원래대로
          </button>
        </div>
      )}
      <TopBar activeTab={activeTab} onTabChange={handleTabChange} isSuperAdmin={isSuperAdmin} userEmail={userEmail} userName={userName} userAvatarUrl={resolvedAvatarUrl} messagesUnread={messagesUnread} />
      <main className="peer flex-1 min-w-0 overflow-hidden">
        {mounted.has('cases') && (
          <div className="h-full" style={{ display: activeTab === 'cases' ? 'block' : 'none' }}>
            <MemoizedCases />
          </div>
        )}
        {mounted.has('calculator') && (
          <div className="h-full" style={{ display: activeTab === 'calculator' ? 'block' : 'none' }}>
            <MemoizedCalculator initialExternalLinks={initialExternalLinks} />
          </div>
        )}
        {mounted.has('messages') && (
          <div className="h-full" style={{ display: activeTab === 'messages' ? 'block' : 'none' }}>
            <MemoizedMessages
              conversations={conversations}
              setConversations={setConversations}
              currentUserId={currentUserId}
              isActive={activeTab === 'messages'}
            />
          </div>
        )}
{mounted.has('settings') && (
          <div className="h-full" style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <MemoizedSettings initialBootstrap={initialSettingsBootstrap} />
          </div>
        )}
        {isSuperAdmin && mounted.has('super-admin') && (
          <div className="h-full" style={{ display: activeTab === 'super-admin' ? 'block' : 'none' }}>
            <MemoizedSuperAdmin initialOrgs={initialOrgs} initialSuperAdmins={initialSuperAdmins} userEmail={userEmail ?? null} currentUserId={currentUserId} embedded />
          </div>
        )}
      </main>
      {activeTab !== 'messages' && (
        <button
          type="button"
          onClick={() => handleTabChange('messages')}
          aria-label="채팅 열기"
          title={messagesUnread > 0 ? `안 읽은 메시지 ${messagesUnread}개` : '채팅'}
          className="fixed bottom-6 right-6 z-40 h-14 w-14 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-transform max-md:peer-focus-within:hidden"
        >
          <MessageSquare size={22} />
          {messagesUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-white font-mono text-[11px] font-semibold leading-none flex items-center justify-center ring-2 ring-background">
              {messagesUnread > 99 ? '99+' : messagesUnread}
            </span>
          )}
        </button>
      )}
    </>
  )
}
