'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { CopyButton } from './copy-button'

interface TiterRecord {
  date: string | null
  value: string | null
  lab: string | null
  /**
   * Legacy field — older rows may still carry `received_date` from when the
   * Australia titer row displayed it inline. No longer shown or edited in the
   * UI; the value now lives at `data.australia_extra.sample_received_date`.
   * Kept in the type so existing rows deserialize without warnings.
   */
  received_date?: string | null
}

const LABS = [
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
]

const DATA_KEY = 'rabies_titer_records'

type TiterEditField = 'date' | 'value' | 'lab'

const EU_COUNTRIES = new Set([
  '독일', '프랑스', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
  '스웨덴', '덴마크', '핀란드', '폴란드', '체코', '헝가리', '포르투갈',
  '그리스', '루마니아', '불가리아', '크로아티아', '슬로바키아', '슬로베니아',
  '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '몰타', '키프로스',
  '아일랜드', '영국',
])

/** Auto-detect lab based on destination */
function autoDetectLab(destination?: string | null): string | null {
  if (!destination) return 'krsl'
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  if (dests.length !== 1) return null // 복수 목적지: 미지정
  const d = dests[0]
  if (d === '일본' || d === '하와이' || d.toLowerCase() === 'japan' || d.toLowerCase() === 'hawaii') return 'apqa_seoul'
  if (d === '싱가포르' || d.toLowerCase() === 'singapore') return 'ksvdl_r'
  if (EU_COUNTRIES.has(d)) return 'apqa_hq'
  return 'krsl'
}

export function RabiesTiterField({ caseId, caseRow, destination }: { caseId: string; caseRow: CaseRow; destination?: string | null }) {
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
  const [editField, setEditField] = useState<TiterEditField | null>(null)
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
    const detectedLab = autoDetectLab(destination)
    const next = [...records, { date, value: null, lab: detectedLab }]
    startSave(async () => {
      await saveRecords(next)
      setAddingNew(false)
    })
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-md py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-xs pt-1">
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
          <button type="button" onClick={() => setAddingNew(true)}
            className="text-left rounded-md px-2 py-1 -mx-2 text-sm text-muted-foreground/60 italic transition-colors hover:bg-accent/60 cursor-pointer">
            —
          </button>
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
  isEditing: TiterEditField | null
  onStartEdit: (f: TiterEditField) => void
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
    <div className="group/item flex items-baseline gap-[10px] min-w-0">
      {/* Date (채혈일) */}
      {isEditing === 'date' ? (
        <DateInput
          initial={record.date || ''}
          onSave={(v) => { onUpdateField('date', v || null); onStopEdit() }}
          onCancel={onStopEdit}
        />
      ) : (
        <span className="group/v inline-flex items-baseline">
          <button type="button" onClick={() => onStartEdit('date')}
            className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'text-muted-foreground/60 italic')}>
            {dateDisplay}
          </button>
          {dateDisplay !== '—' && <CopyButton value={dateDisplay} className="ml-1 opacity-0 group-hover/v:opacity-100" />}
        </span>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Value (수치) */}
      {isEditing === 'value' ? (
        <ValueInput
          initial={record.value || ''}
          onSave={(v) => { onUpdateField('value', v || null); onStopEdit() }}
          onCancel={onStopEdit}
          saving={saving}
        />
      ) : (
        <span className="group/v inline-flex items-baseline">
          <button type="button" onClick={() => onStartEdit('value')}
            className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-text', valueDisplay === '—' && 'text-muted-foreground/60 italic')}>
            {valueDisplay}
          </button>
          {valueDisplay !== '—' && <CopyButton value={valueDisplay} className="ml-1 opacity-0 group-hover/v:opacity-100" />}
        </span>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Lab (검사기관) */}
      {isEditing === 'lab' ? (
        <LabDropdown
          current={record.lab}
          onSelect={(v) => { onUpdateField('lab', v); onStopEdit() }}
          onClose={onStopEdit}
        />
      ) : (
        <span className="group/v inline-flex items-baseline">
          <button type="button" onClick={() => onStartEdit('lab')}
            className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer', labDisplay === '—' && 'text-muted-foreground/60 italic')}>
            {labDisplay}
          </button>
          {labDisplay !== '—' && <CopyButton value={labDisplay} className="ml-1 opacity-0 group-hover/v:opacity-100" />}
        </span>
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
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => {
        if (!(ref.current?.value ?? '').trim()) return
        saveFromRef()
      }, 150)}
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
