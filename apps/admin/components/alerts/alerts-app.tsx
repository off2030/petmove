'use client'

// 펫무브워크 알림 — 각 사용자의 '시스템 대화방'(kind='system') 에 봇이 쌓아 둔
// 자동 알림 메시지를 목록으로 보여준다. 조직 간 대화(사람↔사람 채팅)는 제거됨.
//
// 같은 컴포넌트를 두 곳에서 재사용:
//   variant='tab'   — 상단 '알림' 탭, 전체 화면 큰 목록
//   variant='popup' — 우측 하단 플로팅 버튼이 여는 작은 창
//
// 실시간 갱신: DashboardShell 의 'topbar-inbox' 구독이 새 메시지 도착 시 conversations
// 를 refetch 한다. 그때 systemConv.last_message_at 이 바뀌므로, 여기선 그 값만 watch 해
// 메시지를 다시 불러온다 — 별도 realtime 구독을 만들지 않아 중복 구독이 없다.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageShell } from '@petmove/ui'
import { useCases } from '@/components/cases/cases-context'
import {
  listConversationMessages,
  markConversationRead,
  type ConversationListItem,
  type ConversationMessagesResult,
  type MessageRow,
} from '@/lib/actions/chat'

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

interface ParsedAlert {
  title: string
  /** 고객·동물·국가 를 라벨 없이 ' · ' 로 이은 요약 라인. 없으면 null. */
  meta: string | null
  bullets: string[]
}

/**
 * 시스템 알림 본문 파싱 — system-notifications.ts 가 만드는 3단 구조를 분해.
 *   1줄: 제목 (예: "검증 실패 알림 (2건)")
 *   메타: "고객 · 김철수" / "동물 · 몽이" / "국가 · 일본"
 *   본문: "• …" 불릿들
 */
function parseAlert(content: string | null): ParsedAlert {
  const raw = (content ?? '').trim()
  if (!raw) return { title: '알림', meta: null, bullets: [] }
  const lines = raw.split('\n')
  const title = lines[0].trim() || '알림'
  const metaParts: string[] = []
  const bullets: string[] = []
  for (const line of lines.slice(1)) {
    const l = line.trim()
    if (!l) continue
    const m = l.match(/^(고객|동물|국가)\s*·\s*(.+)$/)
    if (m) metaParts.push(m[2].trim())
    else bullets.push(l.replace(/^•\s*/, ''))
  }
  return { title, meta: metaParts.length ? metaParts.join(' · ') : null, bullets }
}

export function AlertsApp({
  conversations,
  setConversations,
  currentUserId,
  isActive,
  variant = 'tab',
  initialSnapshots = {},
}: {
  conversations: ConversationListItem[]
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>
  currentUserId: string | null
  isActive: boolean
  variant?: 'tab' | 'popup'
  initialSnapshots?: Record<string, ConversationMessagesResult>
}) {
  const { openCase } = useCases()

  const systemConv = useMemo(
    () => conversations.find((c) => c.kind === 'system') ?? null,
    [conversations],
  )
  const convId = systemConv?.id ?? null
  const lastMsgAt = systemConv?.last_message_at ?? null

  const [messages, setMessages] = useState<MessageRow[]>([])
  const [myLastRead, setMyLastRead] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refetch = useCallback(async () => {
    if (!convId) {
      setMessages([])
      setLoaded(true)
      return
    }
    const r = await listConversationMessages({ convId })
    if (r.ok) {
      setMessages(r.value.messages)
      const mine = r.value.reads.find((x) => x.user_id === currentUserId)
      setMyLastRead(mine?.last_read_at ?? null)
    }
    setLoaded(true)
  }, [convId, currentUserId])

  // conv 확정 / 새 알림 도착(last_message_at 변화) 시 메시지 재적재.
  // 서버 prefetch 스냅샷이 있으면 즉시 표시 후 백그라운드로 최신화.
  useEffect(() => {
    if (!convId) {
      setMessages([])
      setLoaded(true)
      return
    }
    const snap = initialSnapshots[convId]
    if (snap) {
      setMessages(snap.messages)
      const mine = snap.reads.find((x) => x.user_id === currentUserId)
      setMyLastRead(mine?.last_read_at ?? null)
      setLoaded(true)
    }
    void refetch()
    // initialSnapshots 는 첫 마운트 값만 의미 — 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, lastMsgAt, refetch])

  // 화면에 보이는 동안(활성) 안 읽음 처리.
  useEffect(() => {
    if (!convId || !isActive) return
    if (systemConv && systemConv.unread_count === 0) return
    markConversationRead(convId).then((r) => {
      if (!r.ok) return
      setMyLastRead(new Date().toISOString())
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)),
      )
    })
  }, [convId, isActive, systemConv, setConversations])

  // 최신순 정렬 + 삭제 메시지 제외.
  const ordered = useMemo(
    () => messages.filter((m) => !m.deleted_at).slice().reverse(),
    [messages],
  )

  const isUnread = useCallback(
    (m: MessageRow) => {
      if (!myLastRead) return true
      return new Date(m.created_at) > new Date(myLastRead)
    },
    [myLastRead],
  )

  const listBody =
    loaded && ordered.length === 0 ? (
      <EmptyAlerts />
    ) : (
      <ul className="divide-y divide-border/40">
        {ordered.map((m) => (
          <AlertRow
            key={m.id}
            msg={m}
            unread={isUnread(m)}
            variant={variant}
            onOpen={m.case_id ? () => openCase(m.case_id as string) : undefined}
          />
        ))}
      </ul>
    )

  if (variant === 'popup') {
    return <div className="h-full overflow-y-auto scrollbar-minimal">{listBody}</div>
  }

  return (
    <PageShell title="알림" mobileFlush>
      <div className="mx-auto w-full max-w-2xl md:border md:border-border/80 md:rounded-lg overflow-hidden bg-[var(--pmw-sage-paper)]">
        {listBody}
      </div>
    </PageShell>
  )
}

