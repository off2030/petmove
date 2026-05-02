'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { labColor } from '@/lib/lab-color'
import { resolveInspectionLabs } from '@petmove/domain'
import { DateTextField } from '@/components/ui/date-text-field'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

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
  const confirm = useConfirm()
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
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const prevSnapshot = records
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    // Also clear legacy flat key if it exists
    if (data.infectious_disease_test) {
      updateLocalCaseField(caseId, 'data', 'infectious_disease_test', null)
      updateCaseField(caseId, 'data', 'infectious_disease_test', null).catch(() => {})
    }
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (!r.ok) {
      updateLocalCaseField(caseId, 'data', DATA_KEY, prevSnapshot.length > 0 ? prevSnapshot : null)
      return
    }

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

  async function deleteRecord(idx: number) {
    const target = records[idx]
    const ok = await confirm({
      message: `전염병검사${target?.date ? ` (${target.date})` : ''} 기록을 삭제하시겠습니까?`,
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const next = records.filter((_, i) => i !== idx)
    saveRecords(next).catch(() => {})
  }

  function updateRecord(idx: number, field: keyof InfectiousRecord, value: unknown) {
    const next = records.map((rec, i) => i === idx ? { ...rec, [field]: value || null } : rec)
    saveRecords(next).catch(() => {})
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
    setAddingNew(false)
    saveRecords(next).catch(() => {})
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode && records.length === 0 ? () => setAddingNew(true) : undefined}
          title={editMode && records.length === 0 ? '전염병검사 추가' : undefined}
        >
          전염병검사
        </SectionLabel>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        {/* 같은 날짜의 기록은 하나의 행으로 묶고 lab 만 옆에 나열한다. */}
        {groupByDate(records).map((group) => (
          <InfectiousGroup
            key={group.date ?? `null-${group.indices.join('_')}`}
            date={group.date}
            indices={group.indices}
            records={records}
            editIdx={editIdx}
            editField={editField}
            onStartEdit={(idx, f) => { setEditIdx(idx); setEditField(f) }}
            onStopEdit={() => { setEditIdx(null); setEditField(null) }}
            onUpdateField={(idx, f, v) => updateRecord(idx, f, v)}
            onUpdateGroupDate={(newDate) => {
              // 같은 날짜를 공유하는 모든 기록의 date 갱신.
              const next = records.map((r, i) => group.indices.includes(i) ? { ...r, date: newDate || null } : r)
              saveRecords(next).catch(() => {})
              setEditIdx(null); setEditField(null)
            }}
            onDelete={(idx) => deleteRecord(idx)}
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
      </div>
    </div>
  )
}

/* ── 같은 날짜끼리 묶기. 빈 날짜(null)는 각자 독립 그룹. ── */
function groupByDate(records: InfectiousRecord[]): { date: string | null; indices: number[] }[] {
  const result: { date: string | null; indices: number[] }[] = []
  records.forEach((rec, i) => {
    if (!rec.date) {
      result.push({ date: null, indices: [i] })
      return
    }
    const existing = result.find((g) => g.date === rec.date)
    if (existing) existing.indices.push(i)
    else result.push({ date: rec.date, indices: [i] })
  })
  return result
}

/* ── 한 행: 날짜 + (같은 날짜의 모든) lab 들 ── */

function InfectiousGroup({
  date, indices, records, editIdx, editField,
  onStartEdit, onStopEdit, onUpdateField, onUpdateGroupDate, onDelete, saving,
}: {
  date: string | null
  indices: number[]
  records: InfectiousRecord[]
  editIdx: number | null
  editField: 'date' | 'lab' | null
  onStartEdit: (idx: number, f: 'date' | 'lab') => void
  onStopEdit: () => void
  onUpdateField: (idx: number, f: keyof InfectiousRecord, v: unknown) => void
  onUpdateGroupDate: (v: string) => void
  onDelete: (idx: number) => void
  saving: boolean
}) {
  const editMode = useSectionEditMode()
  const dateDisplay = date || '—'
  // date 행 편집은 그룹의 첫 인덱스를 기준으로 표시.
  const dateEditingIdx = indices[0]
  const dateIsEditing = editIdx === dateEditingIdx && editField === 'date'

  return (
    <div className="group/item flex items-baseline gap-[10px] min-w-0 overflow-x-auto whitespace-nowrap scrollbar-hide">
      {/* Date — 그룹당 1번만 표시 */}
      {editMode && dateIsEditing ? (
        <DateInput
          initial={date || ''}
          onSave={(v) => {
            if (!v) { indices.forEach(onDelete); onStopEdit(); return }
            onUpdateGroupDate(v)
          }}
          onCancel={onStopEdit}
        />
      ) : editMode ? (
        <button type="button" onClick={() => onStartEdit(dateEditingIdx, 'date')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60')}>
          {dateDisplay}
        </button>
      ) : (
        <span className={cn('inline-block rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground', dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/40')}>
          {dateDisplay}
        </span>
      )}

      {/* Labs — | 로 구분하여 나열 */}
      {indices.map((idx, n) => {
        const rec = records[idx]
        const labObj = LABS.find(l => l.value === rec.lab)
        const labDisplay = labObj?.label || rec.lab || '—'
        const labTone = labColor(rec.lab)
        const labIsEditing = editIdx === idx && editField === 'lab'
        return (
          <span key={idx} className="group/lab inline-flex items-baseline gap-[10px]">
            <span className="text-muted-foreground/30 select-none">|</span>
            {editMode && labIsEditing ? (
              <LabDropdown
                current={rec.lab}
                onSelect={(v) => { onUpdateField(idx, 'lab', v); onStopEdit() }}
                onClose={onStopEdit}
              />
            ) : editMode ? (
              <button type="button" onClick={() => onStartEdit(idx, 'lab')}
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
              <button
                type="button"
                onClick={() => onDelete(idx)}
                title="삭제"
                className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/lab:opacity-70 hover:!opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
            {/* suppress unused warning */}
            <span className="hidden">{n}</span>
          </span>
        )
      })}
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
      skipClearConfirm
      className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
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
