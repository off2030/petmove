'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, Plus, Trash2 } from 'lucide-react'
import { AttachButton } from '@/components/ui/attach-button'
import { DropdownSelect } from '@/components/ui/dropdown-select'
import { cn, roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { labColor } from '@/lib/lab-color'
import { extractTiterInfo } from '@/lib/actions/extract-titer'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { resolveTiterLab, type InspectionLabRule } from '@petmove/domain'
import { severityTextClass, tooltipText, useFieldVerification } from './verification-context'
import { DateTextField } from '@/components/ui/date-text-field'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface TiterRecord {
  date: string | null
  value: string | null
  lab: string | null
  /** Legacy field — older rows may carry `received_date`. UI 에는 노출 안 함. */
  received_date?: string | null
}

const LABS = [
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
]

const DATA_KEY = 'rabies_titer_records'

/**
 * 검사 수치에서 단위(IU/mL) 와 비교 부호 외 잡문자 제거.
 * 표시 시 항상 ' IU/ml' 가 덧붙으므로, 저장 값엔 절대 단위를 남기지 않는다.
 */
function stripTiterUnit(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/\s*IU\s*\/\s*m[lL]\s*/gi, '').trim()
  return cleaned || null
}

/**
 * 광견병항체 검사기관 자동 감지 — 단일 목적지일 때만.
 */
function autoDetectLab(
  destination: string | null | undefined,
  rules: InspectionLabRule[],
  defaultLab: string,
): string | null {
  if (!destination) return defaultLab
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  if (dests.length !== 1) return null
  return resolveTiterLab(dests[0], rules, defaultLab)
}

