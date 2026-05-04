'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldSpec } from '@/lib/fields'
import { coerceInputValue, renderFieldValue } from '@/lib/fields'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from '@/components/cases/copy-button'
import { useCases } from '@/components/cases/cases-context'
import { useDetailViewSettings } from '@/components/providers/detail-view-settings-provider'
import { severityTextClass, tooltipText, useFieldVerification } from '@/components/cases/verification-context'
import { DateTextField } from '@/components/ui/date-text-field'
import { SectionLabel } from '@/components/ui/section-label'
import { useSectionEditMode } from '@/components/cases/section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

/** Filter input by language */
function filterByLang(str: string, lang?: 'ko' | 'en'): string {
  if (lang === 'ko') return str.replace(/[a-zA-Z]/g, '')
  if (lang === 'en') return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
  // mixed (undefined): allow both, but auto-capitalize English words
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Editorial value styling — derive from field spec */
const MONO_VALUE_KEYS = new Set(['phone', 'microchip', 'weight', 'payment_amount', 'rabies_titer', 'rabies_titer_value'])
const ITALIC_VALUE_KEYS = new Set(['address_overseas'])

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
  compact = false,
}: {
  caseId: string
  spec: FieldSpec
  rawValue: unknown
  inline?: boolean
  lang?: 'ko' | 'en'
  clearable?: boolean
  /** 그룹 내부 sub-row 용 — 좁은 라벨 너비(100px), 더 작은 padding, border-bottom 없음. */
  compact?: boolean
}) {
  const { updateLocalCaseField, replaceLocalCaseData, activeDestination } = useCases()
  const { settings: detailViewSettings } = useDetailViewSettings()
  const confirm = useConfirm()
  const editMode = useSectionEditMode()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(stringifyRaw(rawValue, spec))
  const [saving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(null)
  const selectWrapRef = useRef<HTMLDivElement>(null)

  // Reset editing when case changes (caseId changes)
  useEffect(() => {
    setEditing(false)
    setError(null)
  }, [caseId])

  // Select 드롭다운: 외부 클릭으로 닫기.
  useEffect(() => {
    if (!editing || spec.type !== 'select') return
    function onClick(e: MouseEvent) {
      if (selectWrapRef.current && !selectWrapRef.current.contains(e.target as Node)) {
        setEditing(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [editing, spec.type])

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

  // 상세뷰 설정: 종/성별 select 를 "한글 | 영문" 으로 병기.
  const bilingualSelect = (() => {
    if (spec.type !== 'select' || !spec.options || rawValue == null || rawValue === '') return null
    const enabled =
      (spec.key === 'species' && detailViewSettings.species_bilingual) ||
      (spec.key === 'sex' && detailViewSettings.sex_bilingual)
    if (!enabled) return null
    const opt = spec.options.find((o) => o.value === rawValue)
    if (!opt || !opt.label_en) return null
    return { ko: opt.label_ko, en: opt.label_en }
  })()
  const displayNode: React.ReactNode = bilingualSelect ? (
    <>
      <span className="text-muted-foreground">{bilingualSelect.ko}</span>
      <span className="text-muted-foreground/30 mx-1.5 select-none">|</span>
      <span className="italic text-foreground">{bilingualSelect.en}</span>
    </>
  ) : isEmpty ? (
    // 빈 값일 때: '—' 대신 투명 placeholder — 클릭 영역은 유지하면서 시각적 잡음 제거.
    // 좌측 라벨 클릭으로도 편집 진입 가능 (SectionLabel onClick).
    <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>
  ) : (
    display
  )
  const copyDisplay = bilingualSelect ? `${bilingualSelect.ko} | ${bilingualSelect.en}` : display

  async function handleClear() {
    const ok = await confirm({
      message: `${spec.label} 정보를 삭제하시겠습니까?`,
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const prevValue = rawValue
    updateLocalCaseField(caseId, spec.storage, spec.key, null)
    setError(null)
    setEditing(false)
    void (async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, null)
      if (!result.ok) {
        updateLocalCaseField(caseId, spec.storage, spec.key, prevValue)
        setError(result.error)
      }
    })()
  }

  function handleEnterEdit() {
    if (!editMode) return
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
    const prev = rawValue
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    updateLocalCaseField(caseId, spec.storage, spec.key, coerced)
    setError(null)
    setEditing(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    void (async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, coerced)
      if (!result.ok) {
        updateLocalCaseField(caseId, spec.storage, spec.key, prev)
        setError(result.error)
      }
    })()
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
    const prev = rawValue
    updateLocalCaseField(caseId, spec.storage, spec.key, coerced)
    setError(null)
    void (async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, coerced)
      if (!result.ok) {
        updateLocalCaseField(caseId, spec.storage, spec.key, prev)
        setError(result.error)
      }
    })()
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
  const isPhone = spec.key === 'phone'
  const composingRef = useRef(false) // IME composition state
  const effectiveLang = autoDetectLang(spec, lang) // true if keyboard was used (vs picker)

  function saveDateValue(v: string) {
    const value = v.trim() || null
    const prev = rawValue
    updateLocalCaseField(caseId, spec.storage, spec.key, value)
    setError(null)
    setEditing(false)
    void (async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, value)
      if (!result.ok) {
        updateLocalCaseField(caseId, spec.storage, spec.key, prev)
        setError(result.error)
        return
      }
      // 자동 채움 결과 반영 — 엔진이 다른 필드들을 채웠으면 data 통째 교체 + 컬럼도 갱신.
      if (result.autoFilled) {
        replaceLocalCaseData(caseId, result.autoFilled.data)
        for (const [k, v] of Object.entries(result.autoFilled.columns ?? {})) {
          updateLocalCaseField(caseId, 'column', k, v)
        }
      }

      // 출국일/내원일 입력 시 활성 목적지를 캡처해 서류/신고 탭의 active_dest에 영속 저장.
      // 사용자가 칩 클릭으로 바꾼 활성이 있고 비어있지 않은 새 값일 때만.
      // 항상 동기화 — 신고국이면 자동 포함, 비-신고국이면 자동 포함 안 됨 (filter에서 판정).
      const isDeparture = spec.key === 'departure_date'
      const isVetVisit = spec.key === 'vet_visit_date'
      if ((isDeparture || isVetVisit) && value && activeDestination) {
        updateLocalCaseField(caseId, 'data', 'export_doc_active_dest', activeDestination)
        await updateCaseField(caseId, 'data', 'export_doc_active_dest', activeDestination)
        if (isDeparture) {
          // 항상 active로 sync — 신고국 여부는 isAutoImportReport에서 판정.
          // 비-신고국으로 sync되면 stale 신고 자동 포함이 사라짐.
          updateLocalCaseField(caseId, 'data', 'import_report_active_dest', activeDestination)
          await updateCaseField(caseId, 'data', 'import_report_active_dest', activeDestination)
        }
      }
    })()
  }

  function handleSelectChange_custom(val: string | null) {
    const coerced = val ? coerceInputValue(spec, val) : null
    const prev = rawValue
    updateLocalCaseField(caseId, spec.storage, spec.key, coerced)
    setError(null)
    void (async () => {
      const result = await updateCaseField(caseId, spec.storage, spec.key, coerced)
      if (!result.ok) {
        updateLocalCaseField(caseId, spec.storage, spec.key, prev)
        setError(result.error)
      }
    })()
  }

  const valueCell = (
    <div className="min-w-0">
      {isSelect ? (
        // Custom dropdown: looks like plain text, click shows options
        <div className="relative" ref={selectWrapRef}>
          <div className="relative w-fit">
            {editMode ? (
              <button
                type="button"
                onClick={() => setEditing(!editing)}
                className={cn(
                  'text-left rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/60 cursor-pointer',
                  getValueClass(spec),
                  isEmpty && 'font-sans not-italic text-base font-normal tracking-normal text-muted-foreground/60',
                )}
              >
                {displayNode}
              </button>
            ) : (
              <span
                className={cn(
                  'inline-block rounded-md px-2 py-1 -mx-2',
                  getValueClass(spec),
                  isEmpty && 'font-sans not-italic text-base font-normal tracking-normal text-muted-foreground/60',
                )}
              >
                {displayNode}
              </span>
            )}
          </div>
          {editMode && editing && (
            <ul className="absolute left-0 top-full mt-1 z-20 w-max max-w-[400px] rounded-md border border-border/80 bg-background py-1 shadow-md">
              {spec.options!.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => { handleSelectChange_custom(opt.value); setEditing(false) }}
                    className={cn(
                      'w-full text-left px-sm py-1.5 font-serif text-[15px] tracking-[-0.1px] text-foreground hover:bg-accent/60 transition-colors whitespace-nowrap',
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
        <div className="flex items-start gap-sm">
          <DateTextField
            autoFocus
            value={stringifyRaw(rawValue, spec)}
            onChange={saveDateValue}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); handleCancel() }
            }}
            className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
          />
        </div>
      ) : isPhone && editing ? (
        <div className="flex items-start gap-sm">
          <PhoneInput
            inputRef={inputRef as React.RefObject<HTMLInputElement>}
            initial={value}
            onChange={setValue}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="flex-1 h-8 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            disabled={saving}
            className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 transition-colors disabled:opacity-50"
          >
            {saving ? '...' : '저장'}
          </button>
        </div>
      ) : editing ? (
        // 박스폼 — 모든 편집은 동일한 박스 + 저장 버튼 패턴으로 통일.
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
            className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 transition-colors disabled:opacity-50"
          >
            {saving ? '...' : '저장'}
          </button>
        </div>
      ) : (
        <span className="inline-flex items-baseline">
          <VerifiedDisplayButton
            spec={spec}
            path={spec.key}
            display={displayNode}
            isEmpty={isEmpty}
            isLongText={spec.type === 'longtext'}
            onClick={handleEnterEdit}
          />
          {savedFlash && (
            <span
              className="ml-2 text-pmw-positive text-sm select-none"
              aria-label="저장됨"
            >
              ✓
            </span>
          )}
        </span>
      )}
      {error && (
        <div className="mt-1 text-xs text-destructive">{error}</div>
      )}
    </div>
  )

  if (inline) return valueCell

  const clearButton = clearable && !isEmpty && !editing && editMode ? (
    <button
      type="button"
      onClick={handleClear}
      title="삭제"
      className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/row:opacity-70 hover:!opacity-100"
    >
      <Trash2 size={13} />
    </button>
  ) : null

  // 라벨 클릭으로 편집 진입 — 빈 값일 때 좌측 라벨만 보여서 사용자가 어디를 눌러야 할지 모르는 상황을 해결.
  const labelOnClick = (() => {
    if (!editMode) return undefined
    if (spec.key === 'age') return undefined
    if (editing) return undefined
    if (isSelect) return () => setEditing(true)
    return handleEnterEdit
  })()

  return (
    <div className={cn(
      compact
        ? "grid grid-cols-1 md:grid-cols-[100px_1fr] items-baseline gap-md py-1"
        : "grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0",
      clearable && "group/row",
    )}>
      <SectionLabel className={compact ? undefined : "pt-1"} onClick={labelOnClick}>{spec.label}</SectionLabel>
      <div className="min-w-0 flex items-baseline gap-sm">
        {(() => {
          // 절차정보 그룹은 CopyButton 표시 안 함 (사용자 요청).
          const noCopy = spec.type === 'longtext' || spec.key === 'select' || spec.group === '절차정보'
          if ((isDate && editing) || (isSelect && editing) || editing) return valueCell
          // longtext 만 inline clearButton — 긴 텍스트 wrap 때문에 외부 절대배치가 어색함.
          if (spec.type === 'longtext') return <>{valueCell}{clearButton}</>
          if (noCopy) return valueCell
          // CopyButton 을 flex 흐름에 두어 뒤따르는 ✕ 와 겹치지 않게 한다
          // (과거: absolute left-full → ✕ 와 같은 위치 점유).
          return (
            <div className="group/val flex items-baseline gap-xs w-fit">
              {valueCell}
              <CopyButton
                value={isEmpty ? '' : copyDisplay}
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
  display: React.ReactNode
  isEmpty: boolean
  isLongText: boolean
  onClick: () => void
}) {
  const editMode = useSectionEditMode()
  const info = useFieldVerification(path)
  const colorCls = info ? severityTextClass(info.severity) : ''
  const title = info ? tooltipText(info) : (editMode ? '클릭하여 편집' : undefined)
  const valueCls = getValueClass(spec)
  if (!editMode) {
    if (isEmpty) return null
    return (
      <span
        className={cn(
          'inline-block rounded-md px-2 py-1 -mx-2',
          valueCls,
          colorCls,
        )}
        title={title}
      >
        {isLongText ? <span className="whitespace-pre-wrap">{display}</span> : display}
      </span>
    )
  }
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
  inline = false,
) {
  const placeholder = DIGITS_ONLY_KEYS.has(spec.key) ? '숫자'
    : DIGITS_SPACE_KEYS.has(spec.key) ? '숫자'
    : NUMERIC_KEYS.has(spec.key) || spec.type === 'number' ? '숫자'
    : lang === 'en' ? '영문만 입력 가능'
    : undefined
  const commonClass = inline
    ? cn(
        getValueClass(spec),
        'bg-transparent border-0 outline-none rounded-md',
        'px-2 py-1 -mx-2 w-full min-w-0',
        'focus:bg-accent/40',
      )
    : 'flex-1 h-8 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'

  if (spec.type === 'longtext') {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        rows={3}
        className={inline
          ? cn(
              getValueClass(spec),
              'bg-transparent border-0 outline-none rounded-md',
              'p-2 -mx-2 w-full min-h-[4.5rem] resize-y',
              'focus:bg-accent/40',
            )
          : 'flex-1 min-h-[4.5rem] rounded-md border border-border/80 bg-background p-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-y'}
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
  // 모바일 키보드 분기 — 이메일은 영문/@ 키보드, microchip 은 숫자 키패드.
  const isEmail = EMAIL_KEYS.has(spec.key)
  const isDigitsSpace = DIGITS_SPACE_KEYS.has(spec.key)
  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type={isEmail ? 'email' : 'text'}
      inputMode={isEmail ? 'email' : isDigitsSpace ? 'numeric' : undefined}
      autoCapitalize={isEmail ? 'off' : undefined}
      autoCorrect={isEmail ? 'off' : undefined}
      spellCheck={isEmail ? false : undefined}
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
      placeholder="010-1234-5678"
      maxLength={13}
      className={className}
    />
  )
}
