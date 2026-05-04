'use client'

import { useEffect, useMemo, useState } from 'react'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import {
  listReceivedTransfers,
  listSentTransfers,
  type TransferStatus,
  type TransferWithContext,
} from '@/lib/actions/transfers'
import { useCases } from '@/components/cases/cases-context'

const STATUS_LABEL: Record<TransferStatus, string> = {
  pending: '대기',
  accepted: '수락',
  rejected: '거부',
  cancelled: '취소',
}

const STATUS_TONE: Record<TransferStatus, string> = {
  pending: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  accepted: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  rejected: 'border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-400',
  cancelled: 'border-border/80 text-muted-foreground',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function TransfersSection() {
  const { openCase } = useCases()
  const [received, setReceived] = useState<TransferWithContext[] | null>(null)
  const [sent, setSent] = useState<TransferWithContext[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    const [r, s] = await Promise.all([
      listReceivedTransfers(),
      listSentTransfers(),
    ])
    if (r.ok) setReceived(r.value); else setError(r.error)
    if (s.ok) setSent(s.value); else setError((prev) => prev ?? s.error)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const pendingCount = useMemo(
    () => received?.filter((t) => t.status === 'pending').length ?? 0,
    [received],
  )

  return (
    <div className="max-w-3xl pb-2xl">
      <header className="pb-xl">
        <SectionHeader>전달</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          다른 조직으로 보낸 / 받은 케이스 전달 내역을 관리합니다.
        </p>
        {error && (
          <p className="mt-2 font-serif text-[13px] text-destructive">{error}</p>
        )}
      </header>

      {/* 보낸 전달 */}
      <section className="mb-2xl">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-serif text-[18px] text-foreground">보낸 전달</h3>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            새로고침
          </button>
        </div>
        <div className="border-t border-border/80">
          {loading ? (
            <p className="font-serif italic text-[14px] text-muted-foreground py-4">불러오는 중…</p>
          ) : !sent || sent.length === 0 ? (
            <p className="font-serif italic text-[14px] text-muted-foreground py-4">보낸 전달이 없습니다.</p>
          ) : (
            sent.map((t) => (
              <SentRow
                key={t.id}
                transfer={t}
                onOpenSource={(caseId) => openCase(caseId)}
              />
            ))
          )}
        </div>
      </section>

      {/* 받은 전달 */}
      <section>
        <h3 className="font-serif text-[18px] text-foreground mb-2">
          받은 전달
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 font-mono text-[11px]">
              {pendingCount}
            </span>
          )}
        </h3>
        <p className="mt-1 mb-2 font-serif italic text-[12px] text-muted-foreground/70">
          수락·거부는 메시지 화면의 케이스 카드에서 진행합니다.
        </p>
        <div className="border-t border-border/80">
          {loading ? (
            <p className="font-serif italic text-[14px] text-muted-foreground py-4">불러오는 중…</p>
          ) : !received || received.length === 0 ? (
            <p className="font-serif italic text-[14px] text-muted-foreground py-4">받은 전달이 없습니다.</p>
          ) : (
            received.map((t) => (
              <ReceivedRow
                key={t.id}
                transfer={t}
                onOpenTarget={(caseId) => openCase(caseId)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function ReceivedRow({
  transfer: t,
  onOpenTarget,
}: {
  transfer: TransferWithContext
  onOpenTarget: (caseId: string) => void
}) {
  const snap = t.payload_snapshot
  const petLabel = snap.pet_name ?? snap.pet_name_en ?? '(이름 없음)'
  return (
    <div className="py-3 border-b border-dotted border-border/80">
      <div className="flex items-center gap-2">
        <span className={cn('font-mono text-[10.5px] uppercase tracking-[1.2px] px-1.5 py-0.5 rounded-full border', STATUS_TONE[t.status])}>
          {STATUS_LABEL[t.status]}
        </span>
        <span className="font-serif text-[13px] text-muted-foreground">
          {t.from_org_name ?? '(상대 조직)'} · {t.from_user_name ?? '—'}
        </span>
      </div>
      <div className="mt-1 font-serif text-[15px] text-foreground truncate">
        {snap.customer_name || '(고객 없음)'} · {petLabel}
      </div>
      <div className="mt-0.5 font-serif text-[12px] text-muted-foreground">
        {formatDateTime(t.created_at)}
        {t.responded_at && ` · 응답 ${formatDateTime(t.responded_at)}`}
      </div>
      {t.note && (
        <div className="mt-1 font-serif italic text-[13px] text-muted-foreground/90 whitespace-pre-wrap">
          “{t.note}”
        </div>
      )}
      {t.status === 'accepted' && t.target_case_id && (
        <button
          type="button"
          onClick={() => onOpenTarget(t.target_case_id!)}
          className="mt-1 font-mono text-[10.5px] uppercase tracking-[1.2px] text-primary hover:underline"
        >
          받은 케이스 열기 →
        </button>
      )}
    </div>
  )
}

function SentRow({
  transfer: t,
  onOpenSource,
}: {
  transfer: TransferWithContext
  onOpenSource: (caseId: string) => void
}) {
  const src = t.source_case
  const petLabel = src?.pet_name ?? '(이름 없음)'
  return (
    <div className="py-3 border-b border-dotted border-border/80">
      <div className="flex items-center gap-2">
        <span className={cn('font-mono text-[10.5px] uppercase tracking-[1.2px] px-1.5 py-0.5 rounded-full border', STATUS_TONE[t.status])}>
          {STATUS_LABEL[t.status]}
        </span>
        <span className="font-serif text-[13px] text-muted-foreground">
          → {t.to_org_name ?? '(받는 조직)'}{t.to_user_name ? ` · ${t.to_user_name}` : ''}
        </span>
      </div>
      <div className="mt-1 font-serif text-[15px] text-foreground truncate">
        {src ? `${src.customer_name || '(고객 없음)'} · ${petLabel}` : '(원본 삭제됨)'}
      </div>
      <div className="mt-0.5 font-serif text-[12px] text-muted-foreground">
        {formatDateTime(t.created_at)}
        {t.responded_at && ` · 응답 ${formatDateTime(t.responded_at)}`}
      </div>
      {t.response_note && (
        <div className="mt-1 font-serif italic text-[13px] text-muted-foreground/90 whitespace-pre-wrap">
          응답: {t.response_note}
        </div>
      )}
      {src && (
        <button
          type="button"
          onClick={() => onOpenSource(src.id)}
          className="mt-1 font-mono text-[10.5px] uppercase tracking-[1.2px] text-primary hover:underline"
        >
          원본 케이스 열기 →
        </button>
      )}
    </div>
  )
}
