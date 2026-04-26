'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from '@/components/cases/cases-context'
import { labColor } from '@/lib/lab-color'
import { destCode } from '@/lib/country-code'
import { cn } from '@/lib/utils'
import { DateTextField } from '@/components/ui/date-text-field'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

/** 검사일이 오늘 기준 N일 이상 경과했는지. YYYY-MM-DD 기준. */
function isOverdue(dateStr: string, days: number): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
  return diffDays >= days
}

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

/** YYYY-MM-DD → YYYY·MM·DD (editorial 구분자). */
function formatDateDotted(v: string): string {
  if (!v || v.length < 10) return v
  return v.replace(/-/g, '\u00B7')
}

/**
 * Inline date editor — 상세페이지(editable-field.tsx)와 동일한 패턴.
 * Uncontrolled `defaultValue` + `autoFocus` 만 사용. `showPicker()`는 호출하지 않는다:
 * 달력 팝업으로 선택한 값 변경은 브라우저 native undo history에 기록되지 않아
 * Ctrl+Z 가 동작하지 않게 된다. 키보드 타이핑은 정상적으로 undo 됨.
 *
 * Editorial: Mono 12px tabular-nums, · 구분자. 빈값은 italic "—".
 */
function DateCell({
  value,
  editable,
  onSave,
  overdue = false,
}: {
  value: string
  editable: boolean
  onSave: (v: string) => void
  overdue?: boolean
}) {
  const [editing, setEditing] = useState(false)

  const overdueCls = overdue && value ? 'text-orange-500' : ''
  const baseCls = 'w-full px-1 py-1 font-mono text-[12px] tabular-nums tracking-[0.3px] truncate min-h-[24px]'

  if (!editable) {
    return (
      <div className={cn(baseCls, 'text-muted-foreground/80', overdueCls)}>
        {value ? formatDateDotted(value) : <span className="font-serif italic text-[15px] text-muted-foreground/40">—</span>}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        className={cn(baseCls, 'cursor-text', overdueCls)}
        onClick={() => setEditing(true)}
      >
        {value ? formatDateDotted(value) : <span className="font-serif italic text-[15px] text-muted-foreground/40">—</span>}
      </div>
    )
  }

  return (
    <DateTextField
      autoFocus
      value={value}
      onChange={(v) => {
        if (v !== value) onSave(v)
        setEditing(false)
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
      }}
      size="sm"
      className="w-full bg-transparent border-0 border-b border-primary font-mono text-[12px] tabular-nums py-1 focus:outline-none"
    />
  )
}

/** Static text cell — 홈 화면과 동일한 typography. 빈값은 italic "—". */
function StaticCell({ value, variant }: { value: string; variant?: 'pet' | 'customer' }) {
  const cls =
    variant === 'pet'
      ? 'font-serif font-semibold text-[17px] leading-tight text-foreground'
      : variant === 'customer'
        ? 'font-sans font-normal text-[14px] leading-tight text-foreground/85'
        : 'font-serif text-[15px] font-medium text-foreground'
  return (
    <div className={cn('w-full px-1 py-1 truncate min-h-[24px]', cls)}>
      {value || <span className="italic font-normal text-muted-foreground/40">—</span>}
    </div>
  )
}

