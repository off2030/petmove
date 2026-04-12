'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { FieldSpec } from '@/lib/fields'
import { coerceInputValue, renderFieldValue } from '@/lib/fields'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from '@/components/cases/copy-button'
import { useCases } from '@/components/cases/cases-context'

/**
 * A single editable field.
 *
 * Default mode renders a full row:
 *   [label]    [display value]            [copy]
 *
 * `inline` mode renders only the value cell — used by PairedField to
 * compose two editable cells side-by-side in a shared row.
 */
export function EditableField({
  caseId,
  spec,
  rawValue,
  inline = false,
}: {
  caseId: string
  spec: FieldSpec
  rawValue: unknown
  inline?: boolean
}) {
  const { updateLocalCaseField } = useCases()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(stringifyRaw(rawValue, spec))
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(null)

  // Keep local state in sync if rawValue changes externally (after revalidation)
  useEffect(() => {
    if (!editing) setValue(stringifyRaw(rawValue, spec))
  }, [rawValue, spec, editing])

  // Focus on enter-edit
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (
        inputRef.current instanceof HTMLInputElement ||
        inputRef.current instanceof HTMLTextAreaElement
      ) {
        inputRef.current.select?.()
      }
    }
  }, [editing])

  const display = renderFieldValue(spec, rawValue)
  const isEmpty = display === '—'

  function handleEnterEdit() {
    setError(null)
    setValue(stringifyRaw(rawValue, spec))
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setValue(stringifyRaw(rawValue, spec))
    setError(null)
  }

  function handleSave() {
    const coerced = coerceInputValue(spec, value)
    startSave(async () => {
      const result = await updateCaseField(
        caseId,
        spec.storage,
        spec.key,
        coerced,
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Optimistic local update — no server refetch needed
      updateLocalCaseField(caseId, spec.storage, spec.key, coerced)
      setError(null)
      setEditing(false)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  const valueCell = (
    <div className="min-w-0">
      {editing ? (
        <div className="flex items-start gap-2">
          {renderInput(spec, value, setValue, inputRef, handleKeyDown)}
          <div className="flex gap-1 pt-0.5">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? '저장중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex h-8 items-center justify-center rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleEnterEdit}
          className={cn(
            'text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors',
            'hover:bg-accent/60 cursor-text',
            !inline && 'w-full',
            isEmpty && 'text-muted-foreground/60 italic',
          )}
          title="클릭하여 편집"
        >
          {spec.type === 'longtext' ? (
            <span className="whitespace-pre-wrap">{display}</span>
          ) : (
            display
          )}
        </button>
      )}
      {error && (
        <div className="mt-1 text-xs text-red-600">에러: {error}</div>
      )}
    </div>
  )

  if (inline) return valueCell

  return (
    <div className="group grid grid-cols-[140px_1fr_auto] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="text-sm text-muted-foreground pt-1">{spec.label}</div>
      {valueCell}
      <div className="pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton value={isEmpty ? '' : display} />
      </div>
    </div>
  )
}

function stringifyRaw(raw: unknown, spec: FieldSpec): string {
  if (raw === null || raw === undefined) return ''
  if (spec.type === 'date') {
    // Keep the YYYY-MM-DD form for the date input
    return renderFieldValue(spec, raw).replace('—', '')
  }
  return String(raw)
}

function renderInput(
  spec: FieldSpec,
  value: string,
  setValue: (v: string) => void,
  ref: React.RefObject<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >,
  onKeyDown: (e: React.KeyboardEvent) => void,
) {
  const commonClass =
    'flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  if (spec.type === 'longtext') {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        className="flex-1 min-h-[4.5rem] rounded-md border border-input bg-background p-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
      />
    )
  }
  if (spec.type === 'select' && spec.options) {
    return (
      <select
        ref={ref as React.RefObject<HTMLSelectElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className={commonClass}
      >
        <option value="">—</option>
        {spec.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label_ko}
          </option>
        ))}
      </select>
    )
  }
  if (spec.type === 'date') {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className={commonClass}
      />
    )
  }
  if (spec.type === 'number') {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="number"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className={commonClass}
      />
    )
  }
  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      className={commonClass}
    />
  )
}
