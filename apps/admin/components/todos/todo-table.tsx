'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from '@/components/cases/cases-context'
import { cn } from '@/lib/utils'
import { DateTextField } from '@/components/ui/date-text-field'
import { DropdownSelect } from '@/components/ui/dropdown-select'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

function formatDateDotted(v: string): string {
  if (!v || v.length < 10) return v
  return v.replace(/-/g, '\u00B7')
}

function isUrgentText(v: string): boolean {
  return /^ASAP$/i.test(v.trim())
}

export interface TodoColumn {
  key: string
  label: string
  storage: 'column' | 'data'
  type: 'text' | 'date' | 'select' | 'custom'
  width: number
  options?: Array<{ value: string; label: string }>
  /** Override default value resolution (e.g. read from nested structure) */
  resolveValue?: (row: CaseRow) => string
  /** Fallback value when stored value is empty */
  defaultValue?: string
  /** Only show this column's cell for rows matching this condition */
  condition?: (row: CaseRow) => boolean
  /**
   * Custom cell renderer for `type: 'custom'`. Receives the row and an
   * `onUpdate` helper for persisting changes via the shared local+DB path.
   */
  render?: (row: CaseRow, onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void) => React.ReactNode
  /**
   * 읽기 전용으로 표시하고 셀 클릭 시 행 네비게이션(상세페이지 이동)을 허용.
   * 식별 컬럼(동물명·고객명 등)에 사용.
   */
  readonly?: boolean
  /** 표시 모드 셀에 추가로 붙일 className (예: 경고 색상). */
  cellClass?: (row: CaseRow) => string
}

function getCellValue(row: CaseRow, col: TodoColumn): string {
  if (col.resolveValue) return col.resolveValue(row)
  let v: unknown
  if (col.storage === 'column') {
    v = (row as unknown as Record<string, unknown>)[col.key]
  } else {
    const data = (row.data ?? {}) as Record<string, unknown>
    v = data[col.key]
  }
  if (v != null && String(v) !== '') return String(v)
  return col.defaultValue ?? ''
}

function StatusBadge({ value, options }: { value: string; options: Array<{ value: string; label: string }> }) {
  const opt = options.find((o) => o.value === value)
  if (!opt) {
    return <span className="font-serif italic text-[15px] text-muted-foreground/40">—</span>
  }

  // Editorial tone: 배지 제거, 이탤릭 세리프로 표시.
  // 진행 중 → primary(테라코타, warm). 완료 → sage(차분한 녹색, cool 대비). 그 외 → muted.
  const isActive = value === 'in_progress' || value === 'testing'
  const isDone = value === 'done'
  const cls = isActive
    ? 'font-serif italic text-[16px] text-primary'
    : isDone
    ? 'font-serif italic text-[16px] text-pmw-positive'
    : 'font-serif italic text-[16px] text-muted-foreground'

  return (
    <span className={cls}>
      {isActive && <span className="not-italic mr-1">↻</span>}
      {isDone && <span className="not-italic mr-1">✓</span>}
      {opt.label}
    </span>
  )
}

function EditableCell({
  row,
  col,
  onUpdate,
}: {
  row: CaseRow
  col: TodoColumn
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const { replaceLocalCaseData } = useCases()
  const value = getCellValue(row, col)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDate = col.type === 'date'

  const save = useCallback(
    async (newVal: string) => {
      const trimmed = newVal.trim()
      if (trimmed === value) {
        setEditing(false)
        return
      }
      const saveVal = trimmed === '' ? null : trimmed
      onUpdate(row.id, col.storage, col.key, saveVal)
      setEditing(false)
      const result = await updateCaseField(row.id, col.storage, col.key, saveVal)
      // 자동 채움/리셋 결과 반영 — 서버에서 다른 필드(예: export_doc_status)가 바뀌었을 수 있음.
      if (result.ok && result.autoFilled) replaceLocalCaseData(row.id, result.autoFilled.data)
    },
    [row.id, col.storage, col.key, value, onUpdate, replaceLocalCaseData],
  )

  useEffect(() => {
    if (!editing || isDate) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [editing, isDate])

  // Display mode
  if (!editing) {
    const extraCls = col.cellClass?.(row) ?? ''
    const urgent = !isDate && isUrgentText(value)
    const displayCls = isDate
      ? 'font-mono text-[12px] tabular-nums tracking-[0.3px] text-foreground'
      : urgent
      ? 'font-mono text-[12px] uppercase tracking-[1.3px] text-primary'
      : 'font-serif text-[15px] font-medium text-foreground'
    const displayVal = isDate ? formatDateDotted(value) : value
    return (
      <div
        className={cn(
          'w-full px-1 py-1 cursor-text whitespace-pre-wrap min-h-[24px]',
          displayCls,
          extraCls,
        )}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value ? displayVal : <span className="font-serif italic font-normal text-[15px] text-muted-foreground/40">—</span>}
      </div>
    )
  }

  // Date: editorial calendar (DateTextField) — popover + text input in one.
  if (isDate) {
    return (
      <DateTextField
        autoFocus
        value={value}
        onChange={(v) => save(v)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        }}
        size="sm"
        className="w-full bg-transparent border-0 border-b border-primary text-base py-1 focus:outline-none"
      />
    )
  }

  // Text: 상세페이지 NoteTextInput 동일 — 박스 textarea + 자동 높이 + Enter 저장 / Shift+Enter 줄바꿈.
  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
      }}
      onBlur={() => save(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(draft) }
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full min-h-[2rem] rounded-md border border-border/80 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
    />
  )
}

