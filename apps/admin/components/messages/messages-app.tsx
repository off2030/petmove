'use client'

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  ArrowLeft,
  Bookmark,
  Check,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Search,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  addParticipant,
  createConversation,
  deleteConversation,
  deleteMessage,
  getOrCreateDM,
  leaveConversation,
  listConversationMessages,
  listMembersForDmPicker,
  listMyConversations,
  listOrgsForDmPicker,
  markConversationRead,
  pinMessage,
  removeParticipant,
  renameConversation,
  searchMessagesInConversation,
  sendMessage,
  type ConversationListItem,
  type MemberPickerItem,
  type MessageRow,
  type MessageSearchHit,
  type OrgPickerItem,
  type Participant,
} from '@/lib/actions/chat'
import { PageShell } from '@/components/ui/page-shell'
import { Avatar, avatarInitial } from '@/components/ui/avatar'
import { getCachedConv, setCachedConv, deleteCachedConv } from '@/lib/messages/cache-idb'
import { AttachButton } from '@/components/ui/attach-button'

const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024
const NAME_MAX = 50

export function MessagesApp({
  conversations,
  setConversations,
  currentUserId,
  isActive,
}: {
  conversations: ConversationListItem[]
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>
  currentUserId: string | null
  isActive: boolean
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [reads, setReads] = useState<Array<{ user_id: string; last_read_at: string }>>([])
  const [pinnedMessage, setPinnedMessage] = useState<MessageRow | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showNewConv, setShowNewConv] = useState(false)

  // convId 별 마지막 fetch 결과 캐시 — 같은 방을 재진입하면 즉시 표시 후
  // background refresh 만 수행해 첫 진입 외에는 로딩 깜빡임 제거.
  type ConvSnapshot = {
    messages: MessageRow[]
    participants: Participant[]
    reads: Array<{ user_id: string; last_read_at: string }>
    pinned_message: MessageRow | null
  }
  const cacheRef = useRef<Map<string, ConvSnapshot>>(new Map())

  const refresh = useCallback(
    async (convId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingMessages(true)
      const r = await listConversationMessages({ convId })
      if (r.ok) {
        const snap = {
          messages: r.value.messages,
          participants: r.value.participants,
          reads: r.value.reads,
          pinned_message: r.value.pinned_message,
        }
        cacheRef.current.set(convId, snap)
        // IDB 영속 저장 (silent fail) — 다음 세션/새로고침에서도 즉시 표시.
        void setCachedConv(convId, snap)
        setMessages(r.value.messages)
        setParticipants(r.value.participants)
        setReads(r.value.reads)
        setPinnedMessage(r.value.pinned_message)
      }
      if (!opts?.silent) setLoadingMessages(false)
    },
    [],
  )

  // realtime 이벤트가 짧은 시간에 여러 번 와도 한번만 refetch.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = useCallback(
    (convId: string) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        refresh(convId, { silent: true })
      }, 200)
    },
    [refresh],
  )

  // 대화목록이 채워지면 — 모든 conv 의 메시지를 백그라운드 prefetch.
  // 사용자가 어떤 대화를 탭하든 in-memory cache hit → 즉시 표시.
  // 동시 요청이 많으면 서버 부담 → 동시 3개로 제한 + 이미 캐시 있으면 skip.
  const prefetchedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!isActive || conversations.length === 0) return
    let canceled = false
    const PARALLEL = 3
    const queue = conversations
      .map((c) => c.id)
      .filter((id) => !cacheRef.current.has(id) && !prefetchedRef.current.has(id))
    if (queue.length === 0) return

    async function worker() {
      while (!canceled) {
        const id = queue.shift()
        if (!id) return
        prefetchedRef.current.add(id)
        try {
          const r = await listConversationMessages({ convId: id })
          if (canceled) return
          if (r.ok) {
            const snap = {
              messages: r.value.messages,
              participants: r.value.participants,
              reads: r.value.reads,
              pinned_message: r.value.pinned_message,
            }
            cacheRef.current.set(id, snap)
            void setCachedConv(id, snap)
          }
        } catch {
          // ignore — 사용자가 직접 탭했을 때 다시 fetch.
        }
      }
    }

    const workers = Array.from({ length: Math.min(PARALLEL, queue.length) }, () => worker())
    void Promise.all(workers)
    return () => {
      canceled = true
    }
  }, [isActive, conversations])

  // 활성 대화방 — 캐시 우선 표시 + 첫 로드 + Realtime
  useEffect(() => {
    if (!activeId) {
      setMessages([])
      setParticipants([])
      setReads([])
      setPinnedMessage(null)
      return
    }
    const convId = activeId

    // 1) in-memory 캐시 우선. miss 면 IDB 조회 후 hydrate. 둘 다 miss 면 loading.
    const cached = cacheRef.current.get(convId)
    if (cached) {
      setMessages(cached.messages)
      setParticipants(cached.participants)
      setReads(cached.reads)
      setPinnedMessage(cached.pinned_message)
      refresh(convId, { silent: true })
    } else {
      // 네트워크 fetch 와 IDB 조회를 동시에 시작. 보통 IDB 가 먼저 끝나
      // 즉시 화면이 채워지고, 잠시 뒤 fetch 가 최신 데이터로 덮음.
      // 만약 fetch 가 먼저 끝났으면 (in-memory cache 존재) IDB 응답 무시.
      void getCachedConv(convId).then((snap) => {
        if (!snap) return
        if (cacheRef.current.has(convId)) return
        const restored = {
          messages: snap.messages,
          participants: snap.participants,
          reads: snap.reads,
          pinned_message: snap.pinned_message,
        }
        cacheRef.current.set(convId, restored)
        setMessages(restored.messages)
        setParticipants(restored.participants)
        setReads(restored.reads)
        setPinnedMessage(restored.pinned_message)
        setLoadingMessages(false)
      })
      refresh(convId)
    }

    // 2) Realtime — 본인이 보낸 INSERT 는 이미 낙관적으로 추가했으므로 skip,
    //    그 외 모든 변경은 200ms debounce 로 묶어 1회 refetch.
    const channel = supabaseBrowser
      .channel(`conv:${convId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const sender = (payload.new as { sender_user_id?: string } | null)?.sender_user_id
          if (sender && sender === currentUserId) return
          scheduleRefresh(convId)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        () => scheduleRefresh(convId),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        () => scheduleRefresh(convId),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reads',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const userId =
            (payload.new as { user_id?: string } | null)?.user_id ??
            (payload.old as { user_id?: string } | null)?.user_id
          if (userId && userId === currentUserId) return
          scheduleRefresh(convId)
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `conversation_id=eq.${convId}`,
        },
        () => scheduleRefresh(convId),
      )
      .subscribe()
    return () => {
      void supabaseBrowser.removeChannel(channel)
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [activeId, currentUserId, refresh, scheduleRefresh])

  // 메시지 탭이 활성일 때만 read 처리
  useEffect(() => {
    if (!activeId || !isActive) return
    const convId = activeId
    markConversationRead(convId).then(() => {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)),
      )
    })
  }, [activeId, messages.length, isActive, setConversations])

  const activeConv = useMemo(
    () => (activeId ? conversations.find((c) => c.id === activeId) ?? null : null),
    [conversations, activeId],
  )

  // 공지 변경 — 인박스 row 가 갱신되면 thread 도 동기화
  const activePinnedId = activeConv?.pinned_message_id ?? null
  useEffect(() => {
    if (!activeId) return
    if ((pinnedMessage?.id ?? null) === activePinnedId) return
    refresh(activeId, { silent: true })
  }, [activePinnedId, activeId, pinnedMessage?.id, refresh])

  const onSelect = useCallback((c: ConversationListItem) => {
    setActiveId(c.id)
  }, [])

  async function handleNewConvCreated(convId: string) {
    setShowNewConv(false)
    const r = await listMyConversations()
    if (r.ok) setConversations(r.value)
    setActiveId(convId)
  }

  async function refreshConversationsList() {
    const r = await listMyConversations()
    if (r.ok) setConversations(r.value)
  }

  return (
    <PageShell title="메시지" hideTitleMobile mobileFlush>
      <div className="h-full mx-0 md:mx-lg flex flex-row min-h-0 gap-0 md:gap-md">
        {/* List — 모바일은 thread 활성 시 숨김, 아니면 풀폭. 데스크톱은 항상 280px. */}
        <div className={cn(
          'min-h-0 flex flex-col md:border md:border-border/80 md:rounded-lg overflow-hidden bg-[var(--pmw-sage-paper)]',
          'md:shrink-0',
          activeConv ? 'hidden md:flex' : 'flex flex-1 md:flex-none',
        )}>
          <InboxListPane
            items={conversations}
            activeId={activeId}
            onSelect={onSelect}
            onNewConv={() => setShowNewConv(true)}
          />
        </div>
        {/* Thread — 모바일은 thread 활성 시만, 데스크톱은 항상. */}
        <div className={cn(
          'flex-1 min-w-0 min-h-0 flex-col md:border md:border-border/80 md:rounded-lg overflow-hidden bg-[var(--pmw-sage-paper)]',
          activeConv ? 'flex' : 'hidden md:flex',
        )}>
          {activeConv ? (
            <ThreadPane
              key={activeConv.id}
              conv={activeConv}
              messages={messages}
              participants={participants}
              reads={reads}
              pinnedMessage={pinnedMessage}
              loading={loadingMessages}
              currentUserId={currentUserId}
              onClose={() => setActiveId(null)}
              onMessageSent={(m) => {
                // 낙관적 추가 + cache 동기화. realtime 자체 echo 는 스킵되므로
                // 명시적 refresh() 불필요 — UI flash 제거.
                setMessages((prev) => {
                  const next = [...prev, m]
                  const snap = cacheRef.current.get(activeConv.id)
                  if (snap) cacheRef.current.set(activeConv.id, { ...snap, messages: next })
                  return next
                })
              }}
              onMessageDeleted={(msgId) => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m,
                  ),
                )
              }}
              onLeftOrDeleted={() => {
                const leftId = activeConv.id
                setActiveId(null)
                setMessages([])
                setParticipants([])
                setReads([])
                setPinnedMessage(null)
                cacheRef.current.delete(leftId)
                void deleteCachedConv(leftId)
                setConversations((prev) => prev.filter((c) => c.id !== leftId))
              }}
              onPinChange={async (msgId) => {
                const r = await pinMessage({ convId: activeConv.id, msgId })
                if (!r.ok) {
                  alert(`공지 처리 실패: ${r.error}`)
                  return
                }
                await refresh(activeConv.id, { silent: true })
                await refreshConversationsList()
              }}
              onMembersChanged={() => {
                refresh(activeConv.id, { silent: true })
                refreshConversationsList()
              }}
              onRenamed={(name) => {
                setConversations((prev) =>
                  prev.map((c) => (c.id === activeConv.id ? { ...c, name } : c)),
                )
              }}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
      {showNewConv && (
        <NewConversationModal
          onClose={() => setShowNewConv(false)}
          onCreated={handleNewConvCreated}
        />
      )}
    </PageShell>
  )
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <p className="font-serif text-[18px]">대화를 선택하세요</p>
        <p className="font-mono text-[12px] mt-1 text-muted-foreground/70">
          왼쪽 상단의 + 버튼으로 새 대화를 시작할 수 있습니다
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// 인박스 — 1:1 / 그룹 통합
// ─────────────────────────────────────────────────

function displayNameFor(c: ConversationListItem): string {
  if (c.name) return c.name
  if (c.participants.length === 0) return '(빈 대화방)'
  return (
    c.participants
      .map((p) => p.name ?? p.email ?? '?')
      .filter(Boolean)
      .join(', ') || '(이름 없음)'
  )
}

function InboxListPane({
  items,
  activeId,
  onSelect,
  onNewConv,
}: {
  items: ConversationListItem[]
  activeId: string | null
  onSelect: (c: ConversationListItem) => void
  onNewConv: () => void
}) {
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((c) => {
      const name = (c.name ?? '').toLowerCase()
      const memberText = c.participants
        .map((p) => `${p.name ?? ''} ${p.email ?? ''} ${p.org_name ?? ''}`)
        .join(' ')
        .toLowerCase()
      return name.includes(q) || memberText.includes(q)
    })
  }, [items, query])

  return (
    <aside className="w-full md:w-[280px] md:shrink-0 flex flex-col min-h-0">
      <div className="shrink-0 px-md py-sm min-h-[60px] flex items-center justify-between">
        <h2 className="font-serif text-[18px] font-semibold text-foreground">채팅</h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              setShowSearch((v) => {
                if (v) setQuery('')
                return !v
              })
            }}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full text-foreground hover:bg-accent/60 transition-colors"
            title="검색"
            aria-label="검색"
            aria-pressed={showSearch}
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={onNewConv}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full text-foreground hover:bg-accent/60 transition-colors"
            title="새 대화"
            aria-label="새 대화"
          >
            <MessageSquarePlus size={20} />
          </button>
        </div>
      </div>
      {showSearch && (
        <div className="shrink-0 px-md pb-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 / 조직 / 그룹 검색"
              autoFocus
              className="w-full h-8 rounded-full border border-border/80 bg-popover pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
            />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        {filtered.length === 0 ? (
          <div className="px-md py-lg text-center text-[13px] text-muted-foreground/70">
            {items.length === 0 ? '아직 대화가 없습니다' : '결과 없음'}
          </div>
        ) : (
          <ul>
            {filtered.map((c) => (
              <li key={c.id}>
                <ConversationRow
                  conv={c}
                  active={activeId === c.id}
                  onClick={() => onSelect(c)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: ConversationListItem
  active: boolean
  onClick: () => void
}) {
  const displayName = displayNameFor(conv)
  const isGroup = conv.participants.length >= 2
  const subtitle = isGroup ? null : conv.participants[0]?.org_name ?? null
  const avatarLabel = avatarInitial(displayName || '?')
  const avatarImage = isGroup ? null : conv.participants[0]?.avatar_url ?? null
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-md py-sm border-b border-border/40 transition-colors flex items-center gap-sm',
        active
          ? 'bg-[var(--pmw-sage-soft)]'
          : 'hover:bg-[var(--pmw-sage-soft)]/50',
      )}
    >
      <span className="shrink-0">
        <Avatar label={avatarLabel} imageUrl={avatarImage} tone="sage" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-serif text-[15px] text-foreground truncate leading-normal">
          {displayName}
        </span>
        {subtitle && (
          <span className="block font-serif italic text-[12px] text-muted-foreground truncate leading-normal mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      {conv.unread_count > 0 && (
        <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white font-mono text-[10px] font-semibold">
          {conv.unread_count > 99 ? '99+' : conv.unread_count}
        </span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────
// 새 대화 모달 — 조직 → 멤버 (다중 선택)
// 1명 선택 → getOrCreateDM, 2명+ → createConversation
// ─────────────────────────────────────────────────

interface SelectedMember {
  user_id: string
  name: string | null
  email: string | null
  org_name: string | null
}

function NewConversationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (convId: string) => void
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<SelectedMember[]>([])
  const [step, setStep] = useState<'org' | 'member'>('org')
  const [orgs, setOrgs] = useState<OrgPickerItem[]>([])
  const [orgQuery, setOrgQuery] = useState('')
  const [selectedOrg, setSelectedOrg] = useState<OrgPickerItem | null>(null)
  const [members, setMembers] = useState<MemberPickerItem[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()

  useEffect(() => {
    if (step !== 'org') return
    setLoadingOrgs(true)
    const id = setTimeout(async () => {
      const r = await listOrgsForDmPicker({ search: orgQuery })
      if (r.ok) setOrgs(r.value)
      setLoadingOrgs(false)
    }, 150)
    return () => clearTimeout(id)
  }, [step, orgQuery])

  useEffect(() => {
    if (step !== 'member' || !selectedOrg) return
    setLoadingMembers(true)
    const id = setTimeout(async () => {
      const r = await listMembersForDmPicker({ orgId: selectedOrg.id, search: memberQuery })
      if (r.ok) setMembers(r.value)
      setLoadingMembers(false)
    }, 150)
    return () => clearTimeout(id)
  }, [step, selectedOrg, memberQuery])

  const selectedIds = useMemo(() => new Set(selected.map((m) => m.user_id)), [selected])

  function pickOrg(o: OrgPickerItem) {
    setSelectedOrg(o)
    setMemberQuery('')
    setStep('member')
  }

  function toggleMember(m: MemberPickerItem) {
    setError(null)
    if (selectedIds.has(m.user_id)) {
      setSelected((prev) => prev.filter((s) => s.user_id !== m.user_id))
      return
    }
    setSelected((prev) => [
      ...prev,
      {
        user_id: m.user_id,
        name: m.name,
        email: m.email,
        org_name: selectedOrg?.name ?? null,
      },
    ])
  }

  function removeSelected(userId: string) {
    setSelected((prev) => prev.filter((s) => s.user_id !== userId))
  }

  function backToOrgs() {
    setStep('org')
    setMembers([])
    setMemberQuery('')
  }

  function submit() {
    if (selected.length === 0) {
      setError('최소 1명을 선택해 주세요')
      return
    }
    setError(null)
    startSubmit(async () => {
      if (selected.length === 1) {
        const r = await getOrCreateDM({ otherUserId: selected[0].user_id })
        if (r.ok) onCreated(r.value.id)
        else setError(r.error)
        return
      }
      const r = await createConversation({
        name: name.trim() || null,
        memberIds: selected.map((s) => s.user_id),
      })
      if (r.ok) onCreated(r.value.conversationId)
      else setError(r.error)
    })
  }

  const isGroup = selected.length >= 2

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-h-[80vh] flex flex-col rounded-lg border border-border/80 bg-popover shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-md py-sm border-b border-border/80">
          <h2 className="font-serif text-[16px] text-foreground">새 대화</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {isGroup && (
          <div className="shrink-0 px-md py-sm border-b border-border/40">
            <label className="block text-[11px] text-muted-foreground/70 mb-1">
              그룹 이름 (선택, 최대 {NAME_MAX}자)
            </label>
            <input
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="비워두면 멤버 이름으로 표시"
              className="w-full h-8 rounded-md border border-border/80 bg-card px-sm text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
            />
          </div>
        )}

        {selected.length > 0 && (
          <div className="shrink-0 px-md py-sm border-b border-border/40">
            <div className="text-[11px] text-muted-foreground/70 mb-1">
              선택됨 ({selected.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {selected.map((s) => (
                <span
                  key={s.user_id}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/70 pl-2 pr-1 py-0.5 text-[12px]"
                >
                  <span className="font-serif">{s.name ?? s.email ?? '(이름 없음)'}</span>
                  {s.org_name && (
                    <span className="text-muted-foreground/70 text-[10px]">· {s.org_name}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSelected(s.user_id)}
                    className="rounded-full hover:bg-background/60 p-0.5"
                    aria-label="제거"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {step === 'member' && (
          <div className="shrink-0 px-md pt-sm">
            <button
              type="button"
              onClick={backToOrgs}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              ← 다른 조직 선택
            </button>
          </div>
        )}

        <div className="shrink-0 px-md py-sm relative">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          {step === 'org' ? (
            <input
              autoFocus
              value={orgQuery}
              onChange={(e) => setOrgQuery(e.target.value)}
              placeholder="조직 이름"
              className="w-full h-8 rounded-md border border-border/80 bg-card pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
            />
          ) : (
            <input
              autoFocus
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder={`${selectedOrg?.name ?? ''} — 이름 / 이메일`}
              className="w-full h-8 rounded-md border border-border/80 bg-card pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
            />
          )}
        </div>

        {error && (
          <div className="shrink-0 mx-md mb-sm rounded-md border border-destructive/40 bg-destructive/10 px-md py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal">
          {step === 'org' ? (
            loadingOrgs ? (
              <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
                불러오는 중…
              </p>
            ) : orgs.length === 0 ? (
              <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
                {orgQuery ? '결과 없음' : '조직이 없습니다'}
              </p>
            ) : (
              <ul>
                {orgs.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => pickOrg(o)}
                      className="w-full text-left px-md py-2 text-[14px] hover:bg-accent transition-colors border-b border-border/30 last:border-b-0"
                    >
                      {o.name}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : loadingMembers ? (
            <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
              불러오는 중…
            </p>
          ) : members.length === 0 ? (
            <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
              {memberQuery ? '결과 없음' : '대화 가능한 멤버가 없습니다'}
            </p>
          ) : (
            <ul>
              {members.map((m) => {
                const checked = selectedIds.has(m.user_id)
                return (
                  <li key={m.user_id}>
                    <button
                      type="button"
                      onClick={() => toggleMember(m)}
                      className={`w-full text-left px-md py-2 hover:bg-accent transition-colors border-b border-border/30 last:border-b-0 flex items-center gap-sm ${
                        checked ? 'bg-accent/40' : ''
                      }`}
                    >
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                          checked
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border'
                        }`}
                      >
                        {checked && <span className="text-[10px]">✓</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] text-foreground truncate">
                          {m.name ?? '(이름 없음)'}
                        </div>
                        {m.email && (
                          <div className="text-[11px] text-muted-foreground/70 font-mono truncate">
                            {m.email}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 px-md py-sm border-t border-border/80 flex items-center justify-between gap-sm">
          <span className="text-[12px] text-muted-foreground/70">
            {selected.length === 0
              ? '1명 = 1:1 / 2명+ = 그룹'
              : selected.length === 1
                ? '1:1 대화'
                : `그룹 (본인 + ${selected.length}명)`}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || selected.length === 0}
            className="inline-flex items-center h-8 px-3 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {submitting ? '시작 중…' : '대화 시작'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// 작성 중… (Realtime broadcast) — 1:1 전용
// ─────────────────────────────────────────────────

function useTypingChannel(convId: string, currentUserId: string | null, enabled: boolean) {
  const [otherTyping, setOtherTyping] = useState(false)
  const lastEmitRef = useRef(0)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null)

  useEffect(() => {
    if (!enabled || !convId || !currentUserId) return
    const channel = supabaseBrowser.channel(`chat:${convId}`, {
      config: { broadcast: { self: false } },
    })
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const fromUserId = (payload.payload as { user_id?: string } | null)?.user_id
      if (!fromUserId || fromUserId === currentUserId) return
      setOtherTyping(true)
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      clearTimerRef.current = setTimeout(() => setOtherTyping(false), 4000)
    })
    channel.subscribe()
    channelRef.current = channel
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      channel.unsubscribe()
      channelRef.current = null
      setOtherTyping(false)
    }
  }, [convId, currentUserId, enabled])

  const emitTyping = useCallback(() => {
    if (!enabled || !currentUserId || !channelRef.current) return
    const now = Date.now()
    if (now - lastEmitRef.current < 2000) return
    lastEmitRef.current = now
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUserId },
    })
  }, [currentUserId, enabled])

  return { otherTyping, emitTyping }
}

