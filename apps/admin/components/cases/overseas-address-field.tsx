'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { CopyButton } from './copy-button'
import { SectionLabel } from '@/components/ui/section-label'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

const DATA_KEY = 'address_overseas'

export function OverseasAddressField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()
  async function handleDelete() {
    const ok = await confirm({
      message: '해외주소 정보를 삭제하시겠습니까?',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (ok) save(null)
  }
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const value = (data[DATA_KEY] as string | null) ?? null

  const [editing, setEditing] = useState(false)

  useEffect(() => { setEditing(false) }, [caseId])

  function save(v: string | null) {
    const val = v?.trim() || null
    const prev = value
    // Optimistic
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditing(false)
    void (async () => {
      const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
      if (!r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, prev)
    })()
  }

  // 라벨 클릭으로도 편집 진입 — 빈 값일 때 클릭 영역 잘 안 보이는 문제 해결.
  const labelOnClick = editMode && !editing ? () => setEditing(true) : undefined

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <SectionLabel className="pt-1" onClick={labelOnClick}>해외주소</SectionLabel>
      {editMode && editing ? (
        <AddressInput
          initial={value ?? ''}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="group/val inline-flex items-baseline">
          {editMode ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 font-serif italic text-[17px] text-muted-foreground transition-colors hover:bg-accent/60 cursor-text',
                !value && 'font-sans not-italic text-base text-muted-foreground/60',
              )}
            >
              {value || <span className="inline-block min-w-[6rem] select-none" aria-hidden>&nbsp;</span>}
            </button>
          ) : (
            <span
              className={cn(
                'inline-block rounded-md px-2 py-0.5 -mx-2 font-serif italic text-[17px] text-muted-foreground',
                !value && 'font-sans not-italic text-base text-muted-foreground/40',
              )}
            >
              {value || <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>}
            </span>
          )}
          {value && (
            <>
              <CopyButton value={value} className="ml-1 opacity-0 group-hover/val:opacity-100" />
              {editMode && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="ml-0.5 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/val:opacity-70 hover:!opacity-100 transition-colors"
                  title="삭제"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AddressInput({ initial, onSave, onCancel }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initial)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="flex items-start gap-sm">
      <input
        ref={ref}
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(val) }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => setTimeout(() => onSave(val), 150)}
        placeholder="Destination address"
        className="flex-1 h-8 max-w-[400px] rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSave(val)}
        className="inline-flex h-7 items-center justify-center rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        저장
      </button>
    </div>
  )
}
