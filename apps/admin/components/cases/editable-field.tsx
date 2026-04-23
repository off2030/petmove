'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { FieldSpec } from '@/lib/fields'
import { coerceInputValue, renderFieldValue } from '@/lib/fields'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from '@/components/cases/copy-button'
import { useCases } from '@/components/cases/cases-context'
import { severityTextClass, tooltipText, useFieldVerification } from '@/components/cases/verification-context'
import { DateTextField } from '@/components/ui/date-text-field'

/** Filter input by language */
function filterByLang(str: string, lang?: 'ko' | 'en'): string {
  if (lang === 'ko') return str.replace(/[a-zA-Z]/g, '')
  if (lang === 'en') return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
  // mixed (undefined): allow both, but auto-capitalize English words
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Editorial value styling — derive from field spec */
const MONO_VALUE_KEYS = new Set(['phone', 'microchip', 'weight', 'payment_amount', 'rabies_titer', 'rabies_titer_value'])
const ITALIC_VALUE_KEYS = new Set(['sex', 'address_overseas'])

function getValueClass(spec: FieldSpec): string {
  if (spec.type === 'date' || MONO_VALUE_KEYS.has(spec.key)) {
    return 'font-mono text-[15px] tracking-[0.3px] text-foreground'
  }
  if (ITALIC_VALUE_KEYS.has(spec.key)) {
    return 'font-serif italic text-[17px] text-muted-foreground'
  }
  return 'font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground'
}

/** Auto-determine language filter from field spec */
const DIGITS_ONLY_KEYS = new Set(['phone', 'payment_amount'])
const DIGITS_SPACE_KEYS = new Set(['microchip'])
const NUMERIC_KEYS = new Set(['rabies_titer', 'rabies_titer_value'])

function autoDetectLang(spec: FieldSpec, explicit?: 'ko' | 'en'): 'ko' | 'en' | undefined {
  if (explicit) return explicit
  if (spec.type !== 'text') return undefined
  if (spec.key.endsWith('_en')) return 'en'
  if (spec.key === 'address_overseas') return 'en'
  if (spec.key === 'email') return undefined // no auto-capitalize
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
const EMAIL_KEYS = new Set(['email'])

const MAX_DIGITS: Record<string, number> = { phone: 11 }

function applyFilter(spec: FieldSpec, str: string, lang?: 'ko' | 'en'): string {
  if (DIGITS_ONLY_KEYS.has(spec.key)) {
    const digits = filterDigitsOnly(str)
    return MAX_DIGITS[spec.key] ? digits.slice(0, MAX_DIGITS[spec.key]) : digits
  }
  if (DIGITS_SPACE_KEYS.has(spec.key)) {
    const digits = str.replace(/\D/g, '').slice(0, 15)
    // Format as spaced: 000 000 000 000 000
    return digits.replace(/(\d{3})(?=\d)/g, '$1 ')
  }
  if (NUMERIC_KEYS.has(spec.key) || spec.type === 'number') return filterNumeric(str)
  if (EMAIL_KEYS.has(spec.key)) return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').toLowerCase()
  return filterByLang(str, lang)
}

export function EditableField({
  caseId,
  spec,
  rawValue,
  inline = false,
  lang,
  clearable = false,
}: {
  caseId: string
  spec: FieldSpec
  rawValue: unknown
  inline?: boolean
  lang?: 'ko' | 'en'
  clearable?: boolean
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

  function handleClear() {
    startSave(async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, null)
      if (!result.ok) { setError(result.error); return }
      updateLocalCaseField(caseId, spec.storage, spec.key, null)
      setError(null)
      setEditing(false)
    })
  }

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
  const composingRef = useRef(false) // IME composition state
  const effectiveLang = autoDetectLang(spec, lang) // true if keyboard was used (vs picker)

  function saveDateValue(v: string) {
    const value = v.trim() || null
    startSave(async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, value)
      if (!result.ok) { setError(result.error); return }
      updateLocalCaseField(caseId, spec.storage, spec.key, value)
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
          <div className="relative w-fit">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className={cn(
                'text-left rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/60 cursor-pointer',
                spec.key === 'status'
                  ? 'font-serif italic text-[16px] text-primary'
                  : getValueClass(spec),
                isEmpty && 'font-sans not-italic text-base font-normal tracking-normal text-muted-foreground/60',
              )}
            >
              {display}
            </button>
          </div>
          {editing && (
            <ul className="absolute left-0 top-full mt-1 z-20 min-w-[120px] rounded-md border border-border/50 bg-background py-1 shadow-md">
              <li>
                <button
                  type="button"
                  onClick={() => { handleSelectChange_custom(null); setEditing(false) }}
                  className="w-full text-left px-sm py-1.5 font-serif text-[15px] text-muted-foreground hover:bg-accent/60 transition-colors"
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
                      'w-full text-left px-sm py-1.5 font-serif text-[15px] tracking-[-0.1px] text-foreground hover:bg-accent/60 transition-colors',
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
        <DateTextField
          autoFocus
          value={stringifyRaw(rawValue, spec)}
          onChange={saveDateValue}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); handleCancel() }
          }}
          className="w-44 bg-transparent border-0 border-b border-primary text-base py-1 focus:outline-none"
        />
      ) : editing ? (
        <div className="flex items-start gap-sm">
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
                : EMAIL_KEYS.has(spec.key) && hasKorean
                  ? '영문만 입력 가능합니다'
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
        <VerifiedDisplayButton
          spec={spec}
          path={spec.key}
          display={display}
          isEmpty={isEmpty}
          isLongText={spec.type === 'longtext'}
          onClick={handleEnterEdit}
        />
      )}
      {error && (
        <div className="mt-1 text-xs text-red-600">{error}</div>
      )}
    </div>
  )

  if (inline) return valueCell

  const clearButton = clearable && !isEmpty && !editing ? (
    <button
      type="button"
      onClick={handleClear}
      className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/row:opacity-100"
    >
      ✕
    </button>
  ) : null

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0", clearable && "group/row")}>
      <div className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1">{spec.label}</div>
      <div className="min-w-0 flex items-baseline gap-sm">
        {(() => {
          const noCopy = spec.type === 'longtext' || spec.key === 'select' || spec.key === 'status'
          if ((isDate && editing) || (isSelect && editing) || editing) return valueCell
          // longtext 만 inline clearButton — 긴 텍스트 wrap 때문에 외부 절대배치가 어색함.
          // status 등 select 는 noCopy 라도 외부 clearButton 만 사용(아래 411) → 중복 방지.
          if (spec.type === 'longtext') return <>{valueCell}{clearButton}</>
          if (noCopy) return valueCell
          // CopyButton 을 flex 흐름에 두어 뒤따르는 ✕ 와 겹치지 않게 한다
          // (과거: absolute left-full → ✕ 와 같은 위치 점유).
          return (
            <div className="group/val flex items-baseline gap-xs w-fit">
              {valueCell}
              <CopyButton
                value={isEmpty ? '' : display}
                className="shrink-0 opacity-0 group-hover/val:opacity-100"
              />
            </div>
          )
        })()}
        {!(spec.type === 'longtext') && !editing && clearButton}
      </div>
    </div>
  )
}

