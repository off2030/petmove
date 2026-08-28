'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { History } from 'lucide-react'
import { useCases } from './cases-context'
import { restoreToHistoryPoint } from '@/lib/actions/cases'
import { useConfirm } from '@petmove/ui'
import {
  CHANGE_KIND_LABEL,
  buildFieldMetaResolver,
  changeKindOf,
  dayKey,
  dayLabel,
  formatHistoryValue,
  groupHistoryEntries,
  timeLabel,
  type FieldMeta,
  type HistoryEntry,
  type HistoryGroup,
} from '@/lib/history-format'

export function CaseHistory({ caseId }: { caseId: string }) {
  const { updateLocalCaseField, fieldDefs } = useCases()
  const confirm = useConfirm()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const resolveField = useMemo(() => buildFieldMetaResolver(fieldDefs), [fieldDefs])
  const groups = useMemo(() => groupHistoryEntries(entries), [entries])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/history?caseId=${caseId}`)
      const data = await res.json()
      setEntries(data.entries ?? [])
    } catch {
      setEntries([])
    }
    setLoading(false)
  }, [caseId])

  useEffect(() => {
    if (open) fetchHistory()
  }, [open, fetchHistory])

  useEffect(() => {
    setOpen(false)
    setEntries([])
  }, [caseId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function handleRestoreGroup(group: HistoryGroup) {
    if (restoring) return
    // 이 묶음(같은 분) 이후에 쌓인 변경까지 함께 되돌아간다 — 몇 건인지 미리 알려준다.
    const affected = entries.filter((e) => e.changed_at >= group.anchor.changed_at)
    const names = Array.from(new Set(affected.map((e) => resolveField(e.field_key).label)))
    const shown = names.slice(0, 4).join(', ')
    const confirmed = await confirm({
      message: `${timeLabel(group.changedAt)} 직전 상태로 되돌립니다`,
      description:
        `${dayLabel(group.changedAt)} ${timeLabel(group.changedAt)} 이후의 변경 ${affected.length}건이 취소됩니다.\n` +
        `대상: ${shown}${names.length > 4 ? ` 외 ${names.length - 4}개` : ''}`,
      okLabel: '되돌리기',
      variant: 'destructive',
    })
    if (!confirmed) return

    setRestoring(true)
    const result = await restoreToHistoryPoint(caseId, group.anchor.id)
    setRestoring(false)

    if (result.ok) {
      // Sync local state for each restored field.
      // by_dest 이력은 destination 이 함께 내려온다 — by_dest 경로로 로컬 반영.
      for (const r of result.restored) {
        updateLocalCaseField(caseId, r.storage, r.key, r.value, r.destination ?? null)
      }
      // Drop all entries at or after the restore point.
      setEntries((prev) => prev.filter((e) => e.changed_at < group.anchor.changed_at))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="변경 이력 · 시점으로 되돌리기"
        aria-label="변경 이력"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <History className="h-3.5 w-3.5" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-background rounded-lg shadow-lg w-[680px] max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex items-baseline justify-between px-5 py-3 border-b border-border/80">
              <div className="flex items-baseline gap-sm">
                <span className="font-serif text-[17px] font-medium text-foreground">변경 이력</span>
                <span className="font-serif italic text-[13px] text-muted-foreground/70">
                  최근 바뀐 내용부터
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-[11px] uppercase tracking-[1.3px] text-muted-foreground hover:text-foreground transition-colors"
              >
                닫기
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loading ? (
                <div className="font-serif italic text-[14px] text-muted-foreground py-md text-center">
                  로딩...
                </div>
              ) : groups.length === 0 ? (
                <div className="font-serif italic text-[14px] text-muted-foreground py-md text-center">
                  아직 바뀐 내용이 없습니다
                </div>
              ) : (
                groups.map((g, i) => {
                  const prev = groups[i - 1]
                  const showDay = !prev || dayKey(prev.changedAt) !== dayKey(g.changedAt)
                  return (
                    <div key={g.bucket}>
                      {showDay && (
                        <div className="pt-3 first:pt-0 pb-1.5 font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground/60">
                          {dayLabel(g.changedAt)}
                        </div>
                      )}
                      <div className="group flex items-start gap-md py-2 border-b border-dashed border-border/40">
                        <span className="shrink-0 w-[38px] pt-[3px] font-mono text-[11px] tabular-nums tracking-[0.3px] text-muted-foreground/80">
                          {timeLabel(g.changedAt)}
                        </span>
                        <ul className="min-w-0 flex-1 space-y-1">
                          {g.entries.map((e) => (
                            <ChangeLine key={e.id} entry={e} resolveField={resolveField} />
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => handleRestoreGroup(g)}
                          disabled={restoring}
                          title={`${timeLabel(g.changedAt)} 직전 상태로 되돌립니다 (이후 변경도 함께 취소)`}
                          className="shrink-0 mt-[1px] font-mono text-[10px] tracking-[0.3px] text-muted-foreground/50 hover:text-primary focus-visible:text-primary group-hover:text-muted-foreground/90 transition-colors disabled:opacity-30"
                        >
                          되돌리기
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="shrink-0 px-5 py-2 border-t border-border/40">
              <p className="font-serif italic text-[12px] text-muted-foreground/70">
                <span className="not-italic">되돌리기</span> = 그 시각 이후 변경을 모두 취소 · 방금 한 것만 취소하려면{' '}
                <kbd className="font-mono not-italic text-[10px] uppercase tracking-[1px] px-1.5 py-0.5 rounded border border-border/80 bg-muted/40 text-foreground/80">
                  Ctrl · Z
                </kbd>
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** 이력 한 줄 — "필드이름  [입력] 값" / "필드이름  [수정] 이전값 → 새값". */
function ChangeLine({
  entry,
  resolveField,
}: {
  entry: HistoryEntry
  resolveField: (fieldKey: string) => FieldMeta
}) {
  const meta = resolveField(entry.field_key)
  const kind = changeKindOf(entry)
  const oldText = formatHistoryValue(entry.field_storage, entry.old_value, meta)
  const newText = formatHistoryValue(entry.field_storage, entry.new_value, meta)

  return (
    <li className="flex items-baseline gap-sm min-w-0">
      <span
        className="shrink-0 font-serif text-[13px] text-foreground/90"
        title={meta.unknown ? undefined : meta.rawKey}
      >
        {meta.label}
      </span>
      {meta.destination && (
        <span className="shrink-0 font-mono text-[10px] tracking-[0.3px] px-1 py-px rounded border border-border/70 text-muted-foreground/80">
          {meta.destination}
        </span>
      )}
      <span className="shrink-0 font-mono text-[10px] tracking-[0.3px] text-muted-foreground/70">
        {CHANGE_KIND_LABEL[kind]}
      </span>
      <span className="min-w-0 flex-1 font-serif text-[13px] truncate">
        {kind === 'added' ? (
          <span className="text-foreground/80">{truncate(newText)}</span>
        ) : kind === 'removed' ? (
          <span className="text-muted-foreground/60 line-through">{truncate(oldText)}</span>
        ) : (
          <>
            <span className="text-muted-foreground/60">{truncate(oldText)}</span>
            <span className="mx-1.5 text-muted-foreground/40">→</span>
            <span className="text-foreground/80">{truncate(newText)}</span>
          </>
        )}
      </span>
    </li>
  )
}

function truncate(v: string | null, len = 24) {
  if (!v) return '비어 있음'
  return v.length > len ? v.slice(0, len) + '…' : v
}
