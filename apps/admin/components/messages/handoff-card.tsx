'use client'

import { useEffect, useState, useTransition } from 'react'
import { Inbox, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  acceptTransfer,
  cancelTransfer,
  getTransfer,
  rejectTransfer,
  type TransferStatus,
  type TransferWithContext,
} from '@/lib/actions/transfers'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useCases } from '@/components/cases/cases-context'

const STATUS_LABEL: Record<TransferStatus, string> = {
  pending: '대기',
  accepted: '수락됨',
  rejected: '거부됨',
  cancelled: '취소됨',
}

const STATUS_TONE: Record<TransferStatus, string> = {
  pending: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  accepted: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  rejected: 'border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-400',
  cancelled: 'border-border/80 text-muted-foreground',
}

interface Props {
  transferId: string
  /** 본인 user id — 송신/수신 측 판단용. */
  currentUserId: string | null
  /** 메시지가 본인 발송인지 — 카드 정렬·tone 결정에 사용. */
  isOwn: boolean
  /** 메시지 안에 첨부됐던 노트(=case_label 또는 message.content). 카드 헤더에 표시. */
  caseLabel?: string | null
  /**
   * 부모(messages-app)가 listConversationMessages 안에서 함께 prefetch 한 transfer 데이터.
   * 있으면 spinner·초기 fetch 생략 → 채팅 진입 시 카드가 즉시 렌더.
   */
  preloaded?: TransferWithContext | null
}

/**
 * 채팅 메시지 안에 인라인으로 보여지는 케이스 핸드오프 카드.
 * - pending + 수신자 → 수락/거부 버튼
 * - pending + 송신자 → 취소 버튼
 * - accepted → 받은 케이스 열기 (수신자) / "수락됨" 표시 (송신자)
 * - rejected/cancelled → 상태만 표시
 */
