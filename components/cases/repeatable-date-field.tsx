'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { lookupRabies, lookupComprehensive, lookupCiv } from '@/lib/vaccine-lookup'

interface VacRecord {
  date: string
  valid_until?: string | null
  product?: string | null
  manufacturer?: string | null
  lot?: string | null
  expiry?: string | null
}

interface Props {
  caseId: string
  caseRow: CaseRow
  label: string
  dataKey: string
  legacyKey?: string
  hideValidUntil?: boolean // 구충 등 유효기간 불필요한 항목
}

/** Normalize: string[] or VacRecord[] or legacy flat key → VacRecord[] */
function readRecords(data: Record<string, unknown>, dataKey: string, legacyKey?: string): VacRecord[] {
  const raw = data[dataKey]
  if (Array.isArray(raw)) {
    return raw.map(item =>
      typeof item === 'string' ? { date: item } : (item as VacRecord)
    )
  }
  if (legacyKey && data[legacyKey]) {
    return [{ date: data[legacyKey] as string }]
  }
  return []
}

/** 라벨과 접종일로 자동 조회 힌트 생성 (상세페이지 보조 표시용) */
function getLookupHint(label: string, date: string, species: string): string | null {
  if (!date) return null
  const sp: 'dog' | 'cat' = species === 'cat' ? 'cat' : 'dog'
  let result: { vaccine?: string; product?: string; batch: string | null } | null = null
  if (label === '광견병') result = lookupRabies(date)
  else if (label === '종합백신') result = lookupComprehensive(sp, date)
  else if (label === 'CIV') result = lookupCiv(date)
  if (!result) return null
  const name = result.vaccine || result.product || ''
  return result.batch ? `${name} · ${result.batch}` : name || null
}

