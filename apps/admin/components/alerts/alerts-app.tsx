'use client'

// 펫무브워크 알림 — notifications 테이블의 내 알림을 목록으로 보여준다.
// (구 채팅 유산 — system 대화방 + 봇 발신자 — 는 2026-08-05 평범한 알림 테이블로 대체됨.)
//
// 같은 컴포넌트를 두 곳에서 재사용:
//   variant='tab'   — 상단 '알림' 탭, 전체 화면 큰 목록
//   variant='popup' — 우측 하단 플로팅 버튼이 여는 작은 창
//
// 데이터는 DashboardShell 이 소유 — 서버 prefetch 로 초기값을 받고, realtime 구독이
// 새 알림 도착 시 refetch 한다. 여기서는 표시와 읽음 처리만 담당.
//
// 디자인: editorial 톤(docs/design-system.md) — 카드 박스/그림자 없이 얇은 점선으로
// 행을 구분, 서체 중심, 상태는 작은 dot 로 절제, 날짜별 그룹 헤더.
//
// 조직 구분(2026-09-23): 여러 org 의 멤버(super_admin = 펫무브 직영 + 로잔)는 두 조직의
// 알림을 한 목록으로 받는다. 본문만으론 출처를 알 수 없어, 알림 행의 org_id 를 근거로
//   · 목록에 두 조직 이상이 섞여 있을 때만 행에 조직 칩을 붙이고
//   · 탭에서는 조직 필터를 띄우며
//   · 활성 조직이 아닌 알림은 클릭 시 그 조직으로 전환한 뒤 케이스를 연다
//     (전환 없이 열면 케이스 목록에 없는 id 라 상세가 비어 보인다).

import { useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageShell } from '@petmove/ui'
import { useCases } from '@/components/cases/cases-context'
import { switchActiveOrg } from '@/lib/actions/super-admin'
import { markAllNotificationsRead, type NotificationRow } from '@/lib/actions/notifications'

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

const META_LABELS = new Set(['고객', '동물', '국가', '여행지'])

/** 받침 유무에 따라 '으로/로' — 한글이 아니면 '로'. (org-switcher 와 동일 규칙) */
function roParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '로'
  return (last - 0xac00) % 28 > 0 ? '으로' : '로'
}

interface ParsedAlert {
  title: string
  /** 고객·동물·국가·여행지 값을 라벨 없이 ' · ' 로 이은 요약 라인. */
  meta: string | null
  /** '•' 불릿 (검증 실패 항목들). */
  bullets: string[]
  /** 그 외 문장(예: "홍길동 님이 입력했습니다.", "비고 · 메모"). */
  notes: string[]
}