// ─────────────────────────────────────────────────
// 통합 스레드 패널 — 1:1 / 그룹
// ─────────────────────────────────────────────────

function ThreadPane({
  conv,
  messages,
  participants,
  reads,
  pinnedMessage,
  loading,
  currentUserId,
  onClose,
  onMessageSent,
  onMessageDeleted,
  onLeftOrDeleted,
  onPinChange,
  onMembersChanged,
  onRenamed,
}: {
  conv: ConversationListItem
  messages: MessageRow[]
  participants: Participant[]
  reads: Array<{ user_id: string; last_read_at: string }>
  pinnedMessage: MessageRow | null
  loading: boolean
  currentUserId: string | null
  onClose: () => void
  onMessageSent: (m: MessageRow) => void
  onMessageDeleted: (msgId: string) => void
  onLeftOrDeleted: () => void
  onPinChange: (msgId: string | null) => Promise<void>
  onMembersChanged: () => void
  onRenamed: (name: string | null) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const confirm = useConfirm()
  const [showMembers, setShowMembers] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(conv.name ?? '')
  const [, startRename] = useTransition()
  const [busy, setBusy] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MessageSearchHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const isGroup = participants.length >= 2
  const memberCount = participants.length // 본인 제외
  const totalCount = memberCount + 1
  const { otherTyping, emitTyping } = useTypingChannel(conv.id, currentUserId, !isGroup)

  useEffect(() => {
    setDraftName(conv.name ?? '')
    setEditingName(false)
  }, [conv.id, conv.name])

  // 대화방 전환 — 검색 상태 리셋
  useEffect(() => {
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
    setShowActionMenu(false)
  }, [conv.id])

  // 액션 메뉴 — 바깥 클릭 / Esc 로 닫기
  useEffect(() => {
    if (!showActionMenu) return
    function onDown(e: MouseEvent) {
      if (!actionMenuRef.current?.contains(e.target as Node)) setShowActionMenu(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowActionMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showActionMenu])

  // 메시지 길이 변경시에만 자동 스크롤. otherTyping 토글로는 스크롤하지
  // 않음 — 사용자가 위로 스크롤해서 과거 메시지 보고 있을 때 상대 입력
  // 표시가 떠도 강제 하단 이동 안 일어남.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  // 검색 — 250ms debounce
  useEffect(() => {
    const q = searchQuery.trim()
    if (!showSearch || !q) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    const handle = setTimeout(async () => {
      const r = await searchMessagesInConversation({ convId: conv.id, query: q })
      if (r.ok) setSearchResults(r.value)
      setSearchLoading(false)
    }, 250)
    return () => clearTimeout(handle)
  }, [conv.id, searchQuery, showSearch])

  function jumpToMessage(msgId: string) {
    const el = document.getElementById(`msg-${msgId}`)
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('bg-accent/40', 'rounded-md')
    setTimeout(() => el.classList.remove('bg-accent/40', 'rounded-md'), 1400)
    return true
  }

  const headerTitle = useMemo(() => {
    if (conv.name) return conv.name
    if (participants.length === 0) return '(빈 대화방)'
    return participants
      .map((p) => p.name ?? p.email ?? '?')
      .filter(Boolean)
      .join(', ') || '(이름 없음)'
  }, [conv.name, participants])

  // 1:1 — 상대 프로필 (Settings/Members 스타일).
  const other = !isGroup ? participants[0] ?? null : null
  const otherHasRealName = !!(other?.name && other.name.trim() && other.name !== other.email)
  const otherDisplayName = otherHasRealName ? (other?.name ?? '') : (other?.email ?? '')
  const headerAvatarLabel = avatarInitial(isGroup ? headerTitle : otherDisplayName || '?')
  const headerAvatarImage = isGroup ? null : other?.avatar_url ?? null
  const headerSubtitle = isGroup ? `${totalCount}명` : other?.org_name ?? null

  const readsByUser = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of reads) map.set(r.user_id, r.last_read_at)
    return map
  }, [reads])

  // 1:1 — 상대 last_read_at
  const otherLastReadAt = useMemo(() => {
    if (isGroup || !participants[0]) return null
    return readsByUser.get(participants[0].user_id) ?? null
  }, [isGroup, participants, readsByUser])

  // 메시지별 readCount 를 한 번에 계산 — 매 렌더 O(n×m) 재계산 회피.
  // participants/reads/messages 가 바뀔 때만 재계산.
  const readCountByMsgId = useMemo(() => {
    const out = new Map<string, number>()
    if (!currentUserId) return out
    // 참여자별 last_read_at 의 ms 값을 미리 구해 비교 비용 낮춤.
    const participantReadMs: number[] = []
    for (const p of participants) {
      const rd = readsByUser.get(p.user_id)
      if (rd) participantReadMs.push(new Date(rd).getTime())
    }
    for (const m of messages) {
      if (m.sender_user_id !== currentUserId) continue
      const created = new Date(m.created_at).getTime()
      let count = 0
      for (const ms of participantReadMs) if (created <= ms) count += 1
      out.set(m.id, count)
    }
    return out
  }, [currentUserId, messages, participants, readsByUser])

  async function handleRename() {
    const next = draftName.trim().slice(0, NAME_MAX) || null
    setEditingName(false)
    if ((next ?? '') === (conv.name ?? '')) return
    startRename(async () => {
      const r = await renameConversation({ convId: conv.id, name: next })
      if (!r.ok) {
        alert(`이름 변경 실패: ${r.error}`)
        return
      }
      onRenamed(next)
    })
  }

  async function handleLeave() {
    const ok = await confirm({
      message: isGroup ? '이 그룹에서 나가시겠습니까?' : '이 대화방에서 나가시겠습니까?',
      description: '나간 후에도 다른 멤버가 다시 초대할 수 있습니다.',
      okLabel: '나가기',
      variant: 'destructive',
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await leaveConversation(conv.id)
      if (!r.ok) {
        alert(`나가기 실패: ${r.error}`)
        return
      }
      onLeftOrDeleted()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      message: '이 대화방을 완전히 삭제하시겠습니까?',
      description: '메시지·첨부파일·멤버십이 모두 제거됩니다. 복구할 수 없습니다.',
      okLabel: '삭제',
      cancelLabel: '취소',
      variant: 'destructive',
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await deleteConversation({ convId: conv.id })
      if (!r.ok) {
        alert(`삭제 실패: ${r.error}`)
        return
      }
      onLeftOrDeleted()
    } finally {
      setBusy(false)
    }
  }

  async function handleKick(p: Participant) {
    const ok = await confirm({
      message: `${p.name ?? p.email ?? '이 멤버'}를 추방하시겠습니까?`,
      okLabel: '추방',
      variant: 'destructive',
    })
    if (!ok) return
    const r = await removeParticipant({ convId: conv.id, userId: p.user_id })
    if (!r.ok) {
      alert(`추방 실패: ${r.error}`)
      return
    }
    onMembersChanged()
  }

  const handleMessageDelete = useCallback(async (msgId: string) => {
    const ok = await confirm({
      message: '이 메시지를 삭제하시겠습니까?',
      description: isGroup
        ? undefined
        : '상대방 화면에서도 "삭제된 메시지" 로 표시됩니다.',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const r = await deleteMessage(msgId)
    if (!r.ok) {
      alert(`삭제 실패: ${r.error}`)
      return
    }
    onMessageDeleted(msgId)
  }, [confirm, isGroup, onMessageDeleted])

  // 메시지별 onPin/onDelete 콜백을 매 렌더마다 새로 만들면 React.memo 가
  // 깨짐. (msgId, currentlyPinned) 시그니처로 통일해 안정 ref 유지.
  const handleTogglePin = useCallback(
    (msgId: string, currentlyPinned: boolean) => {
      void onPinChange(currentlyPinned ? null : msgId)
    },
    [onPinChange],
  )

  return (
    <>
      <div className="shrink-0 px-md py-sm min-h-[60px] flex items-center justify-between gap-md border-b border-[var(--pmw-border-warm)]">
        <div className="min-w-0 flex items-center gap-sm">
          <button
            type="button"
            onClick={onClose}
            aria-label="목록으로"
            title="목록으로"
            className="md:hidden -ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <Avatar label={headerAvatarLabel} imageUrl={headerAvatarImage} tone="sage" />
          {editingName ? (
            <input
              autoFocus
              value={draftName}
              maxLength={NAME_MAX}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                } else if (e.key === 'Escape') {
                  setDraftName(conv.name ?? '')
                  setEditingName(false)
                }
              }}
              placeholder="대화방 이름 (선택)"
              className="font-serif text-[16px] bg-transparent border-b border-border/80 focus-visible:outline-none focus-visible:border-foreground/40 min-w-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftName(conv.name ?? '')
                setEditingName(true)
              }}
              className="group/name min-w-0 flex flex-col text-left"
              title="이름 변경"
            >
              <span className="flex items-center gap-1 min-w-0">
                <span className="font-serif text-[16px] text-foreground truncate leading-normal min-w-0">
                  {headerTitle}
                </span>
                <Pencil
                  size={11}
                  className="shrink-0 text-muted-foreground/40 opacity-0 group-hover/name:opacity-100 transition-opacity"
                />
              </span>
              {headerSubtitle && (
                <span className="font-serif italic text-[12px] text-muted-foreground truncate leading-normal mt-0.5">
                  {headerSubtitle}
                </span>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-md">
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            title="메시지 검색"
            aria-label="메시지 검색"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              showSearch
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Search size={20} />
          </button>
          <div ref={actionMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowActionMenu((v) => !v)}
              aria-label="대화방 메뉴"
              aria-haspopup="menu"
              aria-expanded={showActionMenu}
              title="대화방 메뉴"
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                showActionMenu
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Menu size={20} />
            </button>
            {showActionMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-44 rounded-md border border-border/80 bg-popover shadow-md py-1 z-30"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMembers((v) => !v)
                    setShowActionMenu(false)
                  }}
                  className="w-full flex items-center gap-sm px-md py-2 text-[13px] text-foreground hover:bg-accent transition-colors"
                >
                  <Users size={14} className="shrink-0 text-muted-foreground" />
                  <span>멤버 목록</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowAddMember(true)
                    setShowActionMenu(false)
                  }}
                  className="w-full flex items-center gap-sm px-md py-2 text-[13px] text-foreground hover:bg-accent transition-colors"
                >
                  <UserPlus size={14} className="shrink-0 text-muted-foreground" />
                  <span>멤버 초대</span>
                </button>
                {isGroup && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowActionMenu(false)
                      handleLeave()
                    }}
                    disabled={busy}
                    className="w-full flex items-center gap-sm px-md py-2 text-[13px] text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                  >
                    <UserMinus size={14} className="shrink-0 text-muted-foreground" />
                    <span>나가기</span>
                  </button>
                )}
                <div className="my-1 border-t border-border/40" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowActionMenu(false)
                    handleDelete()
                  }}
                  disabled={busy}
                  className="w-full flex items-center gap-sm px-md py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={14} className="shrink-0" />
                  <span>대화방 삭제</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="shrink-0 border-b border-[var(--pmw-border-warm)]">
          <div className="flex items-center gap-sm px-md py-sm">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSearch(false)
                  setSearchQuery('')
                }
              }}
              placeholder="이 대화방의 메시지 검색…"
              className="flex-1 min-w-0 bg-transparent text-[13px] focus-visible:outline-none placeholder:text-muted-foreground/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
                className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div className="max-h-[40vh] overflow-y-auto scrollbar-minimal border-t border-border/40">
              {searchLoading ? (
                <div className="px-md py-sm text-[12px] italic text-muted-foreground/70 font-serif">
                  검색 중…
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-md py-sm text-[12px] italic text-muted-foreground/60 font-serif">
                  결과 없음
                </div>
              ) : (
                <ul>
                  {searchResults.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const found = jumpToMessage(hit.id)
                          if (found) setShowSearch(false)
                        }}
                        className="w-full text-left px-md py-2 border-b border-border/30 hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-baseline gap-sm mb-0.5">
                          <span className="text-[12px] font-medium text-foreground truncate">
                            {hit.sender_name ?? '(탈퇴한 사용자)'}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                            {formatTime(hit.created_at)}
                          </span>
                        </div>
                        <p className="text-[12px] text-foreground/80 line-clamp-2 whitespace-pre-wrap break-words">
                          {highlightSnippet(hit.content ?? '', searchQuery.trim())}
                          {!hit.content && hit.has_file && (
                            <span className="italic text-muted-foreground/70">📎 첨부파일</span>
                          )}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {pinnedMessage && !pinnedMessage.deleted_at && (
        <div className="shrink-0 flex items-start gap-sm px-md py-2 bg-accent/40 border-b border-border/40">
          <Bookmark size={14} className="shrink-0 mt-0.5 text-muted-foreground fill-current" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-sm mb-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">공지</span>
              {pinnedMessage.sender_name && (
                <span className="text-[11px] text-muted-foreground/60">
                  — {pinnedMessage.sender_name}
                </span>
              )}
            </div>
            <p className="text-[12px] text-foreground line-clamp-2 whitespace-pre-wrap break-words">
              {pinnedMessage.content ??
                (pinnedMessage.file_name ? `📎 ${pinnedMessage.file_name}` : '')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onPinChange(null)}
            aria-label="공지 해제"
            title="공지 해제"
            className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-row">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal px-md py-md"
          >
            {loading ? (
              <div className="text-center text-muted-foreground/70 text-[13px] py-md">
                불러오는 중…
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground/50 text-[13px] py-md italic font-serif">
                아직 메시지가 없습니다
              </div>
            ) : (
              <ul className="space-y-2">
                {messages.map((m, i) => {
                  const isOwn = m.sender_user_id === currentUserId
                  const showSender =
                    i === 0 || messages[i - 1].sender_user_id !== m.sender_user_id
                  const isPinned = pinnedMessage?.id === m.id
                  const readCount = readCountByMsgId.get(m.id) ?? 0
                  const isReadByOther =
                    !isGroup &&
                    isOwn &&
                    !!otherLastReadAt &&
                    new Date(m.created_at) <= new Date(otherLastReadAt)
                  return (
                    <MessageItem
                      key={m.id}
                      msg={m}
                      isOwn={isOwn}
                      showSender={showSender}
                      isGroup={isGroup}
                      isReadByOther={isReadByOther}
                      readCount={readCount}
                      memberCount={memberCount}
                      isPinned={isPinned}
                      onDelete={isOwn ? handleMessageDelete : undefined}
                      onPin={handleTogglePin}
                    />
                  )
                })}
              </ul>
            )}
            {/* 항상 자리를 차지해 표시/숨김 시 레이아웃 시프트 없음. */}
            <div className="mt-2 px-sm text-[12px] italic font-serif text-muted-foreground/70 h-4" aria-live="polite">
              {otherTyping ? '작성 중…' : ''}
            </div>
          </div>

          <Composer
            convId={conv.id}
            onMessageSent={onMessageSent}
            onTextChange={isGroup ? undefined : emitTyping}
          />
        </div>

        {/* 모바일 backdrop — 클릭 시 닫기. 데스크톱에선 인라인 패널이라 불필요. */}
        {showMembers && (
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/30"
            onClick={() => setShowMembers(false)}
            aria-hidden="true"
          />
        )}
        {showMembers && (
          <aside className="flex flex-col border-l border-border/80 bg-background min-h-0 md:w-[240px] md:shrink-0 max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:w-[85%] max-md:max-w-[320px] max-md:z-40 max-md:shadow-xl">
            <div className="shrink-0 flex items-center justify-between px-md py-sm border-b border-border/80">
              <span className="font-serif text-[14px]">멤버 ({totalCount})</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowAddMember(true)}
                  aria-label="멤버 초대"
                  title="멤버 초대"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <UserPlus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowMembers(false)}
                  aria-label="닫기"
                  title="닫기"
                  className="md:hidden inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto scrollbar-minimal">
              <li className="px-md py-2 border-b border-border/30 flex items-center gap-sm">
                <Avatar size="sm" label="나" muted />
                <span className="font-serif text-[13px] text-foreground">나</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60 font-mono">본인</span>
              </li>
              {participants.map((p) => {
                const hasRealName = !!(p.name && p.name.trim() && p.name !== p.email)
                const displayName = hasRealName ? p.name! : p.email ?? '(이름 없음)'
                return (
                  <li
                    key={p.user_id}
                    className="group/member px-md py-2 border-b border-border/30 flex items-center gap-sm last:border-b-0"
                  >
                    <Avatar size="sm" label={avatarInitial(displayName)} imageUrl={p.avatar_url} tone="sage" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-serif text-foreground truncate leading-tight">
                        {displayName}
                      </div>
                      {hasRealName && p.email && (
                        <div className="font-serif italic text-[11px] text-muted-foreground truncate mt-0.5">
                          {p.email}
                        </div>
                      )}
                      {p.org_name && (
                        <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                          {p.org_name}
                        </div>
                      )}
                    </div>
                    {isGroup && (
                      <button
                        type="button"
                        onClick={() => handleKick(p)}
                        aria-label="추방"
                        title="추방"
                        className="opacity-0 group-hover/member:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-opacity"
                      >
                        <UserMinus size={12} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
      </div>

      {showAddMember && (
        <AddMemberModal
          convId={conv.id}
          existingMemberIds={
            new Set([...participants.map((p) => p.user_id), currentUserId ?? ''])
          }
          onClose={() => setShowAddMember(false)}
          onAdded={() => {
            setShowAddMember(false)
            onMembersChanged()
          }}
        />
      )}
    </>
  )
}

const MessageItem = memo(function MessageItem({
  msg,
  isOwn,
  showSender,
  isGroup,
  isReadByOther,
  readCount,
  memberCount,
  isPinned,
  onDelete,
  onPin,
}: {
  msg: MessageRow
  isOwn: boolean
  showSender: boolean
  isGroup: boolean
  isReadByOther: boolean
  readCount: number
  memberCount: number
  isPinned: boolean
  onDelete?: (msgId: string) => void
  onPin?: (msgId: string, currentlyPinned: boolean) => void
}) {
  if (msg.deleted_at) {
    return (
      <li id={`msg-${msg.id}`} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
        <span className="italic text-[12px] text-muted-foreground/50 px-sm py-1">
          (삭제된 메시지)
        </span>
      </li>
    )
  }
  const unreadByOthers = isOwn && isGroup && memberCount > 0 ? memberCount - readCount : 0
  const showRead =
    isOwn &&
    ((!isGroup && isReadByOther) ||
      (isGroup && memberCount > 0 && unreadByOthers === 0))
  const groupUnreadBadge = isOwn && isGroup && unreadByOthers > 0 ? unreadByOthers : null
  return (
    <li
      id={`msg-${msg.id}`}
      className={cn(
        'flex flex-col group scroll-mt-4 transition-colors duration-700',
        isOwn ? 'items-end' : 'items-start',
      )}
    >
      {showSender && !isOwn && (
        <span className="text-[12px] text-muted-foreground/70 mb-1">
          {msg.sender_name ?? '(탈퇴한 사용자)'}
        </span>
      )}
      <div
        className={cn(
          'flex items-end gap-1.5 max-w-full',
          isOwn && 'flex-row-reverse',
        )}
      >
        <div
          data-bubble={isOwn ? 'own' : 'other'}
          className={cn(
            'max-w-[70%] rounded-2xl px-3 py-1.5',
            isOwn
              ? 'bg-pmw-accent text-pmw-accent-foreground'
              : 'bg-muted text-foreground',
          )}
        >
          {msg.content && (
            <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
              {msg.content}
            </p>
          )}
          {msg.file_url && (
            <a
              href={msg.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] underline opacity-90 hover:opacity-100 block mt-1 break-all"
            >
              📎 {msg.file_name ?? '첨부파일'}
            </a>
          )}
        </div>
        <div
          className={cn(
            'shrink-0 flex items-center gap-1 pb-0.5 font-mono text-[10px] text-muted-foreground/60 whitespace-nowrap',
            isOwn && 'flex-row-reverse',
          )}
        >
          {isOwn && (
            <Check
              size={11}
              strokeWidth={2.5}
              className={cn(showRead ? 'text-muted-foreground/80' : 'text-muted-foreground/40')}
            />
          )}
          {showRead && <span>읽음</span>}
          {groupUnreadBadge !== null && <span>{groupUnreadBadge}</span>}
          <span suppressHydrationWarning>{formatTime(msg.created_at)}</span>
        </div>
        <div
          className={cn(
            'shrink-0 inline-flex items-center gap-0.5 self-center',
            isOwn && 'flex-row-reverse',
          )}
        >
          {onPin && !msg.deleted_at && (
            <button
              type="button"
              onClick={() => onPin(msg.id, isPinned)}
              aria-label={isPinned ? '공지 해제' : '공지로 등록'}
              title={isPinned ? '공지 해제' : '공지로 등록'}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-opacity',
                isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              <Bookmark size={12} className={isPinned ? 'fill-current' : ''} />
            </button>
          )}
          {isOwn && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(msg.id)}
              aria-label="메시지 삭제"
              title="메시지 삭제"
              className="opacity-0 group-hover:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-opacity"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </li>
  )
})

function Composer({
  convId,
  onMessageSent,
  onTextChange,
}: {
  convId: string
  onMessageSent: (m: MessageRow) => void
  onTextChange?: () => void
}) {
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const [attachment, setAttachment] = useState<{
    path: string
    name: string
    signedUrl: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setText('')
    setAttachment(null)
  }, [convId])

  async function handleFile(file: File) {
    if (file.size > MAX_CHAT_FILE_BYTES) {
      alert(
        `파일이 너무 큽니다 (최대 25MB). 현재 ${(file.size / 1024 / 1024).toFixed(1)}MB`,
      )
      return
    }
    setUploading(true)
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `${convId}/${crypto.randomUUID()}_${safeName}`
      const up = await supabaseBrowser.storage.from('chat-files').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      })
      if (up.error) {
        alert(`업로드 실패: ${up.error.message}`)
        return
      }
      const signed = await supabaseBrowser.storage
        .from('chat-files')
        .createSignedUrl(path, 60 * 60)
      if (signed.error || !signed.data) {
        alert(`미리보기 URL 생성 실패: ${signed.error?.message ?? '알 수 없음'}`)
        return
      }
      setAttachment({ path, name: file.name, signedUrl: signed.data.signedUrl })
    } finally {
      setUploading(false)
    }
  }

  async function removeAttachment() {
    if (!attachment) return
    const path = attachment.path
    setAttachment(null)
    await supabaseBrowser.storage.from('chat-files').remove([path])
  }

  function send() {
    const content = text.trim()
    if (!content && !attachment) return
    const att = attachment
    startTransition(async () => {
      const r = await sendMessage({
        convId,
        content: content || null,
        fileUrl: att?.path ?? null,
        fileName: att?.name ?? null,
      })
      if (r.ok) {
        onMessageSent({
          ...r.value,
          file_url: att?.signedUrl ?? r.value.file_url,
        })
        setText('')
        setAttachment(null)
        // 모바일 키보드를 끊지 않으려면 send 버튼이 textarea 포커스를 빼앗지
        // 않아야 함 (onMouseDown preventDefault). 여기서 focus() 재호출하면
        // 키보드가 한번 닫혔다 다시 열림.
      } else {
        alert(`전송 실패: ${r.error}`)
      }
    })
  }

  return (
    <div className="shrink-0 px-md pt-sm pb-md border-t border-[var(--pmw-border-warm)]">
      {attachment && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-border/80 bg-popover pl-2 pr-1 py-1 text-[12px]">
          <Paperclip size={12} className="text-muted-foreground" />
          <span className="truncate max-w-[240px]">{attachment.name}</span>
          <button
            type="button"
            onClick={removeAttachment}
            className="ml-1 rounded-full hover:bg-accent p-0.5"
            aria-label="첨부 제거"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1 rounded-full bg-popover border border-border/80 pl-1 pr-1 py-1">
        <AttachButton
          onFile={handleFile}
          disabled={uploading || !!attachment}
          title="파일 첨부 (최대 25MB)"
          className="h-8 w-8 rounded-full"
        />
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            onTextChange?.()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={uploading ? '업로드 중…' : '메시지 입력'}
          rows={1}
          disabled={uploading}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="flex-1 resize-none bg-transparent px-1 py-1.5 text-[14px] text-foreground focus-visible:outline-none max-h-32 scrollbar-minimal disabled:opacity-60 placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={send}
          disabled={pending || uploading || (!text.trim() && !attachment)}
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          aria-label="전송"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// 멤버 추가 모달 — 기존 멤버 제외, 단일 선택 즉시 추가
// ─────────────────────────────────────────────────

function AddMemberModal({
  convId,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  convId: string
  existingMemberIds: Set<string>
  onClose: () => void
  onAdded: () => void
}) {
  const [step, setStep] = useState<'org' | 'member'>('org')
  const [orgs, setOrgs] = useState<OrgPickerItem[]>([])
  const [orgQuery, setOrgQuery] = useState('')
  const [selectedOrg, setSelectedOrg] = useState<OrgPickerItem | null>(null)
  const [members, setMembers] = useState<MemberPickerItem[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (step !== 'org') return
    setLoadingOrgs(true)
    const id = setTimeout(async () => {
      const r = await listOrgsForDmPicker({ search: orgQuery })
      if (r.ok) setOrgs(r.value)
      setLoadingOrgs(false)
    }, 150)
    return () => clearTimeout(id)
  }, [step, orgQuery])

  useEffect(() => {
    if (step !== 'member' || !selectedOrg) return
    setLoadingMembers(true)
    const id = setTimeout(async () => {
      const r = await listMembersForDmPicker({ orgId: selectedOrg.id, search: memberQuery })
      if (r.ok) setMembers(r.value.filter((m) => !existingMemberIds.has(m.user_id)))
      setLoadingMembers(false)
    }, 150)
    return () => clearTimeout(id)
  }, [step, selectedOrg, memberQuery, existingMemberIds])

  const pickMember = useCallback(
    (m: MemberPickerItem) => {
      startTransition(async () => {
        const r = await addParticipant({ convId, userId: m.user_id })
        if (r.ok) {
          onAdded()
        } else {
          setError(r.error)
        }
      })
    },
    [convId, onAdded],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-h-[80vh] flex flex-col rounded-lg border border-border/80 bg-popover shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-md py-sm border-b border-border/80">
          <h2 className="font-serif text-[16px] text-foreground">
            {step === 'org' ? '멤버 초대 — 조직' : `멤버 초대 — ${selectedOrg?.name ?? ''}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {step === 'member' && (
          <div className="shrink-0 px-md pt-sm">
            <button
              type="button"
              onClick={() => {
                setStep('org')
                setMembers([])
                setMemberQuery('')
              }}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              ← 조직 다시 선택
            </button>
          </div>
        )}

        <div className="shrink-0 px-md py-sm relative">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          {step === 'org' ? (
            <input
              autoFocus
              value={orgQuery}
              onChange={(e) => setOrgQuery(e.target.value)}
              placeholder="조직 이름"
              className="w-full h-8 rounded-md border border-border/80 bg-card pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
            />
          ) : (
            <input
              autoFocus
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="이름 / 이메일"
              className="w-full h-8 rounded-md border border-border/80 bg-card pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
            />
          )}
        </div>

        {error && (
          <div className="shrink-0 mx-md mb-sm rounded-md border border-destructive/40 bg-destructive/10 px-md py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal">
          {step === 'org' ? (
            loadingOrgs ? (
              <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
                불러오는 중…
              </p>
            ) : orgs.length === 0 ? (
              <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
                {orgQuery ? '결과 없음' : '조직이 없습니다'}
              </p>
            ) : (
              <ul>
                {orgs.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrg(o)
                        setMemberQuery('')
                        setStep('member')
                      }}
                      className="w-full text-left px-md py-2 text-[14px] hover:bg-accent transition-colors border-b border-border/30 last:border-b-0"
                    >
                      {o.name}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : loadingMembers ? (
            <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
              불러오는 중…
            </p>
          ) : members.length === 0 ? (
            <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
              {memberQuery ? '결과 없음' : '추가 가능한 멤버가 없습니다'}
            </p>
          ) : (
            <ul>
              {members.map((m) => (
                <li key={m.user_id}>
                  <button
                    type="button"
                    onClick={() => pickMember(m)}
                    className="w-full text-left px-md py-2 hover:bg-accent transition-colors border-b border-border/30 last:border-b-0"
                  >
                    <div className="text-[14px] text-foreground">{m.name ?? '(이름 없음)'}</div>
                    {m.email && (
                      <div className="text-[11px] text-muted-foreground/70 font-mono">
                        {m.email}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// 시간 포맷
// ─────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `${hh}:${mm}`
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear) return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

// 검색 매칭 부분 강조 — 대소문자 무시. snippet 의 매칭 부분 앞뒤로 자르고 <mark>.
function highlightSnippet(text: string, query: string): ReactNode {
  if (!text || !query) return text
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return text

  const CONTEXT_BEFORE = 30
  const start = Math.max(0, idx - CONTEXT_BEFORE)
  const visible = text.slice(start)
  const matchOffset = idx - start

  return (
    <>
      {start > 0 && '…'}
      {visible.slice(0, matchOffset)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-foreground rounded-sm px-0.5">
        {visible.slice(matchOffset, matchOffset + query.length)}
      </mark>
      {visible.slice(matchOffset + query.length)}
    </>
  )
}