export function RepeatableDateField({ caseId, caseRow, label, dataKey, legacyKey, hideValidUntil }: Props) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const records = readRecords(data, dataKey, legacyKey)
  const species = (data.species as string) || ''

  // Sort: newest first for expanded view
  const sortedForExpand = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Which detail field is being edited (in expanded view)
  const [detailEdit, setDetailEdit] = useState<{ idx: number; field: keyof VacRecord } | null>(null)

  useEffect(() => {
    setEditIdx(null)
    setAddingNew(false)
    setExpanded(false)
    setDetailEdit(null)
  }, [caseId])

  async function saveRecords(next: VacRecord[]) {
    const val = next.length > 0 ? next : null
    if (legacyKey && data[legacyKey]) {
      await updateCaseField(caseId, 'data', legacyKey, null)
      updateLocalCaseField(caseId, 'data', legacyKey, null)
    }
    const r = await updateCaseField(caseId, 'data', dataKey, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', dataKey, val)
  }

  function deleteRecord(idx: number) {
    const next = records.filter((_, i) => i !== idx)
    startSave(() => saveRecords(next))
  }

  function updateRecordDate(idx: number, value: string) {
    const next = records.map((r, i) => i === idx ? { ...r, date: value } : r)
    startSave(() => saveRecords(next))
    setEditIdx(null)
  }

  function updateRecordField(idx: number, field: keyof VacRecord, value: string | null) {
    const next = records.map((r, i) => i === idx ? { ...r, [field]: value || null } : r)
    startSave(() => saveRecords(next))
    setDetailEdit(null)
  }

  function saveNewDate(value: string) {
    if (!value) { setAddingNew(false); return }
    const next = [...records, { date: value }]
    startSave(async () => {
      await saveRecords(next)
      setAddingNew(false)
    })
  }

  // Map sorted index back to original records index
  function origIdx(sortedIdx: number): number {
    const rec = sortedForExpand[sortedIdx]
    return records.indexOf(rec)
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1 pt-1">
        {/* Label: click to toggle expanded */}
        <button
          type="button"
          onClick={() => { if (records.length > 0) setExpanded(!expanded) }}
          className={cn(
            'text-sm text-muted-foreground transition-colors',
            records.length > 0 && 'hover:text-foreground cursor-pointer',
          )}
        >
          {label}{expanded ? ' ▾' : ''}
        </button>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={saving || addingNew}
          className="text-muted-foreground/40 hover:text-foreground text-sm font-medium leading-none transition-colors disabled:opacity-30"
          title={`${label} 추가`}
        >
          +
        </button>
      </div>

      {/* Collapsed view: dates inline */}
      {!expanded && (
        <div className="flex items-baseline gap-[10px] min-w-0 flex-wrap">
          {records.map((rec, i) => (
            <div key={i} className="group/item inline-flex items-baseline gap-[10px]">
              {i > 0 && <span className="text-muted-foreground/30 select-none">|</span>}
              {editIdx === i ? (
                <DateInput
                  initial={rec.date}
                  onSave={(v) => { if (v) updateRecordDate(i, v); else setEditIdx(null) }}
                  onCancel={() => setEditIdx(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditIdx(i)}
                  className="text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer"
                  title={getLookupHint(label, rec.date, species) ?? undefined}
                >
                  {rec.date}
                  {(() => {
                    const hint = getLookupHint(label, rec.date, species)
                    return hint ? (
                      <span className="ml-2 text-xs text-muted-foreground/60 font-normal">
                        {hint}
                      </span>
                    ) : null
                  })()}
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteRecord(i)}
                className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/item:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}

          {addingNew && (
            <>
              {records.length > 0 && <span className="text-muted-foreground/30 select-none">|</span>}
              <DateInput
                initial=""
                onSave={saveNewDate}
                onCancel={() => setAddingNew(false)}
              />
            </>
          )}

          {records.length === 0 && !addingNew && (
            <button type="button" onClick={() => setAddingNew(true)}
              className="text-left rounded-md px-2 py-1 -mx-2 text-sm text-muted-foreground/60 italic transition-colors hover:bg-accent/60 cursor-pointer">
              —
            </button>
          )}
        </div>
      )}

      {/* Expanded view: detail cards, newest first */}
      {expanded && (
        <div className="min-w-0 space-y-2">
          {addingNew && (
            <div className="flex items-baseline gap-2">
              <DateInput
                initial=""
                onSave={saveNewDate}
                onCancel={() => setAddingNew(false)}
              />
            </div>
          )}

          {sortedForExpand.map((rec, si) => {
            const oi = origIdx(si)
            const hasDetails = rec.valid_until || rec.product || rec.manufacturer || rec.lot || rec.expiry
            return (
              <div key={oi} className="group/item">
                {/* Row 1: date + valid_until */}
                <div className="flex items-baseline gap-[10px]">
                  {editIdx === oi ? (
                    <DateInput
                      initial={rec.date}
                      onSave={(v) => { if (v) updateRecordDate(oi, v); else setEditIdx(null) }}
                      onCancel={() => setEditIdx(null)}
                    />
                  ) : (
                    <button type="button" onClick={() => setEditIdx(oi)}
                      className="text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer">
                      {rec.date}
                    </button>
                  )}

                  {!hideValidUntil && (
                    <>
                      <DetailField
                        value={rec.valid_until}
                        type="date"
                        placeholder="유효기간"
                        isEditing={detailEdit?.idx === oi && detailEdit?.field === 'valid_until'}
                        onStartEdit={() => setDetailEdit({ idx: oi, field: 'valid_until' })}
                        onSave={(v) => updateRecordField(oi, 'valid_until', v)}
                        onCancel={() => setDetailEdit(null)}
                        saving={saving}
                      />
                    </>
                  )}

                  <button type="button" onClick={() => deleteRecord(oi)}
                    className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/item:opacity-100 ml-auto">
                    ✕
                  </button>
                </div>

                {/* Row 2: 제품명 | 제조사 | 제품번호 | 유효기간 */}
                <div className="flex items-baseline gap-[10px] ml-2 mt-0.5">
                  <DetailField
                    value={rec.product}
                    placeholder="제품명"
                    isEditing={detailEdit?.idx === oi && detailEdit?.field === 'product'}
                    onStartEdit={() => setDetailEdit({ idx: oi, field: 'product' })}
                    onSave={(v) => updateRecordField(oi, 'product', v)}
                    onCancel={() => setDetailEdit(null)}
                    saving={saving}
                  />
                  <span className="text-muted-foreground/30 select-none">|</span>
                  <DetailField
                    value={rec.manufacturer}
                    placeholder="제조사"
                    isEditing={detailEdit?.idx === oi && detailEdit?.field === 'manufacturer'}
                    onStartEdit={() => setDetailEdit({ idx: oi, field: 'manufacturer' })}
                    onSave={(v) => updateRecordField(oi, 'manufacturer', v)}
                    onCancel={() => setDetailEdit(null)}
                    saving={saving}
                  />
                  <span className="text-muted-foreground/30 select-none">|</span>
                  <DetailField
                    value={rec.lot}
                    placeholder="제품번호"
                    isEditing={detailEdit?.idx === oi && detailEdit?.field === 'lot'}
                    onStartEdit={() => setDetailEdit({ idx: oi, field: 'lot' })}
                    onSave={(v) => updateRecordField(oi, 'lot', v)}
                    onCancel={() => setDetailEdit(null)}
                    saving={saving}
                  />
                  {!hideValidUntil && (
                    <>
                      <span className="text-muted-foreground/30 select-none">|</span>
                      <DetailField
                        value={rec.expiry}
                        type="date"
                        placeholder="유효기간"
                        isEditing={detailEdit?.idx === oi && detailEdit?.field === 'expiry'}
                        onStartEdit={() => setDetailEdit({ idx: oi, field: 'expiry' })}
                        onSave={(v) => updateRecordField(oi, 'expiry', v)}
                        onCancel={() => setDetailEdit(null)}
                        saving={saving}
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Detail field (text or date, inline editable) ── */

function DetailField({ value, type, placeholder, isEditing, onStartEdit, onSave, onCancel, saving }: {
  value?: string | null
  type?: 'text' | 'date'
  placeholder: string
  isEditing: boolean
  onStartEdit: () => void
  onSave: (v: string | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const display = value || '—'
  const isEmpty = !value

  if (isEditing) {
    return type === 'date' ? (
      <DateInput initial={value || ''} onSave={(v) => onSave(v || null)} onCancel={onCancel} />
    ) : (
      <TextInput initial={value || ''} placeholder={placeholder} onSave={(v) => onSave(v || null)} onCancel={onCancel} saving={saving} />
    )
  }

  return (
    <button type="button" onClick={onStartEdit}
      className={cn('text-left rounded-md px-2 py-1 -mx-2 text-xs transition-colors hover:bg-accent/60 cursor-text', isEmpty && 'text-muted-foreground/40 italic')}>
      {isEmpty ? placeholder : display}
    </button>
  )
}

/* ── Text input ── */

function TextInput({ initial, placeholder, onSave, onCancel, saving }: {
  initial: string; placeholder: string; onSave: (v: string) => void; onCancel: () => void; saving: boolean
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <input ref={ref} type="text" value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSave(val.trim()); if (e.key === 'Escape') onCancel() }}
      onBlur={() => setTimeout(() => { if (!saving) onSave(val.trim()) }, 150)}
      placeholder={placeholder}
      className="w-28 h-7 rounded-md border border-border/50 bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

/* ── Date input ── */

function DateInput({ initial, onSave, onCancel }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const dateTypedRef = useRef(false)

  useEffect(() => { ref.current?.focus() }, [])

  function saveFromRef() {
    const raw = (ref.current?.value ?? '').trim()
    if (!raw) { onSave(''); return }
    const digits = raw.replace(/\D/g, '')
    let dateStr = ''
    if (digits.length === 8) dateStr = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
    else if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(raw)) {
      const parts = raw.split(/[-./]/)
      dateStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`
    } else {
      dateStr = raw
    }
    const d = new Date(dateStr)
    const year = parseInt(dateStr.split('-')[0], 10)
    if (isNaN(d.getTime()) || year < 1900 || year > 2100) return
    onSave(dateStr)
  }

  return (
    <input
      ref={ref}
      type="date"
      min="1900-01-01"
      max="2100-12-31"
      defaultValue={initial}
      onChange={(e) => {
        const v = e.target.value
        if (!v) { dateTypedRef.current = false; return }
        const year = parseInt(v.split('-')[0], 10)
        if (year < 1900 || year > 2100) { dateTypedRef.current = false; return }
        if (dateTypedRef.current) {
          onSave(v)
          dateTypedRef.current = false
        } else {
          saveFromRef()
        }
      }}
      onKeyDown={(e) => {
        dateTypedRef.current = true
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => saveFromRef(), 150)}
      className="w-36 h-7 rounded-md border border-border/50 bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
