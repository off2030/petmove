'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'

const DATA_KEY = 'memos'

export function RepeatableMemoField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  function readMemos(): string[] {
    if (Array.isArray(data[DATA_KEY])) return data[DATA_KEY] as string[]
    if (data.memo) return [data.memo as string]
    return []
  }

  const memos = readMemos()
  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    setEditIdx(null)
    setAddingNew(false)
  }, [caseId])

  async function saveMemos(next: string[]) {
    const val = next.length > 0 ? next : null
    // Clear legacy flat key
    if (data.memo) {
      await updateCaseField(caseId, 'data', 'memo', null)
      updateLocalCaseField(caseId, 'data', 'memo', null)
    }
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
  }

  function deleteMemo(idx: number) {
    const next = memos.filter((_, i) => i !== idx)
    startSave(() => saveMemos(next))
  }

  function updateMemo(idx: number, value: string) {
    if (!value.trim()) { deleteMemo(idx); return }
    const next = memos.map((m, i) => i === idx ? value : m)
    startSave(() => saveMemos(next))
    setEditIdx(null)
  }

  function saveNewMemo(value: string) {
    if (!value.trim()) { setAddingNew(false); return }
    const next = [...memos, value]
    startSave(async () => {
      await saveMemos(next)
      setAddingNew(false)
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel>메모</SectionLabel>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={saving || addingNew}
          className="shrink-0 rounded-md p-1 text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-30"
          title="메모 추가"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
      <div className="min-w-0 space-y-1">
        {memos.map((m, i) => (
          <div key={i} className="group/item flex items-start gap-sm">
            {editIdx === i ? (
              <MemoInput
                initial={m}
                onSave={(v) => updateMemo(i, v)}
                onCancel={() => setEditIdx(null)}
                saving={saving}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditIdx(i)}
                className="text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text whitespace-pre-wrap flex-1 min-w-0"
              >
                {m}
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteMemo(i)}
              className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 mt-1 opacity-0 group-hover/item:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}

        {addingNew && (
          <MemoInput
            initial=""
            onSave={saveNewMemo}
            onCancel={() => setAddingNew(false)}
            saving={saving}
          />
        )}

        {memos.length === 0 && !addingNew && (
          <button type="button" onClick={() => setAddingNew(true)}
            className="text-left rounded-md px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/50 transition-colors hover:text-muted-foreground cursor-pointer">
            —
          </button>
        )}
      </div>
    </div>
  )
}

function MemoInput({ initial, onSave, onCancel, saving }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void; saving: boolean
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [])

  return (
    <textarea
      ref={ref}
      value={val}
      onChange={(e) => {
        setVal(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(val.trim()) }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => setTimeout(() => { if (!saving) onSave(val.trim()) }, 150)}
      placeholder="메모 입력 (Shift+Enter로 줄바꿈)"
      className="w-full min-h-[2rem] rounded-md border border-border/80 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
    />
  )
}
