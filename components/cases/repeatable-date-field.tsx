'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'

interface Props {
  caseId: string
  caseRow: CaseRow
  label: string
  dataKey: string // e.g. 'rabies_dates'
}

export function RepeatableDateField({ caseId, caseRow, label, dataKey }: Props) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const dates: string[] = Array.isArray(data[dataKey]) ? (data[dataKey] as string[]) : []

  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    setEditIdx(null)
    setAddingNew(false)
  }, [caseId])

  async function saveDates(next: string[]) {
    const val = next.length > 0 ? next : null
    const r = await updateCaseField(caseId, 'data', dataKey, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', dataKey, val)
  }

  function deleteDate(idx: number) {
    const next = dates.filter((_, i) => i !== idx)
    startSave(() => saveDates(next))
  }

  function updateDate(idx: number, value: string) {
    const next = dates.map((d, i) => i === idx ? value : d)
    startSave(() => saveDates(next))
    setEditIdx(null)
  }

  function saveNewDate(value: string) {
    if (!value) { setAddingNew(false); return }
    const next = [...dates, value]
    startSave(async () => {
      await saveDates(next)
      setAddingNew(false)
    })
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1 pt-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={saving || addingNew}
          className="text-muted-foreground/40 hover:text-foreground text-sm font-medium leading-none transition-colors disabled:opacity-30"
          title={`${label} 추가`}
        >
          +
        </button>
      </div>
      <div className="min-w-0 space-y-0.5">
        {dates.map((d, i) => (
          <div key={i} className="flex items-baseline gap-[10px] min-w-0">
            {editIdx === i ? (
              <DateInput
                initial={d}
                onSave={(v) => { if (v) updateDate(i, v); else setEditIdx(null) }}
                onCancel={() => setEditIdx(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditIdx(i)}
                className="text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer"
              >
                {d}
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteDate(i)}
              className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        ))}

        {addingNew && (
          <DateInput
            initial=""
            onSave={saveNewDate}
            onCancel={() => setAddingNew(false)}
          />
        )}

        {dates.length === 0 && !addingNew && (
          <span className="text-sm text-muted-foreground/60 italic">—</span>
        )}
      </div>
    </div>
  )
}

/* ── Date input (reusable) ── */

function DateInput({ initial, onSave, onCancel }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const dateTypedRef = useRef(false)

  useEffect(() => { ref.current?.focus() }, [])

  function saveFromRef() {
    const raw = (ref.current?.value ?? '').trim()
    if (!raw) { onSave(''); return }
    const digits = raw.replace(/\D/g, '')
    let dateStr = ''
    if (digits.length === 8) dateStr = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
    else if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(raw)) {
      const parts = raw.split(/[-./]/)
      dateStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`
    } else {
      dateStr = raw
    }
    const d = new Date(dateStr)
    const year = parseInt(dateStr.split('-')[0], 10)
    if (isNaN(d.getTime()) || year < 1900 || year > 2100) return
    onSave(dateStr)
  }

  return (
    <input
      ref={ref}
      type="date"
      min="1900-01-01"
      max="2100-12-31"
      defaultValue={initial}
      onChange={(e) => {
        const v = e.target.value
        if (!v) { dateTypedRef.current = false; return }
        const year = parseInt(v.split('-')[0], 10)
        if (year < 1900 || year > 2100) { dateTypedRef.current = false; return }
        if (dateTypedRef.current) {
          onSave(v)
          dateTypedRef.current = false
        } else {
          saveFromRef()
        }
      }}
      onKeyDown={(e) => {
        dateTypedRef.current = true
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => saveFromRef(), 150)}
      className="w-36 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
