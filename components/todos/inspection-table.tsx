'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { updateCaseField } from '@/lib/actions/cases'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

/**
 * 검사 탭의 한 행. 한 케이스가 여러 행을 가질 수 있음
 * (광견병항체 + 전염병검사 KSVDL 등).
 */
export interface InspectionRow {
  /** caseId + kind + lab 조합으로 유니크. React key 용. */
  id: string
  caseRow: CaseRow
  kind: 'titer' | 'infectious'
  lab: string
  date: string
  /** false면 날짜 셀은 읽기 전용(뉴질랜드 전염병검사 = 출국일-15일 규칙). */
  dateEditable: boolean
  /** 날짜 수정 시 어느 저장소를 업데이트할지. */
  dateStorage:
    | { kind: 'titer' }
    | { kind: 'infectious'; lab: string }
}

interface LabOption { value: string; label: string }

interface StatusOption { value: string; label: string }

/** Update rabies_titer_records[0].date, preserving other fields. */
async function saveTiterDate(caseRow: CaseRow, newDate: string): Promise<void> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const current = Array.isArray(data.rabies_titer_records)
    ? (data.rabies_titer_records as Array<{ date?: string | null; value?: string | null; lab?: string | null }>)
    : []
  const head = current[0] ?? { date: null, value: null, lab: null }
  const next = [{ ...head, date: newDate || null }, ...current.slice(1)]
  await updateCaseField(caseRow.id, 'data', 'rabies_titer_records', next)
}

/** Update infectious_disease_records: upsert entry with given lab, set date. */
async function saveInfectiousDate(caseRow: CaseRow, lab: string, newDate: string): Promise<void> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const current = Array.isArray(data.infectious_disease_records)
    ? (data.infectious_disease_records as Array<{ date?: string | null; lab?: string | null }>)
    : []
  const idx = current.findIndex(r => r?.lab === lab)
  const cleanDate = newDate || null
  let next: Array<{ date?: string | null; lab?: string | null }>
  if (idx >= 0) {
    next = current.map((r, i) => i === idx ? { ...r, date: cleanDate } : r)
  } else {
    next = [...current, { lab, date: cleanDate }]
  }
  await updateCaseField(caseRow.id, 'data', 'infectious_disease_records', next)
}

