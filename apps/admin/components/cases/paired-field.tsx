'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { FieldSpec } from '@/lib/fields'
import { renderFieldValue } from '@/lib/fields'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import { CopyButton } from './copy-button'
import { SectionLabel } from '@/components/ui/section-label'
import { useSectionEditMode } from './section-edit-mode-context'
import { cn } from '@/lib/utils'

/** Capitalize first letter of each word: "rosie  pup" → "Rosie Pup" */
function capitalize(str: string): string {
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Strip Korean characters */
function filterKorean(str: string): string {
  return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
}

function asString(v: unknown): string {
  return v == null ? '' : String(v)
}

/**
 * One row that shows a Korean + English paired text field side-by-side.
 * Clicking either side enters a unified edit mode where BOTH inputs are active,
 * and a single save commits both atomically.
 */
export function PairedField({
  caseId,
  koSpec,
  enSpec,
  koRaw,
  enRaw,
}: {
  caseId: string
  koSpec: FieldSpec
  enSpec: FieldSpec | undefined
  koRaw: unknown
  enRaw: unknown
}) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const [editing, setEditing] = useState(false)
  const [koVal, setKoVal] = useState(asString(koRaw))
  const [enVal, setEnVal] = useState(asString(enRaw))
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const koRef = useRef<HTMLInputElement>(null)
  const enRef = useRef<HTMLInputElement>(null)
  const koComposing = useRef(false)
  const enComposing = useRef(false)

  // Sync local state when props change (and not editing)
  useEffect(() => {
    if (!editing) {
      setKoVal(asString(koRaw))
      setEnVal(asString(enRaw))
    }
  }, [koRaw, enRaw, editing])

  // Reset on case change
  useEffect(() => {
    setEditing(false)
    setError(null)
  }, [caseId])

  const koDisplay = renderFieldValue(koSpec, koRaw)
  const enDisplay = enSpec ? renderFieldValue(enSpec, enRaw) : '—'
  const koEmpty = koDisplay === '—'
  const enEmpty = enDisplay === '—'

  function startEdit(focus: 'ko' | 'en' = 'ko') {
    if (!editMode) return
    setKoVal(asString(koRaw))
    setEnVal(asString(enRaw))
    setError(null)
    setEditing(true)
    setTimeout(() => {
      if (focus === 'en') enRef.current?.focus()
      else koRef.current?.focus()
    }, 0)
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  function save() {
    const koNew = koVal.trim() || null
    const enNew = enSpec ? (enVal.trim() || null) : null
    const koCurr = asString(koRaw).trim() || null
    const enCurr = asString(enRaw).trim() || null
    if (koNew === koCurr && (!enSpec || enNew === enCurr)) {
      setEditing(false)
      return
    }
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const koPrev = koRaw
    const enPrev = enRaw
    setEditing(false)
    setError(null)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    if (koNew !== koCurr) updateLocalCaseField(caseId, koSpec.storage, koSpec.key, koNew)
    if (enSpec && enNew !== enCurr) updateLocalCaseField(caseId, enSpec.storage, enSpec.key, enNew)
    void (async () => {
      if (koNew !== koCurr) {
        const r = await updateCaseField(caseId, koSpec.storage, koSpec.key, koNew)
        if (!r.ok) {
          updateLocalCaseField(caseId, koSpec.storage, koSpec.key, koPrev)
          setError(r.error)
          return
        }
      }
      if (enSpec && enNew !== enCurr) {
        const r = await updateCaseField(caseId, enSpec.storage, enSpec.key, enNew)
        if (!r.ok) {
          updateLocalCaseField(caseId, enSpec.storage, enSpec.key, enPrev)
          setError(r.error)
        }
      }
    })()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  const valueCls = 'rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-muted-foreground'
  const valueClsEn = 'rounded-md px-2 py-1 -mx-2 font-serif italic text-[17px] text-foreground'

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <SectionLabel
        className="pt-1"
        onClick={editMode && !editing ? () => startEdit('ko') : undefined}
      >
        {koSpec.label}
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
              onChange={(e) => {
                if (koComposing.current) { setKoVal(e.target.value); return }
                setKoVal(capitalize(e.target.value))
              }}
              onCompositionStart={() => { koComposing.current = true }}
              onCompositionEnd={(e) => {
                koComposing.current = false
                setKoVal(capitalize((e.target as HTMLInputElement).value))
              }}
              onKeyDown={handleKeyDown}
              placeholder={koSpec.label}
              className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
            />
            {enSpec && (
              <>
                <span className="text-muted-foreground/30 select-none">|</span>
                <input
                  ref={enRef}
                  type="text"
                  value={enVal}
                  onChange={(e) => {
                    if (enComposing.current) { setEnVal(e.target.value); return }
                    setEnVal(capitalize(filterKorean(e.target.value)))
                  }}
                  onCompositionStart={() => { enComposing.current = true }}
                  onCompositionEnd={(e) => {
                    enComposing.current = false
                    const raw = (e.target as HTMLInputElement).value
                    const filtered = capitalize(filterKorean(raw))
                    setEnVal(filtered)
                    if (raw !== filtered) {
                      setError('영문만 입력 가능합니다')
                      setTimeout(() => setError(null), 2000)
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={enSpec.label}
                  className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
                />
              </>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={save}
              disabled={saving}
              className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 transition-colors disabled:opacity-50"
            >
              {saving ? '...' : '저장'}
            </button>
            {error && <div className="w-full text-xs text-destructive">{error}</div>}
          </div>
        ) : (
          <div className="flex items-baseline gap-[10px] min-w-0 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <div className="group/ko inline-flex items-baseline">
              {editMode ? (
                <button
                  type="button"
                  onClick={() => startEdit('ko')}
                  className={cn(
                    'text-left transition-colors hover:bg-accent/60 cursor-text',
                    valueCls,
                    koEmpty && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60',
                  )}
                >
                  {koEmpty ? (
                    <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>
                  ) : (
                    koDisplay
                  )}
                </button>
              ) : (
                <span className={valueCls}>{koDisplay}</span>
              )}
              {savedFlash && (
                <span className="ml-2 text-pmw-positive text-sm select-none" aria-label="저장됨">✓</span>
              )}
            </div>

            {enSpec && (!koEmpty || !enEmpty) && (
              <span className="text-muted-foreground/30 select-none">|</span>
            )}

            {enSpec && (
              <div className="group/en relative inline-flex items-baseline">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => startEdit('en')}
                    className={cn(
                      'text-left transition-colors hover:bg-accent/60 cursor-text',
                      valueClsEn,
                      enEmpty && 'font-sans not-italic text-base font-normal tracking-normal text-muted-foreground/60',
                    )}
                  >
                    {enEmpty ? (
                      <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>
                    ) : (
                      enDisplay
                    )}
                  </button>
                ) : (
                  <span className={valueClsEn}>{enDisplay}</span>
                )}
                <CopyButton
                  value={enEmpty ? '' : enDisplay}
                  className="absolute left-full ml-1 z-10 opacity-0 group-hover/en:opacity-100 shrink-0"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
