'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { lookupRabies, lookupComprehensive, lookupCiv, lookupKennelCough, lookupExternalParasite, lookupInternalParasite, lookupHeartworm, lookupParasiteById, listParasiteFamilies, getParasiteFamily } from '@/lib/vaccine-lookup'
import { CopyButton } from './copy-button'
import { extractVaccineInfo } from '@/lib/actions/extract-vaccine'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'

interface VacRecord {
  date: string
  valid_until?: string | null
  product?: string | null
  manufacturer?: string | null
  lot?: string | null
  expiry?: string | null
  /** Parasiticide product family selected by user (overrides date-based lookup). */
  product_id?: string | null
}

interface Props {
  caseId: string
  caseRow: CaseRow
  label: string
  dataKey: string
  legacyKey?: string
  hideValidUntil?: boolean // 구충 등 유효기간 불필요한 항목
  /** Sibling parasite kind data key (for combo sync). e.g. external→internal */
  siblingKey?: string
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
function getDetailHints(label: string, date: string, species: string, weightKg = 0): Partial<VacRecord> {
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
  if (label === '켄넬코프') {
    const r = lookupKennelCough()
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
  if (label === '심장사상충') {
    const r = lookupHeartworm(sp, weightKg)
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

/** Detail hints for a record that already has product_id picked. */
function getDetailHintsById(productId: string, date: string, weightKg: number): Partial<VacRecord> {
  const p = lookupParasiteById(productId, { date, weightKg })
  if (!p) return {}
  return {
    product: p.product || undefined,
    manufacturer: p.manufacturer || undefined,
    lot: p.batch || undefined,
    expiry: p.expiry || undefined,
  }
}

/** label → 'external' | 'internal' | null (for parasiticide rows only) */
function parasiteKindFromLabel(label: string): 'external' | 'internal' | null {
  if (label === '외부구충') return 'external'
  if (label === '내부구충') return 'internal'
  return null
}

export function RepeatableDateField({ caseId, caseRow, label, dataKey, legacyKey, hideValidUntil, siblingKey }: Props) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const records = readRecords(data, dataKey, legacyKey)
  const species = (data.species as string) || ''
  const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
  const parasiteKind = parasiteKindFromLabel(label)
  const productOptions = parasiteKind && (species === 'dog' || species === 'cat')
    ? listParasiteFamilies(species, parasiteKind)
    : []

  // Sort: newest first for expanded view
  const sortedForExpand = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Which detail field is being edited (in expanded view)
  const [detailEdit, setDetailEdit] = useState<{ idx: number; field: keyof VacRecord } | null>(null)

  useEffect(() => {
    setEditIdx(null)
    setAddingNew(false)
    setExpanded(false)
    setDetailEdit(null)
    setExtractMsg(null)
    setDragOver(false)

    // If this field is toggled but has no records, remove it from toggleable fields
    if (records.length === 0) {
      const labelToToggleKey: Record<string, string> = {
        '종합백신': 'vaccine:general',
        '광견병': 'vaccine:rabies',
        'CIV': 'vaccine:civ',
        '켄넬코프': 'vaccine:kennel',
        '외부구충': 'vaccine:external_parasite',
        '내부구충': 'vaccine:internal_parasite',
        '심장사상충': 'vaccine:heartworm',
      }
      const toggleKey = labelToToggleKey[label]
      if (toggleKey) {
        const currentExtra = (data.extra_visible_fields as string[]) ?? []
        if (currentExtra.includes(toggleKey)) {
          const updated = currentExtra.filter(f => f !== toggleKey)
          const extraVal = updated.length > 0 ? updated : null
          updateCaseField(caseId, 'data', 'extra_visible_fields', extraVal).then((r) => {
            if (r.ok) updateLocalCaseField(caseId, 'data', 'extra_visible_fields', extraVal)
          })
        }
      }
    }
  }, [caseId])

  async function saveRecords(next: VacRecord[]) {
    const val = next.length > 0 ? next : null
    if (legacyKey && data[legacyKey]) {
      await updateCaseField(caseId, 'data', legacyKey, null)
      updateLocalCaseField(caseId, 'data', legacyKey, null)
    }
    const r = await updateCaseField(caseId, 'data', dataKey, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', dataKey, val)

    // If clearing all records, remove this field from toggleable fields
    if (val === null) {
      const labelToToggleKey: Record<string, string> = {
        '종합백신': 'vaccine:general',
        '광견병': 'vaccine:rabies',
        'CIV': 'vaccine:civ',
        '켄넬코프': 'vaccine:kennel',
        '외부구충': 'vaccine:external_parasite',
        '내부구충': 'vaccine:internal_parasite',
        '심장사상충': 'vaccine:heartworm',
      }
      const toggleKey = labelToToggleKey[label]
      if (toggleKey) {
        const currentExtra = (data.extra_visible_fields as string[]) ?? []
        if (currentExtra.includes(toggleKey)) {
          const updated = currentExtra.filter(f => f !== toggleKey)
          const extraVal = updated.length > 0 ? updated : null
          const r2 = await updateCaseField(caseId, 'data', 'extra_visible_fields', extraVal)
          if (r2.ok) updateLocalCaseField(caseId, 'data', 'extra_visible_fields', extraVal)
        }
      }
    }
  }

  /** Persist updates to the sibling parasite array (combo sync). */
  async function saveSiblingRecords(next: VacRecord[]) {
    if (!siblingKey) return
    const val = next.length > 0 ? next : null
    const r = await updateCaseField(caseId, 'data', siblingKey, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', siblingKey, val)
  }

  function readSiblingRecords(): VacRecord[] {
    if (!siblingKey) return []
    const raw = data[siblingKey]
    if (!Array.isArray(raw)) return []
    return raw.map(item => (typeof item === 'string' ? { date: item } : (item as VacRecord)))
  }

  function deleteRecord(idx: number) {
    const removed = records[idx]
    const next = records.filter((_, i) => i !== idx)
    startSave(async () => {
      await saveRecords(next)
      // If the deleted entry was a combo product, remove its mirror on the other side.
      if (removed?.product_id && getParasiteFamily(removed.product_id)?.kind === 'combo' && siblingKey) {
        const sib = readSiblingRecords()
        const sibNext = sib.filter(r => !(r.date === removed.date && r.product_id === removed.product_id))
        if (sibNext.length !== sib.length) await saveSiblingRecords(sibNext)
      }
    })
  }

  function updateRecordDate(idx: number, value: string) {
    const target = records[idx]
    const oldDate = target?.date
    const next = records.map((r, i) => i === idx ? { ...r, date: value } : r)
    startSave(async () => {
      await saveRecords(next)
      // Keep combo mirror's date in sync.
      if (target?.product_id && getParasiteFamily(target.product_id)?.kind === 'combo' && siblingKey) {
        const sib = readSiblingRecords()
        const sibNext = sib.map(r =>
          r.product_id === target.product_id && r.date === oldDate ? { ...r, date: value } : r,
        )
        if (JSON.stringify(sibNext) !== JSON.stringify(sib)) await saveSiblingRecords(sibNext)
      }
    })
    setEditIdx(null)
  }

  function updateRecordField(idx: number, field: keyof VacRecord, value: string | null) {
    const next = records.map((r, i) => i === idx ? { ...r, [field]: value || null } : r)
    startSave(() => saveRecords(next))
    setDetailEdit(null)
  }

  /** Apply a parasite product family selection. Handles combo sync to sibling array. */
  function updateProductId(idx: number, newProductId: string | null) {
    const target = records[idx]
    if (!target) return
    const oldFamily = target.product_id ? getParasiteFamily(target.product_id) : null
    const newFamily = newProductId ? getParasiteFamily(newProductId) : null

    // Clear product/manufacturer/lot/expiry overrides so hints take over for the new product.
    const next = records.map((r, i) => i === idx
      ? { date: r.date, valid_until: r.valid_until ?? null, product_id: newProductId }
      : r)

    startSave(async () => {
      await saveRecords(next)
      if (!siblingKey) { setDetailEdit(null); return }

      const sib = readSiblingRecords()
      let sibNext = sib

      // If the previous selection was combo, remove its mirror on the other side.
      if (oldFamily?.kind === 'combo' && oldFamily.id !== newFamily?.id) {
        sibNext = sibNext.filter(r => !(r.date === target.date && r.product_id === oldFamily.id))
      }

      // If the new selection is combo, ensure a mirror entry exists on the other side.
      if (newFamily?.kind === 'combo') {
        // Replace any existing entry with the same date on sibling (per "교체" policy).
        sibNext = sibNext.filter(r => r.date !== target.date)
        sibNext.push({ date: target.date, product_id: newFamily.id })
      }

      if (sibNext !== sib) await saveSiblingRecords(sibNext)
      setDetailEdit(null)
    })
  }

  function saveNewDate(value: string) {
    if (!value) { setAddingNew(false); return }
    const next = [...records, { date: value }]
    startSave(async () => {
      await saveRecords(next)
      setAddingNew(false)
    })
  }

  /* ── AI extraction (image drop) ── */

  /**
   * targetIdx가 null이면 새 레코드 추가, 숫자면 해당 레코드의 약품 정보만 업데이트.
   */
  async function handleFile(file: File, targetIdx: number | null) {
    if (!isExtractableFile(file)) return
    setExtracting(true)
    setExtractMsg(null)
    uploadFileToNotes(caseId, caseRow, file, updateLocalCaseField).catch(() => {})
    try {
      const images = await filesToBase64([file])
      if (images.length === 0) return
      const result = await extractVaccineInfo({ imageBase64: images[0].base64, mediaType: images[0].mediaType })
      if (result.ok) {
        const hasProduct = result.data.product || result.data.manufacturer || result.data.lot || result.data.expiry
        if (!hasProduct) {
          setExtractMsg('추출 실패: 약품 정보를 찾을 수 없습니다')
        } else if (targetIdx !== null) {
          // 기존 레코드 업데이트
          const next = records.map((r, i) => i === targetIdx ? {
            ...r,
            product: result.data.product ?? r.product,
            manufacturer: result.data.manufacturer ?? r.manufacturer,
            lot: result.data.lot ?? r.lot,
            expiry: result.data.expiry ?? r.expiry,
          } : r)
          await saveRecords(next)
          setExtractMsg(`약품 정보가 업데이트되었습니다`)
        } else {
          // 새 레코드 추가
          const newRec: VacRecord = {
            date: '',
            valid_until: null,
            product: result.data.product,
            manufacturer: result.data.manufacturer,
            lot: result.data.lot,
            expiry: result.data.expiry,
          }
          const next = [...records, newRec]
          await saveRecords(next)
          setExtractMsg(`${label} 약품 정보가 추가되었습니다. 접종일을 입력하세요.`)
          setExpanded(true)
          setEditIdx(next.length - 1)
        }
      } else {
        setExtractMsg('추출 실패: ' + result.error)
      }
    } catch (err) {
      setExtractMsg('오류: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExtracting(false)
      setTimeout(() => setExtractMsg(null), 4000)
    }
  }

  // ── Paste (Ctrl+V) ──
  // 루트 div 또는 확장 뷰의 각 카드에 hover 중일 때 붙여넣으면 해당 영역으로 전달
  const rootRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!rootRef.current) return
      // 컴포넌트 내 input/textarea가 포커스 중이면 무시 (기본 동작 유지)
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      // 이 컴포넌트 위에 hover 중일 때만 처리
      if (!rootRef.current.matches(':hover')) return

      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            // 호버된 카드가 있으면 해당 레코드에, 아니면 새 기록으로 추가
            // dragOverIdx는 드래그 전용이므로, hover 중인 카드를 별도로 찾음
            const hoveredCard = rootRef.current.querySelector('[data-record-idx]:hover') as HTMLElement | null
            if (hoveredCard) {
              const idx = Number(hoveredCard.dataset.recordIdx)
              if (!Number.isNaN(idx)) { handleFile(file, idx); return }
            }
            handleFile(file, null)
            return
          }
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, caseId])

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragOver(true) }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  function handleDropNew(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = Array.from(e.dataTransfer.files).find(isExtractableFile)
    if (file) handleFile(file, null)
  }

  // Map sorted index back to original records index
  function origIdx(sortedIdx: number): number {
    const rec = sortedForExpand[sortedIdx]
    return records.indexOf(rec)
  }

  return (
    <div
      ref={rootRef}
      onDragOver={!expanded ? handleDragOver : undefined}
      onDragLeave={!expanded ? handleDragLeave : undefined}
      onDrop={!expanded ? handleDropNew : undefined}
      className={cn(
        "grid grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 last:border-0 rounded-md transition-colors hover:bg-muted/60",
        !expanded && dragOver && "bg-accent/40 ring-2 ring-ring/30 ring-dashed",
      )}
    >
      <div className="flex items-center gap-xs pt-1">
        {/* Label: click to toggle expanded */}
        <button
          type="button"
          onClick={() => { if (records.length > 0) setExpanded(!expanded) }}
          className={cn(
            'text-base text-primary transition-colors',
            records.length > 0 && 'hover:text-foreground cursor-pointer',
          )}
        >
          {label}{expanded ? ' ▾' : ''}
        </button>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={saving || addingNew}
          className="text-muted-foreground/40 hover:text-foreground text-lg font-semibold leading-none transition-colors disabled:opacity-30"
          title={`${label} 추가`}
        >
          +
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, null); e.target.value = '' }} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={extracting} className="shrink-0 rounded-md p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-30" title="이미지/PDF로 약품 정보 추출">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </button>
      </div>

      {/* Collapsed view: dates inline (newest first) */}
      {!expanded && (
        <div className="flex items-baseline gap-[10px] min-w-0 flex-wrap">
          {sortedForExpand.map((rec, si) => {
            const i = origIdx(si)
            return (
              <div key={i} className="group/item inline-flex items-baseline gap-[10px]">
                {si > 0 && <span className="text-muted-foreground/30 select-none">|</span>}
                {editIdx === i ? (
                  <DateInput
                    initial={rec.date}
                    onSave={(v) => { if (v) updateRecordDate(i, v); else { deleteRecord(i); setEditIdx(null) } }}
                    onCancel={() => setEditIdx(null)}
                  />
                ) : (
                  <span className="group/v relative inline-flex items-baseline">
                    <button
                      type="button"
                      onClick={() => setEditIdx(i)}
                      className="text-left rounded-md px-2 py-1 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-pointer"
                    >
                      {rec.date}
                    </button>
                    <CopyButton value={rec.date} className="ml-1 opacity-0 group-hover/v:opacity-100" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => deleteRecord(i)}
                  className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/item:opacity-100"
                >
                  ✕
                </button>
              </div>
            )
          })}

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

          {records.length === 0 && !addingNew && !extracting && (
            <button type="button" onClick={() => setAddingNew(true)}
              className="text-left rounded-md px-2 py-1 -mx-2 text-base text-muted-foreground/60 transition-colors hover:bg-accent/60 cursor-pointer">
              —
            </button>
          )}
          {extracting && (
            <span className="text-xs text-muted-foreground">추출 중...</span>
          )}
          {extractMsg && (
            <span className={cn('text-xs ml-2', extractMsg.includes('실패') || extractMsg.includes('오류') ? 'text-red-600' : 'text-green-600')}>
              {extractMsg}
            </span>
          )}
          {dragOver && (
            <span className="text-xs text-muted-foreground">이미지를 놓으면 자동 입력됩니다</span>
          )}
        </div>
      )}

      {/* Expanded view: detail cards, newest first */}
      {expanded && (
        <div className="min-w-0 space-y-2">
          {addingNew && (
            <div className="flex items-baseline gap-sm">
              <DateInput
                initial=""
                onSave={saveNewDate}
                onCancel={() => setAddingNew(false)}
              />
            </div>
          )}

          {/* Drop zone for NEW record */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropNew}
            className={cn(
              "text-xs text-muted-foreground/50 italic px-2 py-1 rounded-md border border-dashed border-border/40 transition-colors",
              dragOver && "bg-accent/40 ring-2 ring-ring/30 ring-dashed text-foreground",
            )}
          >
            {dragOver ? '새 기록으로 추가됩니다' : '이미지를 여기 드롭 → 새 접종 기록 추가'}
          </div>

          {sortedForExpand.map((rec, si) => {
            const oi = origIdx(si)
            // If user picked a specific parasite product, hints come from that product family.
            const hints = rec.product_id
              ? getDetailHintsById(rec.product_id, rec.date, weightKg)
              : getDetailHints(label, rec.date, species, weightKg)
            return (
              <div
                key={oi}
                data-record-idx={oi}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIdx(oi) }}
                onDragLeave={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIdx(null)
                }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  setDragOverIdx(null)
                  const file = Array.from(e.dataTransfer.files).find(isExtractableFile)
                  if (file) handleFile(file, oi)
                }}
                className={cn(
                  "group/item rounded-md transition-colors",
                  dragOverIdx === oi && "bg-accent/40 ring-2 ring-ring/30 ring-dashed",
                )}
              >
                {/* Row 1: date + valid_until */}
                <div className="flex items-baseline gap-[10px]">
                  {editIdx === oi ? (
                    <DateInput
                      initial={rec.date}
                      onSave={(v) => { if (v) updateRecordDate(oi, v); else { deleteRecord(oi); setEditIdx(null) } }}
                      onCancel={() => setEditIdx(null)}
                    />
                  ) : (
                    <button type="button" onClick={() => setEditIdx(oi)}
                      className="text-left rounded-md px-2 py-1 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-pointer">
                      {rec.date}
                    </button>
                  )}

                  {!hideValidUntil && (
                    <ValidUntilSelector
                      value={rec.valid_until}
                      onChange={(v) => updateRecordField(oi, 'valid_until', v)}
                      saving={saving}
                    />
                  )}

                  <button type="button" onClick={() => deleteRecord(oi)}
                    className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/item:opacity-100 ml-auto">
                    ✕
                  </button>
                </div>

                {/* Row 2: 제품명 | 제조사 | 제품번호 | 유효기간 */}
                <div className="flex items-baseline gap-[10px] ml-2 mt-0.5">
                  {productOptions.length > 0 ? (
                    <ProductDropdown
                      value={rec.product_id ?? null}
                      defaultName={hints.product ?? null}
                      options={productOptions}
                      onChange={(id) => updateProductId(oi, id)}
                      saving={saving}
                    />
                  ) : (
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
                  )}
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

/* ── Parasite product dropdown ── */

function ProductDropdown({ value, defaultName, options, onChange, saving }: {
  value: string | null
  defaultName: string | null
  options: ReturnType<typeof listParasiteFamilies>
  onChange: (id: string | null) => void
  saving: boolean
}) {
  const selected = value ? options.find(o => o.id === value) : null
  // Display: explicit pick = product name in normal color; default = "(자동)" hint
  const display = selected
    ? `${selected.name}${selected.kind === 'combo' ? ' (콤보)' : ''}`
    : (defaultName ? `(자동: ${defaultName})` : '제품명')

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={saving}
      className={cn(
        'text-xs rounded-md px-2 py-1 -mx-2 bg-transparent border-0 cursor-pointer transition-colors hover:bg-accent/60 focus:outline-none focus:ring-1 focus:ring-ring max-w-[180px]',
        !selected && 'text-muted-foreground/60',
        !selected && !defaultName && 'italic text-muted-foreground/40',
      )}
      title={display}
    >
      <option value="">{defaultName ? `(자동: ${defaultName})` : '(자동)'}</option>
      {options.map(opt => (
        <option key={opt.id} value={opt.id}>
          {opt.name}{opt.kind === 'combo' ? ' (콤보)' : ''}
        </option>
      ))}
    </select>
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

/* ── Valid-until selector (1년 / 2년 / 3년) ── */

function ValidUntilSelector({ value, onChange, saving }: {
  value?: string | null
  onChange: (v: string | null) => void
  saving: boolean
}) {
  // null/빈값은 1년 기본. "N년" 패턴이면 N 추출, 그 외 legacy 값은 선택 없음.
  const match = value?.match(/^(\d+)\s*년$/)
  const current = match ? match[1] : value ? null : '1'
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border/40 bg-background/50 p-0.5">
      {['1', '2', '3'].map(n => (
        <button
          key={n}
          type="button"
          disabled={saving}
          onClick={() => onChange(`${n}년`)}
          className={cn(
            'text-xs px-2 py-0.5 rounded transition-colors',
            current === n
              ? 'bg-[#5f5f5f] text-white'
              : 'text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground',
          )}
          title={`유효기간 ${n}년`}
        >
          {n}년
        </button>
      ))}
    </div>
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
      onChange={(e) => {
        // 달력 picker "삭제" 버튼이나 segment 전체 백스페이스로 ''가 되면 즉시 저장.
        if (e.target.value === '') saveFromRef()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => {
        saveFromRef()
      }, 150)}
      className="w-36 bg-transparent border-0 border-b border-primary text-xs py-1 focus:outline-none"
    />
  )
}
