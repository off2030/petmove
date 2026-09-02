'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, Trash2 } from 'lucide-react'
import { AttachButton } from '@/components/ui/attach-button'
import { SectionLabel } from '@/components/ui/section-label'
import { DropdownSelect } from '@petmove/ui'
import { cn, roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { useCases } from './cases-context'
import type { CaseRow } from '@petmove/domain'
import { labColor } from '@/lib/lab-color'
import { extractTiterInfo } from '@/lib/actions/extract-titer'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { addDays, allLabOptions, effectiveTiterLabs, formatKoreanDate, resolveActiveDestination, resolveTiterLab, type InspectionLabRule } from '@petmove/domain'
import { stampInspectionActiveDest } from '@/lib/inspection-active-dest'
import { severityTextClass, tooltipText, useFieldVerification } from './verification-context'
import { DateTextField } from '@petmove/ui'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@petmove/ui'
import { InspectionStatusChip } from './inspection-status-chip'

interface TiterRecord {
  date: string | null
  value: string | null
  lab: string | null
  /** 검사소 샘플 수령일 — AU/HI/GU 의 N일 대기 카운트다운 기준. 미입력 시 채혈일 fallback. */
  received_date?: string | null
}

// 검사기관 목록은 설정(inspection_config)이 단일 출처 — effectiveTiterLabs 로 파생 (2026-08-06).
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
 * 광견병항체 검사기관 자동 감지 — 단일 여행지일 때만.
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

/**
 * 검사소 샘플 수령일 입력 노출 — AU/HI/GU 에서만 검증에 사용되므로
 * 그 외 여행지에선 UI 비표시. multi-destination 시 하나라도 포함되면 표시.
 */
function destinationNeedsReceivedDate(destination: string | null | undefined): boolean {
  if (!destination) return false
  const dests = destination.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return dests.some(d =>
    d.includes('호주') || d.includes('australia') ||
    d.includes('하와이') || d.includes('hawaii') ||
    d.includes('괌') || d.includes('guam')
  )
}

/**
 * 일본 입국 가능일 hover 툴팁 — 채혈일 + 180일 (jp.entry-180days-after-titer 룰과 동일 기준).
 * 여행지에 일본이 포함될 때만 노출. multi-destination 이어도 일본이 있으면 표시.
 */
function japanEntryTooltip(date: string | null, destination: string | null | undefined): string | undefined {
  if (!date || !destination) return undefined
  const dests = destination.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!dests.some(d => d.includes('일본') || d.includes('japan'))) return undefined
  const entry = addDays(date, 180)
  if (!entry) return undefined
  return `일본 입국 가능일: ${formatKoreanDate(entry)} (검사일로부터 180일)`
}