function VerifiedDisplayButton({ spec, path, display, isEmpty, isLongText, onClick }: {
  spec: FieldSpec
  path: string
  display: string
  isEmpty: boolean
  isLongText: boolean
  onClick: () => void
}) {
  const info = useFieldVerification(path)
  const colorCls = info ? severityTextClass(info.severity) : ''
  const title = info ? tooltipText(info) : '클릭하여 편집'
  const valueCls = getValueClass(spec)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-md px-2 py-1 -mx-2 transition-colors',
        'hover:bg-accent/60 cursor-text',
        valueCls,
        isEmpty && 'font-sans text-base font-normal tracking-normal not-italic text-muted-foreground/60',
        colorCls,
      )}
      title={title}
    >
      {isLongText ? <span className="whitespace-pre-wrap">{display}</span> : display}
    </button>
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
    'flex-1 h-8 rounded-md border border-border/50 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'

  if (spec.type === 'longtext') {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        rows={3}
        className="flex-1 min-h-[4.5rem] rounded-md border border-border/50 bg-background p-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-y"
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
  // NOTE: spec.type === 'date' is handled by the dedicated `isDate && editing`
  // branch in the caller via <DateTextField/>, so it never reaches renderInput.
  if (spec.key === 'phone') {
    return (
      <PhoneInput
        inputRef={ref as React.RefObject<HTMLInputElement>}
        initial={value}
        onChange={setValue}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={commonClass}
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

/**
 * Phone input: uncontrolled to avoid IME conflicts.
 * Formats display as 010-1234-5678, stores digits only, max 11.
 */
function PhoneInput({ inputRef, initial, onChange, onKeyDown, onBlur, className }: {
  inputRef: React.RefObject<HTMLInputElement | null>
  initial: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onBlur: () => void
  className: string
}) {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef || localRef
  const composing = useRef(false)

  function formatPhone(digits: string) {
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  function sync() {
    const el = ref.current
    if (!el) return
    const digits = el.value.replace(/\D/g, '').slice(0, 11)
    const hadNonDigit = /[^\d\s-]/.test(el.value)
    el.value = formatPhone(digits)
    onChange(digits)
    return hadNonDigit
  }

  useEffect(() => {
    if (ref.current) ref.current.value = formatPhone(initial)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      ref={ref}
      type="tel"
      inputMode="numeric"
      defaultValue={formatPhone(initial)}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={() => {
        composing.current = false
        sync()
      }}
      onChange={() => {
        if (composing.current) return
        sync()
      }}
      onKeyDown={onKeyDown}
      onBlur={() => { sync(); onBlur() }}
      placeholder="010-0000-0000"
      maxLength={13}
      className={className}
    />
  )
}
