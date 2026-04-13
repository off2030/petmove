'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'

interface TiterRecord {
  date: string | null
  value: string | null
  lab: string | null
}

const LABS = [
  { value: 'komipharm', label: 'Komipharm' },
  { value: 'nvrqs_seoul', label: 'NVRQS Seoul' },
  { value: 'nvrqs_main', label: 'NVRQS HQ' },
  { value: 'ksu', label: 'KSU' },
]

const DATA_KEY = 'rabies_titer_records'

export function RabiesTiterField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // Read array (backward compat: old flat keys)
  function readRecords(): TiterRecord[] {
    if (Array.isArray(data[DATA_KEY])) return data[DATA_KEY] as TiterRecord[]
    if (data.rabies_titer_test_date || data.rabies_titer || data.rabies_titer_lab) {
      return [{
        date: (data.rabies_titer_test_date as string) || null,
        value: (data.rabies_titer as string) || null,
        lab: (data.rabies_titer_lab as string) || null,
      }]
    }
    return []
  }

  const records = readRecords()
  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editField, setEditField] = useState<'date' | 'value' | 'lab' | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    setEditIdx(null)
    setEditField(null)
    setAddingNew(false)
  }, [caseId])

  async function saveRecords(next: TiterRecord[]) {
    const val = next.length > 0 ? next : null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
  }

  function deleteRecord(idx: number) {
    const next = records.filter((_, i) => i !== idx)
    startSave(() => saveRecords(next))
  }

  function updateRecord(idx: number, field: keyof TiterRecord, value: unknown) {
    const next = records.map((rec, i) => i === idx ? { ...rec, [field]: value || null } : rec)
    startSave(() => saveRecords(next))
  }

  function saveNewRecord(date: string) {
    if (!date) { setAddingNew(false); return }
    const next = [...records, { date, value: null, lab: null }]
    startSave(async () => {
      await saveRecords(next)
      setAddingNew(false)
    })
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1 pt-1">
        <span className="text-sm text-muted-foreground">광견병항체검사</span>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={saving || addingNew}
          className="text-muted-foreground/40 hover:text-foreground text-sm font-medium leading-none transition-colors disabled:opacity-30"
          title="항체검사 추가"
        >
          +
        </button>
      </div>
      <div className="min-w-0 space-y-0.5">
        {records.map((rec, i) => (
          <TiterRow
            key={i}
            record={rec}
            isEditing={editIdx === i ? editField : null}
            onStartEdit={(f) => { setEditIdx(i); setEditField(f) }}
            onStopEdit={() => { setEditIdx(null); setEditField(null) }}
            onUpdateField={(f, v) => updateRecord(i, f, v)}
            onDelete={() => deleteRecord(i)}
            saving={saving}
          />
        ))}

        {addingNew && (
          <DateInput
            initial=""
            onSave={saveNewRecord}
            onCancel={() => setAddingNew(false)}
          />
        )}

        {records.length === 0 && !addingNew && (
          <span className="text-sm text-muted-foreground/60 italic">—</span>
        )}
      </div>
    </div>
  )
}

/* ── Single titer row: date | value | lab ── */

function TiterRow({
  record, isEditing, onStartEdit, onStopEdit, onUpdateField, onDelete, saving,
}: {
  record: TiterRecord
  isEditing: 'date' | 'value' | 'lab' | null
  onStartEdit: (f: 'date' | 'value' | 'lab') => void
  onStopEdit: () => void
  onUpdateField: (f: keyof TiterRecord, v: unknown) => void
  onDelete: () => void
  saving: boolean
}) {
  const dateDisplay = record.date || '—'
  const valueDisplay = record.value || '—'
  const labObj = LABS.find(l => l.value === record.lab)
  const labDisplay = labObj?.label || record.lab || '—'

  return (
    <div className="flex items-baseline gap-[10px] min-w-0">
      {/* Date */}
      {isEditing === 'date' ? (
        <DateInput
          initial={record.date || ''}
          onSave={(v) => { onUpdateField('date', v || null); onStopEdit() }}
          onCancel={onStopEdit}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('date')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'text-muted-foreground/60 italic')}>
          {dateDisplay}
        </button>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Value */}
      {isEditing === 'value' ? (
        <ValueInput
          initial={record.value || ''}
          onSave={(v) => { onUpdateField('value', v || null); onStopEdit() }}
          onCancel={onStopEdit}
          saving={saving}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('value')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-text', valueDisplay === '—' && 'text-muted-foreground/60 italic')}>
          {valueDisplay}
        </button>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Lab */}
      {isEditing === 'lab' ? (
        <LabDropdown
          current={record.lab}
          onSelect={(v) => { onUpdateField('lab', v); onStopEdit() }}
          onClose={onStopEdit}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('lab')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer', labDisplay === '—' && 'text-muted-foreground/60 italic')}>
          {labDisplay}
        </button>
      )}

      <button type="button" onClick={onDelete}
        className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 ml-1">
        ✕
      </button>
    </div>
  )
}

/* ── Sub-field inputs ── */

function DateInput({ initial, onSave, onCancel }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void
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
    } else { dateStr = raw }
    const d = new Date(dateStr)
    const year = parseInt(dateStr.split('-')[0], 10)
    if (isNaN(d.getTime()) || year < 1900 || year > 2100) return
    onSave(dateStr)
  }

  return (
    <input ref={ref} type="date" min="1900-01-01" max="2100-12-31" defaultValue={initial}
      onChange={(e) => {
        const v = e.target.value
        if (!v) { dateTypedRef.current = false; return }
        const year = parseInt(v.split('-')[0], 10)
        if (year < 1900 || year > 2100) { dateTypedRef.current = false; return }
        if (dateTypedRef.current) { onSave(v); dateTypedRef.current = false } else { saveFromRef() }
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

function ValueInput({ initial, onSave, onCancel, saving }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void; saving: boolean
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <input ref={ref} type="text" value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSave(val.trim()); if (e.key === 'Escape') onCancel() }}
      onBlur={() => setTimeout(() => { if (!saving) onSave(val.trim()) }, 150)}
      placeholder="수치"
      className="w-20 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

function LabDropdown({ current, onSelect, onClose }: {
  current: string | null; onSelect: (v: string | null) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div ref={ref} className="relative">
      <ul className="absolute left-0 top-0 z-20 min-w-[160px] rounded-md border border-border/50 bg-background py-1 shadow-md">
        <li><button type="button" onClick={() => onSelect(null)}
          className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors">—</button></li>
        {LABS.map(l => (
          <li key={l.value}><button type="button" onClick={() => onSelect(l.value)}
            className={cn('w-full text-left px-3 py-1.5 text-sm hover:bg-accent/60 transition-colors', current === l.value && 'font-medium')}>
            {l.label}</button></li>
        ))}
      </ul>
    </div>
  )
}
