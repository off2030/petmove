'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type Dispatch, type SetStateAction } from 'react'
import { Paperclip, Plus, Search, Send, Tag, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { useConfirm } from '@/components/ui/confirm-dialog'

const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024
import {
  deleteConversation,
  deleteMessage,
  getOrCreateDM,
  listConversationMessages,
  listMembersForDmPicker,
  listMyConversations,
  listOrgsForDmPicker,
  markConversationRead,
  sendMessage,
  type ConversationListItem,
  type MemberPickerItem,
  type MessageRow,
  type OrgPickerItem,
} from '@/lib/actions/chat'
import { CaseTagPicker } from './case-tag-picker'
import { PageShell } from '@/components/ui/page-shell'

const POLL_INTERVAL_MS = 5000

export function MessagesApp({
  conversations,
  setConversations,
  currentUserId,
}: {
  conversations: ConversationListItem[]
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>
  currentUserId: string | null
}) {
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [caseFilter, setCaseFilter] = useState<{ id: string; label: string } | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showNewDm, setShowNewDm] = useState(false)

  const refreshMessages = useCallback(
    async (convId: string, caseId: string | null, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingMessages(true)
      const r = await listConversationMessages({ convId, caseId })
      if (r.ok) {
        setMessages(r.value.messages)
        setOtherLastReadAt(r.value.other_last_read_at)
      }
      if (!opts?.silent) setLoadingMessages(false)
    },
    [],
  )

  useEffect(() => {
    if (!activeConvId) {
      setMessages([])
      return
    }
    refreshMessages(activeConvId, caseFilter?.id ?? null)
    const id = setInterval(() => {
      refreshMessages(activeConvId, caseFilter?.id ?? null, { silent: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [activeConvId, caseFilter?.id, refreshMessages])

  useEffect(() => {
    if (!activeConvId) return
    markConversationRead(activeConvId).then(() => {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConvId ? { ...c, unread_count: 0 } : c)),
      )
    })
  }, [activeConvId, messages.length])

  const onSelectConv = useCallback((convId: string) => {
    setActiveConvId(convId)
    setCaseFilter(null)
  }, [])

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId],
  )

  async function handleNewDmCreated(convId: string) {
    setShowNewDm(false)
    // 채널 목록 새로고침 후 활성화
    const r = await listMyConversations()
    if (r.ok) setConversations(r.value)
    setActiveConvId(convId)
    setCaseFilter(null)
  }

  return (
    <PageShell
      title="메시지"
      titleRight={
        <button
          type="button"
          onClick={() => setShowNewDm(true)}
          className="inline-flex items-center gap-xs h-8 px-3 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          <span>새 대화</span>
        </button>
      }
    >
      <div className="h-full mx-lg flex flex-row min-h-0 border border-border/60 rounded-lg overflow-hidden bg-card">
        <ConversationListPane
          conversations={conversations}
          activeConvId={activeConvId}
          onSelect={onSelectConv}
        />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col border-l border-border/60">
          {activeConv ? (
            <ThreadPane
              conv={activeConv}
              messages={messages}
              otherLastReadAt={otherLastReadAt}
              loading={loadingMessages}
              currentUserId={currentUserId}
              caseFilter={caseFilter}
              onCaseFilterChange={setCaseFilter}
              onMessageSent={(m) => {
                setMessages((prev) => [...prev, m])
                refreshMessages(activeConv.id, caseFilter?.id ?? null, { silent: true })
              }}
              onMessageDeleted={(msgId) => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m,
                  ),
                )
              }}
              onDeleted={() => {
                const deletedId = activeConv.id
                setActiveConvId(null)
                setMessages([])
                setCaseFilter(null)
                setConversations((prev) => prev.filter((c) => c.id !== deletedId))
              }}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
      {showNewDm && (
        <NewDmModal onClose={() => setShowNewDm(false)} onCreated={handleNewDmCreated} />
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
          왼쪽 + 버튼으로 새 대화를 시작할 수 있습니다
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// 채널 목록 패널
// ─────────────────────────────────────────────────

function ConversationListPane({
  conversations,
  activeConvId,
  onSelect,
}: {
  conversations: ConversationListItem[]
  activeConvId: string | null
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const name = (c.other_user.name ?? c.other_user.email ?? '').toLowerCase()
      const org = (c.other_user.org_name ?? '').toLowerCase()
      return name.includes(q) || org.includes(q)
    })
  }, [conversations, query])

  return (
    <aside className="w-[280px] shrink-0 flex flex-col min-h-0 bg-background">
      <div className="shrink-0 px-md py-sm border-b border-border/60">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 / 조직 검색"
            className="w-full h-8 rounded-full border border-border/60 bg-background pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        {filtered.length === 0 ? (
          <div className="px-md py-lg text-center text-[13px] text-muted-foreground/70">
            {conversations.length === 0 ? '아직 대화가 없습니다' : '결과 없음'}
          </div>
        ) : (
          <ul>
            {filtered.map((c) => (
              <li key={c.id}>
                <ConversationRow
                  conv={c}
                  active={c.id === activeConvId}
                  onClick={() => onSelect(c.id)}
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
  const last = conv.last_message
  const preview = last ? (last.content?.trim() || (last.has_file ? '📎 첨부파일' : '')) : ''
  const displayName = conv.other_user.name ?? conv.other_user.email ?? '(이름 없음)'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-md py-sm border-b border-border/40 transition-colors',
        active ? 'bg-accent/70' : 'hover:bg-accent/40',
      )}
    >
      <div className="flex items-baseline justify-between gap-sm">
        <span className="font-serif text-[15px] font-medium text-foreground truncate">
          {displayName}
        </span>
        {last && (
          <span className="font-mono text-[11px] text-muted-foreground/70 shrink-0">
            {formatRelative(last.created_at)}
          </span>
        )}
      </div>
      {conv.other_user.org_name && (
        <div className="text-[11px] text-muted-foreground/70 truncate">
          {conv.other_user.org_name}
        </div>
      )}
      <div className="mt-1 flex items-baseline justify-between gap-sm">
        <span className="text-[12px] text-muted-foreground truncate">
          {last?.sender_name ? <span className="text-muted-foreground/70">{last.sender_name}: </span> : null}
          {preview || <span className="italic text-muted-foreground/50">메시지 없음</span>}
        </span>
        {conv.unread_count > 0 && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white font-mono text-[10px] font-semibold">
            {conv.unread_count > 99 ? '99+' : conv.unread_count}
          </span>
        )}
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────
// 새 대화 모달 — 조직 → 멤버 drilldown
// ─────────────────────────────────────────────────

function NewDmModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (convId: string) => void
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

  // 조직 목록 — 검색
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

  // 멤버 목록 — 조직 선택 후
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

  function pickOrg(o: OrgPickerItem) {
    setSelectedOrg(o)
    setMemberQuery('')
    setStep('member')
  }

  function pickMember(m: MemberPickerItem) {
    startTransition(async () => {
      const r = await getOrCreateDM({ otherUserId: m.user_id })
      if (r.ok) {
        onCreated(r.value.id)
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-h-[80vh] flex flex-col rounded-lg border border-border/60 bg-popover shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-md py-sm border-b border-border/60">
          <h2 className="font-serif text-[16px] text-foreground">
            {step === 'org' ? '새 대화 — 조직 선택' : `새 대화 — ${selectedOrg?.name ?? ''}`}
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
              className="w-full h-8 rounded-md border border-border/60 bg-card pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
            />
          ) : (
            <input
              autoFocus
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="이름 / 이메일"
              className="w-full h-8 rounded-md border border-border/60 bg-card pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:border-foreground/40"
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
              <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">불러오는 중…</p>
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
            <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">불러오는 중…</p>
          ) : members.length === 0 ? (
            <p className="px-md py-md text-center text-[13px] text-muted-foreground/70">
              {memberQuery ? '결과 없음' : '대화 가능한 멤버가 없습니다'}
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
                      <div className="text-[11px] text-muted-foreground/70 font-mono">{m.email}</div>
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
// 작성 중… (Realtime broadcast)
// ─────────────────────────────────────────────────
// 채널 = `chat:{convId}`. 본인 외의 사용자가 typing 이벤트를 보내면 4s 동안 표시.
// emit 은 2s 간격으로 throttle — textarea 매 keystroke 마다 호출돼도 부담 없음.

function useTypingChannel(convId: string, currentUserId: string | null) {
  const [otherTyping, setOtherTyping] = useState(false)
  const lastEmitRef = useRef(0)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null)

  useEffect(() => {
    if (!convId || !currentUserId) return
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
  }, [convId, currentUserId])

  const emitTyping = useCallback(() => {
    if (!currentUserId || !channelRef.current) return
    const now = Date.now()
    if (now - lastEmitRef.current < 2000) return
    lastEmitRef.current = now
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUserId },
    })
  }, [currentUserId])

  return { otherTyping, emitTyping }
}

// ─────────────────────────────────────────────────
// 스레드 패널
// ─────────────────────────────────────────────────

function ThreadPane({
  conv,
  messages,
  otherLastReadAt,
  loading,
  currentUserId,
  caseFilter,
  onCaseFilterChange,
  onMessageSent,
  onMessageDeleted,
  onDeleted,
}: {
  conv: ConversationListItem
  messages: MessageRow[]
  otherLastReadAt: string | null
  loading: boolean
  currentUserId: string | null
  caseFilter: { id: string; label: string } | null
  onCaseFilterChange: (v: { id: string; label: string } | null) => void
  onMessageSent: (m: MessageRow) => void
  onMessageDeleted: (msgId: string) => void
  onDeleted: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const confirm = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const { otherTyping, emitTyping } = useTypingChannel(conv.id, currentUserId)

  async function handleDelete() {
    if (deleting) return
    const ok = await confirm({
      message: '이 대화방을 완전히 삭제하시겠습니까?',
      description: '메시지·첨부파일이 모두 제거되고 상대방에게서도 사라집니다. 복구할 수 없습니다.',
      okLabel: '삭제',
      cancelLabel: '취소',
      variant: 'destructive',
    })
    if (!ok) return
    setDeleting(true)
    try {
      const r = await deleteConversation({ convId: conv.id })
      if (!r.ok) {
        alert(`삭제 실패: ${r.error}`)
        return
      }
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  async function handleMessageDelete(msgId: string) {
    const ok = await confirm({
      message: '이 메시지를 삭제하시겠습니까?',
      description: '상대방 화면에서도 "삭제된 메시지" 로 표시됩니다.',
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
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, otherTyping])

  const headerName = conv.other_user.name ?? conv.other_user.email ?? '(이름 없음)'

  return (
    <>
      <div className="shrink-0 px-md py-sm border-b border-border/60 flex items-center justify-between gap-md bg-background">
        <div className="min-w-0">
          <h2 className="font-serif text-[17px] text-foreground truncate">{headerName}</h2>
          {conv.other_user.org_name && (
            <p className="text-[11px] text-muted-foreground/70 truncate">{conv.other_user.org_name}</p>
          )}
        </div>
        <div className="flex items-center gap-md">
          {caseFilter ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E5D9C2] text-[#6B5A3A] pl-2 pr-1 py-0.5 text-[12px]">
              <Tag size={11} />
              <span className="font-serif">{caseFilter.label}</span>
              <button
                type="button"
                onClick={() => onCaseFilterChange(null)}
                className="ml-0.5 rounded-full hover:bg-[#D4C4A4] p-0.5"
                aria-label="필터 해제"
              >
                <X size={10} />
              </button>
            </span>
          ) : (
            <CaseTagPicker
              onPick={(c) => onCaseFilterChange(c)}
              trigger={
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <Tag size={12} />
                  <span>케이스 필터</span>
                </span>
              }
            />
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="대화방 완전 삭제"
            aria-label="대화방 삭제"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal px-md py-md bg-background">
        {loading ? (
          <div className="text-center text-muted-foreground/70 text-[13px] py-md">불러오는 중…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground/50 text-[13px] py-md italic font-serif">
            {caseFilter ? '이 케이스 관련 메시지가 없습니다' : '아직 메시지가 없습니다'}
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((m, i) => {
              const isOwn = m.sender_user_id === currentUserId
              const isReadByOther =
                isOwn && !!otherLastReadAt && new Date(m.created_at) <= new Date(otherLastReadAt)
              return (
                <MessageItem
                  key={m.id}
                  msg={m}
                  isOwn={isOwn}
                  showSender={i === 0 || messages[i - 1].sender_user_id !== m.sender_user_id}
                  isReadByOther={isReadByOther}
                  onDelete={isOwn ? () => handleMessageDelete(m.id) : undefined}
                />
              )
            })}
          </ul>
        )}
        {otherTyping && (
          <div className="mt-2 px-sm text-[12px] italic font-serif text-muted-foreground/70">
            작성 중…
          </div>
        )}
      </div>

      <Composer
        convId={conv.id}
        onMessageSent={onMessageSent}
        caseFilter={caseFilter}
        onTextChange={emitTyping}
      />
    </>
  )
}

function MessageItem({
  msg,
  isOwn,
  showSender,
  isReadByOther,
  onDelete,
}: {
  msg: MessageRow
  isOwn: boolean
  showSender: boolean
  isReadByOther: boolean
  onDelete?: () => void
}) {
  if (msg.deleted_at) {
    return (
      <li className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
        <span className="italic text-[12px] text-muted-foreground/50 px-sm py-1">
          (삭제된 메시지)
        </span>
      </li>
    )
  }
  return (
    <li className={cn('flex flex-col group', isOwn ? 'items-end' : 'items-start')}>
      {showSender && !isOwn && (
        <span className="text-[11px] text-muted-foreground/70 px-sm mb-0.5">
          {msg.sender_name ?? '(탈퇴한 사용자)'}
        </span>
      )}
      <div className={cn('flex items-end gap-1', isOwn && 'flex-row-reverse')}>
        <div className={cn('max-w-[70%] rounded-lg px-sm py-1.5', isOwn ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground')}>
          {msg.case_label && (
            <div className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 mb-1 text-[10px] font-mono',
              isOwn ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-[#E5D9C2] text-[#6B5A3A]',
            )}>
              <Tag size={9} />
              <span className="font-serif">{msg.case_label}</span>
            </div>
          )}
          {msg.content && (
            <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{msg.content}</p>
          )}
          {msg.file_url && (
            <a
              href={msg.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] underline opacity-90 hover:opacity-100 block mt-1"
            >
              📎 {msg.file_name ?? '첨부파일'}
            </a>
          )}
        </div>
        {isOwn && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="메시지 삭제"
            title="메시지 삭제"
            className="shrink-0 opacity-0 group-hover:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-opacity"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className={cn('flex items-center gap-1.5 px-sm mt-0.5 font-mono text-[10px] text-muted-foreground/50')}>
        {isOwn && isReadByOther && <span className="text-muted-foreground/70">읽음</span>}
        <span>{formatTime(msg.created_at)}</span>
      </div>
    </li>
  )
}

function Composer({
  convId,
  onMessageSent,
  caseFilter,
  onTextChange,
}: {
  convId: string
  onMessageSent: (m: MessageRow) => void
  caseFilter: { id: string; label: string } | null
  onTextChange?: () => void
}) {
  const [text, setText] = useState('')
  const [tag, setTag] = useState<{ id: string; label: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [attachment, setAttachment] = useState<{ path: string; name: string; signedUrl: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (caseFilter) setTag(caseFilter)
  }, [caseFilter])

  useEffect(() => {
    setText('')
    setTag(caseFilter)
    setAttachment(null)
  }, [convId])

  async function handleFile(file: File) {
    if (file.size > MAX_CHAT_FILE_BYTES) {
      alert(`파일이 너무 큽니다 (최대 25MB). 현재 ${(file.size / 1024 / 1024).toFixed(1)}MB`)
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
      const signed = await supabaseBrowser.storage.from('chat-files').createSignedUrl(path, 60 * 60)
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
    const tagSnapshot = tag
    const att = attachment
    startTransition(async () => {
      const r = await sendMessage({
        convId,
        content: content || null,
        caseId: tagSnapshot?.id ?? null,
        fileUrl: att?.path ?? null,
        fileName: att?.name ?? null,
      })
      if (r.ok) {
        onMessageSent({
          ...r.value,
          case_label: tagSnapshot?.label ?? null,
          file_url: att?.signedUrl ?? r.value.file_url,
        })
        setText('')
        setAttachment(null)
        if (!caseFilter) setTag(null)
        taRef.current?.focus()
      } else {
        alert(`전송 실패: ${r.error}`)
      }
    })
  }

  return (
    <div className="shrink-0 border-t border-border/60 bg-background px-md py-sm">
      {attachment && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-border/60 bg-card pl-2 pr-1 py-1 text-[12px]">
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
      <div className="flex items-end gap-sm">
        {tag ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E5D9C2] text-[#6B5A3A] pl-2 pr-1 py-0.5 text-[12px] mb-1">
            <Tag size={11} />
            <span className="font-serif">{tag.label}</span>
            {!caseFilter && (
              <button
                type="button"
                onClick={() => setTag(null)}
                className="ml-0.5 rounded-full hover:bg-[#D4C4A4] p-0.5"
                aria-label="태그 제거"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ) : (
          <CaseTagPicker
            onPick={(c) => setTag(c)}
            trigger={
              <button
                type="button"
                aria-label="케이스 태그"
                title="케이스 태그"
                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors mb-0.5"
              >
                <Tag size={16} />
              </button>
            }
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !!attachment}
          aria-label="파일 첨부"
          title="파일 첨부 (최대 25MB)"
          className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 mb-0.5"
        >
          <Paperclip size={16} />
        </button>
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
          placeholder={uploading ? '업로드 중…' : '메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)'}
          rows={1}
          disabled={uploading}
          className="flex-1 resize-none rounded-md border border-border/60 bg-card px-sm py-1.5 text-[14px] focus-visible:outline-none focus-visible:border-foreground/40 max-h-32 scrollbar-minimal disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || uploading || (!text.trim() && !attachment)}
          className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 mb-0.5"
          aria-label="전송"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// 시간 포맷
// ─────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '방금'
  if (diff < 3600) return `${Math.floor(diff / 60)}분`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일`
  const sameYear = d.getFullYear() === now.getFullYear()
  return sameYear
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getFullYear().toString().slice(2)}/${d.getMonth() + 1}/${d.getDate()}`
}

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
