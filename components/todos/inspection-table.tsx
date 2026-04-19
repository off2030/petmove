'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from '@/components/cases/cases-context'
import { labColor } from '@/lib/lab-color'
import { destColor } from '@/lib/destination-color'
import { cn } from '@/lib/utils'

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
    | { kind: 'infectious_multi'; labs: string[] }
}

interface LabOption { value: string; label: string }

interface StatusOption { value: string; label: string }

/**
 * Update rabies_titer_records[0].date. Empty newDate → record 자체를 삭제(행 사라짐).
 * 다른 곳들과 의미 일관성: 날짜 비움 = 그 회차 정보 사라짐.
 */
function computeTiterNext(
  current: Array<{ date?: string | null; value?: string | null; lab?: string | null }>,
  newDate: string,
): Array<{ date?: string | null; value?: string | null; lab?: string | null }> {
  if (!newDate) return current.slice(1)
  const head = current[0] ?? { date: null, value: null, lab: null }
  return [{ ...head, date: newDate }, ...current.slice(1)]
}

async function saveTiterDate(caseRow: CaseRow, newDate: string): Promise<Array<{ date?: string | null; value?: string | null; lab?: string | null }> | null> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const current = Array.isArray(data.rabies_titer_records)
    ? (data.rabies_titer_records as Array<{ date?: string | null; value?: string | null; lab?: string | null }>)
    : []
  const next = computeTiterNext(current, newDate)
  const val = next.length > 0 ? next : null
  await updateCaseField(caseRow.id, 'data', 'rabies_titer_records', val)
  return val
}

/**
 * Upsert infectious_disease_records entries for one or more labs.
 * Empty newDate → 해당 lab들의 entry 제거(행 사라짐).
 */
function upsertInfectiousRecords(
  current: Array<{ date?: string | null; lab?: string | null }>,
  labs: string[],
  newDate: string,
): Array<{ date?: string | null; lab?: string | null }> {
  if (!newDate) {
    return current.filter(r => !labs.includes(r?.lab ?? ''))
  }
  let next = current.slice()
  for (const lab of labs) {
    const idx = next.findIndex(r => r?.lab === lab)
    if (idx >= 0) {
      next = next.map((r, i) => i === idx ? { ...r, date: newDate } : r)
    } else {
      next = [...next, { lab, date: newDate }]
    }
  }
  return next
}

async function saveInfectiousDates(caseRow: CaseRow, labs: string[], newDate: string): Promise<Array<{ date?: string | null; lab?: string | null }> | null> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const current = Array.isArray(data.infectious_disease_records)
    ? (data.infectious_disease_records as Array<{ date?: string | null; lab?: string | null }>)
    : []
  const next = upsertInfectiousRecords(current, labs, newDate)
  const val = next.length > 0 ? next : null
  await updateCaseField(caseRow.id, 'data', 'infectious_disease_records', val)
  return val
}

