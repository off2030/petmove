'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { History } from 'lucide-react'
import { useCases } from './cases-context'
import { restoreToHistoryPoint } from '@/lib/actions/cases'

interface HistoryEntry {
  id: string
  field_key: string
  field_storage: 'column' | 'data'
  old_value: string | null
  new_value: string | null
  changed_at: string
}

export function CaseHistory({ caseId }: { caseId: string }) {
  const { updateLocalCaseField } = useCases()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

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

  async function handleRestoreToPoint(entry: HistoryEntry) {
    if (restoring) return
    const confirmed = confirm(
      `${formatTime(entry.changed_at)} 시점 이후의 모든 변경을 되돌립니다.\n계속하시겠습니까?`,
    )
    if (!confirmed) return

    setRestoring(true)
    const result = await restoreToHistoryPoint(caseId, entry.id)
    setRestoring(false)

    if (result.ok) {
      // Sync local state for each restored field.
      for (const r of result.restored) {
        updateLocalCaseField(caseId, r.storage, r.key, r.value)
      }
      // Drop all entries at or after the restore point.
      setEntries((prev) => prev.filter((e) => e.changed_at < entry.changed_at))
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}\u00B7${day} ${h}:${min}`
  }

  function truncate(v: string | null, len = 20) {
    if (!v) return '(빈 값)'
    return v.length > len ? v.slice(0, len) + '…' : v
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
          <div className="relative bg-background rounded-lg shadow-lg w-[620px] max-h-[460px] flex flex-col">
            {/* Header */}
            <div className="flex items-baseline justify-between px-5 py-3 border-b border-border/50">
              <div className="flex items-baseline gap-sm">
                <span className="font-serif text-[17px] font-medium text-foreground">변경 이력</span>
                <span className="font-serif italic text-[13px] text-muted-foreground/70">
                  시점으로 되돌리기
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
              ) : entries.length === 0 ? (
                <div className="font-serif italic text-[14px] text-muted-foreground py-md text-center">
                  변경 이력이 없습니다
                </div>
              ) : (
                <ul>
                  {entries.map((e) => (
                    <li
                      key={e.id}
                      className="group flex items-baseline gap-md py-2 border-b border-dashed border-border/40 last:border-0"
                    >
                      <span className="shrink-0 font-mono text-[11px] tabular-nums tracking-[0.3px] text-muted-foreground/80">
                        {formatTime(e.changed_at)}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                        {e.field_key}
                      </span>
                      <span className="min-w-0 flex-1 font-serif text-[13px] text-muted-foreground truncate">
                        <span className="italic text-muted-foreground/60">{truncate(e.old_value)}</span>
                        <span className="mx-1.5 text-muted-foreground/40">→</span>
                        <span className="text-foreground/80">{truncate(e.new_value)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestoreToPoint(e)}
                        disabled={restoring}
                        className="shrink-0 font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground/60 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                      >
                        이 시점으로
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer hint */}
            <div className="shrink-0 px-5 py-2 border-t border-border/40">
              <p className="font-serif italic text-[12px] text-muted-foreground/70">
                한 단계씩 되돌리려면{' '}
                <kbd className="font-mono not-italic text-[10px] uppercase tracking-[1px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-foreground/80">
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