/**
 * 시스템 알림 본문 파싱 — notify 트리거/시스템알림이 만드는 공통 구조를 분해.
 *   1줄: 제목
 *   "라벨 · 값" 라인: 고객/동물/국가/여행지 → 메타(요약)로, 그 외 → 노트로
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
  notifications,
  setNotifications,
  isActive,
  variant = 'tab',
  activeOrgId = null,
  canSwitchOrg = false,
}: {
  notifications: NotificationRow[]
  setNotifications: Dispatch<SetStateAction<NotificationRow[]>>
  isActive: boolean
  variant?: 'tab' | 'popup'
  /** 현재 보고 있는 조직. 알림의 org 와 다르면 전환 후 열어야 한다. */
  activeOrgId?: string | null
  /** 조직 전환 권한(super_admin). 없으면 다른 조직 알림은 읽기만. */
  canSwitchOrg?: boolean
}) {
  const { openCase } = useCases()
  const [orgFilter, setOrgFilter] = useState<string | null>(null)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const hasUnread = useMemo(() => notifications.some((n) => !n.read_at), [notifications])

  // 화면에 보이는 동안(활성) 읽음 처리 — 서버 일괄 + 로컬 즉시 반영.
  useEffect(() => {
    if (!isActive || !hasUnread) return
    markAllNotificationsRead().then((r) => {
      if (!r.ok) return
      const now = new Date().toISOString()
      setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    })
  }, [isActive, hasUnread, setNotifications])

  // 목록에 등장하는 조직들 — 둘 이상일 때만 칩·필터를 보여준다(단일 조직 계정엔 노이즈).
  const orgs = useMemo(() => {
    const seen = new Map<string, string>()
    for (const n of notifications) {
      if (n.org_id && n.org_name && !seen.has(n.org_id)) seen.set(n.org_id, n.org_name)
    }
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [notifications])
  const multiOrg = orgs.length > 1

  const visible = useMemo(
    () => (orgFilter ? notifications.filter((n) => n.org_id === orgFilter) : notifications),
    [notifications, orgFilter],
  )

  // 조직이 하나로 줄었는데 필터가 남아 있으면 해제(알림이 갈려 나가 빈 화면이 되는 것 방지).
  useEffect(() => {
    if (orgFilter && !orgs.some((o) => o.id === orgFilter)) setOrgFilter(null)
  }, [orgFilter, orgs])

  /**
   * 알림 클릭 — 같은 조직이면 바로 상세, 다른 조직이면 전환 후 상세.
   * 전환은 쿠키(impersonation)를 갈아끼우므로 클라이언트 캐시가 통째로 갈린다 →
   * soft navigation 대신 full navigation 으로 새 조직 컨텍스트에서 ?case= 를 열게 한다.
   */
  const handleOpen = (n: NotificationRow) => {
    if (!n.case_id) return
    const foreign = !!(n.org_id && activeOrgId && n.org_id !== activeOrgId)
    if (!foreign) {
      openCase(n.case_id)
      return
    }
    if (!canSwitchOrg) return
    setSwitchingTo(n.org_name ?? '다른 조직')
    startTransition(async () => {
      const r = await switchActiveOrg(n.org_id as string)
      if (!r.ok) {
        setSwitchingTo(null)
        return
      }
      window.location.href = `/cases?case=${n.case_id}`
    })
  }

  // 서버가 최신순으로 주므로 그대로 날짜별 그룹.
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: NotificationRow[] }> = []
    for (const n of visible) {
      const label = formatDayLabel(n.created_at)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(n)
      else out.push({ label, items: [n] })
    }
    return out
  }, [visible])

  const list = groups.length === 0 ? (
    <EmptyAlerts filtered={orgFilter !== null} />
  ) : (
    <div className={variant === 'tab' ? 'px-sm md:px-0' : ''}>
      {groups.map((g) => (
        <section key={g.label} className="mb-1">
          <div className="px-md pt-4 pb-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/55">
            {g.label}
          </div>
          <ul className="border-t border-border/60">
            {g.items.map((n) => {
              const foreign = !!(n.org_id && activeOrgId && n.org_id !== activeOrgId)
              return (
                <AlertRow
                  key={n.id}
                  item={n}
                  unread={!n.read_at}
                  variant={variant}
                  orgLabel={multiOrg ? n.org_name : null}
                  foreign={foreign}
                  canSwitchOrg={canSwitchOrg}
                  onOpen={n.case_id ? () => handleOpen(n) : undefined}
                />
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )

  // 조직 전환 대기 오버레이 — org-switcher 와 같은 문법(전환 후 full navigation 으로 소멸).
  const overlay =
    switchingTo !== null && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm"
          >
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
            <div className="text-[14px] font-medium text-foreground">
              {switchingTo}
              {roParticle(switchingTo)} 전환 중…
            </div>
          </div>,
          document.body,
        )
      : null

  if (variant === 'popup') {
    return (
      <div className="h-full overflow-y-auto scrollbar-minimal pb-2">
        {list}
        {overlay}
      </div>
    )
  }

  return (
    <PageShell title="알림" mobileFlush>
      {/* 폭은 다른 탭(설정·도구)과 동일하게 PageShell 기본(max-w-5xl)을 따른다. */}
      <div className="w-full pb-lg">
        {multiOrg && (
          <OrgFilterBar
            orgs={orgs}
            active={orgFilter}
            onChange={setOrgFilter}
            notifications={notifications}
            activeOrgId={activeOrgId}
          />
        )}
        {list}
      </div>
      {overlay}
    </PageShell>
  )
}

/**
 * 조직 필터 — 여러 조직의 알림이 섞일 때만 렌더. 조직별 안 읽은 수를 함께 보여준다.
 * (탭 전용 — 팝업은 좁아 칩만으로 구분한다.)
 */
function OrgFilterBar({
  orgs,
  active,
  onChange,
  notifications,
  activeOrgId,
}: {
  orgs: { id: string; name: string }[]
  active: string | null
  onChange: (id: string | null) => void
  notifications: NotificationRow[]
  activeOrgId: string | null
}) {
  const unreadOf = (orgId: string | null) =>
    notifications.reduce(
      (s, n) => s + (!n.read_at && (orgId === null || n.org_id === orgId) ? 1 : 0),
      0,
    )

  const items: Array<{ id: string | null; name: string }> = [
    { id: null, name: '전체' },
    ...orgs,
  ]

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-md md:px-0 pt-1">
      {items.map((it) => {
        const on = active === it.id
        const unread = unreadOf(it.id)
        return (
          <button
            key={it.id ?? 'all'}
            type="button"
            onClick={() => onChange(it.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-serif text-[12.5px] transition-colors',
              on
                ? 'border-foreground/35 bg-accent text-foreground'
                : 'border-dotted border-border/70 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <span>{it.name}</span>
            {it.id !== null && it.id === activeOrgId && (
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
                보는 중
              </span>
            )}
            {unread > 0 && (
              <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground/70">
                {unread}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function AlertRow({
  item,
  unread,
  variant,
  orgLabel,
  foreign,
  canSwitchOrg,
  onOpen,
}: {
  item: NotificationRow
  unread: boolean
  variant: 'tab' | 'popup'
  /** 표시할 조직 이름. 단일 조직 목록이면 null(칩 숨김). */
  orgLabel: string | null
  /** 활성 조직이 아닌 알림 — 열려면 조직 전환이 필요하다. */
  foreign: boolean
  canSwitchOrg: boolean
  onOpen?: () => void
}) {
  const { title, meta, bullets, notes } = useMemo(() => parseAlert(item.content), [item.content])
  // 다른 조직 알림은 전환 권한이 있을 때만 열 수 있다.
  const clickable = !!onOpen && (!foreign || canSwitchOrg)
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
        title={
          foreign
            ? canSwitchOrg
              ? `${orgLabel ?? '해당 조직'}${roParticle(orgLabel ?? '해당 조직')} 전환해 케이스 열기`
              : `다른 조직(${orgLabel ?? '—'})의 알림입니다`
            : clickable
              ? '케이스 상세로 이동'
              : undefined
        }
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
            <span className="shrink-0 flex items-baseline gap-1.5">
              {/* 조직 칩 — 어느 조직의 알림인지. 활성 조직이 아니면 점선으로 한 단계 흐리게. */}
              {orgLabel && (
                <span
                  className={cn(
                    'rounded-sm border px-1.5 py-[1px] font-mono text-[9.5px] tracking-[0.1em] whitespace-nowrap',
                    foreign
                      ? 'border-dotted border-border/70 text-muted-foreground/70'
                      : 'border-border/60 bg-accent/60 text-foreground/70',
                  )}
                >
                  {orgLabel}
                </span>
              )}
              <span
                className="font-mono text-[11px] text-muted-foreground/55 tabular-nums"
                suppressHydrationWarning
              >
                {formatClock(item.created_at)}
              </span>
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

function EmptyAlerts({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-md py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-dotted border-border/70 text-muted-foreground/50">
        <Bell size={20} />
      </span>
      <p className="mt-md font-serif italic text-[16px] text-foreground/70">
        {filtered ? '이 조직의 알림이 없습니다' : '아직 알림이 없습니다'}
      </p>
      <p className="mt-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/45">
        검증·신청 알림이 오면 여기에 표시됩니다
      </p>
    </div>
  )
}
