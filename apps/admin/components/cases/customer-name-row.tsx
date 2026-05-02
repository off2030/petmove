'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from './copy-button'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { SectionLabel } from '@/components/ui/section-label'
import { useSectionEditMode } from './section-edit-mode-context'

/** Capitalize first letter of each word: "john doe" → "John Doe" */
function capitalize(str: string): string {
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Strip Korean characters */
function filterKorean(str: string): string {
  return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
}

/**
 * Custom row for the customer name that shows:
 *   보호자    박하연  /  Namhee Kim       📋  📋
 *
 * Data is stored as separate last/first in data jsonb:
 *   customer_last_name_en:  "Kim"
 *   customer_first_name_en: "Namhee"
 *
 * Display: "First Last" (Western order).
 * Edit: clicking either Korean or English side opens all three inputs (한글이름 / First / Last)
 *       at once with a single 저장 button — atomic save of the trio.
 */
export function CustomerNameRow({
  caseId,
  caseRow,
}: {
  caseId: string
  caseRow: CaseRow
}) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  const koName = (caseRow.customer_name ?? '').trim()
  const lastName = ((data.customer_last_name_en as string) ?? '').trim()
  const firstName = ((data.customer_first_name_en as string) ?? '').trim()
  const legacyEn = (caseRow.customer_name_en ?? '').trim()

  const displayKo = koName || '—'
  const displayEn =
    firstName && lastName
      ? `${firstName} ${lastName}`
      : firstName || lastName || legacyEn || '—'
  const koEmpty = displayKo === '—'
  const enEmpty = displayEn === '—'

  const [editing, setEditing] = useState(false)
  const [koVal, setKoVal] = useState(koName)
  const [firstVal, setFirstVal] = useState(firstName)
  const [lastVal, setLastVal] = useState(lastName)
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const koRef = useRef<HTMLInputElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)
  const lastRef = useRef<HTMLInputElement>(null)
  const koComposing = useRef(false)
  const firstComposing = useRef(false)
  const lastComposing = useRef(false)

  useEffect(() => {
    if (!editing) {
      setKoVal(koName)
      setFirstVal(firstName)
      setLastVal(lastName)
    }
  }, [koName, firstName, lastName, editing])

  useEffect(() => {
    setEditing(false)
    setError(null)
  }, [caseId])

  function startEdit(focus: 'ko' | 'first' | 'last' = 'ko') {
    if (!editMode) return
    setKoVal(koName)
    setFirstVal(firstName)
    setLastVal(lastName)
    setError(null)
    setEditing(true)
    setTimeout(() => {
      if (focus === 'first') firstRef.current?.focus()
      else if (focus === 'last') lastRef.current?.focus()
      else koRef.current?.focus()
    }, 0)
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  function save() {
    const ko = koVal.trim() || null
    const first = firstVal.trim() || null
    const last = lastVal.trim() || null
    const koCurr = koName || null
    const firstCurr = firstName || null
    const lastCurr = lastName || null
    if (ko === koCurr && first === firstCurr && last === lastCurr) {
      setEditing(false)
      return
    }
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    setEditing(false)
    setError(null)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    if (ko !== koCurr) updateLocalCaseField(caseId, 'column', 'customer_name', ko)
    if (first !== firstCurr) updateLocalCaseField(caseId, 'data', 'customer_first_name_en', first)
    if (last !== lastCurr) updateLocalCaseField(caseId, 'data', 'customer_last_name_en', last)
    void (async () => {
      if (ko !== koCurr) {
        const r = await updateCaseField(caseId, 'column', 'customer_name', ko)
        if (!r.ok) { updateLocalCaseField(caseId, 'column', 'customer_name', koCurr); setError(r.error); return }
      }
      if (first !== firstCurr) {
        const r = await updateCaseField(caseId, 'data', 'customer_first_name_en', first)
        if (!r.ok) { updateLocalCaseField(caseId, 'data', 'customer_first_name_en', firstCurr); setError(r.error); return }
      }
      if (last !== lastCurr) {
        const r = await updateCaseField(caseId, 'data', 'customer_last_name_en', last)
        if (!r.ok) { updateLocalCaseField(caseId, 'data', 'customer_last_name_en', lastCurr); setError(r.error) }
      }
    })()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  const koValueCls = 'rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-muted-foreground'
  const enValueCls = 'rounded-md px-2 py-1 -mx-2 font-serif italic text-[17px] text-foreground'
  const inputCls = 'h-8 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <SectionLabel
        className="pt-1"
        onClick={editMode && !editing ? () => startEdit('ko') : undefined}
      >
        성함
      </SectionLabel>

      <div className="min-w-0">
        {editing ? (
          <div
            className="flex flex-wrap items-center gap-sm"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setTimeout(() => { if (!saving) cancel() }, 150)
              }
            }}
          >
            <input
              ref={koRef}
              type="text"
              value={koVal}
              onChange={(e) => setKoVal(e.target.value)}
              onCompositionStart={() => { koComposing.current = true }}
              onCompositionEnd={() => { koComposing.current = false }}
              onKeyDown={handleKeyDown}
              placeholder="한글이름"
              className={cn(inputCls, 'w-32')}
            />
            <span className="text-muted-foreground/30 select-none">|</span>
            <input
              ref={firstRef}
              type="text"
              value={firstVal}
              onChange={(e) => {
                if (firstComposing.current) { setFirstVal(e.target.value); return }
                setFirstVal(capitalize(filterKorean(e.target.value)))
              }}
              onCompositionStart={() => { firstComposing.current = true }}
              onCompositionEnd={(e) => {
                firstComposing.current = false
                const raw = (e.target as HTMLInputElement).value
                const filtered = capitalize(filterKorean(raw))
                setFirstVal(filtered)
                if (raw !== filtered) {
                  setError('영문만 입력 가능합니다')
                  setTimeout(() => setError(null), 2000)
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="First"
              className={cn(inputCls, 'w-28')}
            />
            <input
              ref={lastRef}
              type="text"
              value={lastVal}
              onChange={(e) => {
                if (lastComposing.current) { setLastVal(e.target.value); return }
                setLastVal(capitalize(filterKorean(e.target.value)))
              }}
              onCompositionStart={() => { lastComposing.current = true }}
              onCompositionEnd={(e) => {
                lastComposing.current = false
                const raw = (e.target as HTMLInputElement).value
                const filtered = capitalize(filterKorean(raw))
                setLastVal(filtered)
                if (raw !== filtered) {
                  setError('영문만 입력 가능합니다')
                  setTimeout(() => setError(null), 2000)
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="Last"
              className={cn(inputCls, 'w-28')}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={save}
              disabled={saving}
              className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-[#D9A489] bg-[#D9A489]/15 text-[#A87862] hover:bg-[#D9A489]/25 dark:border-[#C08C70] dark:bg-[#C08C70]/15 dark:text-[#D9A489] dark:hover:bg-[#C08C70]/25 transition-colors disabled:opacity-50"
            >
              {saving ? '...' : '저장'}
            </button>
            {error && <div className="w-full text-xs text-red-600">{error}</div>}
          </div>
        ) : (
          <div className="flex items-baseline gap-[10px] min-w-0 overflow-x-auto whitespace-nowrap scrollbar-minimal">
            {/* Korean name */}
            <div className="group/ko inline-flex items-baseline">
              {editMode ? (
                <button
                  type="button"
                  onClick={() => startEdit('ko')}
                  className={cn(
                    'text-left transition-colors hover:bg-accent/60 cursor-text',
                    koValueCls,
                    koEmpty && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60',
                  )}
                >
                  {koEmpty ? (
                    <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>
                  ) : (
                    displayKo
                  )}
                </button>
              ) : (
                <span className={koValueCls}>{displayKo}</span>
              )}
              {savedFlash && (
                <span className="ml-2 text-emerald-600 text-sm select-none" aria-label="저장됨">✓</span>
              )}
            </div>

            {(!koEmpty || !enEmpty) && (
              <span className="text-muted-foreground/30 select-none">|</span>
            )}

            {/* English name */}
            <div className="group/en relative inline-flex items-baseline">
              {editMode ? (
                <button
                  type="button"
                  onClick={() => startEdit('first')}
                  className={cn(
                    'text-left transition-colors hover:bg-accent/60 cursor-text',
                    enValueCls,
                    enEmpty && 'font-sans not-italic text-base font-normal tracking-normal text-muted-foreground/60',
                  )}
                  title="클릭하여 편집 (First / Last)"
                >
                  {enEmpty ? (
                    <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>
                  ) : (
                    displayEn
                  )}
                </button>
              ) : (
                <span className={enValueCls}>{displayEn}</span>
              )}
              <CopyButton
                value={enEmpty ? '' : displayEn}
                className="absolute left-full ml-1 z-10 opacity-0 group-hover/en:opacity-100 shrink-0"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