export function HandoffCard({ transferId, currentUserId, isOwn, caseLabel, preloaded }: Props) {
  const confirm = useConfirm()
  const { openCase } = useCases()
  const [transfer, setTransfer] = useState<TransferWithContext | null | 'loading'>(
    preloaded ?? 'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function refresh() {
    const r = await getTransfer(transferId)
    if (r.ok) {
      setTransfer(r.value)
      setError(null)
    } else {
      setError(r.error)
      setTransfer(null)
    }
  }

  // preloaded 가 있으면 초기 fetch 생략 — 부모가 prefetch 해 spinner 깜빡임 제거.
  // transferId 가 바뀌면(=다른 메시지) 다시 seed. 동일 카드 내 accept/reject 후엔
  // 로컬 refresh() 결과가 우선이라 parent 의 stale preloaded 가 덮어쓰지 않음.
  useEffect(() => {
    if (preloaded) {
      setTransfer(preloaded)
      setError(null)
      return
    }
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferId])

  if (transfer === 'loading') {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-md py-3 max-w-[360px]">
        <p className="font-serif italic text-[12px] text-muted-foreground">
          전달 정보를 불러오는 중…
        </p>
      </div>
    )
  }

  if (!transfer) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-md py-3 max-w-[360px]">
        <p className="font-serif italic text-[12px] text-destructive">
          {error ?? '전달 정보를 찾을 수 없습니다'}
        </p>
      </div>
    )
  }

  const t = transfer
  const snap = t.payload_snapshot
  const petLabel = snap.pet_name ?? snap.pet_name_en ?? '(이름 없음)'
  const customerLabel = snap.customer_name || '(고객 없음)'

  const isReceiver = currentUserId !== null && t.to_user_id === currentUserId
  const isSender = currentUserId !== null && t.from_user_id === currentUserId
  const isPending = t.status === 'pending'

  function onAccept() {
    startTransition(async () => {
      const r = await acceptTransfer(t.id)
      if (!r.ok) { setError(r.error); return }
      await refresh()
      // 새 케이스로 자동 이동 — openCase 가 selectedId 세팅 + /cases 로 popstate 발사
      openCase(r.value.caseId)
    })
  }

  async function onReject() {
    if (!await confirm({
      message: '이 전달을 거부하시겠습니까?',
      okLabel: '거부',
      variant: 'destructive',
    })) return
    startTransition(async () => {
      const r = await rejectTransfer(t.id)
      if (!r.ok) { setError(r.error); return }
      await refresh()
    })
  }

  async function onCancel() {
    if (!await confirm({
      message: '이 전달을 취소하시겠습니까?',
      okLabel: '취소',
      variant: 'destructive',
    })) return
    startTransition(async () => {
      const r = await cancelTransfer(t.id)
      if (!r.ok) { setError(r.error); return }
      await refresh()
    })
  }

  function onOpenTarget() {
    if (!t.target_case_id) return
    openCase(t.target_case_id)
  }

  return (
    <div
      className={cn(
        'rounded-xl border max-w-[360px] overflow-hidden',
        isOwn ? 'border-pmw-accent/40 bg-pmw-accent/5' : 'border-border/60 bg-card',
      )}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-sm px-md py-2 border-b border-border/40">
        <Inbox size={14} className="text-muted-foreground shrink-0" />
        <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
          케이스 전달
        </span>
        <span
          className={cn(
            'ml-auto font-mono text-[10.5px] uppercase tracking-[1.2px] px-1.5 py-0.5 rounded-full border',
            STATUS_TONE[t.status],
          )}
        >
          {STATUS_LABEL[t.status]}
        </span>
      </div>

      {/* 내용 */}
      <div className="px-md py-3">
        <div className="font-serif text-[15px] text-foreground leading-tight">
          {customerLabel} · {petLabel}
        </div>
        {caseLabel && caseLabel !== `${customerLabel} · ${petLabel}` && (
          <div className="mt-0.5 font-serif italic text-[12px] text-muted-foreground">
            {caseLabel}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1 font-serif text-[12px] text-muted-foreground">
          <span>{t.from_org_name ?? '—'}</span>
          <ArrowRight size={11} />
          <span>{t.to_org_name ?? '—'}</span>
        </div>
        {t.note && (
          <div className="mt-2 font-serif italic text-[13px] text-foreground/80 whitespace-pre-wrap">
            “{t.note}”
          </div>
        )}
        {t.response_note && t.status !== 'pending' && (
          <div className="mt-2 font-serif italic text-[12px] text-muted-foreground">
            응답: {t.response_note}
          </div>
        )}
      </div>

      {/* 액션 — 상태별 분기 */}
      {isPending && isReceiver && (
        <div className="flex gap-1.5 px-md pb-3">
          <button
            type="button"
            onClick={onAccept}
            disabled={pending}
            className="flex-1 h-8 rounded-full bg-foreground text-background font-serif text-[13px] hover:bg-foreground/90 disabled:opacity-40 transition-colors"
          >
            수락
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={pending}
            className="flex-1 h-8 rounded-full border border-border/80 font-serif text-[13px] text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive disabled:opacity-40 transition-colors"
          >
            거부
          </button>
        </div>
      )}

      {isPending && isSender && (
        <div className="flex px-md pb-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="ml-auto h-7 px-3 rounded-full border border-border/80 font-serif text-[12px] text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive disabled:opacity-40 transition-colors"
          >
            전달 취소
          </button>
        </div>
      )}

      {t.status === 'accepted' && t.target_case_id && isReceiver && (
        <div className="px-md pb-3">
          <button
            type="button"
            onClick={onOpenTarget}
            className="w-full h-8 rounded-full border border-border/80 font-serif text-[13px] text-foreground hover:bg-accent/40 transition-colors"
          >
            받은 케이스 열기
          </button>
        </div>
      )}

      {error && (
        <p className="px-md pb-3 font-serif text-[12px] text-destructive">{error}</p>
      )}
    </div>
  )
}
