'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, Plus, Trash2 } from 'lucide-react'
import { cn, roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { listParasiteFamilies, getParasiteFamily, type VaccineLookups } from '@petmove/domain'
import { useVaccineLookups } from '@/components/providers/vaccine-data-provider'
import { extractVaccineInfo } from '@/lib/actions/extract-vaccine'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'
import { severityTextClass, tooltipText, useFieldVerification } from './verification-context'
import { AttachButton } from '@/components/ui/attach-button'
import { DateTextField } from '@/components/ui/date-text-field'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface VacRecord {
  date: string
  valid_until?: string | null
  product?: string | null
  manufacturer?: string | null
  lot?: string | null
  expiry?: string | null
  /** Parasiticide product family selected by user (overrides date-based lookup). */
  product_id?: string | null
  /** 타병원 접종 — 별지25 / 별지25 EX에서는 제외, 국가별 서류에는 포함. */
  other_hospital?: boolean
}

interface Props {
  caseId: string
  caseRow: CaseRow
  label: string
  dataKey: string
  legacyKey?: string
  hideValidUntil?: boolean // 구충 등 유효기간 불필요한 항목
  /** 광견병 외 접종은 1년 고정. 셀렉터 비활성, 표시만 "1년". */
  lockOneYearValidity?: boolean
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

/**
 * 접종일 + 1년 유효기간의 **마지막 유효일** 반환.
 * 달력 +1년 후 동일 MM-DD 에서 하루 뺌 (윤년 처리됨).
 * 예: 2026-01-01 → 2026-12-31 (=접종일 +364일).
 */
function addOneYear(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return ''
  const d = new Date(`${parseInt(parts[0], 10) + 1}-${parts[1]}-${parts[2]}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 라벨과 접종일로 lookup 데이터를 VacRecord 형태로 반환 (expanded view 힌트용) */
function getDetailHints(L: VaccineLookups, label: string, date: string, species: string, weightKg = 0): Partial<VacRecord> {
  if (!date) return {}
  const sp: 'dog' | 'cat' = species === 'cat' ? 'cat' : 'dog'
  if (label === '광견병') {
    const r = L.lookupRabies(date)
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
    const r = L.lookupComprehensive(sp, date)
    if (!r) return {}
    return {
      product: r.vaccine || r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
      valid_until: addOneYear(date),
    }
  }
  if (label === '독감') {
    const r = L.lookupCiv(date)
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
    const r = L.lookupKennelCough()
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
    const r = L.lookupExternalParasite(sp, date, weightKg)
    if (!r) return {}
    return {
      product: r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
    }
  }
  if (label === '내부구충') {
    const r = L.lookupInternalParasite(sp, date, weightKg)
    if (!r) return {}
    return {
      product: r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
    }
  }
  if (label === '심장사상충') {
    const r = L.lookupHeartworm(sp, weightKg)
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
function getDetailHintsById(L: VaccineLookups, productId: string, date: string, weightKg: number): Partial<VacRecord> {
  const p = L.lookupParasiteById(productId, { date, weightKg })
  if (!p) return {}
  return {
    product: p.product || undefined,
    manufacturer: p.manufacturer || undefined,
    lot: p.batch || undefined,
    expiry: p.expiry || undefined,
  }
}

/** label → 'external' | 'internal' | 'heartworm' | null (for parasiticide rows only) */
function parasiteKindFromLabel(label: string): 'external' | 'internal' | 'heartworm' | null {
  if (label === '외부구충') return 'external'
  if (label === '내부구충') return 'internal'
  if (label === '심장사상충') return 'heartworm'
  return null
}

export function RepeatableDateField({ caseId, caseRow, label, dataKey, legacyKey, hideValidUntil, lockOneYearValidity, siblingKey }: Props) {
  const { updateLocalCaseField, replaceLocalCaseData } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()
  const L = useVaccineLookups()
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
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // 항목 클릭 시 열리는 편집 팝업.
  const [modalOpen, setModalOpen] = useState(false)
  // 모달 열릴 때 records 스냅샷 — 변경 감지용 (닫기 vs 저장 버튼 토글).
  const initialRecordsRef = useRef<string>('[]')

  // Which detail field is being edited (in expanded view)
  const [detailEdit, setDetailEdit] = useState<{ idx: number; field: keyof VacRecord } | null>(null)

  useEffect(() => {
    setEditIdx(null)
    setAddingNew(false)
    setDetailEdit(null)
    setExtractMsg(null)
    setDragOver(false)
    setModalOpen(false)
  }, [caseId])

  function openEditModal() {
    if (!editMode) return
    initialRecordsRef.current = JSON.stringify(records)
    setModalOpen(true)
    // 빈 상태에서 모달 열면 새 입력칸 자동 노출.
    if (records.length === 0) setAddingNew(true)
  }
  function closeEditModal() {
    setModalOpen(false)
    setAddingNew(false)
    setEditIdx(null)
    setDetailEdit(null)
  }

  async function saveRecords(next: VacRecord[]) {
    const val = next.length > 0 ? next : null
    // Optimistic — UI 즉시 반영. 서버 응답이 늦어도 토글이 즉시 반응함.
    const prevSnapshot = records
    updateLocalCaseField(caseId, 'data', dataKey, val)
    if (legacyKey && data[legacyKey]) {
      updateLocalCaseField(caseId, 'data', legacyKey, null)
      updateCaseField(caseId, 'data', legacyKey, null).catch(() => {})
    }
    const r = await updateCaseField(caseId, 'data', dataKey, val)
    if (!r.ok) {
      // 실패 시 rollback.
      updateLocalCaseField(caseId, 'data', dataKey, prevSnapshot.length > 0 ? prevSnapshot : null)
    } else if (r.autoFilled?.data) {
      // 자동 채움 결과를 로컬 케이스 컨텍스트에 통째 반영.
      replaceLocalCaseData(caseId, r.autoFilled.data)
    }

    // If clearing all records, remove this field from toggleable fields
    if (val === null) {
      const labelToToggleKey: Record<string, string> = {
        '종합백신': 'vaccine:general',
        '광견병': 'vaccine:rabies',
        '독감': 'vaccine:civ',
        '켄넬코프': 'vaccine:kennel',
        '코로나': 'vaccine:covid',
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
    // Optimistic — UI 즉시 반영.
    updateLocalCaseField(caseId, 'data', siblingKey, val)
    void updateCaseField(caseId, 'data', siblingKey, val)
  }

  function readSiblingRecords(): VacRecord[] {
    if (!siblingKey) return []
    const raw = data[siblingKey]
    if (!Array.isArray(raw)) return []
    return raw.map(item => (typeof item === 'string' ? { date: item } : (item as VacRecord)))
  }

  async function deleteRecord(idx: number) {
    const removed = records[idx]
    const ok = await confirm({
      message: `${label}${removed?.date ? ` (${removed.date})` : ''} 기록을 삭제하시겠습니까?`,
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const next = records.filter((_, i) => i !== idx)
    // useTransition 없이 직접 호출 — saveRecords 의 optimistic update 가 즉시 반영.
    void (async () => {
      await saveRecords(next)
      // If the deleted entry was a combo product, remove its mirror on the other side.
      if (removed?.product_id && getParasiteFamily(removed.product_id)?.kind === 'combo' && siblingKey) {
        const sib = readSiblingRecords()
        const sibNext = sib.filter(r => !(r.date === removed.date && r.product_id === removed.product_id))
        if (sibNext.length !== sib.length) await saveSiblingRecords(sibNext)
      }
    })()
  }

  function updateRecordDate(idx: number, value: string) {
    const target = records[idx]
    const oldDate = target?.date
    const next = records.map((r, i) => i === idx ? { ...r, date: value } : r)
    void (async () => {
      await saveRecords(next)
      // Keep combo mirror's date in sync.
      if (target?.product_id && getParasiteFamily(target.product_id)?.kind === 'combo' && siblingKey) {
        const sib = readSiblingRecords()
        const sibNext = sib.map(r =>
          r.product_id === target.product_id && r.date === oldDate ? { ...r, date: value } : r,
        )
        if (JSON.stringify(sibNext) !== JSON.stringify(sib)) await saveSiblingRecords(sibNext)
      }
    })()
    setEditIdx(null)
  }

  function updateRecordField(idx: number, field: keyof VacRecord, value: string | null) {
    // 빈 문자열은 "명시적으로 비움"을 의미 — 자동 추론값(hint) 폴백을 막는다.
    // null 은 "값 없음" — 자동 추론값이 hint 로 표시.
    const next = records.map((r, i) => i === idx ? { ...r, [field]: value } : r)
    saveRecords(next).catch(() => {})
    setDetailEdit(null)
  }

  function toggleOtherHospital(idx: number) {
    const next = records.map((r, i) => {
      if (i !== idx) return r
      const nextOther = !r.other_hospital
      if (!nextOther) {
        // 타병원 → 본 병원 전환: "명시 비움(빈 문자열)" 상태의 detail 필드를 null 로 되돌려
        // 자동 추론값(hint)이 다시 표시되게 한다. 사용자가 직접 입력한 값은 보존.
        return {
          ...r,
          other_hospital: false,
          product: r.product === '' ? null : r.product,
          manufacturer: r.manufacturer === '' ? null : r.manufacturer,
          lot: r.lot === '' ? null : r.lot,
          expiry: r.expiry === '' ? null : r.expiry,
        }
      }
      return { ...r, other_hospital: true }
    })
    // useTransition 없이 직접 호출 — saveRecords 내부에서 optimistic update 가 즉시 적용됨.
    saveRecords(next).catch(() => {})
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

    void (async () => {
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
    })()
  }

  function saveNewDate(value: string) {
    if (!value) { setAddingNew(false); return }
    const next = [...records, { date: value }]
    setAddingNew(false)
    saveRecords(next).catch(() => {})
  }

  /* ── AI extraction (image drop) ── */

  /**
   * targetIdx가 null이면 새 레코드 추가, 숫자면 해당 레코드의 약품 정보만 업데이트.
   */
  async function runVacExtract(input: { imageBase64?: string; mediaType?: string; text?: string }, targetIdx: number | null) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractVaccineInfo(input)
      if (result.ok) {
        const extracted = result.records
        if (extracted.length === 0) {
          setExtractMsg('추출 실패: 약품 정보를 찾을 수 없습니다')
        } else if (targetIdx !== null) {
          // 기존 레코드 업데이트 — 첫 번째 레코드만 사용 (카드별 업데이트 시 단일 레코드 가정)
          const top = extracted[0]
          const next = records.map((r, i) => i === targetIdx ? {
            ...r,
            date: top.date ?? r.date,
            valid_until: top.valid_until ?? r.valid_until,
            product: top.product ?? r.product,
            manufacturer: top.manufacturer ?? r.manufacturer,
            lot: top.lot ?? r.lot,
            expiry: top.expiry ?? r.expiry,
          } : r)
          await saveRecords(next)
          setExtractMsg(`약품 정보가 업데이트되었습니다`)
        } else {
          // 새 레코드 — 추출된 모든 항목을 각각 추가
          const newRecs: VacRecord[] = extracted.map(e => ({
            date: e.date ?? '',
            valid_until: e.valid_until ?? null,
            product: e.product,
            manufacturer: e.manufacturer,
            lot: e.lot,
            expiry: e.expiry,
          }))
          const next = [...records, ...newRecs]
          await saveRecords(next)
          const firstMissingDateOffset = newRecs.findIndex(r => !r.date)
          const anyMissingDate = firstMissingDateOffset !== -1
          setExtractMsg(
            extracted.length > 1
              ? `${label} 접종 ${extracted.length}건이 추가되었습니다${anyMissingDate ? '. 접종일을 입력하세요.' : '.'}`
              : anyMissingDate
                ? `${label} 약품 정보가 추가되었습니다. 접종일을 입력하세요.`
                : `${label} 정보가 추가되었습니다.`,
          )
          if (anyMissingDate) setEditIdx(records.length + firstMissingDateOffset)
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

  async function handleFile(file: File, targetIdx: number | null) {
    if (!isExtractableFile(file)) return
    uploadFileToNotes(caseId, caseRow, file, updateLocalCaseField).catch(() => {})
    const images = await filesToBase64([file])
    if (images.length === 0) return
    await runVacExtract({ imageBase64: images[0].base64, mediaType: images[0].mediaType }, targetIdx)
  }

  // ── Paste (Ctrl+V) ──
  // 모달이 열려 있으면 (모달 안에서) 항상 동작.
  // 모달이 닫혀있으면 인라인 영역(rootRef) 위에 hover 중일 때만 동작.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return

      // 모달 열림 우선 — 모달 영역에 paste.
      const inModal = modalOpen && !!modalRef.current
      const inRoot = !modalOpen && rootRef.current?.matches(':hover')
      if (!inModal && !inRoot) return

      const items = e.clipboardData?.items
      if (!items) return
      // 호버된 카드(모달 안 또는 인라인) 가 있으면 해당 레코드, 아니면 null(새 기록).
      const container = inModal ? modalRef.current : rootRef.current
      const hoveredCard = container?.querySelector('[data-record-idx]:hover') as HTMLElement | null
      let targetIdx: number | null = null
      if (hoveredCard) {
        const idx = Number(hoveredCard.dataset.recordIdx)
        if (!Number.isNaN(idx)) targetIdx = idx
      }
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            handleFile(file, targetIdx)
            return
          }
        }
      }
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (text && text.length > 10) {
        e.preventDefault()
        void runVacExtract({ text }, targetIdx)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, caseId, modalOpen])

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
      data-paste-section="repeatable-date"
      className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0 rounded-md transition-colors hover:bg-accent/60"
    >
      <div className="flex items-center gap-[6px] pt-1">
        {/* Label: 클릭 시 편집 모달 열림. */}
        <button
          type="button"
          onClick={openEditModal}
          disabled={!editMode || saving}
          className={cn(
            'font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground transition-colors',
            editMode && 'hover:text-foreground cursor-pointer',
          )}
          title={editMode ? `${label} 편집` : undefined}
        >
          {label}
        </button>
      </div>

      {/* 인라인: 날짜 chips 만 (간결). 클릭하면 모달 열림.
          많아질 경우 줄 바꿈 대신 가로 스크롤. */}
      <div className="min-w-0 flex items-baseline gap-[10px] pt-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {sortedForExpand.length === 0 ? null : (
          sortedForExpand.map((rec, si) => (
            <InlineDateChip
              key={si}
              path={`${dataKey}[${origIdx(si)}].date`}
              date={rec.date}
              separator={si > 0}
              onClick={openEditModal}
            />
          ))
        )}
      </div>

      {/* 편집 모달 — 클릭 시 createPortal 로 띄움. */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-md">
          <div className="absolute inset-0 bg-black/40" onClick={closeEditModal} />
          <div
            ref={modalRef}
            data-paste-section="repeatable-date-modal"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropNew}
            className={cn(
              "relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-border/80 bg-background shadow-xl transition-colors",
              dragOver && "bg-accent/40 ring-2 ring-ring/30 ring-dashed",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-md px-md py-3 border-b border-border/80">
              <h2 className="font-serif text-[18px] text-foreground">{label}</h2>
              <div className="flex items-center gap-1">
                <AttachButton
                  accept="image/*,.pdf"
                  onFile={(f) => handleFile(f, null)}
                  disabled={extracting}
                  cropMode="fixed"
                  className={roundIconBtn}
                  title="이미지/PDF 로 새 기록 추출 (모바일 카메라 시 자동 크롭)"
                >
                  <Paperclip size={14} />
                </AttachButton>
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  disabled={addingNew || saving}
                  className={roundIconBtn}
                  title="기록 추가"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto px-md py-md space-y-2 scrollbar-minimal">
              {addingNew && (
                <div className="flex items-baseline gap-sm">
                  <DateInput
                    initial=""
                    onSave={saveNewDate}
                    onCancel={() => setAddingNew(false)}
                  />
                </div>
              )}

              {extracting && (
                <div className="text-xs text-muted-foreground">추출 중...</div>
              )}
              {extractMsg && (
                <div className={cn('text-xs', extractMsg.includes('실패') || extractMsg.includes('오류') ? 'text-red-600' : 'text-green-600')}>
                  {extractMsg}
                </div>
              )}
              {dragOver && (
                <div className="text-xs text-muted-foreground italic">놓으면 자동 입력</div>
              )}

              {sortedForExpand.length === 0 && !addingNew && !extracting && (
                <div className="text-[13px] italic text-muted-foreground/60">기록이 없습니다. 위의 "추가" 버튼으로 새 기록을 추가하세요.</div>
              )}

              {sortedForExpand.map((rec, si) => {
                const oi = origIdx(si)
                const hints = rec.product_id
                  ? getDetailHintsById(L, rec.product_id, rec.date, weightKg)
                  : getDetailHints(L, label, rec.date, species, weightKg)
                const suppressHints = !!rec.other_hospital
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
                      "group/item rounded-md p-2 border border-border/40 transition-colors",
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
                        <ExpandedDateButton
                          path={`${dataKey}[${oi}].date`}
                          date={rec.date}
                          onClick={() => setEditIdx(oi)}
                        />
                      )}

                      {!hideValidUntil && (
                        <ValidUntilSelector
                          value={rec.valid_until}
                          onChange={(v) => updateRecordField(oi, 'valid_until', v)}
                          saving={saving}
                          locked={lockOneYearValidity}
                        />
                      )}

                      <div className="flex items-center gap-1 ml-auto">
                        <AttachButton
                          accept="image/*,.pdf"
                          onFile={(f) => handleFile(f, oi)}
                          disabled={extracting}
                          cropMode="fixed"
                          title="이 기록에 이미지/PDF 추출 (모바일 카메라 시 자동 크롭)"
                          className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground hover:bg-accent/40"
                        >
                          <Paperclip size={13} />
                        </AttachButton>
                        <button
                          type="button"
                          onClick={() => deleteRecord(oi)}
                          title="삭제"
                          className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: 제품명 | 제조사 | 제품번호 | 유효기간 */}
                    <div className="flex items-baseline gap-[10px] ml-2 mt-1 flex-wrap">
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
                          suppressHint={suppressHints}
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
                        suppressHint={suppressHints}
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
                        suppressHint={suppressHints}
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
                            suppressHint={suppressHints}
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

                    {/* Row 3: 타병원 접종 체크 */}
                    {OTHER_HOSPITAL_LABELS.has(label) && (
                      <div className="ml-2 mt-1">
                        <button
                          type="button"
                          onClick={() => toggleOtherHospital(oi)}
                          aria-pressed={!!rec.other_hospital}
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground cursor-pointer select-none"
                        >
                          <span
                            className={cn(
                              'inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border transition-colors',
                              rec.other_hospital
                                ? 'bg-[#D9A489] border-[#D9A489] dark:bg-[#C08C70] dark:border-[#C08C70]'
                                : 'border-foreground/40 bg-transparent',
                            )}
                          >
                            {rec.other_hospital && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6L5 8.5L9.5 4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          타병원 접종
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-md py-2 border-t border-border/80 bg-background/95">
              {(() => {
                const hasChanges = JSON.stringify(records) !== initialRecordsRef.current
                return (
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className={cn(
                      'h-7 px-3 rounded-full border text-[13px] transition-colors',
                      hasChanges
                        ? 'border-[#D9A489] bg-[#D9A489]/15 text-[#A87862] hover:bg-[#D9A489]/25 dark:border-[#C08C70] dark:bg-[#C08C70]/15 dark:text-[#D9A489] dark:hover:bg-[#C08C70]/25'
                        : 'border-border/80 bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40',
                    )}
                  >
                    {hasChanges ? '저장' : '닫기'}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ── 인라인 날짜 chip (verification color 적용) ── */

function InlineDateChip({ path, date, separator, onClick }: { path: string; date: string; separator: boolean; onClick?: () => void }) {
  const editMode = useSectionEditMode()
  const info = useFieldVerification(path)
  const colorCls = info ? severityTextClass(info.severity) : ''
  const title = info ? tooltipText(info) : undefined
  const baseCls = cn('font-mono text-[15px] tracking-[0.3px] text-foreground', colorCls)
  return (
    <span className="inline-flex items-baseline gap-[10px]">
      {separator && <span className="text-muted-foreground/30 select-none">|</span>}
      {editMode && onClick ? (
        <button type="button" onClick={onClick} title={title}
          className={cn('rounded-md px-1 py-0.5 -mx-1 hover:bg-accent/60 transition-colors cursor-pointer', baseCls)}
        >
          {date}
        </button>
      ) : (
        <span title={title} className={baseCls}>{date}</span>
      )}
    </span>
  )
}

/** 타병원 접종 체크박스를 노출할 백신 라벨. 별지25·별지25 EX에서 제외 대상. */
const OTHER_HOSPITAL_LABELS = new Set(['광견병', '종합백신', '독감', '켄넬코프'])

/* ── Date button with verification color ── */

function ExpandedDateButton({ path, date, onClick }: { path: string; date: string; onClick: () => void }) {
  const editMode = useSectionEditMode()
  const info = useFieldVerification(path)
  const colorCls = info ? severityTextClass(info.severity) : ''
  const title = info ? tooltipText(info) : undefined
  if (!editMode) {
    return (
      <span
        title={title}
        className={cn(
          'rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground',
          colorCls,
        )}
      >
        {date}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
        colorCls,
      )}
    >
      {date}
    </button>
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
  const editMode = useSectionEditMode()
  const selected = value ? options.find(o => o.id === value) : null
  // Display: explicit pick = product name in normal color; default = "(자동)" hint
  const display = selected
    ? `${selected.name}${selected.kind === 'combo' ? ' (콤보)' : ''}`
    : (defaultName ? `(자동: ${defaultName})` : '제품명')

  if (!editMode) {
    if (!selected && !defaultName) return null
    return (
      <span className={cn(
        'inline-block rounded-md px-2 py-1 -mx-2 text-xs',
        !selected && 'text-muted-foreground/70',
      )} title={display}>
        {display}
      </span>
    )
  }

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

function DetailField({ value, hint, suppressHint, type, placeholder, isEditing, onStartEdit, onSave, onCancel, saving }: {
  value?: string | null
  /** lookup 으로 자동 추론된 값 — 사용자 입력(value) 없을 때 hint 를 옅게 표시. */
  hint?: string | null
  /** true 면 hint 표시 억제 (예: 타병원 접종 record 의 detail 필드). */
  suppressHint?: boolean
  type?: 'text' | 'date'
  placeholder: string
  isEditing: boolean
  onStartEdit: () => void
  onSave: (v: string | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const editMode = useSectionEditMode()
  const effectiveHint = suppressHint ? null : hint
  const cleared = value === ''
  const hasValue = !cleared && !!value
  const hasHint = !hasValue && !cleared && !!effectiveHint
  // 우선순위: 사용자 입력 > "명시적으로 비움" > 자동 추론 hint > placeholder
  const display = hasValue ? (value as string) : cleared ? '—' : (effectiveHint || placeholder)

  if (isEditing) {
    return type === 'date' ? (
      <DateInput initial={value || ''} onSave={(v) => onSave(v)} onCancel={onCancel} onClearAuto={() => onSave(null)} />
    ) : (
      <TextInput initial={value || ''} placeholder={placeholder} onSave={(v) => onSave(v)} onCancel={onCancel} saving={saving} onClearAuto={() => onSave(null)} />
    )
  }

  if (!editMode) {
    // 읽기 모드: hint(자동 추론)는 표시하되 placeholder/cleared/—는 숨김.
    if (!hasValue && !hasHint) return null
    return (
      <span className={cn(
        'inline-block rounded-md px-2 py-1 -mx-2 text-xs',
        hasHint && 'text-muted-foreground/70',
      )}>
        {display}
      </span>
    )
  }

  return (
    <button type="button" onClick={onStartEdit}
      title={
        hasHint
          ? '자동 추론값 — 클릭하여 직접 입력'
          : cleared
          ? '명시적으로 비움 — 클릭하여 입력'
          : undefined
      }
      className={cn(
        'text-left rounded-md px-2 py-1 -mx-2 text-xs transition-colors hover:bg-accent/60 cursor-text',
        !hasValue && !hasHint && !cleared && 'text-muted-foreground/40 italic',
        hasHint && 'text-muted-foreground/70',
        cleared && 'text-muted-foreground/50',
      )}>
      {display}
    </button>
  )
}

/* ── Valid-until selector (1년 / 2년 / 3년) ── */

function ValidUntilSelector({ value, onChange, saving, locked }: {
  value?: string | null
  onChange: (v: string | null) => void
  saving: boolean
  locked?: boolean
}) {
  const editMode = useSectionEditMode()
  // null/빈값은 1년 기본. "N년" 패턴이면 N 추출, 그 외 legacy 값은 선택 없음.
  const match = value?.match(/^(\d+)\s*년$/)
  const current = match ? match[1] : value ? null : '1'

  // 광견병 외 접종은 1년 고정 — 셀렉터 비활성, 표시만.
  if (locked) {
    return (
      <span className="inline-block rounded-md px-2 py-0.5 text-xs text-muted-foreground/70" title="유효기간 1년 (고정)">
        1년
      </span>
    )
  }

  if (!editMode) {
    if (!current) return null
    return (
      <span className="inline-block rounded-md px-2 py-0.5 text-xs text-muted-foreground/70" title={`유효기간 ${current}년`}>
        {current}년
      </span>
    )
  }

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

function TextInput({ initial, placeholder, onSave, onCancel, saving, onClearAuto }: {
  initial: string
  placeholder: string
  onSave: (v: string) => void
  onCancel: () => void
  saving: boolean
  /** 있으면 입력칸 옆에 "자동" 버튼 노출 — 클릭 시 값을 null 로 되돌려 자동 추론값 사용. */
  onClearAuto?: () => void
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)
  useEffect(() => { ref.current?.focus() }, [])

  const submit = (v: string) => {
    if (submittedRef.current) return
    submittedRef.current = true
    // 변경 없으면 저장 안 함 — 자동 추론값(hint) 표시 상태에서 클릭만 하고 빠져나갈 때
    // initial='' 이라 빈 문자열을 명시 비움으로 저장해버리는 버그 방지.
    if (v === initial) {
      onCancel()
      return
    }
    onSave(v)
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input ref={ref} type="text" value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(val.trim()); if (e.key === 'Escape') onCancel() }}
        onBlur={() => setTimeout(() => { if (!saving) submit(val.trim()) }, 150)}
        placeholder={placeholder}
        className="w-28 h-7 rounded-md border border-border/80 bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
      />
      {onClearAuto && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); submittedRef.current = true; onClearAuto() }}
          title="자동 추론값으로 되돌리기"
          className="h-7 px-1.5 rounded text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/60 transition-colors whitespace-nowrap"
        >
          자동
        </button>
      )}
    </span>
  )
}

/* ── Date input ── */

function DateInput({ initial, onSave, onCancel, onClearAuto }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
  onClearAuto?: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <DateTextField
        autoFocus
        value={initial}
        onChange={(v) => onSave(v)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        skipClearConfirm
        className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
      />
      {onClearAuto && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onClearAuto() }}
          title="자동 추론값으로 되돌리기"
          className="h-7 px-1.5 rounded text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/60 transition-colors whitespace-nowrap"
        >
          자동
        </button>
      )}
    </span>
  )
}
