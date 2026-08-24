'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldSpec } from '@petmove/domain'
import { calculateAge, coerceInputValue, renderFieldValue, isDestinationScopedKey, resolveActiveDestination, formatKoreanPhone, looksLikeKoreanPhoneInput, phoneDigits, KOREAN_PHONE_MAX_DIGITS } from '@petmove/domain'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { CopyButton } from '@/components/cases/copy-button'
import { useCases } from '@/components/cases/cases-context'
import { useDetailViewSettings } from '@/components/providers/detail-view-settings-provider'
import { severityTextClass, tooltipText, useFieldVerification } from '@/components/cases/verification-context'
import { DateTextField } from '@petmove/ui'
import { SectionLabel } from '@/components/ui/section-label'
import { useSectionEditMode } from '@/components/cases/section-edit-mode-context'
import { useConfirm } from '@petmove/ui'

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
  if (spec.type === 'date' || spec.type === 'time' || MONO_VALUE_KEYS.has(spec.key)) {
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
  const { cases, updateLocalCaseField, replaceLocalCaseData, activeDestination } = useCases()
  // scoped 키 → data.by_dest[destination][key] 경로 (B: 단일도 by_dest 통일).
  // 단일 여행지면 resolveActiveDestination 이 유일 토큰을 돌려줘 그 칸으로 저장된다.
  // destArg 가 set 이면 server action·local mutator 둘 다 5번째 인자로 전달.
  const currentCase = cases.find((c) => c.id === caseId)
  const activeDest = resolveActiveDestination(currentCase?.destination, activeDestination)
  const useByDest = !!activeDest && isDestinationScopedKey(spec.key)
  const destArg: string | null | undefined = useByDest ? activeDest : undefined
  const { settings: detailViewSettings } = useDetailViewSettings()
  const confirm = useConfirm()
  const editMode = useSectionEditMode()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(stringifyRaw(rawValue, spec))
  const [saving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  // 종(species) 필드는 개/고양이 프리셋 외 값도 관리자가 직접 입력할 수 있어야 함(펫무브워크 한정).
  const allowCustomEntry = spec.key === 'species'
  const [customEntry, setCustomEntry] = useState(false)

  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(null)
  const selectWrapRef = useRef<HTMLDivElement>(null)
  const selectPopupRef = useRef<HTMLUListElement>(null)
  type SelectPopupPos =
    | { left: number; top: number; minWidth: number; maxHeight: number }
    | { left: number; bottom: number; minWidth: number; maxHeight: number }
  const [selectPopupPos, setSelectPopupPos] = useState<SelectPopupPos | null>(null)

  // Reset editing when case changes (caseId changes)
  useEffect(() => {
    setEditing(false)
    setCustomEntry(false)
    setError(null)
  }, [caseId])

  // Select 드롭다운: 외부 클릭으로 닫기.
  // 팝업은 portal 로 띄우므로 selectWrapRef(트리거) 또는 selectPopupRef 안쪽 클릭이면 닫지 않는다.
  useEffect(() => {
    if (!editing || spec.type !== 'select' || customEntry) return
    function onClick(e: MouseEvent) {
      const t = e.target as Node
      if (selectWrapRef.current?.contains(t)) return
      if (selectPopupRef.current?.contains(t)) return
      setEditing(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [editing, spec.type, customEntry])

  // Select 드롭다운 위치 측정 — fixed 로 띄워 부모 overflow:auto 클리핑 우회.
  // 아래 공간이 위보다 넓으면 아래로 (디폴트), 아니면 위로 펼침.
  useEffect(() => {
    if (!editing || spec.type !== 'select' || customEntry) return
    function measure() {
      const trigger = selectWrapRef.current?.querySelector('button')
      const rect = trigger?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(8, rect.left)
      const gap = 4
      const above = rect.top - 8 - gap
      const below = window.innerHeight - rect.bottom - 8 - gap
      if (below >= above) {
        setSelectPopupPos({ left, top: rect.bottom + gap, minWidth: rect.width, maxHeight: Math.max(120, below) })
      } else {
        setSelectPopupPos({ left, bottom: window.innerHeight - rect.top + gap, minWidth: rect.width, maxHeight: Math.max(120, above) })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [editing, spec.type, customEntry])

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
    <span className="inline-block min-w-[2.5rem] select-none text-muted-foreground/40" aria-hidden>—</span>
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
    // Optimistic — UI 즉시 반영. 실패 시 값 보존 + '다시 시도' 토스트(persistField).
    updateLocalCaseField(caseId, spec.storage, spec.key, null, destArg)
    setError(null)
    setEditing(false)
    void persistField(spec.label, () =>
      updateCaseField(caseId, spec.storage, spec.key, null, destArg),
    )
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
    setCustomEntry(false)
    setValue(stringifyRaw(rawValue, spec))
    setError(null)
  }

  function handleEnterCustomEntry() {
    const isKnownOption = spec.options?.some((o) => o.value === rawValue)
    setValue(isKnownOption || rawValue == null ? '' : String(rawValue))
    setError(null)
    setCustomEntry(true)
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
    // 전화번호 — 010 + 8자리 강제 (펫무브 portal 과 동일). 빈 값은 OK.
    if (spec.key === 'phone' && value.trim()) {
      const digits = value.trim().replace(/\D/g, '')
      if (!/^010\d{8}$/.test(digits)) {
        setError('010-XXXX-XXXX 형식으로 입력해 주세요')
        return
      }
    }
    // 이메일 — 단순 형식(sub@domain.tld). 빈 값은 OK.
    if (spec.key === 'email' && value.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        setError('이메일 형식이 올바르지 않습니다')
        return
      }
    }

    const coerced = coerceInputValue(spec, value)
    // Optimistic — UI 즉시 반영. 실패 시 값 보존 + '다시 시도' 토스트(persistField).
    updateLocalCaseField(caseId, spec.storage, spec.key, coerced, destArg)
    setError(null)
    setEditing(false)
    setCustomEntry(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    void persistField(spec.label, () =>
      updateCaseField(caseId, spec.storage, spec.key, coerced, destArg),
    )
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
    updateLocalCaseField(caseId, spec.storage, spec.key, coerced, destArg)
    setError(null)
    void persistField(spec.label, () =>
      updateCaseField(caseId, spec.storage, spec.key, coerced, destArg),
    )
  }

  function handleBlur() {
    // Small delay: if user clicks save button, onMouseDown preventDefault
    // keeps focus, so this blur won't fire. If they click elsewhere, cancel.
    setTimeout(() => {
      if (!saving) handleCancel()
    }, 150)
  }

  // Select fields: always render as inline dropdown (no edit mode toggle)
  // customEntry 이면 드롭다운 대신 일반 텍스트 입력으로 전환(species 직접 입력).
  const isSelect = spec.type === 'select' && spec.options && !customEntry
  const inputSpec = customEntry ? { ...spec, type: 'text' as const, options: undefined } : spec
  const isDate = spec.type === 'date'
  const isPhone = spec.key === 'phone'
  const composingRef = useRef(false) // IME composition state
  const effectiveLang = autoDetectLang(spec, lang) // true if keyboard was used (vs picker)

  function saveDateValue(v: string) {
    const value = v.trim() || null
    updateLocalCaseField(caseId, spec.storage, spec.key, value, destArg)
    setError(null)
    setEditing(false)
    void (async () => {
      const result = await persistField(spec.label, () =>
        updateCaseField(caseId, spec.storage, spec.key, value, destArg),
      )
      if (!result || !result.ok) return
      // 자동 채움 결과 반영 — 엔진이 다른 필드들을 채웠으면 data 통째 교체 + 컬럼도 갱신.
      // (by_dest 경로에선 server action 이 auto-fill skip — autoFilled 없음.)
      if (result.autoFilled) {
        replaceLocalCaseData(caseId, result.autoFilled.data)
        for (const [k, v] of Object.entries(result.autoFilled.columns ?? {})) {
          updateLocalCaseField(caseId, 'column', k, v)
        }
      }

      // 출국일/내원일 입력 시 활성 여행지를 캡처해 서류/신고 탭의 active_dest에 영속 저장.
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

  function handleFilteredInputChange(v: string, fromCompositionEnd?: boolean) {
    if (composingRef.current && !fromCompositionEnd) { setValue(v); return }
    const filtered = applyFilter(spec, v, effectiveLang)
    setValue(filtered)
    if (v !== filtered) {
      const hasKorean = /[\u3131-\u318e\uac00-\ud7a3]/.test(v)
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
  }

  function handleSelectChange_custom(val: string | null) {
    const coerced = val ? coerceInputValue(spec, val) : null
    updateLocalCaseField(caseId, spec.storage, spec.key, coerced, destArg)
    setError(null)
    void persistField(spec.label, () =>
      updateCaseField(caseId, spec.storage, spec.key, coerced, destArg),
    )
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
                  'text-left rounded-md px-2 py-1 -mx-2 transition-colors cursor-pointer',
                  'hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border',
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
          {editMode && editing && selectPopupPos && typeof document !== 'undefined' && createPortal(
            <ul
              ref={selectPopupRef}
              style={{
                position: 'fixed',
                left: selectPopupPos.left,
                top: 'top' in selectPopupPos ? selectPopupPos.top : undefined,
                bottom: 'bottom' in selectPopupPos ? selectPopupPos.bottom : undefined,
                minWidth: selectPopupPos.minWidth,
                maxHeight: selectPopupPos.maxHeight,
              }}
              className="z-50 w-max max-w-[400px] overflow-y-auto rounded-md border border-border/80 bg-background py-1 shadow-md scrollbar-minimal"
            >
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
              {allowCustomEntry && (
                <li>
                  <button
                    type="button"
                    onClick={handleEnterCustomEntry}
                    className="w-full text-left px-sm py-1.5 font-serif text-[15px] tracking-[-0.1px] text-muted-foreground hover:bg-accent/60 transition-colors whitespace-nowrap border-t border-border/40"
                  >
                    직접 입력
                  </button>
                </li>
              )}
            </ul>,
            document.body,
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
            className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none"
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
            className="flex-1 h-8 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none"
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
          {/* eslint-disable-next-line react-hooks/refs -- handler reads composition ref only during input events. */}
          {renderInput(inputSpec, value, handleFilteredInputChange, inputRef, handleKeyDown, handleBlur, effectiveLang, autoSave, composingRef)}
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

  return (
    <div data-field={spec.key} className={cn(
      compact
        ? "grid grid-cols-1 md:grid-cols-[100px_1fr] items-baseline gap-md py-1"
        : "grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors last:border-0",
      clearable && "group/row",
    )}>
      <SectionLabel className={compact ? undefined : "pt-1"}>{spec.label}</SectionLabel>
      {/* flex-wrap md:flex-nowrap — phone row 의 인라인 email chip 이 모바일에서 다음 줄로 떨어지게.
          데스크톱은 한 줄 유지 (address-field 의 우편번호 chip 과 동일 패턴). */}
      <div className="min-w-0 flex flex-wrap md:flex-nowrap items-baseline gap-sm">
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
        {spec.key === 'birth_date' && !editing && !isEmpty && (() => {
          const age = typeof rawValue === 'string' ? calculateAge(rawValue) : ''
          if (!age) return null
          return (
            <>
              <span className="text-muted-foreground/30 select-none mx-2 hidden md:inline">|</span>
              <div className="group/age relative inline-flex items-baseline shrink-0">
                <span className="font-sans text-[10px] uppercase tracking-[1px] text-muted-foreground mr-1">연령</span>
                <span className="font-mono text-[12px] tracking-[0.5px] text-foreground">{age}</span>
                <CopyButton value={age} className="ml-1 opacity-0 group-hover/age:opacity-100" />
              </div>
            </>
          )
        })()}
        {spec.key === 'phone' && !editing && <EmailChip caseId={caseId} />}
      </div>
    </div>
  )
}

/**
 * Phone 행 우측의 인라인 이메일 chip — 클릭 시 인라인 편집.
 * 값이 비어있고 editMode 이면 "+ 이메일 추가" 버튼 노출. 저장은 data.email 에.
 */
function EmailChip({ caseId }: { caseId: string }) {
  const { cases, updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const row = cases.find((c) => c.id === caseId)
  const emailRaw = (row?.data as Record<string, unknown> | undefined)?.email
  const emailStr = typeof emailRaw === 'string' ? emailRaw.trim() : ''
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(emailStr)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setValue(emailStr)
  }, [emailStr, editing])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function handleChange(v: string) {
    const filtered = v.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').toLowerCase()
    setValue(filtered)
    if (v !== filtered) {
      setError('영문만 입력 가능합니다')
      setTimeout(() => setError(null), 2000)
    }
  }

  function save() {
    const trimmed = value.trim()
    const next = trimmed || null
    updateLocalCaseField(caseId, 'data', 'email', next)
    setEditing(false)
    setError(null)
    void persistField('이메일', () => updateCaseField(caseId, 'data', 'email', next))
  }

  function cancel() {
    setEditing(false)
    setValue(emailStr)
    setError(null)
  }

  if (!editMode && !emailStr) return null

  if (editing) {
    return (
      <>
        <span className="text-muted-foreground/30 select-none mx-2 hidden md:inline">|</span>
        <div className="inline-flex items-baseline gap-1 min-w-0 basis-full md:basis-auto">
          <span className="font-sans text-[10px] uppercase tracking-[1px] text-muted-foreground mr-1 shrink-0">이메일</span>
          <input
            ref={inputRef}
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              else if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
            onBlur={() => { setTimeout(() => cancel(), 150) }}
            placeholder="name@example.com"
            className="flex-1 min-w-0 h-7 rounded-md border border-border/80 bg-background px-2 font-mono text-[12px] tracking-[0.5px] focus-visible:outline-none"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={save}
            className="shrink-0 whitespace-nowrap inline-flex h-6 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 transition-colors"
          >
            저장
          </button>
        </div>
        {error && <div className="basis-full mt-1 text-xs text-destructive">{error}</div>}
      </>
    )
  }

  if (!emailStr) {
    return (
      <>
        <span className="text-muted-foreground/30 select-none mx-2 hidden md:inline">|</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-baseline shrink-0 rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-accent/60 transition-colors"
          title="클릭하여 입력"
        >
          <span className="font-sans text-[10px] uppercase tracking-[1px] text-muted-foreground/70">이메일</span>
        </button>
      </>
    )
  }

  return (
    <>
      <span className="text-muted-foreground/30 select-none mx-2 hidden md:inline">|</span>
      <div className="group/email relative inline-flex items-baseline shrink-0 min-w-0 basis-full md:basis-auto">
        {editMode ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-baseline min-w-0 rounded-md px-1 py-0.5 -mx-1 hover:bg-accent/60 transition-colors"
            title="클릭하여 편집"
          >
            <span className="font-sans text-[10px] uppercase tracking-[1px] text-muted-foreground mr-1 shrink-0">이메일</span>
            <span className="font-mono text-[12px] tracking-[0.5px] text-foreground truncate">{emailStr}</span>
          </button>
        ) : (
          <>
            <span className="font-sans text-[10px] uppercase tracking-[1px] text-muted-foreground mr-1 shrink-0">이메일</span>
            <span className="font-mono text-[12px] tracking-[0.5px] text-foreground truncate">{emailStr}</span>
          </>
        )}
        <CopyButton value={emailStr} className="ml-1 opacity-0 group-hover/email:opacity-100 shrink-0" />
      </div>
    </>
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
        // 하이브리드 어포던스 — 평소엔 평문처럼 보이고, hover 시 편집 가능한 '셀' 테두리로 신호.
        'hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border cursor-text',
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
    : spec.key === 'species' ? '예: 토끼, 페럿, 뱀'
    : undefined
  const commonClass = inline
    ? cn(
        getValueClass(spec),
        'bg-transparent border-0 outline-none rounded-md',
        'px-2 py-1 -mx-2 w-full min-w-0',
        'focus:bg-accent/40',
      )
    : 'flex-1 h-8 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none'

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
          : 'flex-1 min-h-[4.5rem] rounded-md border border-border/80 bg-background p-2 text-base focus-visible:outline-none resize-y'}
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
  if (spec.type === 'time') {
    return (
      <TimeInput
        inputRef={ref as React.RefObject<HTMLInputElement>}
        initial={value}
        onChange={setValue}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onSave={saveFn}
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
 * 24h time input — HH:MM, browser locale 무시. 숫자만 받아 자동 포맷.
 * 0-23 시 / 0-59 분 범위 외 입력은 blur 에서 잘라냄.
 * blur 즉시 onSave 호출 — date 필드와 동일하게 Enter 없이도 저장된다.
 */
function TimeInput({ inputRef, initial, onChange, onKeyDown, onBlur, onSave, className }: {
  inputRef: React.RefObject<HTMLInputElement | null>
  initial: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onBlur: () => void
  onSave?: (coerced: unknown) => void
  className: string
}) {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef || localRef

  function formatTime(digits: string): string {
    const d = digits.slice(0, 4)
    if (d.length <= 2) return d
    return `${d.slice(0, 2)}:${d.slice(2)}`
  }

  function normalize(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    if (digits.length === 0) return ''
    const hh = Math.min(parseInt(digits.slice(0, 2) || '0', 10), 23)
    const mm = digits.length > 2
      ? Math.min(parseInt(digits.slice(2, 4), 10), 59)
      : null
    const hhStr = String(hh).padStart(2, '0')
    if (mm === null) return hhStr
    return `${hhStr}:${String(mm).padStart(2, '0')}`
  }

  function sync() {
    const el = ref.current
    if (!el) return
    const digits = el.value.replace(/\D/g, '').slice(0, 4)
    const formatted = formatTime(digits)
    el.value = formatted
    onChange(formatted)
  }

  useEffect(() => {
    if (ref.current) ref.current.value = initial
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      defaultValue={initial}
      onChange={sync}
      onKeyDown={onKeyDown}
      onBlur={() => {
        const el = ref.current
        if (el) {
          const norm = normalize(el.value)
          el.value = norm
          onChange(norm)
          if (onSave) onSave(norm === '' ? null : norm)
        }
        onBlur()
      }}
      placeholder="00:00"
      maxLength={5}
      className={className}
    />
  )
}

/**
 * Phone input: uncontrolled to avoid IME conflicts.
 *
 * **하이브리드**(2026-08-24 사용자 결정) — 한국 번호처럼 치면 지금까지처럼 자동 포맷하고
 * 숫자만 저장한다(앱·PDF·검색과 round-trip). 그 외(+81-90-…, 내선, '010-1234-5678 (남편)'
 * 같은 메모)는 **친 그대로** 보존한다. 정보 요청 링크 폼은 반대로 지정 형식만 받는다 —
 * 보호자 입력은 형식이 흔들리면 안 되고, 운영자는 예외를 적을 수 있어야 한다.
 *
 * 표기·판정은 domain/phone.ts 단일 출처. 0507 안심번호(12자리)도 여기서 지원된다 —
 * 예전엔 네 화면 모두 11자리에서 잘라 마지막 숫자가 조용히 사라졌다.
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

  function sync() {
    const el = ref.current
    if (!el) return
    // 한국 번호로 보이면 하이픈 표기로 다듬고 숫자만 저장. 그 외는 손대지 않는다 —
    // 자유 입력을 지우면 운영자가 해외번호·내선을 아예 못 적는다.
    if (!looksLikeKoreanPhoneInput(el.value)) {
      onChange(el.value.trim())
      return
    }
    const digits = phoneDigits(el.value).slice(0, KOREAN_PHONE_MAX_DIGITS)
    el.value = formatKoreanPhone(digits)
    onChange(digits)
  }

  useEffect(() => {
    if (ref.current) {
      ref.current.value = looksLikeKoreanPhoneInput(initial) ? formatKoreanPhone(initial) : initial
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      defaultValue={looksLikeKoreanPhoneInput(initial) ? formatKoreanPhone(initial) : initial}
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
      // 자유 입력(해외번호·내선·메모)을 허용하므로 한국 번호 자릿수로 자르지 않는다.
      maxLength={40}
      className={className}
    />
  )
}
