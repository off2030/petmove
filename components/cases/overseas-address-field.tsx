'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { CopyButton } from './copy-button'

const DATA_KEY = 'address_overseas'

export function OverseasAddressField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const value = (data[DATA_KEY] as string | null) ?? null

  const [editing, setEditing] = useState(false)

  useEffect(() => { setEditing(false) }, [caseId])

  async function save(v: string | null) {
    const val = v?.trim() || null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditing(false)
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-md py-1">
      <span className="text-sm text-muted-foreground pt-1">해외주소</span>
      {editing ? (
        <AddressInput
          initial={value ?? ''}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="group/val inline-flex items-baseline">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              'text-left rounded-md px-2 py-0.5 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-text',
              !value && 'text-muted-foreground/60 italic',
            )}
          >
            {value || '—'}
          </button>
          {value && <CopyButton value={value} className="ml-1 opacity-0 group-hover/val:opacity-100" />}
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
      className="h-7 w-full max-w-[400px] rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
