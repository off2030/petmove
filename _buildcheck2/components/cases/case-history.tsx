'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCases } from './cases-context'
import { updateCaseField } from '@/lib/actions/cases'

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

  async function handleRestore(entry: HistoryEntry) {
    const result = await updateCaseField(
      caseId,
      entry.field_storage,
      entry.field_key,
      entry.old_value,
    )
    if (result.ok) {
      updateLocalCaseField(caseId, entry.field_storage, entry.field_key, entry.old_value)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}-${day} ${h}:${min}`
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
        className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
      >
        변경이력
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-background rounded-lg shadow-lg w-[560px] max-h-[400px] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
              <span className="text-sm font-medium">변경 이력</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loading ? (
                <div className="text-sm text-muted-foreground py-md text-center">로딩...</div>
              ) : entries.length === 0 ? (
                <div className="text-sm text-muted-foreground py-md text-center">변경 이력이 없습니다</div>
              ) : (
                <ul className="space-y-2">
                  {entries.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-baseline gap-md text-sm py-1.5 border-b border-border/30 last:border-0"
                    >
                      <span className="shrink-0 text-xs font-mono text-muted-foreground">
                        {formatTime(e.changed_at)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{e.field_key}</span>
                      <span className="min-w-0 flex-1 text-xs text-muted-foreground truncate">
                        {truncate(e.old_value)} → {truncate(e.new_value)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestore(e)}
                        className="shrink-0 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                      >
                        복원
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
