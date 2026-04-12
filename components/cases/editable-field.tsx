'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { FieldSpec } from '@/lib/fields'
import { coerceInputValue, renderFieldValue } from '@/lib/fields'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from '@/components/cases/copy-button'
import { useCases } from '@/components/cases/cases-context'

/** Filter input by language */
function filterByLang(str: string, lang?: 'ko' | 'en'): string {
  if (lang === 'ko') return str.replace(/[a-zA-Z]/g, '')
  if (lang === 'en') return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
  return str
}

/** Auto-determine language filter from field spec */
const DIGITS_ONLY_KEYS = new Set(['phone'])
const DIGITS_SPACE_KEYS = new Set(['microchip'])
const NUMERIC_KEYS = new Set(['rabies_titer', 'rabies_titer_value'])

function autoDetectLang(spec: FieldSpec, explicit?: 'ko' | 'en'): 'ko' | 'en' | undefined {
  if (explicit) return explicit
  if (spec.type !== 'text') return undefined
  if (spec.key.endsWith('_en')) return 'en'
  if (spec.key === 'address_overseas' || spec.key === 'email') return 'en'
  // Korean fields: allow both Korean AND English (no filter)
  return undefined
}

/** Filter to digits only (for phone, etc.) */
function filterDigitsOnly(str: string): string {
  return str.replace(/[^\d]/g, '')
}

/** Filter to digits and decimal point (for weight, etc.) */
function filterNumeric(str: string): string {
  return str.replace(/[^\d.]/g, '')
}

/** Apply all input filters based on field spec */
function applyFilter(spec: FieldSpec, str: string, lang?: 'ko' | 'en'): string {
  if (DIGITS_ONLY_KEYS.has(spec.key)) return filterDigitsOnly(str)
  if (DIGITS_SPACE_KEYS.has(spec.key)) return str.replace(/[^\d\s]/g, '')
  if (NUMERIC_KEYS.has(spec.key) || spec.type === 'number') return filterNumeric(str)
  return filterByLang(str, lang)
}

