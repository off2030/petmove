'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { lookupRabies, lookupComprehensive, lookupCiv, lookupExternalParasite, lookupInternalParasite } from '@/lib/vaccine-lookup'

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

/** 접종일 + 1년 → YYYY-MM-DD */
function addOneYear(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return ''
  return `${parseInt(parts[0], 10) + 1}-${parts[1]}-${parts[2]}`
}

/** 라벨과 접종일로 lookup 데이터를 VacRecord 형태로 반환 (expanded view 힌트용) */
function getDetailHints(label: string, date: string, species: string): Partial<VacRecord> {
  if (!date) return {}
  const sp: 'dog' | 'cat' = species === 'cat' ? 'cat' : 'dog'
  if (label === '광견병') {
    const r = lookupRabies(date)
    if (!r) return {}
    return {
      product: r.vaccine || r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
      valid_until: addOneYear(date),
    }
  }
  if (label === '종합백신') {
    const r = lookupComprehensive(sp, date)
    if (!r) return {}
    return {
      product: r.vaccine || r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
      valid_until: addOneYear(date),
    }
  }
  if (label === 'CIV') {
    const r = lookupCiv(date)
    if (!r) return {}
    return {
      product: r.vaccine || r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
      valid_until: addOneYear(date),
    }
  }
  if (label === '외부구충') {
    const r = lookupExternalParasite(sp, date)
    if (!r) return {}
    return {
      product: r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
    }
  }
  if (label === '내부구충') {
    const r = lookupInternalParasite(sp, date)
    if (!r) return {}
    return {
      product: r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
    }
  }
  return {}
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
                >
                  {rec.date}
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
            const hints = getDetailHints(label, rec.date, species)
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
                        hint={hints.valid_until}
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
                    hint={hints.product}
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
                    hint={hints.manufacturer}
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
                    hint={hints.lot}
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
                        hint={hints.expiry}
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

function DetailField({ value, hint, type, placeholder, isEditing, onStartEdit, onSave, onCancel, saving }: {
  value?: string | null
  hint?: string | null
  type?: 'text' | 'date'
  placeholder: string
  isEditing: boolean
  onStartEdit: () => void
  onSave: (v: string | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const hasValue = !!value
  const hasHint = !value && !!hint
  const display = value || hint || placeholder

  if (isEditing) {
    return type === 'date' ? (
      <DateInput initial={value || hint || ''} onSave={(v) => onSave(v || null)} onCancel={onCancel} />
    ) : (
      <TextInput initial={value || hint || ''} placeholder={placeholder} onSave={(v) => onSave(v || null)} onCancel={onCancel} saving={saving} />
    )
  }

  return (
    <button type="button" onClick={onStartEdit}
      className={cn(
        'text-left rounded-md px-2 py-1 -mx-2 text-xs transition-colors hover:bg-accent/60 cursor-text',
        !hasValue && !hasHint && 'text-muted-foreground/40 italic',
        hasHint && 'text-muted-foreground/60',
      )}>
      {display}
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
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => saveFromRef(), 150)}
      className="w-36 h-7 rounded-md border border-border/50 bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