/** 목적지를 tan pill + MONO code + Serif 이름으로 렌더링 (상세페이지 DestinationField와 동일). 항상 한 줄. */
function DestinationCell({ value }: { value: string | null | undefined }) {
  const dests = (value ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (dests.length === 0) {
    return (
      <div className="w-full px-1 py-1 min-h-[24px]">
        <span className="font-serif italic text-[15px] text-muted-foreground/40">—</span>
      </div>
    )
  }
  return (
    <div className="w-full px-1 py-1 min-h-[24px] flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
      {dests.map(d => {
        const code = destCode(d)
        return (
          <span
            key={d}
            className="inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-0.5 bg-[#E5D9C2] text-[#6B5A3A] whitespace-nowrap"
          >
            {code && (
              <span className="font-mono text-[11px] uppercase tracking-[1px] text-[#7B7B5F]">
                {code}
              </span>
            )}
            <span className="font-serif text-[13px] text-[#6B5A3A]">{d}</span>
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

  // "ASAP" 같은 긴급 메모는 Mono uppercase + 브랜드 색. 일반 메모는 Serif.
  const isUrgent = /^ASAP$/i.test(initial.trim())
  const displayCls = isUrgent
    ? 'font-mono text-[12px] uppercase tracking-[1.3px] text-primary'
    : 'font-serif text-[15px] text-foreground'

  if (!editing) {
    return (
      <div
        className={cn('w-full px-1 py-1 cursor-text whitespace-pre-wrap min-h-[24px]', displayCls)}
        onClick={() => { setDraft(initial); setEditing(true) }}
      >
        {initial || <span className="font-serif italic text-muted-foreground/40">—</span>}
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

/**
 * Status — 배지 없음. 이탤릭 세리프 + "검사중" 활성 상태만 브랜드 색으로 강조.
 * 상세페이지의 Status 규칙과 동일.
 */
function StatusCell({ row, options, onUpdate }: {
  row: InspectionRow
  options: StatusOption[]
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const data = (row.caseRow.data ?? {}) as Record<string, unknown>
  const value = typeof data.inspection_status === 'string' ? (data.inspection_status as string) : 'waiting'
  const opt = options.find(o => o.value === value)
  const label = opt?.label ?? '대기'

  // "검사중" → primary(테라코타, warm). "완료" → sage(차분한 녹색, cool 대비). 대기 → muted.
  const isActive = value === 'testing'
  const isDone = value === 'done'
  const cls = isActive
    ? 'font-serif italic text-[16px] text-primary'
    : isDone
    ? 'font-serif italic text-[16px] text-[#2E5A3E] dark:text-[#B5D4BE]'
    : 'font-serif italic text-[16px] text-muted-foreground'

  return <StatusPicker row={row} options={options} value={value} label={label} cls={cls} isDone={isDone} onUpdate={onUpdate} />
}

/** Editorial 커스텀 진행상태 드롭다운 — 네이티브 select 제거. */
function StatusPicker({ row, options, value, label, cls, isDone, onUpdate }: {
  row: InspectionRow
  options: StatusOption[]
  value: string
  label: string
  cls: string
  isDone: boolean
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function pick(v: string) {
    setOpen(false)
    if (v === value) return
    onUpdate(row.caseRow.id, 'data', 'inspection_status', v || null)
    await updateCaseField(row.caseRow.id, 'data', 'inspection_status', v || null)
  }

  return (
    <div ref={ref} className="relative min-h-[24px] flex items-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(cls, 'cursor-pointer rounded-md -mx-1 px-1 hover:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40')}
      >
        {value === 'testing' && <span className="not-italic mr-1">↻</span>}
        {isDone && <span className="not-italic mr-1">✓</span>}
        {label}
      </button>
      {open && (
        <ul className="absolute left-0 top-full mt-1 z-30 min-w-[120px] rounded-md border border-border/60 bg-background py-1 shadow-md">
          {options.map(o => {
            const isCurrent = value === o.value
            const optActive = o.value === 'testing'
            const optDone = o.value === 'done'
            const optCls = optActive
              ? 'font-serif italic text-[15px] text-primary'
              : optDone
                ? 'font-serif italic text-[15px] text-[#2E5A3E] dark:text-[#B5D4BE]'
                : 'font-serif italic text-[15px] text-muted-foreground'
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={cn(
                    'w-full text-left px-sm py-1.5 hover:bg-accent/60 transition-colors flex items-center gap-sm',
                    isCurrent && 'bg-accent/40',
                  )}
                >
                  <span className={optCls}>
                    {optActive && <span className="not-italic mr-1">↻</span>}
                    {optDone && <span className="not-italic mr-1">✓</span>}
                    {o.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Lab select. For titer rows it saves to inspection_lab. Infectious rows are fixed per rule (read-only label). */
function LabCell({ row, options, onUpdate }: {
  row: InspectionRow
  options: LabOption[]
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  // Editorial pill: rounded-full + MONO uppercase (목적지 pill과 동일 shape, 각 lab 고유 tone 유지).
  const pillCls = 'inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap'

  // Multi-lab row (e.g., NZ: APQA HQ + VBDDL) — render one chip per lab with its own tone. 항상 한 줄.
  if (row.dateStorage.kind === 'infectious_multi') {
    return (
      <div className="w-full min-h-[24px] flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
        {row.dateStorage.labs.map(labVal => {
          const tone = labColor(labVal)
          const label = options.find(o => o.value === labVal)?.label ?? labVal
          return (
            <span
              key={labVal}
              className={cn(pillCls, tone ? cn(tone.bg, tone.text) : 'bg-muted text-muted-foreground')}
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
      className={cn(pillCls, tone ? cn(tone.bg, tone.text) : 'bg-muted/60 text-muted-foreground')}
    >
      {label}
    </span>
  )

  if (row.kind !== 'titer') {
    return <div className="w-full min-h-[24px] flex items-center">{chip}</div>
  }

  return <LabPicker row={row} options={options} chip={chip} onUpdate={onUpdate} />
}

/** Editorial 커스텀 드롭다운 — 네이티브 select 제거. Lab pill 스타일 그대로 유지. */
function LabPicker({ row, options, chip, onUpdate }: {
  row: InspectionRow
  options: LabOption[]
  chip: React.ReactNode
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function pick(v: string) {
    setOpen(false)
    if (v === row.lab) return
    onUpdate(row.caseRow.id, 'data', 'inspection_lab', v || null)
    await updateCaseField(row.caseRow.id, 'data', 'inspection_lab', v || null)
  }

  return (
    <div ref={ref} className="relative min-h-[24px] flex items-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {chip}
      </button>
      {open && (
        <ul className="absolute left-0 top-full mt-1 z-30 min-w-[140px] rounded-md border border-border/60 bg-background py-1 shadow-md">
          {options.map(o => {
            const isCurrent = row.lab === o.value
            const oTone = labColor(o.value)
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={cn(
                    'w-full text-left px-sm py-1.5 hover:bg-accent/60 transition-colors flex items-center gap-sm',
                    isCurrent && 'bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.8px] whitespace-nowrap',
                      oTone ? cn(oTone.bg, oTone.text) : 'bg-muted/60 text-muted-foreground',
                    )}
                  >
                    {o.label}
                  </span>
                  {isCurrent && (
                    <span className="ml-auto text-primary text-xs" aria-hidden="true">✓</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// 모든 데이터 컬럼 통일 너비.
const BASE_W = 116
const COLUMNS = [
  { key: 'lab', label: '검사기관', width: 146 },
  { key: 'date', label: '검사일', width: BASE_W },
  { key: 'pet_name', label: '반려동물', width: BASE_W },
  { key: 'customer_name', label: '보호자', width: BASE_W },
  { key: 'destination', label: '목적지', width: 146 },
  { key: 'status', label: '진행상태', width: BASE_W },
  { key: 'departure_date', label: '출국일', width: BASE_W },
  { key: 'memo', label: '메모', width: 120 },
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
    <table className="w-full border-collapse table-fixed">
      <thead>
        <tr className="border-b border-border/60">
          {COLUMNS.map(col => (
            <th
              key={col.key}
              className="text-left font-sans font-normal text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 px-2 py-2.5 whitespace-nowrap"
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
            className="group/insprow border-b border-dashed border-border/50 hover:bg-accent transition-colors cursor-pointer"
            onClick={() => openCase(row.caseRow.id)}
          >
            <td className="px-2 py-4" style={{ width: 146, minWidth: 146 }} onClick={(e) => e.stopPropagation()}>
              <LabCell row={row} options={labOptions} onUpdate={onUpdate} />
            </td>
            <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }} onClick={(e) => e.stopPropagation()}>
              <DateCell
                value={row.date}
                editable={row.dateEditable}
                onSave={(v) => handleDateSave(row, v)}
                overdue={
                  ((row.caseRow.data as Record<string, unknown> | null)?.inspection_status ?? 'waiting') === 'waiting'
                  && isOverdue(row.date, 5)
                }
              />
            </td>
            <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }}>
              <StaticCell value={row.caseRow.pet_name ?? ''} variant="pet" />
            </td>
            <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }}>
              <StaticCell value={row.caseRow.customer_name ?? ''} variant="customer" />
            </td>
            <td className="px-2 py-4" style={{ width: 146, minWidth: 146 }}>
              <DestinationCell value={row.caseRow.destination} />
            </td>
            <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }} onClick={(e) => e.stopPropagation()}>
              <StatusCell row={row} options={statusOptions} onUpdate={onUpdate} />
            </td>
            <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }} onClick={(e) => e.stopPropagation()}>
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
            <td className="px-2 py-4" style={{ width: 120, minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
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