/**
 * Inline date editor — 상세페이지(editable-field.tsx)와 동일한 패턴.
 * Uncontrolled `defaultValue` + `autoFocus` 만 사용. `showPicker()`는 호출하지 않는다:
 * 달력 팝업으로 선택한 값 변경은 브라우저 native undo history에 기록되지 않아
 * Ctrl+Z 가 동작하지 않게 된다. 키보드 타이핑은 정상적으로 undo 됨.
 */
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
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = useCallback(() => {
    setEditing(false)
    const v = inputRef.current?.value ?? ''
    if (v === value) return
    onSave(v)
  }, [value, onSave])

  if (!editable) {
    return (
      <div className="w-full px-1 py-1 text-base truncate min-h-[24px] text-muted-foreground/80">
        {value || <span className="text-muted-foreground/50">—</span>}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        className="w-full px-1 py-1 text-base cursor-text truncate min-h-[24px]"
        onClick={() => setEditing(true)}
      >
        {value || <span className="text-muted-foreground/50">—</span>}
      </div>
    )
  }

  return (
    <input
      ref={inputRef}
      type="date"
      min="1900-01-01"
      max="2100-12-31"
      defaultValue={value}
      autoFocus
      onChange={(e) => {
        // 달력 picker "삭제" 버튼으로 ''가 되면 즉시 저장.
        if (e.target.value === '') commit()
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full bg-transparent border-0 border-b border-primary text-base py-1 focus:outline-none"
    />
  )
}

/** Static text cell (read-only data from the case row). */
function StaticCell({ value }: { value: string }) {
  return (
    <div className="w-full px-1 py-1 text-base truncate min-h-[24px]">
      {value || <span className="text-muted-foreground/50">—</span>}
    </div>
  )
}

/** 목적지를 국가별 색상 배지로 표시 (홈/상세와 동일 패턴). */
function DestinationCell({ value }: { value: string | null | undefined }) {
  const dests = (value ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (dests.length === 0) {
    return <div className="w-full px-1 py-1 text-base min-h-[24px]"><span className="text-muted-foreground/50">—</span></div>
  }
  return (
    <div className="w-full px-1 py-1 min-h-[24px] flex items-center gap-1 flex-wrap">
      {dests.map(d => {
        const tone = destColor(d)
        return (
          <span key={d} className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', tone.bg, tone.text)}>
            {d}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Editable text cell saved to case data (메모).
 * 상세페이지 NoteTextInput과 동일한 박스 textarea + 자동 높이 + Enter 저장 / Shift+Enter 줄바꿈.
 */
function MemoCell({ row, onUpdate }: {
  row: InspectionRow
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const data = (row.caseRow.data ?? {}) as Record<string, unknown>
  const initial = typeof data.inspection_memo === 'string' ? (data.inspection_memo as string) : ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(initial) }, [initial])

  const commit = useCallback(async (v: string) => {
    setEditing(false)
    const trimmed = v.trim()
    if (trimmed === initial) return
    const saveVal = trimmed === '' ? null : trimmed
    onUpdate(row.caseRow.id, 'data', 'inspection_memo', saveVal)
    await updateCaseField(row.caseRow.id, 'data', 'inspection_memo', saveVal)
  }, [initial, onUpdate, row.caseRow.id])

  useEffect(() => {
    if (!editing || !inputRef.current) return
    const el = inputRef.current
    el.focus()
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [editing])

  if (!editing) {
    return (
      <div
        className="w-full px-1 py-1 text-base cursor-text whitespace-pre-wrap min-h-[24px]"
        onClick={() => { setDraft(initial); setEditing(true) }}
      >
        {initial || <span className="text-muted-foreground/50">—</span>}
      </div>
    )
  }
  return (
    <textarea
      ref={inputRef}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(draft) }
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full min-h-[2rem] rounded-md border border-border/50 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
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

  let cls = 'bg-[#D6D5D1] text-[#3E3E3A] dark:bg-[#3A3A37] dark:text-[#CACAC5]'
  if (value === 'done') cls = 'bg-[#DBE4D6] text-[#3F5A35] dark:bg-[#364332] dark:text-[#C4D4B9]'
  else if (value === 'testing') cls = 'bg-[#D6E0EA] text-[#3D5268] dark:bg-[#2F3D4D] dark:text-[#C4D1DE]'

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
  // Multi-lab row (e.g., NZ: APQA HQ + VBDDL) — render one chip per lab with its own tone.
  if (row.dateStorage.kind === 'infectious_multi') {
    return (
      <div className="w-full min-h-[24px] flex items-center gap-1 flex-wrap">
        {row.dateStorage.labs.map(labVal => {
          const tone = labColor(labVal)
          const label = options.find(o => o.value === labVal)?.label ?? labVal
          return (
            <span
              key={labVal}
              className={cn(
                'inline-block text-xs rounded px-2 py-0.5 font-medium',
                tone ? cn(tone.bg, tone.text) : 'bg-muted text-muted-foreground',
              )}
            >
              {label}
            </span>
          )
        })}
      </div>
    )
  }

  const label = options.find(o => o.value === row.lab)?.label ?? row.lab
  const tone = labColor(row.lab)

  const chip = (
    <span
      className={cn(
        'inline-block text-xs truncate max-w-full',
        tone
          ? cn('rounded px-2 py-0.5 font-medium', tone.bg, tone.text)
          : 'px-1 py-1',
      )}
    >
      {label}
    </span>
  )

  if (row.kind !== 'titer') {
    return <div className="w-full min-h-[24px] flex items-center">{chip}</div>
  }

  return (
    <div className="relative min-h-[24px] flex items-center">
      <div className="cursor-pointer">{chip}</div>
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
  { key: 'departure_date', label: '출국일', width: 120 },
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
  const { openCase } = useCases()

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
      const val = await saveTiterDate(row.caseRow, v)
      onUpdate(row.caseRow.id, 'data', 'rabies_titer_records', val)
    } else {
      const labs = row.dateStorage.kind === 'infectious_multi'
        ? row.dateStorage.labs
        : [row.dateStorage.lab]
      const val = await saveInfectiousDates(row.caseRow, labs, v)
      onUpdate(row.caseRow.id, 'data', 'infectious_disease_records', val)
    }
  }, [onUpdate])

  return (
    <table className="w-full border-collapse text-base">
      <thead>
        <tr className="border-b border-border/60">
          {COLUMNS.map(col => (
            <th
              key={col.key}
              className="text-left text-base font-medium text-primary px-2 py-2.5 whitespace-nowrap"
              style={{ width: col.width, minWidth: col.width }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleRows.map(row => (
          <tr
            key={row.id}
            className="border-b border-border/60 hover:bg-accent/30 transition-colors cursor-pointer"
            onClick={() => openCase(row.caseRow.id)}
          >
            <td className="px-2 py-2" style={{ width: 160, minWidth: 160 }} onClick={(e) => e.stopPropagation()}>
              <LabCell row={row} options={labOptions} onUpdate={onUpdate} />
            </td>
            <td className="px-2 py-2" style={{ width: 120, minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
              <DateCell
                value={row.date}
                editable={row.dateEditable}
                onSave={(v) => handleDateSave(row, v)}
              />
            </td>
            <td className="px-2 py-2" style={{ width: 100, minWidth: 100 }}>
              <StaticCell value={row.caseRow.pet_name ?? ''} />
            </td>
            <td className="px-2 py-2" style={{ width: 100, minWidth: 100 }}>
              <StaticCell value={row.caseRow.customer_name ?? ''} />
            </td>
            <td className="px-2 py-2" style={{ width: 100, minWidth: 100 }}>
              <DestinationCell value={row.caseRow.destination} />
            </td>
            <td className="px-2 py-2" style={{ width: 110, minWidth: 110 }} onClick={(e) => e.stopPropagation()}>
              <StatusCell row={row} options={statusOptions} onUpdate={onUpdate} />
            </td>
            <td className="px-2 py-2" style={{ width: 120, minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
              <DateCell
                value={row.caseRow.departure_date ?? ''}
                editable
                onSave={async (v) => {
                  const next = v || null
                  onUpdate(row.caseRow.id, 'column', 'departure_date', next)
                  await updateCaseField(row.caseRow.id, 'column', 'departure_date', next)
                }}
              />
            </td>
            <td className="px-2 py-2" style={{ width: 180, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
              <MemoCell row={row} onUpdate={onUpdate} />
            </td>
          </tr>
        ))}
        {visible < rows.length && (
          <tr ref={sentinelRef}>
            <td colSpan={COLUMNS.length} className="text-center text-muted-foreground/50 py-2 text-[13px]">
              {visible} / {rows.length}건
            </td>
          </tr>
        )}
        {rows.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length} className="text-center text-muted-foreground py-2xl">
              데이터가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
