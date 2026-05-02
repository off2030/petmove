'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { AttachButton } from '@/components/ui/attach-button'
import { cn } from '@/lib/utils'
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
  /**
   * Legacy field — older rows may still carry `received_date` from when the
   * Australia titer row displayed it inline. No longer shown or edited in the
   * UI; the value now lives at `data.australia_extra.sample_received_date`.
   * Kept in the type so existing rows deserialize without warnings.
   */
  received_date?: string | null
}

const LABS = [
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
]

const DATA_KEY = 'rabies_titer_records'

type TiterEditField = 'date' | 'value' | 'lab'

/**
 * 검사 수치에서 단위(IU/mL) 와 비교 부호 외 잡문자 제거.
 * 표시 시 항상 ' IU/ml' 가 덧붙으므로, 저장 값엔 절대 단위를 남기지 않는다.
 * 예: "41.59 IU/ml" → "41.59", "≥0.5 IU/mL" → "≥0.5".
 */
function stripTiterUnit(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/\s*IU\s*\/\s*m[lL]\s*/gi, '').trim()
  return cleaned || null
}

/**
 * 광견병항체 검사기관 자동 감지.
 * 설정(app_settings.inspection_config) 의 국가별 override 를 우선 적용, 없으면 default.
 * 복수 목적지는 미지정(null) 반환.
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

  // Read array (backward compat: old flat keys)
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
  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editField, setEditField] = useState<TiterEditField | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setEditIdx(null)
    setEditField(null)
    setAddingNew(false)
    setExtractMsg(null)
    setDragOver(false)
  }, [caseId])

  const isAU = !!destination && destination.split(',').some(d => {
    const t = d.trim().toLowerCase()
    return t === '호주' || t === 'australia'
  })

  async function runTiterExtract(input: { imageBase64?: string; mediaType?: string; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractTiterInfo(input)
      if (!result.ok) {
        setExtractMsg('추출 실패: ' + result.error)
        return
      }
      // 추출된 value 에서 단위(IU/mL) 제거 — 표시 시 항상 ' IU/ml' 가 덧붙어 중복 방지.
      const xValue = stripTiterUnit(result.data.value)
      const { sample_received_date: xReceived } = result.data
      const existing = records[0]
      const targetIdx = existing ? 0 : null

      // records 업데이트: 기존 값 보존, 빈 필드에만 채움 (date 는 추출 대상 아님 — 수동 입력 유지)
      let nextRecords: TiterRecord[] = records
      let createdNewRecord = false
      if (targetIdx === null) {
        if (xValue) {
          const detectedLab = autoDetectLab(destination, inspectionConfig.titerRules, inspectionConfig.titerDefault)
          nextRecords = [{ date: null, value: xValue, lab: detectedLab }]
          createdNewRecord = true
        }
      } else {
        nextRecords = records.map((r, i) => i === targetIdx ? {
          ...r,
          value: r.value || xValue || null,
        } : r)
      }

      const applied = { value: false, received: false }
      if (targetIdx === null) {
        if (xValue) applied.value = true
      } else if (xValue && !existing?.value) {
        applied.value = true
      }

      if (nextRecords !== records) {
        await saveRecords(nextRecords)
        // 새 record 가 idx 0 에 생성된 경우 — saveNewRecord 와 동일하게
        // legacy 'done' 상속 방지 위해 명시적 'waiting' 저장.
        if (createdNewRecord) {
          updateLocalCaseField(caseId, 'data', 'inspection_status_titer_0', 'waiting')
          void updateCaseField(caseId, 'data', 'inspection_status_titer_0', 'waiting')
        }
      }

      // 호주인 경우에만 sample_received_date 저장
      if (isAU && xReceived) {
        const auPrev = (data.australia_extra as Record<string, unknown> | undefined) ?? {}
        const auExistingReceived = typeof auPrev.sample_received_date === 'string' ? auPrev.sample_received_date : null
        if (!auExistingReceived) {
          const nextAu = { ...auPrev, sample_received_date: xReceived }
          // Optimistic — UI 즉시 반영.
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

  async function handleFile(file: File) {
    if (!isExtractableFile(file)) return
    uploadFileToNotes(caseId, caseRow, file, updateLocalCaseField).catch(() => {})
    const images = await filesToBase64([file])
    if (images.length === 0) return
    await runTiterExtract({ imageBase64: images[0].base64, mediaType: images[0].mediaType })
  }

  function handleDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    setDragOver(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = Array.from(e.dataTransfer.files).find(isExtractableFile)
    if (file) handleFile(file)
  }

  // 루트 영역 hover 중일 때 Ctrl+V 붙여넣기 → 이미지 파일로 처리
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!rootRef.current) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      if (!rootRef.current.matches(':hover')) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) { e.preventDefault(); handleFile(file); return }
        }
      }
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (text && text.length > 10) {
        e.preventDefault()
        void runTiterExtract({ text })
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, records, destination])

  async function saveRecords(next: TiterRecord[]) {
    const val = next.length > 0 ? next : null
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const prevSnapshot = records
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (!r.ok) {
      updateLocalCaseField(caseId, 'data', DATA_KEY, prevSnapshot.length > 0 ? prevSnapshot : null)
    }
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
    const next = records.map((rec, i) => i === idx ? { ...rec, [field]: value || null } : rec)
    saveRecords(next).catch(() => {})
  }

  function saveNewRecord(date: string) {
    if (!date) { setAddingNew(false); return }
    const detectedLab = autoDetectLab(destination, inspectionConfig.titerRules, inspectionConfig.titerDefault)
    const newIdx = records.length
    const next = [...records, { date, value: null, lab: detectedLab }]
    setAddingNew(false)
    void (async () => {
      await saveRecords(next)
      // 새 회차의 진행상태를 'waiting' 으로 명시 — readInspectionStatus 의
      // legacy 폴백 (옛 케이스가 'done' 보유) 이 새 record 에 번지지 않도록.
      const statusKey = `inspection_status_titer_${newIdx}`
      updateLocalCaseField(caseId, 'data', statusKey, 'waiting')
      void updateCaseField(caseId, 'data', statusKey, 'waiting')
    })()
  }

  return (
    <div
      ref={rootRef}
      data-paste-section="rabies-titer"
      onDragOver={editMode ? handleDragOver : undefined}
      onDragLeave={editMode ? handleDragLeave : undefined}
      onDrop={editMode ? handleDrop : undefined}
      className={cn(
        'grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0 rounded-md',
        editMode && dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
      )}
    >
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? () => setAddingNew(true) : undefined}
          title={editMode ? '항체검사 추가' : undefined}
        >
          광견병항체검사
        </SectionLabel>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        {extracting && (
          <div className="text-xs text-muted-foreground/70 italic px-2 py-1">이미지에서 추출 중…</div>
        )}
        {extractMsg && (
          <div className="text-xs text-muted-foreground px-2 py-1">{extractMsg}</div>
        )}

        {records.map((rec, i) => (
          <TiterRow
            key={i}
            record={rec}
            recordIdx={i}
            isEditing={editIdx === i ? editField : null}
            onStartEdit={(f) => { setEditIdx(i); setEditField(f) }}
            onStopEdit={() => { setEditIdx(null); setEditField(null) }}
            onUpdateField={(f, v) => updateRecord(i, f, v)}
            onDelete={() => deleteRecord(i)}
            saving={saving}
            onAttachFile={handleFile}
            extracting={extracting}
          />
        ))}

        {addingNew && (
          <DateInput
            initial=""
            onSave={saveNewRecord}
            onCancel={() => setAddingNew(false)}
          />
        )}

        {dragOver && (
          <div className="text-xs text-muted-foreground px-2 py-1">놓으면 자동 입력</div>
        )}
      </div>
    </div>
  )
}

/* ── Single titer row: date | value | lab ── */

