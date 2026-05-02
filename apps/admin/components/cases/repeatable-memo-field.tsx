'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

const DATA_KEY = 'memos'

export function RepeatableMemoField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
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
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const prevSnapshot = memos
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    // Clear legacy flat key (fire-and-forget)
    if (data.memo) {
      updateLocalCaseField(caseId, 'data', 'memo', null)
      updateCaseField(caseId, 'data', 'memo', null).catch(() => {})
    }
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (!r.ok) {
      updateLocalCaseField(caseId, 'data', DATA_KEY, prevSnapshot.length > 0 ? prevSnapshot : null)
    }
  }

  function deleteMemo(idx: number) {
    const next = memos.filter((_, i) => i !== idx)
    saveMemos(next).catch(() => {})
  }

  const confirm = useConfirm()
  async function confirmDeleteMemo(idx: number) {
    const ok = await confirm({
      message: '메모를 삭제하시겠습니까?',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (ok) deleteMemo(idx)
  }

  function updateMemo(idx: number, value: string) {
    if (!value.trim()) { deleteMemo(idx); return }
    const next = memos.map((m, i) => i === idx ? value : m)
    saveMemos(next).catch(() => {})
    setEditIdx(null)
  }

  function saveNewMemo(value: string) {
    if (!value.trim()) { setAddingNew(false); return }
    const next = [...memos, value]
    setAddingNew(false)
    saveMemos(next).catch(() => {})
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? () => setAddingNew(true) : undefined}
          title={editMode ? '메모 추가' : undefined}
        >
          메모
        </SectionLabel>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {memos.map((m, i) => (
          <div key={i} className="group/item flex items-start gap-sm">
            {editMode && editIdx === i ? (
              <MemoInput
                initial={m}
                onSave={(v) => updateMemo(i, v)}
                onCancel={() => setEditIdx(null)}
                saving={saving}
              />
            ) : editMode ? (
              <button
                type="button"
                onClick={() => setEditIdx(i)}
                className="text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text whitespace-pre-wrap flex-1 min-w-0"
              >
                {m}
              </button>
            ) : (
              <span className="rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground whitespace-pre-wrap flex-1 min-w-0">
                {m}
              </span>
            )}
            {editMode && (
              <button
                type="button"
                onClick={() => confirmDeleteMemo(i)}
                title="삭제"
                className="shrink-0 inline-flex items-center justify-center rounded-md p-1 mt-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/item:opacity-70 hover:!opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
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
