'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from '@/components/cases/cases-context'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

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
  if (!opt) return <span className="text-muted-foreground">—</span>

  // Juniper & Pearl 톤 — 저채도 (destination-color.ts 와 같은 팔레트).
  let colorClass = 'bg-[#D6D5D1] text-[#3E3E3A] dark:bg-[#3A3A37] dark:text-[#CACAC5]' // charcoal — 기본/대기
  if (value === 'done') colorClass = 'bg-[#DBE4D6] text-[#3F5A35] dark:bg-[#364332] dark:text-[#C4D4B9]' // olive — 완료
  else if (value === 'in_progress' || value === 'testing') colorClass = 'bg-[#D6E0EA] text-[#3D5268] dark:bg-[#2F3D4D] dark:text-[#C4D1DE]' // blue — 진행 중
  else if (value === 'na') colorClass = 'bg-[#E5D9C2] text-[#6B5A3A] dark:bg-[#4A412D] dark:text-[#DBCDB0]' // amber — N/A
  else if (value === 'yes') colorClass = 'bg-[#EDD6D0] text-[#7A4A40] dark:bg-[#4D3631] dark:text-[#E3C4BE]' // red — 왕복

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
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
      await updateCaseField(row.id, col.storage, col.key, saveVal)
    },
    [row.id, col.storage, col.key, value, onUpdate],
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
    return (
      <div
        className="w-full px-1 py-1 text-base cursor-text whitespace-pre-wrap min-h-[24px]"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || <span className="text-muted-foreground/50">—</span>}
      </div>
    )
  }

  // Date: uncontrolled (검사 패턴 통일). defaultValue + ref + Ctrl+Z 보존.
  if (isDate) {
    const commit = () => save(inputRef.current?.value ?? '')
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
      className="w-full min-h-[2rem] rounded-md border border-border/50 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
    />
  )
}

function ReadonlyCell({ row, col }: { row: CaseRow; col: TodoColumn }) {
  const value = getCellValue(row, col)
  return (
    <div className="w-full px-1 py-1 text-base truncate min-h-[24px]">
      {value || <span className="text-muted-foreground/50">—</span>}
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
  const opt = col.options?.find((o) => o.value === value)

  return (
    <div className="relative">
      <StatusBadge value={value} options={col.options!} />
      <select
        value={value}
        onChange={async (e) => {
          const newVal = e.target.value
          onUpdate(row.id, col.storage, col.key, newVal || null)
          await updateCaseField(row.id, col.storage, col.key, newVal || null)
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        <option value="">—</option>
        {col.options!.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function TodoTable({
  cases,
  columns,
  onUpdate,
}: {
  cases: CaseRow[]
  columns: TodoColumn[]
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
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
    <table className="w-full border-collapse text-base">
      <thead>
        <tr className="border-b border-border/60">
          {columns.map((col) => (
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
        {visibleCases.map((row) => (
          <tr
            key={row.id}
            className="border-b border-border/60 hover:bg-accent/30 transition-colors cursor-pointer"
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
                  className="px-2 py-2"
                  style={{ width: col.width, minWidth: col.width }}
                  {...tdProps}
                >
                  {col.condition && !col.condition(row) ? (
                    <span className="text-muted-foreground/30 text-base px-1">—</span>
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
            <td colSpan={columns.length} className="text-center text-muted-foreground/50 py-2 text-[13px]">
              {visible} / {cases.length}건
            </td>
          </tr>
        )}
        {cases.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="text-center text-muted-foreground py-2xl">
              데이터가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