function TiterRow({
  record, recordIdx, isEditing, onStartEdit, onStopEdit, onUpdateField, onDelete, saving,
  onAttachFile, extracting,
}: {
  record: TiterRecord
  recordIdx: number
  isEditing: TiterEditField | null
  onStartEdit: (f: TiterEditField) => void
  onStopEdit: () => void
  onUpdateField: (f: keyof TiterRecord, v: unknown) => void
  onDelete: () => void
  saving: boolean
  onAttachFile: (file: File) => void
  extracting: boolean
}) {
  const editMode = useSectionEditMode()
  const dateDisplay = record.date || '—'
  // legacy 데이터에 단위가 포함된 경우(과거 추출 결과) 도 중복 표시 방지.
  const cleanValue = stripTiterUnit(record.value)
  const valueDisplay = cleanValue ? `${cleanValue} IU/ml` : 'IU/ml'
  const labObj = LABS.find(l => l.value === record.lab)
  const labDisplay = labObj?.label || record.lab || '—'
  const labTone = labColor(record.lab)
  const dateInfo = useFieldVerification(`rabies_titer_records[${recordIdx}].date`)
  const dateColorCls = dateInfo ? severityTextClass(dateInfo.severity) : ''
  const dateTitle = dateInfo ? tooltipText(dateInfo) : undefined
  const showLab = editMode || labDisplay !== '—'
  const showValue = editMode || valueDisplay !== '—'

  return (
    <div className="group/item flex items-baseline gap-[10px] min-w-0 overflow-x-auto whitespace-nowrap scrollbar-minimal">
      {/* Date (채혈일) */}
      {editMode && isEditing === 'date' ? (
        <DateInput
          initial={record.date || ''}
          onSave={(v) => { if (!v) onDelete(); else onUpdateField('date', v); onStopEdit() }}
          onCancel={onStopEdit}
        />
      ) : (
        <span className="group/v inline-flex items-baseline">
          {editMode ? (
            <button type="button" onClick={() => onStartEdit('date')} title={dateTitle}
              className={cn(
                'text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
                dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60',
                dateColorCls,
              )}>
              {dateDisplay}
            </button>
          ) : (
            <span title={dateTitle}
              className={cn(
                'inline-block rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground',
                dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/40',
                dateColorCls,
              )}>
              {dateDisplay}
            </span>
          )}
        </span>
      )}

      {showLab && <span className="text-muted-foreground/30 select-none">|</span>}

      {/* Lab (검사기관) */}
      {showLab && (
        editMode && isEditing === 'lab' ? (
          <LabDropdown
            current={record.lab}
            onSelect={(v) => { onUpdateField('lab', v); onStopEdit() }}
            onClose={onStopEdit}
          />
        ) : (
          <span className="group/v inline-flex items-baseline">
            {editMode ? (
              <button type="button" onClick={() => onStartEdit('lab')}
                className={cn(
                  'text-left cursor-pointer transition-all',
                  labTone
                    ? cn('inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap hover:opacity-80', labTone.bg, labTone.text)
                    : cn('text-base rounded-md px-2 py-1 -mx-2 hover:bg-accent/60', labDisplay === '—' && 'text-muted-foreground/60'),
                )}>
                {labDisplay}
              </button>
            ) : (
              <span
                className={cn(
                  'inline-block transition-all',
                  labTone
                    ? cn('items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap', labTone.bg, labTone.text)
                    : cn('text-base rounded-md px-2 py-1 -mx-2', labDisplay === '—' && 'text-muted-foreground/40'),
                )}>
                {labDisplay}
              </span>
            )}
          </span>
        )
      )}

      {showValue && <span className="text-muted-foreground/30 select-none">|</span>}

      {/* Value (결과수치) */}
      {showValue && (
        <span className="inline-flex items-center gap-1">
          {editMode && isEditing === 'value' ? (
            <ValueInput
              initial={record.value || ''}
              onSave={(v) => { onUpdateField('value', v || null); onStopEdit() }}
              onCancel={onStopEdit}
              saving={saving}
            />
          ) : (
            <span className="group/v inline-flex items-baseline">
              {editMode ? (
                <button type="button" onClick={() => onStartEdit('value')}
                  className={cn('text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-text', !record.value && 'font-sans italic text-[13px] font-normal tracking-normal text-muted-foreground/60')}>
                  {valueDisplay}
                </button>
              ) : (
                <span className={cn('inline-block rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground', !record.value && 'font-sans italic text-[13px] font-normal tracking-normal text-muted-foreground/40')}>
                  {valueDisplay}
                </span>
              )}
            </span>
          )}
          {/* AttachButton — 편집 모드 진입 시 보이지만, picker 가 비동기로 열리는 동안
              ValueInput onBlur → 언마운트로 input.onChange 가 유실되는 문제 방지 위해
              항상 mount, visibility 로만 토글. */}
          {editMode && (
            <span className={cn('inline-flex', isEditing !== 'value' && 'invisible pointer-events-none')}>
              <AttachButton
                accept="image/*,.pdf"
                onFile={onAttachFile}
                disabled={extracting}
                title="이미지/PDF 로 자동 입력 (자동 크롭)"
                className="h-6 w-6 text-muted-foreground/60"
              />
            </span>
          )}
        </span>
      )}

      {editMode && (
        <button
          type="button"
          onClick={onDelete}
          title="기록 삭제"
          className="shrink-0 inline-flex items-center justify-center rounded-md p-1 ml-3 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover/item:opacity-70 hover:!opacity-100"
        >
          <Trash2 size={13} />
        </button>
      )}
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
      className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

function ValueInput({ initial, onSave, onCancel, saving }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void; saving: boolean
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <input ref={ref} type="text" value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSave(val.trim()); if (e.key === 'Escape') onCancel() }}
      onBlur={() => setTimeout(() => { if (!saving) onSave(val.trim()) }, 150)}
      placeholder="수치"
      className="w-20 h-8 rounded-md border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

function LabDropdown({ current, onSelect, onClose }: {
  current: string | null; onSelect: (v: string | null) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div ref={ref} className="relative">
      <ul className="absolute left-0 top-0 z-20 min-w-[160px] rounded-md border border-border/80 bg-background py-1 shadow-md">
        <li><button type="button" onClick={() => onSelect(null)}
          className="w-full text-left px-sm py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors">—</button></li>
        {LABS.map(l => (
          <li key={l.value}><button type="button" onClick={() => onSelect(l.value)}
            className={cn('w-full text-left px-sm py-1.5 text-sm hover:bg-accent/60 transition-colors', current === l.value && 'font-medium')}>
            {l.label}</button></li>
        ))}
      </ul>
    </div>
  )
}