export function RabiesTiterField({ caseId, caseRow, destination }: { caseId: string; caseRow: CaseRow; destination?: string | null }) {
  const { updateLocalCaseField, inspectionConfig } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  function readRecords(): TiterRecord[] {
    if (Array.isArray(data[DATA_KEY])) return data[DATA_KEY] as TiterRecord[]
    if (data.rabies_titer_test_date || data.rabies_titer || data.rabies_titer_lab) {
      return [{
        date: (data.rabies_titer_test_date as string) || null,
        value: (data.rabies_titer as string) || null,
        lab: (data.rabies_titer_lab as string) || null,
      }]
    }
    return []
  }

  const records = readRecords()
  const sortedForExpand = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const [saving] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editField, setEditField] = useState<'date' | 'value' | 'lab' | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // 항목 클릭 시 열리는 편집 팝업.
  const [modalOpen, setModalOpen] = useState(false)
  // 모달 열릴 때 records 스냅샷 — 변경 감지용 (닫기 vs 저장 버튼 토글).
  const initialRecordsRef = useRef<string>('[]')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setEditIdx(null)
    setEditField(null)
    setAddingNew(false)
    setExtractMsg(null)
    setDragOver(false)
    setModalOpen(false)
  }, [caseId])

  function openEditModal() {
    if (!editMode) return
    initialRecordsRef.current = JSON.stringify(records)
    setModalOpen(true)
    if (records.length === 0) setAddingNew(true)
  }
  function closeEditModal() {
    setModalOpen(false)
    setAddingNew(false)
    setEditIdx(null)
    setEditField(null)
  }

  const isAU = !!destination && destination.split(',').some(d => {
    const t = d.trim().toLowerCase()
    return t === '호주' || t === 'australia'
  })

  async function saveRecords(next: TiterRecord[]) {
    const val = next.length > 0 ? next : null
    const prevSnapshot = records
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (!r.ok) {
      updateLocalCaseField(caseId, 'data', DATA_KEY, prevSnapshot.length > 0 ? prevSnapshot : null)
    }
  }

  async function runTiterExtract(input: { imageBase64?: string; mediaType?: string; text?: string }, targetIdx: number | null) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractTiterInfo(input)
      if (!result.ok) {
        setExtractMsg('추출 실패: ' + result.error)
        return
      }
      const xValue = stripTiterUnit(result.data.value)
      const xReceived = result.data.sample_received_date

      let nextRecords: TiterRecord[] = records
      let createdNewRecord = false
      let createdAtIdx: number | null = null

      if (targetIdx !== null && records[targetIdx]) {
        // 특정 record 업데이트 — 빈 필드만 채움.
        nextRecords = records.map((r, i) => i === targetIdx ? {
          ...r,
          value: r.value || xValue || null,
        } : r)
      } else if (xValue) {
        // 새 record — 추출된 값을 가진 신규 row.
        const detectedLab = autoDetectLab(destination, inspectionConfig.titerRules, inspectionConfig.titerDefault)
        nextRecords = [...records, { date: null, value: xValue, lab: detectedLab }]
        createdAtIdx = records.length
        createdNewRecord = true
      }

      const applied = { value: false, received: false }
      if (xValue && nextRecords !== records) applied.value = true

      if (nextRecords !== records) {
        await saveRecords(nextRecords)
        if (createdNewRecord && createdAtIdx !== null) {
          // legacy 'done' 상속 방지 — 새 회차 'waiting' 명시.
          const statusKey = `inspection_status_titer_${createdAtIdx}`
          updateLocalCaseField(caseId, 'data', statusKey, 'waiting')
          void updateCaseField(caseId, 'data', statusKey, 'waiting')
        }
      }

      // 호주: sample_received_date 가 비어있으면 기록.
      if (isAU && xReceived) {
        const auPrev = (data.australia_extra as Record<string, unknown> | undefined) ?? {}
        const auExistingReceived = typeof auPrev.sample_received_date === 'string' ? auPrev.sample_received_date : null
        if (!auExistingReceived) {
          const nextAu = { ...auPrev, sample_received_date: xReceived }
          updateLocalCaseField(caseId, 'data', 'australia_extra', nextAu)
          applied.received = true
          void updateCaseField(caseId, 'data', 'australia_extra', nextAu)
        }
      }

      const msgs: string[] = []
      if (applied.value) msgs.push('수치')
      if (applied.received) msgs.push('샘플수령일')
      setExtractMsg(msgs.length > 0 ? `${msgs.join('·')} 업데이트됨` : '새로운 정보가 없습니다')
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
    await runTiterExtract({ imageBase64: images[0].base64, mediaType: images[0].mediaType }, targetIdx)
  }

  // Paste 처리 — 모달 열려있으면 모달 안에서, 아니면 root hover 시.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      const inModal = modalOpen && !!modalRef.current
      const inRoot = !modalOpen && rootRef.current?.matches(':hover')
      if (!inModal && !inRoot) return
      const items = e.clipboardData?.items
      if (!items) return
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
          if (file) { e.preventDefault(); handleFile(file, targetIdx); return }
        }
      }
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (text && text.length > 10) {
        e.preventDefault()
        void runTiterExtract({ text }, targetIdx)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, records, destination, modalOpen])

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

  async function deleteRecord(idx: number) {
    const target = records[idx]
    const ok = await confirm({
      message: `광견병항체검사${target?.date ? ` (${target.date})` : ''} 기록을 삭제하시겠습니까?`,
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const next = records.filter((_, i) => i !== idx)
    saveRecords(next).catch(() => {})
  }

  function updateRecord(idx: number, field: keyof TiterRecord, value: unknown) {
    // value 필드는 IU/mL 단위 자동 strip.
    const cleaned = field === 'value' ? stripTiterUnit(typeof value === 'string' ? value : null) : (value || null)
    const next = records.map((rec, i) => i === idx ? { ...rec, [field]: cleaned } : rec)
    saveRecords(next).catch(() => {})
  }

  function saveNewDate(date: string) {
    if (!date) { setAddingNew(false); return }
    const detectedLab = autoDetectLab(destination, inspectionConfig.titerRules, inspectionConfig.titerDefault)
    const newIdx = records.length
    const next = [...records, { date, value: null, lab: detectedLab }]
    setAddingNew(false)
    void (async () => {
      await saveRecords(next)
      const statusKey = `inspection_status_titer_${newIdx}`
      updateLocalCaseField(caseId, 'data', statusKey, 'waiting')
      void updateCaseField(caseId, 'data', statusKey, 'waiting')
    })()
  }

  function origIdx(sortedIdx: number): number {
    const rec = sortedForExpand[sortedIdx]
    return records.indexOf(rec)
  }

  return (
    <div
      ref={rootRef}
      data-paste-section="rabies-titer"
      className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0 rounded-md transition-colors hover:bg-accent/60"
    >
      <div className="flex items-center gap-[6px] pt-1">
        <button
          type="button"
          onClick={openEditModal}
          disabled={!editMode || saving}
          className={cn(
            'font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground transition-colors',
            editMode && 'hover:text-foreground cursor-pointer',
          )}
          title={editMode ? '광견병항체검사 편집' : undefined}
        >
          광견병항체검사
        </button>
      </div>

      {/* 인라인: 날짜 chips. 클릭하면 모달 열림. */}
      <div className="min-w-0 flex items-baseline gap-[10px] pt-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {sortedForExpand.length === 0 ? null : (
          sortedForExpand.map((rec, si) => (
            <InlineDateChip
              key={si}
              path={`${DATA_KEY}[${origIdx(si)}].date`}
              date={rec.date}
              separator={si > 0}
              onClick={openEditModal}
            />
          ))
        )}
      </div>

      {/* 편집 모달 */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-md">
          <div className="absolute inset-0 bg-black/40" onClick={closeEditModal} />
          <div
            ref={modalRef}
            data-paste-section="rabies-titer-modal"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropNew}
            className={cn(
              'relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-border/80 bg-background shadow-xl transition-colors',
              dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-md px-md py-3 border-b border-border/80">
              <h2 className="font-serif text-[18px] text-foreground">광견병항체검사</h2>
              <div className="flex items-center gap-1">
                <AttachButton
                  accept="image/*,.pdf"
                  onFile={(f) => handleFile(f, null)}
                  disabled={extracting}
                  className={roundIconBtn}
                  title="이미지/PDF 로 새 기록 추출"
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
                <div className={cn('text-xs', extractMsg.includes('실패') || extractMsg.includes('오류') ? 'text-destructive' : 'text-pmw-positive')}>
                  {extractMsg}
                </div>
              )}
              {dragOver && (
                <div className="text-xs text-muted-foreground italic">놓으면 자동 입력</div>
              )}

              {sortedForExpand.length === 0 && !addingNew && !extracting && (
                <div className="text-[13px] italic text-muted-foreground/60">
                  기록이 없습니다. 위의 &quot;추가&quot; 버튼으로 새 기록을 추가하세요.
                </div>
              )}

              {sortedForExpand.map((rec, si) => {
                const oi = origIdx(si)
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
                      'group/item rounded-md p-2 border border-border/40 transition-colors',
                      dragOverIdx === oi && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
                    )}
                  >
                    <TiterRecordRow
                      record={rec}
                      recordIdx={oi}
                      isEditing={editIdx === oi ? editField : null}
                      onStartEdit={(f) => { setEditIdx(oi); setEditField(f) }}
                      onStopEdit={() => { setEditIdx(null); setEditField(null) }}
                      onUpdateField={(f, v) => updateRecord(oi, f, v)}
                      onDelete={() => deleteRecord(oi)}
                      onAttachFile={(f) => handleFile(f, oi)}
                      saving={saving}
                      extracting={extracting}
                    />
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
                        ? 'border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25'
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

function InlineDateChip({ path, date, separator, onClick }: { path: string; date: string | null; separator: boolean; onClick?: () => void }) {
  const editMode = useSectionEditMode()
  const info = useFieldVerification(path)
  const colorCls = info ? severityTextClass(info.severity) : ''
  const title = info ? tooltipText(info) : undefined
  const display = date || '—'
  const baseCls = cn('font-mono text-[15px] tracking-[0.3px] text-foreground', !date && 'font-sans text-base text-muted-foreground/40', colorCls)
  return (
    <span className="inline-flex items-baseline gap-[10px]">
      {separator && <span className="text-muted-foreground/30 select-none">|</span>}
      {editMode && onClick ? (
        <button type="button" onClick={onClick} title={title}
          className={cn('rounded-md px-1 py-0.5 -mx-1 hover:bg-accent/60 transition-colors cursor-pointer', baseCls)}
        >
          {display}
        </button>
      ) : (
        <span title={title} className={baseCls}>{display}</span>
      )}
    </span>
  )
}

/* ── 모달 안의 단일 record row: date | lab | value | attach | delete ── */

function TiterRecordRow({
  record, recordIdx, isEditing, onStartEdit, onStopEdit, onUpdateField, onDelete, onAttachFile, saving, extracting,
}: {
  record: TiterRecord
  recordIdx: number
  isEditing: 'date' | 'value' | 'lab' | null
  onStartEdit: (f: 'date' | 'value' | 'lab') => void
  onStopEdit: () => void
  onUpdateField: (f: keyof TiterRecord, v: unknown) => void
  onDelete: () => void
  onAttachFile: (file: File) => void
  saving: boolean
  extracting: boolean
}) {
  const cleanValue = stripTiterUnit(record.value)
  const valueDisplay = cleanValue ? `${cleanValue} IU/ml` : 'IU/ml'
  const labObj = LABS.find(l => l.value === record.lab)
  const labDisplay = labObj?.label || record.lab || '—'
  const labTone = labColor(record.lab)
  const dateInfo = useFieldVerification(`${DATA_KEY}[${recordIdx}].date`)
  const dateColorCls = dateInfo ? severityTextClass(dateInfo.severity) : ''
  const dateTitle = dateInfo ? tooltipText(dateInfo) : undefined

  return (
    <div className="flex items-baseline gap-[10px] flex-wrap">
      {/* Date */}
      {isEditing === 'date' ? (
        <DateInput
          initial={record.date || ''}
          onSave={(v) => { if (!v) onDelete(); else onUpdateField('date', v); onStopEdit() }}
          onCancel={onStopEdit}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('date')} title={dateTitle}
          className={cn(
            'text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
            !record.date && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60',
            dateColorCls,
          )}>
          {record.date || '—'}
        </button>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Lab — DropdownSelect 통일. trigger 가 lab chip. */}
      <DropdownSelect
        value={record.lab ?? ''}
        options={[{ value: '', label: '—' }, ...LABS]}
        onChange={(v) => onUpdateField('lab', v || null)}
        triggerClassName={cn(
          'text-left',
          labTone
            ? cn('inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap hover:opacity-80', labTone.bg, labTone.text)
            : cn('text-base rounded-md px-2 py-1 -mx-2 hover:bg-accent/60', labDisplay === '—' && 'text-muted-foreground/60'),
        )}
        renderTrigger={() => labDisplay}
      />

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Value */}
      {isEditing === 'value' ? (
        <ValueInput
          initial={cleanValue || ''}
          onSave={(v) => { onUpdateField('value', v || null); onStopEdit() }}
          onCancel={onStopEdit}
          saving={saving}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('value')}
          className={cn(
            'text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
            !cleanValue && 'font-sans italic text-[13px] font-normal tracking-normal text-muted-foreground/60',
          )}>
          {valueDisplay}
        </button>
      )}

      <div className="flex items-center gap-1 ml-auto">
        <AttachButton
          accept="image/*,.pdf"
          onFile={onAttachFile}
          disabled={extracting}
          title="이 기록에 이미지/PDF 추출"
          className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground hover:bg-accent/40"
        >
          <Paperclip size={13} />
        </AttachButton>
        <button
          type="button"
          onClick={onDelete}
          title="삭제"
          className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

/* ── Sub-field inputs ── */

function DateInput({ initial, onSave, onCancel }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void
}) {
  return (
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
  )
}

function ValueInput({ initial, onSave, onCancel, saving }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void; saving: boolean
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)
  useEffect(() => { ref.current?.focus() }, [])

  function submit(v: string) {
    if (submittedRef.current) return
    submittedRef.current = true
    onSave(v)
  }

  return (
    <input ref={ref} type="text" value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(val.trim()); if (e.key === 'Escape') onCancel() }}
      onBlur={() => setTimeout(() => { if (!saving) submit(val.trim()) }, 150)}
      placeholder="수치"
      className="w-24 h-8 rounded-md border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

// LabDropdown 제거 — DropdownSelect (components/ui/dropdown-select.tsx) 로 통일.
