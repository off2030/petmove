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
//
// 디자인: editorial 톤(docs/design-system.md) — 카드 박스/그림자 없이 얇은 점선으로
// 행을 구분, 서체 중심, 상태는 작은 dot 로 절제, 날짜별 그룹 헤더.

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

// 시:분 (같은 그룹=같은 날짜라 시각만).
function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 날짜 그룹 라벨 — 오늘 / 어제 / M월 D일 / (해 넘어가면) YYYY년 M월 D일.
function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (diffDays <= 0) return '오늘'
  if (diffDays === 1) return '어제'
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

const META_LABELS = new Set(['고객', '동물', '국가', '목적지'])

interface ParsedAlert {
  title: string
  /** 고객·동물·국가·목적지 값을 라벨 없이 ' · ' 로 이은 요약 라인. */
  meta: string | null
  /** '•' 불릿 (검증 실패 항목들). */
  bullets: string[]
  /** 그 외 문장(예: "홍길동 님이 입력했습니다.", "비고 · 메모"). */
  notes: string[]
}

/**
 * 시스템 알림 본문 파싱 — notify 트리거/시스템알림이 만드는 공통 구조를 분해.
 *   1줄: 제목
 *   "라벨 · 값" 라인: 고객/동물/국가/목적지 → 메타(요약)로, 그 외 → 노트로
 *   "• …" 라인: 불릿(검증 실패)
 */
function parseAlert(content: string | null): ParsedAlert {
  const raw = (content ?? '').trim()
  if (!raw) return { title: '알림', meta: null, bullets: [], notes: [] }
  const lines = raw.split('\n')
  const title = lines[0].trim() || '알림'
  const metaParts: string[] = []
  const bullets: string[] = []
  const notes: string[] = []
  for (const line of lines.slice(1)) {
    const l = line.trim()
    if (!l) continue
    if (l.startsWith('•')) {
      bullets.push(l.replace(/^•\s*/, ''))
      continue
    }
    const m = l.match(/^(\S+)\s*·\s*(.+)$/)
    if (m && META_LABELS.has(m[1])) metaParts.push(m[2].trim())
    else notes.push(l)
  }
  return { title, meta: metaParts.length ? metaParts.join(' · ') : null, bullets, notes }
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

  const isUnread = useCallback(
    (m: MessageRow) => {
      if (!myLastRead) return true
      return new Date(m.created_at) > new Date(myLastRead)
    },
    [myLastRead],
  )

  // 최신순 + 삭제 제외 → 날짜별 그룹.
  const groups = useMemo(() => {
    const ordered = messages.filter((m) => !m.deleted_at).slice().reverse()
    const out: Array<{ label: string; items: MessageRow[] }> = []
    for (const m of ordered) {
      const label = formatDayLabel(m.created_at)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(m)
      else out.push({ label, items: [m] })
    }
    return out
  }, [messages])

  const isEmpty = loaded && groups.length === 0

  const list = isEmpty ? (
    <EmptyAlerts />
  ) : (
    <div className={variant === 'tab' ? 'px-sm md:px-0' : ''}>
      {groups.map((g) => (
        <section key={g.label} className="mb-1">
          <div className="px-md pt-4 pb-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/55">
            {g.label}
          </div>
          <ul className="border-t border-border/60">
            {g.items.map((m) => (
              <AlertRow
                key={m.id}
                msg={m}
                unread={isUnread(m)}
                variant={variant}
                onOpen={m.case_id ? () => openCase(m.case_id as string) : undefined}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )

  if (variant === 'popup') {
    return <div className="h-full overflow-y-auto scrollbar-minimal pb-2">{list}</div>
  }

  return (
    <PageShell title="알림" mobileFlush>
      {/* 폭은 다른 탭(설정·도구)과 동일하게 PageShell 기본(max-w-5xl)을 따른다. */}
      <div className="w-full pb-lg">{list}</div>
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
  const { title, meta, bullets, notes } = useMemo(() => parseAlert(msg.content), [msg.content])
  const clickable = !!onOpen
  const isWarning = /검증|실패|만료|주의/.test(title)
  const dotColor = isWarning ? 'var(--pmw-amber)' : 'var(--pmw-sage)'

  // 팝업은 좁으니 불릿 3개까지, 노트는 숨김.
  const shownBullets = variant === 'popup' ? bullets.slice(0, 3) : bullets
  const moreCount = bullets.length - shownBullets.length
  const shownNotes = variant === 'popup' ? [] : notes

  return (
    <li className="border-b border-dotted border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={!clickable}
        title={clickable ? '케이스 상세로 이동' : undefined}
        className={cn(
          'w-full text-left flex items-start gap-sm px-md transition-colors',
          variant === 'tab' ? 'py-3.5' : 'py-3',
          clickable ? 'hover:bg-accent cursor-pointer' : 'cursor-default',
        )}
      >
        {/* 상태 dot — 검증/만료=amber, 그 외=sage. 읽은 항목은 흐리게. */}
        <span
          className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor, opacity: unread ? 1 : 0.35 }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-sm">
            <span
              className={cn(
                'font-serif text-[15.5px] leading-snug truncate',
                unread ? 'font-semibold text-foreground' : 'font-normal text-foreground/85',
              )}
            >
              {title}
            </span>
            <span
              className="shrink-0 font-mono text-[11px] text-muted-foreground/55 tabular-nums"
              suppressHydrationWarning
            >
              {formatClock(msg.created_at)}
            </span>
          </span>
          {meta && (
            <span className="mt-1 block font-serif text-[13px] text-muted-foreground truncate">
              {meta}
            </span>
          )}
          {shownBullets.length > 0 && (
            <span className="mt-1.5 block space-y-1">
              {shownBullets.map((b, i) => (
                <span key={i} className="flex gap-1.5 text-[13px] leading-snug text-foreground/80">
                  <span className="shrink-0" style={{ color: dotColor }}>
                    •
                  </span>
                  <span className="min-w-0">{b}</span>
                </span>
              ))}
              {moreCount > 0 && (
                <span className="block font-serif italic text-[12px] text-muted-foreground/60">
                  외 {moreCount}건…
                </span>
              )}
            </span>
          )}
          {shownNotes.length > 0 && (
            <span className="mt-1.5 block space-y-0.5">
              {shownNotes.map((n, i) => (
                <span
                  key={i}
                  className="block font-serif italic text-[12.5px] leading-snug text-muted-foreground/75"
                >
                  {n}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function EmptyAlerts() {
  return (
    <div className="flex flex-col items-center justify-center px-md py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-dotted border-border/70 text-muted-foreground/50">
        <Bell size={20} />
      </span>
      <p className="mt-md font-serif italic text-[16px] text-foreground/70">아직 알림이 없습니다</p>
      <p className="mt-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/45">
        검증·신청 알림이 오면 여기에 표시됩니다
      </p>
    </div>
  )
}
