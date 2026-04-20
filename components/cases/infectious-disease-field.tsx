'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { labColor } from '@/lib/lab-color'
import { resolveInspectionLab } from '@/lib/inspection-config-defaults'

interface InfectiousRecord {
  date: string | null
  lab: string | null
}

const LABS = [
  { value: 'ksvdl', label: 'KSVDL' },
  { value: 'vbddl', label: 'VBDDL' },
  { value: 'apqa_hq', label: 'APQA HQ' },
]

const DATA_KEY = 'infectious_disease_records'

export function InfectiousDiseaseField({ caseId, caseRow, destination }: { caseId: string; caseRow: CaseRow; destination?: string | null }) {
  const { updateLocalCaseField, inspectionConfig } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // Read array (backward compat: old flat key)
  function readRecords(): InfectiousRecord[] {
    if (Array.isArray(data[DATA_KEY])) return data[DATA_KEY] as InfectiousRecord[]
    if (data.infectious_disease_test) {
      return [{ date: data.infectious_disease_test as string, lab: 'ksvdl' }]
    }
    return []
  }

  const records = readRecords()
  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editField, setEditField] = useState<'date' | 'lab' | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    setEditIdx(null)
    setEditField(null)
    setAddingNew(false)
  }, [caseId])

  async function saveRecords(next: InfectiousRecord[]) {
    const val = next.length > 0 ? next : null
    // Also clear legacy flat key if it exists
    if (data.infectious_disease_test) {
      await updateCaseField(caseId, 'data', 'infectious_disease_test', null)
      updateLocalCaseField(caseId, 'data', 'infectious_disease_test', null)
    }
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)

    // If clearing all records, remove from toggleable fields
    if (val === null) {
      const toggleKey = 'vaccine:infectious_disease'
      const currentExtra = (data.extra_visible_fields as string[]) ?? []
      if (currentExtra.includes(toggleKey)) {
        const updated = currentExtra.filter(f => f !== toggleKey)
        const extraVal = updated.length > 0 ? updated : null
        const r2 = await updateCaseField(caseId, 'data', 'extra_visible_fields', extraVal)
        if (r2.ok) updateLocalCaseField(caseId, 'data', 'extra_visible_fields', extraVal)
      }
    }
  }

  function deleteRecord(idx: number) {
    const next = records.filter((_, i) => i !== idx)
    startSave(() => saveRecords(next))
  }

  function updateRecord(idx: number, field: keyof InfectiousRecord, value: unknown) {
    const next = records.map((rec, i) => i === idx ? { ...rec, [field]: value || null } : rec)
    startSave(() => saveRecords(next))
  }

  function saveNewRecord(date: string) {
    if (!date) { setAddingNew(false); return }
    // 뉴질랜드는 APQA HQ + VBDDL 이중 검사로 특수 처리, 그 외는 설정 기반 resolve.
    const isNZ = destination?.includes('뉴질랜드') || destination?.toLowerCase().includes('new zealand')
    const defaultLab = resolveInspectionLab(
      destination,
      inspectionConfig.infectiousOverrides,
      inspectionConfig.infectiousDefault,
    )
    const newRows: InfectiousRecord[] = isNZ
      ? [{ date, lab: 'apqa_hq' }, { date, lab: 'vbddl' }]
      : [{ date, lab: defaultLab }]
    const next = [...records, ...newRows]
    startSave(async () => {
      await saveRecords(next)
      setAddingNew(false)
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
      <div className="flex items-center gap-xs pt-1">
        <span className="text-base text-primary">전염병검사</span>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={saving || addingNew}
          className="text-muted-foreground/40 hover:text-foreground text-lg font-semibold leading-none transition-colors disabled:opacity-30"
          title="전염병검사 추가"
        >
          +
        </button>
      </div>
      <div className="min-w-0 space-y-0.5">
        {records.map((rec, i) => (
          <InfectiousRow
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
          <button type="button" onClick={() => setAddingNew(true)}
            className="text-left rounded-md px-2 py-1 -mx-2 text-base text-primary/60 transition-colors hover:bg-accent/60 cursor-pointer">
            —
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Single row: date | lab ── */

function InfectiousRow({
  record, isEditing, onStartEdit, onStopEdit, onUpdateField, onDelete, saving,
}: {
  record: InfectiousRecord
  isEditing: 'date' | 'lab' | null
  onStartEdit: (f: 'date' | 'lab') => void
  onStopEdit: () => void
  onUpdateField: (f: keyof InfectiousRecord, v: unknown) => void
  onDelete: () => void
  saving: boolean
}) {
  const dateDisplay = record.date || '—'
  const labObj = LABS.find(l => l.value === record.lab)
  const labDisplay = labObj?.label || record.lab || '—'
  const labTone = labColor(record.lab)

  return (
    <div className="group/item flex items-baseline gap-[10px] min-w-0">
      {/* Date */}
      {isEditing === 'date' ? (
        <DateInput
          initial={record.date || ''}
          onSave={(v) => { if (!v) onDelete(); else onUpdateField('date', v); onStopEdit() }}
          onCancel={onStopEdit}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('date')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'text-muted-foreground/60')}>
          {dateDisplay}
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
          className={cn(
            'text-left text-base cursor-pointer transition-all',
            labTone
              ? cn('rounded px-2 py-0.5 font-medium hover:opacity-80', labTone.bg, labTone.text)
              : cn('rounded-md px-2 py-1 -mx-2 hover:bg-accent/60', labDisplay === '—' && 'text-muted-foreground/60'),
          )}>
          {labDisplay}
        </button>
      )}

      <button type="button" onClick={onDelete}
        className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 ml-1 opacity-0 group-hover/item:opacity-100">
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
  useEffect(() => { ref.current?.focus() }, [])

  function saveFromRef() {
    const raw = (ref.current?.value ?? '').trim()
    if (!raw) { onSave(''); return }
    onSave(raw)
  }

  return (
    <input ref={ref} type="date" min="1900-01-01" max="2100-12-31" defaultValue={initial}
      onChange={(e) => {
        // 달력 picker "삭제" 버튼이나 segment 전체 백스페이스로 ''가 되면 즉시 저장.
        if (e.target.value === '') saveFromRef()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => {
        saveFromRef()
      }, 150)}
      className="w-36 bg-transparent border-0 border-b border-primary text-sm py-1 focus:outline-none"
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
      <ul className="absolute left-0 top-0 z-20 min-w-[200px] rounded-md border border-border/50 bg-background py-1 shadow-md">
        <li><button type="button" onClick={() => onSelect(null)}
          className="w-full text-left px-sm py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors">—</button></li>
        {LABS.map(l => (
          <li key={l.value}><button type="button" onClick={() => onSelect(l.value)}
            className={cn('w-full text-left px-sm py-1.5 text-sm hover:bg-accent/60 transition-colors', current === l.value && 'font-medium')}>
            {l.label}</button></li>
        ))}
      </ul>
    </div>
  )
}