export function RabiesTiterField({ caseId, caseRow, destination }: { caseId: string; caseRow: CaseRow; destination?: string | null }) {
  const { updateLocalCaseField, inspectionConfig, activeDestination } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const showReceivedDate = destinationNeedsReceivedDate(destination)
  // 다중 여행지에서 현재 탭 — 검사 탭 활성 여행지 각인 기준.
  const activeDest = resolveActiveDestination(caseRow.destination, activeDestination)
  const stampActiveDest = () =>
    stampInspectionActiveDest(caseId, caseRow.destination, activeDest, updateLocalCaseField)

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
  const [editField, setEditField] = useState<'date' | 'value' | 'lab' | 'received_date' | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // 항목 클릭 시 열리는 편집 팝업.
  const [modalOpen, setModalOpen] = useState(false)
  // 모달 열릴 때 records 스냅샷 — 변경 감지용 (닫기 vs 저장 버튼 토글).
  const [initialRecordsSnapshot, setInitialRecordsSnapshot] = useState('[]')
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
    setInitialRecordsSnapshot(JSON.stringify(records))
    setModalOpen(true)
    if (records.length === 0) setAddingNew(true)
  }
  function closeEditModal() {
    setModalOpen(false)
    setAddingNew(false)
    setEditIdx(null)
    setEditField(null)
  }

  async function saveRecords(next: TiterRecord[]) {
    const val = next.length > 0 ? next : null
    // Optimistic — 실패해도 값 보존 + '다시 시도' 토스트(persistField).
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    await persistField('광견병 항체가', () => updateCaseField(caseId, 'data', DATA_KEY, val))
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
      // 샘플수령일(received_date)은 호주·하와이·괌 전용(RNATT 180일 대기 기준).
      // 그 외 여행지(뉴질랜드 등)는 필드 미표시·검증 미사용이므로 추출값을 무시한다 —
      // 적용 시 메시지에 "샘플수령일 업데이트됨"이 잘못 떠 혼란을 준다.
      const xReceived = showReceivedDate ? result.data.sample_received_date : null

      let nextRecords: TiterRecord[] = records
      let createdNewRecord = false
      let createdAtIdx: number | null = null

      if (targetIdx !== null && records[targetIdx]) {
        // 특정 record 업데이트 — 붙여넣은 결과지가 우선(덮어쓰기). 추출 못 한 필드는 기존 유지.
        nextRecords = records.map((r, i) => i === targetIdx ? {
          ...r,
          value: xValue || r.value || null,
          received_date: xReceived || r.received_date || null,
        } : r)
      } else if (xValue) {
        // 새 record — 추출된 값(+ 가능 시 수령일)을 가진 신규 row.
        const detectedLab = autoDetectLab(destination, inspectionConfig.titerRules, inspectionConfig.titerDefault)
        nextRecords = [...records, { date: null, value: xValue, lab: detectedLab, received_date: xReceived || null }]
        createdAtIdx = records.length
        createdNewRecord = true
      }

      // 실제로 값이 바뀐 경우에만 "업데이트됨" 보고 (변경 전후 비교).
      const applied = { value: false, received: false }
      const appliedIdx = targetIdx !== null ? targetIdx : createdAtIdx
      if (appliedIdx !== null) {
        const before = records[appliedIdx]
        const after = nextRecords[appliedIdx]
        if (xValue && after?.value === xValue && before?.value !== xValue) applied.value = true
        if (xReceived && after?.received_date === xReceived && before?.received_date !== xReceived) applied.received = true
      }

      if (nextRecords !== records) {
        await saveRecords(nextRecords)
        if (createdNewRecord && createdAtIdx !== null) {
          // legacy 'done' 상속 방지 — 새 회차 'waiting' 명시.
          const statusKey = `inspection_status_titer_${createdAtIdx}`
          updateLocalCaseField(caseId, 'data', statusKey, 'waiting')
          void updateCaseField(caseId, 'data', statusKey, 'waiting')
          stampActiveDest()
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
    if (!isExtractableFile(file)) {
      setExtractMsg(`지원하지 않는 파일 형식: ${file.type || '(unknown)'}`)
      setTimeout(() => setExtractMsg(null), 4000)
      return
    }
    // stepId='rabies-titer' — portal 의 필수 서류(광견병 항체가 검사 결과지) 미리보기 연동.
    // catalog 의 attachmentLabel ('광견병 항체가 검사 결과지') 로 자동 명명.
    uploadFileToNotes(caseId, caseRow, file, updateLocalCaseField, { stepId: 'rabies-titer' }).catch(() => {})
    setExtracting(true)
    setExtractMsg(null)
    let images: { base64: string; mediaType: string }[]
    try {
      images = await filesToBase64([file])
    } catch (err) {
      setExtractMsg(`이미지 변환 오류: ${err instanceof Error ? err.message : String(err)}`)
      setTimeout(() => setExtractMsg(null), 4000)
      setExtracting(false)
      return
    }
    if (images.length === 0) {
      setExtractMsg('이미지 변환 결과 없음')
      setTimeout(() => setExtractMsg(null), 4000)
      setExtracting(false)
      return
    }
    // runTiterExtract 가 setExtracting / setExtractMsg 자체 관리 (try/finally).
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
    // 검사기관을 이 탭에서 골랐다 = 이 검사는 이 여행지 것 → 검사 탭 여행지 각인.
    if (field === 'lab') stampActiveDest()
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
      stampActiveDest()
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
      data-field={DATA_KEY}
      className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0 transition-colors"
    >
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? openEditModal : undefined}
          title={editMode ? '광견병항체검사 편집' : undefined}
        >
          광견병항체검사
        </SectionLabel>
      </div>

      {/* 인라인: 날짜 chips. 클릭하면 모달 열림. */}
      <div className="min-w-0 flex items-baseline gap-[10px] pt-1 overflow-x-auto whitespace-nowrap scrollbar-hide pl-2.5 -ml-2.5">
        {sortedForExpand.length === 0 ? (
          editMode ? (
            <button type="button" onClick={openEditModal}
              className="text-left rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border cursor-pointer text-muted-foreground/40 select-none">
              —
            </button>
          ) : (
            <span className="text-muted-foreground/40 select-none" aria-hidden>—</span>
          )
        ) : (
          sortedForExpand.map((rec, si) => (
            <InlineDateChip
              key={si}
              path={`${DATA_KEY}[${origIdx(si)}].date`}
              date={rec.date}
              separator={si > 0}
              onClick={openEditModal}
              extraTitle={japanEntryTooltip(rec.date, destination)}
              // 진행상태는 **최신 회차에만** — 옛 회차는 거의 항상 '완료'라 같은 칩이
              // 반복되며 줄만 길어진다. 회차별 상태 자체는 그대로 살아 있고(검사 탭도
              // record 별 1행), 편집 모달의 각 행에서 보고 바꿀 수 있다.
              // sortedForExpand 는 날짜 내림차순이라 si === 0 이 최신.
              status={
                si === 0 ? (
                  <InspectionStatusChip
                    caseId={caseId}
                    caseRow={caseRow}
                    target={{ kind: 'titer', recordIdx: origIdx(si) }}
                  />
                ) : undefined
              }
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
              // dragOver 에 bg-accent/40 를 주면 모달이 투명해져 뒤의 detail 페이지
              // (인라인 칩·헤더 배지)가 비쳐 보임. 배경은 bg-background 로 유지하고
              // ring 으로만 드롭 가능 영역 신호.
              'relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-border/80 bg-background shadow-xl transition-colors',
              dragOver && 'ring-2 ring-ring/30 ring-dashed',
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-md px-md py-3 border-b border-border/80">
              <h2 className="font-serif text-[18px] text-foreground">광견병항체검사</h2>
            </div>

            {/* Body — 명시적 bg 로 detail 페이지 bleed-through 차단 */}
            <div className="flex-1 overflow-auto px-md py-md space-y-2 scrollbar-minimal bg-background">
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
                      // bg-accent/40 는 반투명 — record 자체엔 영향 없지만
                      // 안전상 ring 만 사용해 일관 동작.
                      'group/item rounded-md p-2 border border-border/40 bg-background transition-colors',
                      dragOverIdx === oi && 'ring-2 ring-ring/30 ring-dashed',
                    )}
                  >
                    <TiterRecordRow
                      caseId={caseId}
                      caseRow={caseRow}
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
                      showReceivedDate={showReceivedDate}
                      entryTooltip={japanEntryTooltip(rec.date, destination)}
                    />
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-md py-2 border-t border-border/80 bg-background/95">
              {/* 좌측: 추가 + 클립 */}
              <button
                type="button"
                onClick={() => setAddingNew(true)}
                disabled={addingNew || saving}
                className={cn(
                  'h-7 px-3 rounded-full border border-border/80 bg-card text-[13px] text-foreground transition-colors hover:bg-accent/60',
                  (addingNew || saving) && 'opacity-50 cursor-not-allowed',
                )}
                title="기록 추가"
              >
                추가
              </button>
              <AttachButton
                accept="image/*,.pdf"
                onFile={(f) => handleFile(f, null)}
                disabled={extracting}
                className={roundIconBtn}
                title="이미지/PDF 로 새 기록 추출"
              >
                <Paperclip size={14} />
              </AttachButton>

              {/* 우측: 닫기/저장 */}
              <div className="ml-auto">
                {(() => {
                  const hasChanges = JSON.stringify(records) !== initialRecordsSnapshot
                  return (
                    <button
                      type="button"
                      onClick={closeEditModal}
                      className={cn(
                        'h-7 px-3 rounded-full border text-[13px] transition-colors',
                        hasChanges
                          ? 'border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25'
                          : 'border-border/80 bg-card text-foreground hover:bg-accent/60',
                      )}
                    >
                      {hasChanges ? '저장' : '닫기'}
                    </button>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ── 인라인 날짜 chip (verification color 적용) ── */

function InlineDateChip({ path, date, separator, onClick, extraTitle, status }: { path: string; date: string | null; separator: boolean; onClick?: () => void; extraTitle?: string; status?: ReactNode }) {
  const editMode = useSectionEditMode()
  const info = useFieldVerification(path)
  const colorCls = info ? severityTextClass(info.severity) : ''
  const title = [info ? tooltipText(info) : undefined, extraTitle].filter(Boolean).join('\n') || undefined
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
      {status}
    </span>
  )
}

/* ── 모달 안의 단일 record row: date | lab | value | attach | delete ── */

function TiterRecordRow({
  caseId, caseRow, record, recordIdx, isEditing, onStartEdit, onStopEdit, onUpdateField, onDelete, onAttachFile, saving, extracting, showReceivedDate, entryTooltip,
}: {
  caseId: string
  caseRow: CaseRow
  record: TiterRecord
  recordIdx: number
  isEditing: 'date' | 'value' | 'lab' | 'received_date' | null
  onStartEdit: (f: 'date' | 'value' | 'lab' | 'received_date') => void
  onStopEdit: () => void
  onUpdateField: (f: keyof TiterRecord, v: unknown) => void
  onDelete: () => void
  onAttachFile: (file: File) => void
  saving: boolean
  extracting: boolean
  showReceivedDate: boolean
  entryTooltip?: string
}) {
  const { inspectionConfig } = useCases()
  const cleanValue = stripTiterUnit(record.value)
  const valueDisplay = cleanValue ? `${cleanValue} IU/ml` : 'IU/ml'
  // 선택지 = 설정의 효과 목록(단일 출처). 표시 라벨은 숨긴 기관까지 lookup — 과거 데이터 보존.
  const titerLabs = effectiveTiterLabs(inspectionConfig)
  const labObj = allLabOptions(inspectionConfig).find(l => l.value === record.lab)
  const labDisplay = labObj?.label || record.lab || '—'
  const labTone = labColor(record.lab)
  // 저장된 값이 선택지에 없으면(고객 직접입력 자유텍스트 또는 설정에서 삭제된 기관)
  // 드롭다운 옵션에 동적 추가해 선택 상태로 보존한다. (옵션에 없으면 미선택으로 보여
  // 매니저가 무심코 다른 값을 골랐을 때 기존 값이 소실됨.)
  const inEffective = !!record.lab && titerLabs.some(l => l.value === record.lab)
  const labOptions = record.lab && !inEffective
    ? [{ value: '', label: '—' }, ...titerLabs, { value: record.lab, label: labObj ? labObj.label : `${record.lab} (직접입력)` }]
    : [{ value: '', label: '—' }, ...titerLabs]
  const dateInfo = useFieldVerification(`${DATA_KEY}[${recordIdx}].date`)
  const dateColorCls = dateInfo ? severityTextClass(dateInfo.severity) : ''
  const dateTitle = [dateInfo ? tooltipText(dateInfo) : undefined, entryTooltip].filter(Boolean).join('\n') || undefined
  const receivedInfo = useFieldVerification(`${DATA_KEY}[${recordIdx}].received_date`)
  const receivedColorCls = receivedInfo ? severityTextClass(receivedInfo.severity) : ''
  const receivedTitle = receivedInfo ? tooltipText(receivedInfo) : undefined

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
        options={labOptions}
        onChange={(v) => onUpdateField('lab', v || null)}
        portal
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

      {/* 검사소 샘플 수령일 — AU/HI/GU 케이스에만 노출 (검증 룰이 사용하는 N일 대기 카운트다운 기준). */}
      {showReceivedDate && (
        <>
          <span className="text-muted-foreground/30 select-none">|</span>
          <span className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground/70">검체 접수일</span>
          {isEditing === 'received_date' ? (
            <DateInput
              initial={record.received_date || ''}
              onSave={(v) => { onUpdateField('received_date', v || null); onStopEdit() }}
              onCancel={onStopEdit}
            />
          ) : (
            <button type="button" onClick={() => onStartEdit('received_date')} title={receivedTitle}
              className={cn(
                'text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
                !record.received_date && 'text-muted-foreground/40',
                receivedColorCls,
              )}>
              {record.received_date || 'YYYY-MM-DD'}
            </button>
          )}
        </>
      )}

      <div className="flex items-center gap-1 ml-auto">
        <InspectionStatusChip caseId={caseId} caseRow={caseRow} target={{ kind: 'titer', recordIdx: recordIdx }} />
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
      className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none"
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

  // 숫자·소수점만 허용 — 숫자가 아닌 문자는 입력 시점에 제거, 소수점은 1개로 제한.
  function sanitize(raw: string): string {
    let s = raw.replace(/[^0-9.]/g, '')
    const first = s.indexOf('.')
    if (first !== -1) s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '')
    return s
  }

  return (
    <input ref={ref} type="text" inputMode="decimal" value={val}
      onChange={(e) => setVal(sanitize(e.target.value))}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(val.trim()); if (e.key === 'Escape') onCancel() }}
      onBlur={() => setTimeout(() => { if (!saving) submit(val.trim()) }, 150)}
      placeholder="수치"
      className="w-24 h-8 rounded-md border border-border/80 bg-background px-2 text-sm focus-visible:outline-none"
    />
  )
}

// LabDropdown 제거 — DropdownSelect (components/ui/dropdown-select.tsx) 로 통일.
