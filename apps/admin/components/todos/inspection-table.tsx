'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDepartureDate, resolveTabActiveDest, type CaseRow } from '@petmove/domain'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from '@/components/cases/cases-context'
import { labColor } from '@/lib/lab-color'
import { cn } from '@/lib/utils'
import { DateTextField } from '@petmove/ui'
import { DropdownSelect } from '@petmove/ui'
import { DestinationCell } from './destination-cell'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

/**
 * 검사일이 오늘 기준 threshold 일 이상 경과했으면 경과일수, 아니면 undefined.
 * YYYY-MM-DD 기준. (지연 배지 표시용)
 */
function overdueDays(dateStr: string, threshold: number): number | undefined {
  if (!dateStr) return undefined
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return undefined
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
  return diffDays >= threshold ? diffDays : undefined
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
    | { kind: 'titer'; recordIdx: number }
    | { kind: 'infectious'; lab: string }
    | { kind: 'infectious_multi'; labs: string[] }
}

/**
 * 행별 진행상태 저장 키. 같은 케이스에 항체검사/전염병검사가 동시에 올라온 경우
 * 각 검사의 상태가 독립적으로 관리되도록 분리. 항체검사는 record 인덱스별.
 */
export function inspectionStatusKey(row: InspectionRow): string {
  if (row.dateStorage.kind === 'titer') return `inspection_status_titer_${row.dateStorage.recordIdx}`
  if (row.dateStorage.kind === 'infectious') return `inspection_status_inf_${row.dateStorage.lab}`
  if (row.dateStorage.kind === 'infectious_multi') {
    return `inspection_status_inf_${[...row.dateStorage.labs].sort().join('_')}`
  }
  return 'inspection_status'
}

/**
 * legacy 케이스단위 `inspection_status` 일괄 done cutoff.
 * 20260425000004_inspection_done_pre_march.sql 가 검사일 < 2026-03-01 케이스를
 * 일괄 done 처리했고, 단일행 시절 UI 도 이 필드만 썼다. 이 날짜 이후 검사일을 가진
 * 행은 "옛 케이스에 새로 추가된 검사"이므로 케이스단위 done 을 상속하면 안 된다.
 */
const INSPECTION_LEGACY_DONE_CUTOFF = '2026-03-01'

/**
 * 행 진행상태 조회. 행별 키 우선, 없으면 legacy 폴백.
 *
 * legacy `inspection_status` 는 단일행 시절·pre-March 일괄 done 마이그레이션에서만
 * 쓰인 케이스단위 필드다. 같은 케이스에 새 검사 행이 추가되면 옛 'done' 이 잘못
 * 번지므로, "옛 행"에만 상속해야 한다 — 옛 행 판별:
 *  - titer idx 0: 단일행 시절부터 있던 행 → `inspection_status_titer` → `inspection_status`.
 *  - titer idx ≥ 1: 재검사 신규 record → legacy 무시, 'waiting' 출발.
 *  - infectious / infectious_multi: 검사일이 cutoff 이전이면 옛 행 → legacy 상속,
 *    cutoff 이후(=옛 케이스에 새로 추가된 검사)면 무시하고 'waiting'.
 *    (titer 의 idx 분리와 동일 취지를 날짜로 판별. 호주행 노견에 광견병항체 done
 *    이후 새 전염병검사를 추가하면 stale done 을 물려받던 버그 방지.)
 */
export function readInspectionStatus(row: InspectionRow): string {
  const data = (row.caseRow.data ?? {}) as Record<string, unknown>
  const v = data[inspectionStatusKey(row)]
  if (typeof v === 'string') return v
  if (row.dateStorage.kind === 'titer' && row.dateStorage.recordIdx === 0) {
    // idx 0 는 옛 단일행 시절 부터 있었을 가능성이 있으므로 legacy 폴백 유지.
    // 새 회차가 옛 'done' 을 상속하지 않게 하려면 saveNewRecord 가
    // inspection_status_titer_<newIdx> 를 'waiting' 으로 명시 저장 (rabies-titer-field).
    const legacyTiter = data.inspection_status_titer
    if (typeof legacyTiter === 'string') return legacyTiter
    const legacy = data.inspection_status
    if (typeof legacy === 'string') return legacy
  }
  if (row.dateStorage.kind === 'infectious' || row.dateStorage.kind === 'infectious_multi') {
    const legacy = data.inspection_status
    // 검사일이 있고 cutoff 이전인 옛 행만 케이스단위 done 을 상속.
    // 검사일이 없거나(아직 미검사 → waiting) cutoff 이후면 상속 안 함.
    if (typeof legacy === 'string' && row.date && row.date < INSPECTION_LEGACY_DONE_CUTOFF) {
      return legacy
    }
  }
  return 'waiting'
}