function ReadonlyCell({ row, col }: { row: CaseRow; col: TodoColumn }) {
  const value = getCellValue(row, col)
  // 홈 화면과 동일한 typography — 보호자는 Sans 16px, 반려동물은 Serif Semibold 17px.
  const cls =
    col.key === 'pet_name'
      ? 'font-serif font-semibold text-[17px] leading-tight text-foreground'
      : col.key === 'customer_name'
        ? 'font-sans font-normal text-[14px] leading-tight text-foreground/85'
        : 'font-serif text-[15px] font-medium text-foreground'
  return (
    <div className={cn('w-full px-1 py-1 truncate min-h-[24px]', cls)}>
      {value || <span className="italic font-normal text-muted-foreground/40">—</span>}
    </div>
  )
}

function SelectCell({
  row,
  col,
  onUpdate,
}: {
  row: CaseRow
  col: TodoColumn
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const value = getCellValue(row, col)
  async function pick(v: string) {
    if (v === value) return
    onUpdate(row.id, col.storage, col.key, v || null)
    await updateCaseField(row.id, col.storage, col.key, v || null)
  }
  const isActive = value === 'in_progress' || value === 'testing'
  return (
    <DropdownSelect
      value={value}
      options={col.options!}
      onChange={pick}
      triggerClassName="-mx-1 px-1 text-left min-h-[24px] flex items-center"
      triggerProps={{
        'data-status-pill': '',
        ...(isActive ? { 'data-status-active': 'true' } : {}),
      } as React.ButtonHTMLAttributes<HTMLButtonElement>}
      renderTrigger={() => <StatusBadge value={value} options={col.options!} />}
      renderOption={(o) => {
        const optActive = o.value === 'in_progress' || o.value === 'testing'
        const optDone = o.value === 'done'
        const cls = optActive
          ? 'font-serif italic text-[15px] text-primary'
          : optDone
            ? 'font-serif italic text-[15px] text-pmw-positive'
            : 'font-serif italic text-[15px] text-muted-foreground'
        return (
          <span className={cls}>
            {optActive && <span className="not-italic mr-1">↻</span>}
            {optDone && <span className="not-italic mr-1">✓</span>}
            {o.label}
          </span>
        )
      }}
    />
  )
}

export function TodoTable({
  cases,
  columns,
  onUpdate,
  rowClass,
}: {
  cases: CaseRow[]
  columns: TodoColumn[]
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
  rowClass?: (row: CaseRow) => string
}) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const sentinelRef = useRef<HTMLTableRowElement>(null)

  // Reset visible count when cases or columns change
  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
  }, [cases.length, columns])

  // Infinite scroll
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visible < cases.length) {
          setVisible((v) => Math.min(v + LOAD_MORE_STEP, cases.length))
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible, cases.length])

  const visibleCases = cases.slice(0, visible)
  const { openCase } = useCases()

  return (
    <table className="w-full border-collapse table-fixed">
      <thead>
        <tr className="border-b border-border/80">
          {columns.map((col) => (
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
        {visibleCases.map((row) => (
          <tr
            key={row.id}
            className={cn(
              'border-b border-dashed border-border/80 hover:bg-accent transition-colors cursor-pointer',
              rowClass?.(row),
            )}
            onClick={() => openCase(row.id)}
          >
            {columns.map((col) => {
              // readonly 셀은 행 클릭(네비게이션) 허용, 그 외 편집 셀은 클릭 전파 차단.
              const tdProps = col.readonly
                ? {}
                : { onClick: (e: React.MouseEvent) => e.stopPropagation() }
              return (
                <td
                  key={col.key}
                  className="px-2 py-4"
                  style={{ width: col.width, minWidth: col.width }}
                  {...tdProps}
                >
                  {col.condition && !col.condition(row) ? (
                    <span className="font-serif italic text-[15px] text-muted-foreground/30 px-1">—</span>
                  ) : col.type === 'custom' && col.render ? (
                    col.render(row, onUpdate)
                  ) : col.readonly ? (
                    <ReadonlyCell row={row} col={col} />
                  ) : col.type === 'select' && col.options ? (
                    <SelectCell row={row} col={col} onUpdate={onUpdate} />
                  ) : (
                    <EditableCell row={row} col={col} onUpdate={onUpdate} />
                  )}
                </td>
              )
            })}
          </tr>
        ))}
        {visible < cases.length && (
          <tr ref={sentinelRef}>
            <td colSpan={columns.length} className="text-center font-mono text-[11px] tracking-[0.3px] text-muted-foreground/50 py-2">
              <span className="tabular-nums">{visible}</span>
              <span className="mx-1">/</span>
              <span className="tabular-nums">{cases.length}</span>
              <span className="font-serif italic ml-1">건</span>
            </td>
          </tr>
        )}
        {cases.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="text-center font-serif italic text-[15px] text-muted-foreground py-2xl">
              데이터가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
