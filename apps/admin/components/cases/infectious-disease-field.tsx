'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn, roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { labColor } from '@/lib/lab-color'
import { resolveInspectionLabs } from '@petmove/domain'
import { DateTextField } from '@/components/ui/date-text-field'
import { useSectionEditMode } from './section-edit-mode-context'

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
  const editMode = useSectionEditMode()
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
    // 설정(전염병 규칙)에서 목적지별 검사기관 resolve. 규칙 여러 개면 각 lab별로 기록 생성.
    // 매칭되는 규칙이 없으면 lab 미지정(null) 1건.
    const labs = resolveInspectionLabs(destination, inspectionConfig.infectiousRules)
    const newRows: InfectiousRecord[] = labs.length > 0
      ? labs.map(lab => ({ date, lab }))
      : [{ date, lab: null }]
    const next = [...records, ...newRows]
    startSave(async () => {
      await saveRecords(next)
      setAddingNew(false)
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel>전염병검사</SectionLabel>
      </div>
      <div className="min-w-0 flex items-start gap-md">
        <div className="flex-1 min-w-0 space-y-0.5">
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
            editMode ? (
              <button type="button" onClick={() => setAddingNew(true)}
                className="text-left rounded-md px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/50 transition-colors hover:text-muted-foreground">
                —
              </button>
            ) : (
              <span className="px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/40">—</span>
            )
          )}
        </div>
        {editMode && (
          <div className="shrink-0 flex items-center gap-[6px]">
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              disabled={saving || addingNew}
              className={roundIconBtn}
              title="전염병검사 추가"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
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
  const editMode = useSectionEditMode()
  const dateDisplay = record.date || '—'
  const labObj = LABS.find(l => l.value === record.lab)
  const labDisplay = labObj?.label || record.lab || '—'
  const labTone = labColor(record.lab)

  return (
    <div className="group/item flex items-baseline gap-[10px] min-w-0">
      {/* Date */}
      {editMode && isEditing === 'date' ? (
        <DateInput
          initial={record.date || ''}
          onSave={(v) => { if (!v) onDelete(); else onUpdateField('date', v); onStopEdit() }}
          onCancel={onStopEdit}
        />
      ) : editMode ? (
        <button type="button" onClick={() => onStartEdit('date')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60')}>
          {dateDisplay}
        </button>
      ) : (
        <span className={cn('inline-block rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground', dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/40')}>
          {dateDisplay}
        </span>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Lab */}
      {editMode && isEditing === 'lab' ? (
        <LabDropdown
          current={record.lab}
          onSelect={(v) => { onUpdateField('lab', v); onStopEdit() }}
          onClose={onStopEdit}
        />
      ) : editMode ? (
        <button type="button" onClick={() => onStartEdit('lab')}
          className={cn(
            'text-left cursor-pointer transition-all',
            labTone
              ? cn('inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap hover:opacity-80', labTone.bg, labTone.text)
              : cn('text-base rounded-md px-2 py-1 -mx-2 hover:bg-accent/60', labDisplay === '—' && 'text-muted-foreground/60'),
          )}>
          {labDisplay}
        </button>
      ) : (
        <span
          className={cn(
            'inline-block transition-all',
            labTone
              ? cn('items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap', labTone.bg, labTone.text)
              : cn('text-base rounded-md px-2 py-1 -mx-2', labDisplay === '—' && 'text-muted-foreground/40'),
          )}>
          {labDisplay}
        </span>
      )}

      {editMode && (
        <button type="button" onClick={onDelete}
          className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 ml-1 opacity-0 group-hover/item:opacity-100">
          ✕
        </button>
      )}
    </div>
  )
}

/* ── Sub-field inputs ── */

function DateInput({ initial, onSave, onCancel }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void
}) {
  return (
    <DateTextField
      autoFocus
      value={initial}
      onChange={(v) => onSave(v)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      className="w-40 bg-transparent border-0 border-b border-primary text-base py-1 focus:outline-none"
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
      <ul className="absolute left-0 top-0 z-20 min-w-[200px] rounded-md border border-border/80 bg-background py-1 shadow-md">
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