interface LabOption { value: string; label: string }

interface StatusOption { value: string; label: string }

/**
 * Update rabies_titer_records[idx].date. Empty newDate → 그 record 삭제(행 사라짐).
 * 다른 곳들과 의미 일관성: 날짜 비움 = 그 회차 정보 사라짐.
 */
function computeTiterNext(
  current: Array<{ date?: string | null; value?: string | null; lab?: string | null }>,
  newDate: string,
  idx: number,
): Array<{ date?: string | null; value?: string | null; lab?: string | null }> {
  if (!newDate) return current.filter((_, i) => i !== idx)
  const target = current[idx] ?? { date: null, value: null, lab: null }
  return current.map((r, i) => i === idx ? { ...target, date: newDate } : r)
}

async function saveTiterDate(caseRow: CaseRow, idx: number, newDate: string): Promise<Array<{ date?: string | null; value?: string | null; lab?: string | null }> | null> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const current = Array.isArray(data.rabies_titer_records)
    ? (data.rabies_titer_records as Array<{ date?: string | null; value?: string | null; lab?: string | null }>)
    : []
  const next = computeTiterNext(current, newDate, idx)
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
  overdueDays,
}: {
  value: string
  editable: boolean
  onSave: (v: string) => void
  /** 대기중 + 검사일 5일 이상 경과 시 경과일수. 미지연이면 undefined. */
  overdueDays?: number
}) {
  const [editing, setEditing] = useState(false)

  // 점은 absolute(흐름 밖)로 두어 날짜 x 위치가 지연/비지연 행에서 동일 — 열 정렬 유지.
  const baseCls = 'relative w-full px-1 py-1 min-h-[24px] flex items-center'
  const dateCls = 'font-mono text-[12px] tabular-nums tracking-[0.3px] truncate'
  const isOverdue = overdueDays != null

  const body = value ? (
    <>
      {isOverdue && (
        <span
          aria-hidden
          title={`검사 접수 후 ${overdueDays}일 경과 — 결과 확인 필요`}
          className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full bg-pmw-warning"
        />
      )}
      <span className={cn(dateCls, isOverdue ? 'text-pmw-warning' : 'text-muted-foreground/80')}>
        {formatDateDotted(value)}
      </span>
    </>
  ) : (
    <span className="font-serif italic text-[15px] text-muted-foreground/40">—</span>
  )

  if (!editable) {
    return <div className={baseCls}>{body}</div>
  }

  if (!editing) {
    return (
      <div className={cn(baseCls, 'cursor-text')} onClick={() => setEditing(true)}>
        {body}
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
      className="w-full min-h-[2rem] rounded-md border border-border/80 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
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
  const value = readInspectionStatus(row)
  const opt = options.find(o => o.value === value)
  const label = opt?.label ?? '대기'

  // "검사중" → primary(테라코타, warm). "완료" → sage(차분한 녹색, cool 대비). 대기 → muted.
  const isActive = value === 'testing'
  const isDone = value === 'done'
  const cls = isActive
    ? 'font-serif italic text-[16px] text-primary'
    : isDone
    ? 'font-serif italic text-[16px] text-pmw-positive'
    : 'font-serif italic text-[16px] text-muted-foreground'

  return <StatusPicker row={row} options={options} value={value} label={label} cls={cls} isDone={isDone} onUpdate={onUpdate} />
}

/** Editorial 커스텀 진행상태 드롭다운 — 통일 DropdownSelect 사용. */
function StatusPicker({ row, options, value, label, cls, isDone, onUpdate }: {
  row: InspectionRow
  options: StatusOption[]
  value: string
  label: string
  cls: string
  isDone: boolean
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  async function pick(v: string) {
    if (v === value) return
    const key = inspectionStatusKey(row)
    onUpdate(row.caseRow.id, 'data', key, v || null)
    await updateCaseField(row.caseRow.id, 'data', key, v || null)
  }
  return (
    <div className="min-h-[24px] flex items-center">
      <DropdownSelect
        value={value}
        options={options}
        onChange={pick}
        portal
        // 평소엔 차분한 텍스트, hover 시 여백 있는 알약(배경+하이라인 링)+꺾쇠(▼)로
        // '눌러서 바꾸는 드롭다운'임을 분명히 신호. 링은 행 hover(accent/40) 위에서도 구분됨.
        triggerClassName={cn(
          'group inline-flex items-center -ml-1 px-2.5 py-1',
          'hover:ring-1 hover:ring-inset hover:ring-border/60',
          cls,
        )}
        triggerProps={{
          'data-status-pill': '',
          ...(value === 'testing' ? { 'data-status-active': 'true' } : {}),
        } as React.ButtonHTMLAttributes<HTMLButtonElement>}
        renderTrigger={() => (
          <>
            {value === 'testing' && <span className="not-italic mr-1">↻</span>}
            {isDone && <span className="not-italic mr-1">✓</span>}
            {label}
            <span aria-hidden className="not-italic ml-1 text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-70">▼</span>
          </>
        )}
        renderOption={(o) => {
          const optActive = o.value === 'testing'
          const optDone = o.value === 'done'
          const optCls = optActive
            ? 'font-serif italic text-[15px] text-primary'
            : optDone
              ? 'font-serif italic text-[15px] text-pmw-positive'
              : 'font-serif italic text-[15px] text-muted-foreground'
          return (
            <span className={optCls}>
              {optActive && <span className="not-italic mr-1">↻</span>}
              {optDone && <span className="not-italic mr-1">✓</span>}
              {o.label}
            </span>
          )
        }}
      />
    </div>
  )
}

/** Lab select. For titer rows it saves to inspection_lab. Infectious rows are fixed per rule (read-only label). */
function LabCell({ row, options }: {
  row: InspectionRow
  options: LabOption[]
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

  // 검사기관은 검사 탭에서 읽기 전용 — 수정은 상세페이지에서만.
  return <div className="w-full min-h-[24px] flex items-center">{chip}</div>
}

// 모든 데이터 컬럼 통일 너비.
const BASE_W = 116
export type InspectionSortKey = 'lab' | 'date' | 'status'
const COLUMNS: { key: string; label: string; width: number; sortKey?: InspectionSortKey }[] = [
  { key: 'lab', label: '검사기관', width: 146, sortKey: 'lab' },
  { key: 'date', label: '검사일', width: BASE_W, sortKey: 'date' },
  { key: 'status', label: '진행상태', width: BASE_W, sortKey: 'status' },
  { key: 'pet_name', label: '반려동물', width: BASE_W },
  { key: 'customer_name', label: '보호자', width: BASE_W },
  { key: 'destination', label: '목적지', width: 146 },
  { key: 'departure_date', label: '출국일', width: BASE_W },
  { key: 'memo', label: '메모', width: 120 },
]

export function InspectionTable({
  rows,
  labOptions,
  statusOptions,
  onUpdate,
  hiddenColumns = [],
  sortMode,
  onSortChange,
}: {
  rows: InspectionRow[]
  labOptions: LabOption[]
  statusOptions: StatusOption[]
  onUpdate: (
    caseId: string,
    storage: 'column' | 'data',
    key: string,
    value: unknown,
    destination?: string | null,
  ) => void
  /** 설정 → 검사 에서 숨김 처리된 컬럼 key. */
  hiddenColumns?: string[]
  /** 현재 정렬 기준 — 상단 라벨 클릭으로 전환. */
  sortMode?: InspectionSortKey
  onSortChange?: (mode: InspectionSortKey) => void
}) {
  const hidden = new Set(hiddenColumns)
  const visibleColumns = COLUMNS.filter(c => !hidden.has(c.key))
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
      const val = await saveTiterDate(row.caseRow, row.dateStorage.recordIdx, v)
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
      <thead className="sticky top-0 z-10 bg-background">
        <tr>
          {visibleColumns.map(col => (
            <th
              key={col.key}
              className="text-left font-sans font-normal text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 px-2 py-2.5 whitespace-nowrap border-b border-border/80"
              style={{ width: col.width, minWidth: col.width }}
            >
              {col.sortKey && onSortChange ? (
                <button
                  type="button"
                  onClick={() => onSortChange(col.sortKey!)}
                  title={`${col.label} 기준으로 정렬`}
                  className={cn(
                    'inline-flex items-center gap-1 uppercase tracking-[0.14em] transition-colors',
                    sortMode === col.sortKey ? 'text-foreground font-medium' : 'hover:text-foreground',
                  )}
                >
                  {col.label}
                  {sortMode === col.sortKey && <span aria-hidden className="text-[8px] leading-none">▼</span>}
                </button>
              ) : (
                col.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleRows.map(row => {
          const isDone = readInspectionStatus(row) === 'done'
          return (
          <tr
            key={row.id}
            className={cn(
              'group/insprow border-b border-dashed border-border/80 hover:bg-accent/40 transition-colors cursor-pointer',
              isDone && 'opacity-50 hover:opacity-100',
            )}
            onClick={() => openCase(row.caseRow.id)}
          >
            {!hidden.has('lab') && (
              <td className="px-2 py-4" style={{ width: 146, minWidth: 146 }}>
                <LabCell row={row} options={labOptions} />
              </td>
            )}
            {!hidden.has('date') && (
              <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }}>
                <DateCell
                  value={row.date}
                  // 검사 탭에서는 검사일 편집 불가 — 수정은 상세페이지에서만.
                  editable={false}
                  onSave={(v) => handleDateSave(row, v)}
                  overdueDays={
                    readInspectionStatus(row) === 'waiting'
                      ? overdueDays(row.date, 5)
                      : undefined
                  }
                />
              </td>
            )}
            {!hidden.has('status') && (
              <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }} onClick={(e) => e.stopPropagation()}>
                <StatusCell row={row} options={statusOptions} onUpdate={onUpdate} />
              </td>
            )}
            {!hidden.has('pet_name') && (
              <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }}>
                <StaticCell value={row.caseRow.pet_name ?? ''} variant="pet" />
              </td>
            )}
            {!hidden.has('customer_name') && (
              <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }}>
                <StaticCell value={row.caseRow.customer_name ?? ''} variant="customer" />
              </td>
            )}
            {!hidden.has('destination') && (
              <td className="px-2 py-4" style={{ width: 146, minWidth: 146 }}>
                <DestinationCell row={row.caseRow} overrideKey="inspection_active_dest" onUpdate={onUpdate} />
              </td>
            )}
            {!hidden.has('departure_date') && (
              <td className="px-2 py-4" style={{ width: BASE_W, minWidth: BASE_W }} onClick={(e) => e.stopPropagation()}>
                {(() => {
                  // 활성 목적지(inspection_active_dest) 출국일 — 다중 목적지면 by_dest,
                  // 단일이면 컬럼. 편집도 같은 목적지로 라우팅.
                  const activeDest = resolveTabActiveDest(row.caseRow, 'inspection_active_dest')
                  return (
                    <DateCell
                      value={getDepartureDate(row.caseRow, activeDest) ?? ''}
                      editable
                      onSave={async (v) => {
                        const next = v || null
                        onUpdate(row.caseRow.id, 'column', 'departure_date', next, activeDest)
                        await updateCaseField(row.caseRow.id, 'column', 'departure_date', next, activeDest)
                      }}
                    />
                  )
                })()}
              </td>
            )}
            {!hidden.has('memo') && (
              <td className="px-2 py-4" style={{ width: 120, minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
                <MemoCell row={row} onUpdate={onUpdate} />
              </td>
            )}
          </tr>
          )
        })}
        {visible < rows.length && (
          <tr ref={sentinelRef}>
            <td colSpan={visibleColumns.length} className="text-center text-muted-foreground/50 py-2 text-[13px]">
              {visible} / {rows.length}건
            </td>
          </tr>
        )}
        {rows.length === 0 && (
          <tr>
            <td colSpan={visibleColumns.length} className="text-center text-muted-foreground py-2xl">
              데이터가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