function AlertRow({
  msg,
  unread,
  variant,
  onOpen,
}: {
  msg: MessageRow
  unread: boolean
  variant: 'tab' | 'popup'
  onOpen?: () => void
}) {
  const { title, meta, bullets } = useMemo(() => parseAlert(msg.content), [msg.content])
  const clickable = !!onOpen
  // 팝업은 좁으니 불릿을 3개까지만, 탭은 전부.
  const shownBullets = variant === 'popup' ? bullets.slice(0, 3) : bullets
  const moreCount = bullets.length - shownBullets.length

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={!clickable}
        title={clickable ? '케이스 상세로 이동' : undefined}
        className={cn(
          'w-full text-left px-md py-sm flex items-start gap-sm transition-colors',
          clickable ? 'hover:bg-[var(--pmw-sage-soft)]/60 cursor-pointer' : 'cursor-default',
        )}
      >
        <span
          className={cn(
            'shrink-0 mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full',
            unread
              ? 'bg-pmw-accent/15 text-pmw-accent'
              : 'bg-muted text-muted-foreground/70',
          )}
        >
          <Bell size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-sm">
            <span
              className={cn(
                'font-serif text-[15px] leading-tight truncate',
                unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
              )}
            >
              {title}
            </span>
            <span
              className="shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground/60"
              suppressHydrationWarning
            >
              {formatTime(msg.created_at)}
            </span>
          </span>
          {meta && (
            <span className="mt-0.5 block text-[12px] text-muted-foreground/80 truncate">
              {meta}
            </span>
          )}
          {shownBullets.length > 0 && (
            <span className="mt-1 block space-y-0.5">
              {shownBullets.map((b, i) => (
                <span key={i} className="flex gap-1.5 text-[13px] text-foreground/80 leading-snug">
                  <span className="shrink-0 text-muted-foreground/50">•</span>
                  <span className="min-w-0">{b}</span>
                </span>
              ))}
              {moreCount > 0 && (
                <span className="block text-[12px] italic text-muted-foreground/60">
                  외 {moreCount}건…
                </span>
              )}
            </span>
          )}
          {unread && (
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-destructive" aria-label="안 읽음" />
          )}
        </span>
      </button>
    </li>
  )
}

function EmptyAlerts() {
  return (
    <div className="flex flex-col items-center justify-center px-md py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
        <Bell size={22} />
      </span>
      <p className="mt-md font-serif italic text-[16px] text-foreground/70">아직 알림이 없습니다</p>
      <p className="mt-1 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/50">
        검증 알림이 오면 여기에 표시됩니다
      </p>
    </div>
  )
}
