'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { REGULAR_COLUMN_SPECS } from '@/lib/fields'
import { updateCaseField } from '@/lib/actions/cases'
import { EditableField } from './editable-field'
import { CopyButton } from './copy-button'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'

/** Capitalize first letter of each word: "john doe" → "John Doe" */
function capitalize(str: string): string {
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Remove Korean characters */
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
 * Edit: clicking the English side opens two inputs (이름 / 성).
 * Fallback: if split fields are empty, shows legacy customer_name_en.
 */
export function CustomerNameRow({
  caseId,
  caseRow,
}: {
  caseId: string
  caseRow: CaseRow
}) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  const lastName = ((data.customer_last_name_en as string) ?? '').trim()
  const firstName = ((data.customer_first_name_en as string) ?? '').trim()
  const legacyEn = (caseRow.customer_name_en ?? '').trim()

  // Display: "First Last" if both present, else legacy, else —
  const displayEn =
    firstName && lastName
      ? `${firstName} ${lastName}`
      : firstName || lastName || legacyEn || '—'
  const isEmpty = displayEn === '—'

  const [editing, setEditing] = useState(false)
  const [lastVal, setLastVal] = useState(lastName)
  const [firstVal, setFirstVal] = useState(firstName)
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Sync local state when data changes externally
  useEffect(() => {
    if (!editing) {
      setLastVal(lastName)
      setFirstVal(firstName)
    }
  }, [lastName, firstName, editing])

  const composingRef = useRef(false)
  const koSpec = REGULAR_COLUMN_SPECS.find((s) => s.key === 'customer_name')!

  // Reset editing when case changes
  useEffect(() => {
    setEditing(false)
    setError(null)
  }, [caseId])

  function handleEditEn() {
    setLastVal(lastName)
    setFirstVal(firstName)
    setEditing(true)
    setError(null)
  }

  function handleCancel() {
    setEditing(false)
    setError(null)
  }

  function handleSave() {
    const last = lastVal.trim() || null
    const first = firstVal.trim() || null
    startSave(async () => {
      const r1 = await updateCaseField(caseId, 'data', 'customer_last_name_en', last)
      if (!r1.ok) { setError(r1.error); return }
      const r2 = await updateCaseField(caseId, 'data', 'customer_first_name_en', first)
      if (!r2.ok) { setError(r2.error); return }
      updateLocalCaseField(caseId, 'data', 'customer_last_name_en', last)
      updateLocalCaseField(caseId, 'data', 'customer_first_name_en', first)
      setEditing(false)
      setError(null)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') { e.preventDefault(); handleCancel() }
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="pt-1 text-sm text-muted-foreground">성함</div>

      <div className="flex items-baseline gap-[10px] min-w-0 flex-wrap">
        {/* Korean name — standard inline EditableField */}
        <div className="inline-flex items-baseline">
          <EditableField
            inline
            caseId={caseId}
            spec={koSpec}
            rawValue={caseRow.customer_name}
          />
        </div>

        <span className="text-muted-foreground/30 select-none">|</span>

        {/* English name — combined "First Last" display, two-input edit */}
        <div className="group/en relative inline-flex items-baseline">
          {editing ? (
            <div
              className="flex items-center gap-2"
              onBlur={(e) => {
                // Only cancel if focus leaves the entire group (not just moving between inputs)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setTimeout(() => { if (!saving) handleCancel() }, 150)
                }
              }}
            >
              <input
                type="text"
                value={firstVal}
                onChange={(e) => {
                  if (composingRef.current) { setFirstVal(e.target.value); return }
                  setFirstVal(capitalize(filterKorean(e.target.value)))
                }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={(e) => {
                  composingRef.current = false
                  const raw = (e.target as HTMLInputElement).value
                  const filtered = capitalize(filterKorean(raw))
                  setFirstVal(filtered)
                  if (raw !== filtered) {
                    setError('영문만 입력 가능합니다')
                    setTimeout(() => setError(null), 2000)
                  }
                }}
                placeholder="이름 (First)"
                autoFocus
                onKeyDown={handleKeyDown}
                className="h-8 w-28 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
              />
              <input
                type="text"
                value={lastVal}
                onChange={(e) => {
                  if (composingRef.current) { setLastVal(e.target.value); return }
                  setLastVal(capitalize(filterKorean((e.target as HTMLInputElement).value)))
                }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={(e) => {
                  composingRef.current = false
                  const raw = (e.target as HTMLInputElement).value
                  const filtered = capitalize(filterKorean(raw))
                  setLastVal(filtered)
                  if (raw !== filtered) {
                    setError('영문만 입력 가능합니다')
                    setTimeout(() => setError(null), 2000)
                  }
                }}
                placeholder="성 (Last)"
                onKeyDown={handleKeyDown}
                className="h-8 w-28 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
              />
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
              onClick={handleEditEn}
              className={cn(
                'text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors',
                'hover:bg-accent/60 cursor-text',
                isEmpty && 'text-muted-foreground/60 italic',
              )}
              title="클릭하여 편집 (이름 / 성)"
            >
              {displayEn}
            </button>
          )}
          <CopyButton
            value={isEmpty ? '' : displayEn}
            className="absolute left-full ml-1 z-10 opacity-0 group-hover/en:opacity-100 shrink-0"
          />
        </div>

        {error && (
          <div className="w-full text-xs text-red-600">에러: {error}</div>
        )}
      </div>
    </div>
  )
}