export function EditableField({
  caseId,
  spec,
  rawValue,
  inline = false,
  lang,
}: {
  caseId: string
  spec: FieldSpec
  rawValue: unknown
  inline?: boolean
  lang?: 'ko' | 'en'
}) {
  const { updateLocalCaseField } = useCases()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(stringifyRaw(rawValue, spec))
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(null)

  // Reset editing when case changes (caseId changes)
  useEffect(() => {
    setEditing(false)
    setError(null)
  }, [caseId])

  useEffect(() => {
    if (!editing) setValue(stringifyRaw(rawValue, spec))
  }, [rawValue, spec, editing])

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
  }, [editing, spec.type])

  const display = renderFieldValue(spec, rawValue)
  const isEmpty = display === '—'

  function handleEnterEdit() {
    if (spec.key === 'age') return // age is auto-calculated, not editable
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
    // Microchip validation: must be exactly 15 digits
    if (spec.key === 'microchip' && value.trim()) {
      const digits = value.trim().replace(/\D/g, '')
      if (digits.length !== 15) {
        setError('유효한 번호가 아닙니다')
        return
      }
    }

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

  /** Save without closing edit mode (used by date inputs that auto-save on change) */
  function autoSave(coerced: unknown) {
    startSave(async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, coerced)
      if (!result.ok) { setError(result.error); return }
      updateLocalCaseField(caseId, spec.storage, spec.key, coerced)
      setError(null)
      // Don't close editing — date inputs stay open until Esc or clicking elsewhere
    })
  }

  function handleBlur() {
    // Small delay: if user clicks save button, onMouseDown preventDefault
    // keeps focus, so this blur won't fire. If they click elsewhere, cancel.
    setTimeout(() => {
      if (!saving) handleCancel()
    }, 150)
  }

  // Select fields: always render as inline dropdown (no edit mode toggle)
  const isSelect = spec.type === 'select' && spec.options
  const isDate = spec.type === 'date'
  const dateTypedRef = useRef(false)
  const composingRef = useRef(false) // IME composition state
  const effectiveLang = autoDetectLang(spec, lang) // true if keyboard was used (vs picker)

  /** Parse date from text input. Accepts: YYYY-MM-DD, YYYYMMDD, YYYY.MM.DD, YYYY/MM/DD */
  function saveDateFromRef() {
    const el = inputRef.current as HTMLInputElement | null
    const raw = (el?.value ?? '').trim()

    // Empty = delete the date
    if (!raw) {
      startSave(async () => {
        const result = await updateCaseField(caseId, spec.storage, spec.key, null)
        if (!result.ok) { setError(result.error); return }
        updateLocalCaseField(caseId, spec.storage, spec.key, null)
        setError(null)
        setEditing(false)
      })
      return
    }

    // Parse: strip non-digits, then format
    const digits = raw.replace(/\D/g, '')
    let dateStr = ''
    if (digits.length === 8) {
      dateStr = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    } else if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(raw)) {
      const parts = raw.split(/[-./]/)
      dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    }

    if (!dateStr) { setError('유효한 날짜가 아닙니다'); return }

    const d = new Date(dateStr)
    const year = parseInt(dateStr.split('-')[0], 10)
    if (isNaN(d.getTime()) || year < 1900 || year > 2100) {
      setError('유효한 날짜가 아닙니다')
      return
    }

    startSave(async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, dateStr)
      if (!result.ok) { setError(result.error); return }
      updateLocalCaseField(caseId, spec.storage, spec.key, dateStr)
      setError(null)
      setEditing(false)
    })
  }

  function handleSelectChange_custom(val: string | null) {
    const coerced = val ? coerceInputValue(spec, val) : null
    startSave(async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, coerced)
      if (!result.ok) { setError(result.error); return }
      updateLocalCaseField(caseId, spec.storage, spec.key, coerced)
      setError(null)
    })
  }

  const valueCell = (
    <div className="min-w-0">
      {isSelect ? (
        // Custom dropdown: looks like plain text, click shows options
        <div className="relative"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false)
          }}
        >
          <div className="group/val relative w-fit">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer"
            >
              {display}
            </button>
            <CopyButton
              value={isEmpty ? '' : display}
              className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/val:opacity-100"
            />
          </div>
          {editing && (
            <ul className="absolute left-0 top-full mt-1 z-20 min-w-[120px] rounded-md border border-border/50 bg-background py-1 shadow-md">
              <li>
                <button
                  type="button"
                  onClick={() => { handleSelectChange_custom(null); setEditing(false) }}
                  className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors"
                >
                  —
                </button>
              </li>
              {spec.options!.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => { handleSelectChange_custom(opt.value); setEditing(false) }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm hover:bg-accent/60 transition-colors',
                      String(rawValue) === opt.value && 'font-medium',
                    )}
                  >
                    {opt.label_ko}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : isDate && editing ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="date"
          min="1900-01-01"
          max="2100-12-31"
          defaultValue={stringifyRaw(rawValue, spec)}
          autoFocus
          onChange={(e) => {
            const v = e.target.value

            // Empty value: picker's delete/clear button
            if (!v) {
              if (!dateTypedRef.current) {
                saveDateFromRef() // save null + close
              }
              dateTypedRef.current = false
              return
            }

            const year = parseInt(v.split('-')[0], 10)
            if (year < 1900 || year > 2100) { dateTypedRef.current = false; return }

            if (dateTypedRef.current) {
              // Keyboard typing → save silently, keep open
              autoSave(coerceInputValue(spec, v))
              dateTypedRef.current = false
            } else {
              // Calendar picker (no keyDown before onChange) → save + close
              saveDateFromRef()
            }
          }}
          onKeyDown={(e) => {
            dateTypedRef.current = true
            if (e.key === 'Enter') { e.preventDefault(); saveDateFromRef() }
            if (e.key === 'Escape') { e.preventDefault(); handleCancel() }
          }}
          onBlur={() => setTimeout(() => saveDateFromRef(), 150)}
          className="w-44 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
        />
      ) : editing ? (
        <div className="flex items-start gap-2">
          {renderInput(spec, value, (v, fromCompositionEnd) => {
            if (composingRef.current && !fromCompositionEnd) { setValue(v); return }
            const filtered = applyFilter(spec, v, effectiveLang)
            setValue(filtered)
            if (v !== filtered) {
              const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(v)
              const hasNonDigit = /[^\d\s.]/.test(v)
              const msg =
                (DIGITS_ONLY_KEYS.has(spec.key) || DIGITS_SPACE_KEYS.has(spec.key)) && hasNonDigit
                  ? '숫자만 입력 가능합니다'
                : (NUMERIC_KEYS.has(spec.key) || spec.type === 'number') && hasNonDigit
                  ? '숫자만 입력 가능합니다'
                : effectiveLang === 'en' && hasKorean
                  ? '영문만 입력 가능합니다'
                : ''
              if (msg) {
                setError(msg)
                setTimeout(() => setError(null), 2000)
              }
            }
          }, inputRef, handleKeyDown, handleBlur, effectiveLang, autoSave, composingRef)}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-7 items-center justify-center rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {saving ? '...' : '저장'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleEnterEdit}
          className={cn(
            'text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors',
            'hover:bg-accent/60 cursor-text',
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
        <div className="mt-1 text-xs text-red-600">{error}</div>
      )}
    </div>
  )

  if (inline) return valueCell

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="text-sm text-muted-foreground pt-1">{spec.label}</div>
      <div className="min-w-0">
        {(isDate && editing) || isSelect || editing ? (
          valueCell
        ) : (
          <div className="group/val relative w-fit">
            {valueCell}
            <CopyButton
              value={isEmpty ? '' : display}
              className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/val:opacity-100"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function stringifyRaw(raw: unknown, spec: FieldSpec): string {
  if (raw === null || raw === undefined) return ''
  if (spec.type === 'date') {
    return renderFieldValue(spec, raw).replace('—', '')
  }
  return String(raw)
}

function renderInput(
  spec: FieldSpec,
  value: string,
  setValue: (v: string, fromCompositionEnd?: boolean) => void,
  ref: React.RefObject<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >,
  onKeyDown: (e: React.KeyboardEvent) => void,
  onBlur: () => void,
  lang?: 'ko' | 'en',
  saveFn?: (coerced: unknown) => void,
  composingRef?: React.RefObject<boolean>,
) {
  const placeholder = DIGITS_ONLY_KEYS.has(spec.key) ? '숫자'
    : DIGITS_SPACE_KEYS.has(spec.key) ? '숫자'
    : NUMERIC_KEYS.has(spec.key) || spec.type === 'number' ? '숫자'
    : lang === 'en' ? '영문만 입력 가능'
    : undefined
  const commonClass =
    'flex-1 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'

  if (spec.type === 'longtext') {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        rows={3}
        className="flex-1 min-h-[4.5rem] rounded-md border border-border/50 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-y"
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
        onBlur={onBlur}
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
        min="1900-01-01"
        max="2100-12-31"
        defaultValue={value}
        onChange={(e) => {
          // Only auto-save when a complete valid date is entered
          const v = e.target.value
          if (!v) return
          const year = parseInt(v.split('-')[0], 10)
          if (year >= 1900 && year <= 2100) {
            saveFn?.(coerceInputValue(spec, v))
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onBlur()
          }
        }}
        className="w-44 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
      />
    )
  }
  if (spec.type === 'number' || NUMERIC_KEYS.has(spec.key)) {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onCompositionStart={() => { if (composingRef) composingRef.current = true }}
        onCompositionEnd={(e) => {
          if (composingRef) composingRef.current = false
          setValue((e.target as HTMLInputElement).value, true)
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
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
      onCompositionStart={() => { if (composingRef) composingRef.current = true }}
      onCompositionEnd={(e) => {
        if (composingRef) composingRef.current = false
        setValue((e.target as HTMLInputElement).value, true)
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      className={commonClass}
    />
  )
}
