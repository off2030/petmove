'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { updateCaseField } from '@/lib/actions/cases'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

export interface TodoColumn {
  key: string
  label: string
  storage: 'column' | 'data'
  type: 'text' | 'date' | 'select'
  width: number
  options?: Array<{ value: string; label: string }>
}

function getCellValue(row: CaseRow, col: TodoColumn): string {
  if (col.storage === 'column') {
    const v = (row as unknown as Record<string, unknown>)[col.key]
    return v != null ? String(v) : ''
  }
  const data = (row.data ?? {}) as Record<string, unknown>
  const v = data[col.key]
  return v != null ? String(v) : ''
}

function StatusBadge({ value, options }: { value: string; options: Array<{ value: string; label: string }> }) {
  const opt = options.find((o) => o.value === value)
  if (!opt) return <span className="text-muted-foreground">—</span>

  let colorClass = 'bg-muted text-muted-foreground'
  if (value === 'done') colorClass = 'bg-emerald-100 text-emerald-700'
  else if (value === 'in_progress') colorClass = 'bg-blue-100 text-blue-700'
  else if (value === 'not_started') colorClass = 'bg-gray-100 text-gray-600'
  else if (value === 'na') colorClass = 'bg-orange-50 text-orange-600'
  else if (value === 'yes') colorClass = 'bg-red-100 text-red-700'

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

  // Select type: show dropdown
  if (col.type === 'select' && col.options) {
    return (
      <select
        value={value}
        onChange={async (e) => {
          const newVal = e.target.value
          onUpdate(row.id, col.storage, col.key, newVal || null)
          await updateCaseField(row.id, col.storage, col.key, newVal || null)
        }}
        className="w-full bg-transparent border-0 text-xs py-1 cursor-pointer focus:outline-none focus:ring-0"
      >
        <option value="">—</option>
        {col.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  // Display mode
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

  // Edit mode
  return (
    <input
      ref={inputRef}
      type={col.type === 'date' ? 'date' : 'text'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => save(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save(draft)
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full bg-transparent border-0 border-b border-primary text-xs py-1 focus:outline-none"
    />
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

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border">
          {columns.map((col) => (
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
        {visibleCases.map((row) => (
          <tr key={row.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
            {columns.map((col) => (
              <td
                key={col.key}
                className="px-2 py-1"
                style={{ width: col.width, minWidth: col.width }}
              >
                {col.type === 'select' && col.options && getCellValue(row, col) ? (
                  <div className="flex items-center gap-1">
                    <StatusBadge value={getCellValue(row, col)} options={col.options} />
                    <select
                      value={getCellValue(row, col)}
                      onChange={async (e) => {
                        const newVal = e.target.value
                        onUpdate(row.id, col.storage, col.key, newVal || null)
                        await updateCaseField(row.id, col.storage, col.key, newVal || null)
                      }}
                      className="w-4 h-4 opacity-0 hover:opacity-100 cursor-pointer absolute"
                      style={{ marginLeft: -4 }}
                    >
                      <option value="">—</option>
                      {col.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <EditableCell row={row} col={col} onUpdate={onUpdate} />
                )}
              </td>
            ))}
          </tr>
        ))}
        {visible < cases.length && (
          <tr ref={sentinelRef}>
            <td colSpan={columns.length} className="text-center text-muted-foreground/50 py-2 text-xs">
              {visible} / {cases.length}건
            </td>
          </tr>
        )}
        {cases.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="text-center text-muted-foreground py-8">
              데이터가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