/** Simple inline date editor. */
function DateCell({
  value,
  editable,
  onSave,
}: {
  value: string
  editable: boolean
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  const commit = useCallback((v: string) => {
    setEditing(false)
    if (v === value) return
    onSave(v)
  }, [value, onSave])

  if (!editable) {
    return (
      <div className="w-full px-1 py-1 text-xs truncate min-h-[24px] text-muted-foreground/80">
        {value || <span className="text-muted-foreground/50">—</span>}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        className="w-full px-1 py-1 text-xs cursor-text truncate min-h-[24px]"
        onClick={() => {
          setDraft(value)
          setEditing(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
      >
        {value || <span className="text-muted-foreground/50">—</span>}
      </div>
    )
  }

  return (
    <input
      ref={inputRef}
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(draft)
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full bg-transparent border-0 border-b border-primary text-xs py-1 focus:outline-none"
    />
  )
}

/** Static text cell (read-only data from the case row). */
function StaticCell({ value }: { value: string }) {
  return (
    <div className="w-full px-1 py-1 text-xs truncate min-h-[24px]">
      {value || <span className="text-muted-foreground/50">—</span>}
    </div>
  )
}

/** Editable text cell saved to case data (메모). */
function MemoCell({ row, onUpdate }: {
  row: InspectionRow
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const data = (row.caseRow.data ?? {}) as Record<string, unknown>
  const initial = typeof data.inspection_memo === 'string' ? (data.inspection_memo as string) : ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(initial) }, [initial])

  const commit = useCallback(async (v: string) => {
    setEditing(false)
    const trimmed = v.trim()
    if (trimmed === initial) return
    const saveVal = trimmed === '' ? null : trimmed
    onUpdate(row.caseRow.id, 'data', 'inspection_memo', saveVal)
    await updateCaseField(row.caseRow.id, 'data', 'inspection_memo', saveVal)
  }, [initial, onUpdate, row.caseRow.id])

  if (!editing) {
    return (
      <div
        className="w-full px-1 py-1 text-xs cursor-text truncate min-h-[24px]"
        onClick={() => {
          setDraft(initial)
          setEditing(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
      >
        {initial || <span className="text-muted-foreground/50">—</span>}
      </div>
    )
  }
  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(draft)
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full bg-transparent border-0 border-b border-primary text-xs py-1 focus:outline-none"
    />
  )
}

/** Status badge + select. Per-case (공유 상태). */
function StatusCell({ row, options, onUpdate }: {
  row: InspectionRow
  options: StatusOption[]
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const data = (row.caseRow.data ?? {}) as Record<string, unknown>
  const value = typeof data.inspection_status === 'string' ? (data.inspection_status as string) : 'waiting'
  const opt = options.find(o => o.value === value)
  const label = opt?.label ?? '대기'

  let cls = 'bg-gray-100 text-gray-600'
  if (value === 'done') cls = 'bg-emerald-100 text-emerald-700'
  else if (value === 'testing') cls = 'bg-blue-100 text-blue-700'

  return (
    <div className="relative">
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>
      <select
        value={value}
        onChange={async (e) => {
          const v = e.target.value
          onUpdate(row.caseRow.id, 'data', 'inspection_status', v || null)
          await updateCaseField(row.caseRow.id, 'data', 'inspection_status', v || null)
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

/** Lab select. For titer rows it saves to inspection_lab. Infectious rows are fixed per rule (read-only label). */
function LabCell({ row, options, onUpdate }: {
  row: InspectionRow
  options: LabOption[]
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const label = options.find(o => o.value === row.lab)?.label ?? row.lab

  if (row.kind !== 'titer') {
    return <div className="w-full px-1 py-1 text-xs truncate min-h-[24px]">{label}</div>
  }

  return (
    <div className="relative">
      <div className="w-full px-1 py-1 text-xs truncate min-h-[24px] cursor-pointer">{label}</div>
      <select
        value={row.lab}
        onChange={async (e) => {
          const v = e.target.value
          onUpdate(row.caseRow.id, 'data', 'inspection_lab', v || null)
          await updateCaseField(row.caseRow.id, 'data', 'inspection_lab', v || null)
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

const COLUMNS = [
  { key: 'lab', label: '검사기관', width: 160 },
  { key: 'date', label: '검사일', width: 120 },
  { key: 'pet_name', label: '동물', width: 100 },
  { key: 'customer_name', label: '고객', width: 100 },
  { key: 'destination', label: '목적지', width: 100 },
  { key: 'status', label: '진행상태', width: 110 },
  { key: 'memo', label: '메모', width: 180 },
]

export function InspectionTable({
  rows,
  labOptions,
  statusOptions,
  onUpdate,
}: {
  rows: InspectionRow[]
  labOptions: LabOption[]
  statusOptions: StatusOption[]
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const sentinelRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => { setVisible(INITIAL_VISIBLE) }, [rows.length])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visible < rows.length) {
        setVisible(v => Math.min(v + LOAD_MORE_STEP, rows.length))
      }
    }, { rootMargin: '200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible, rows.length])

  const visibleRows = rows.slice(0, visible)

  const handleDateSave = useCallback(async (row: InspectionRow, v: string) => {
    if (row.dateStorage.kind === 'titer') {
      await saveTiterDate(row.caseRow, v)
      // Local optimistic: replace array shape is complex; simplest — force reload via onUpdate with raw read.
      const data = (row.caseRow.data ?? {}) as Record<string, unknown>
      const current = Array.isArray(data.rabies_titer_records)
        ? (data.rabies_titer_records as Array<{ date?: string | null }>)
        : []
      const head = current[0] ?? {}
      const next = [{ ...head, date: v || null }, ...current.slice(1)]
      onUpdate(row.caseRow.id, 'data', 'rabies_titer_records', next)
    } else {
      const lab = row.dateStorage.lab
      await saveInfectiousDate(row.caseRow, lab, v)
      const data = (row.caseRow.data ?? {}) as Record<string, unknown>
      const current = Array.isArray(data.infectious_disease_records)
        ? (data.infectious_disease_records as Array<{ date?: string | null; lab?: string | null }>)
        : []
      const idx = current.findIndex(r => r?.lab === lab)
      const next = idx >= 0
        ? current.map((r, i) => i === idx ? { ...r, date: v || null } : r)
        : [...current, { lab, date: v || null }]
      onUpdate(row.caseRow.id, 'data', 'infectious_disease_records', next)
    }
  }, [onUpdate])

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border">
          {COLUMNS.map(col => (
            <th
              key={col.key}
              className="text-left text-xs font-medium text-muted-foreground px-2 py-2 whitespace-nowrap"
              style={{ width: col.width, minWidth: col.width }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleRows.map(row => (
          <tr key={row.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
            <td className="px-2 py-1" style={{ width: 160, minWidth: 160 }}>
              <LabCell row={row} options={labOptions} onUpdate={onUpdate} />
            </td>
            <td className="px-2 py-1" style={{ width: 120, minWidth: 120 }}>
              <DateCell
                value={row.date}
                editable={row.dateEditable}
                onSave={(v) => handleDateSave(row, v)}
              />
            </td>
            <td className="px-2 py-1" style={{ width: 100, minWidth: 100 }}>
              <StaticCell value={row.caseRow.pet_name ?? ''} />
            </td>
            <td className="px-2 py-1" style={{ width: 100, minWidth: 100 }}>
              <StaticCell value={row.caseRow.customer_name ?? ''} />
            </td>
            <td className="px-2 py-1" style={{ width: 100, minWidth: 100 }}>
              <StaticCell value={row.caseRow.destination ?? ''} />
            </td>
            <td className="px-2 py-1" style={{ width: 110, minWidth: 110 }}>
              <StatusCell row={row} options={statusOptions} onUpdate={onUpdate} />
            </td>
            <td className="px-2 py-1" style={{ width: 180, minWidth: 180 }}>
              <MemoCell row={row} onUpdate={onUpdate} />
            </td>
          </tr>
        ))}
        {visible < rows.length && (
          <tr ref={sentinelRef}>
            <td colSpan={COLUMNS.length} className="text-center text-muted-foreground/50 py-2 text-xs">
              {visible} / {rows.length}건
            </td>
          </tr>
        )}
        {rows.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length} className="text-center text-muted-foreground py-8">
              데이터가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
