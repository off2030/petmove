'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { CopyButton } from './copy-button'
import { extractExtra } from '@/lib/actions/extract-extra'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'
import { ExtraSectionShell } from './extra-field-shell'
import { SectionLabel } from '@/components/ui/section-label'
import { useSectionEditMode } from './section-edit-mode-context'

interface SwissExtra {
  entry_purpose: 'temporary' | 'relocation' | 'reentry' | null
  entry_date: string | null
  entry_airport: 'zurich' | 'geneva' | 'basel' | null
  /** §3 E-Mail — 고객 이메일 */
  email: string | null
  /** Dog only. `null` = unspecified, 'no' = 단미/단이 없음, 'tail'/'ears'/'both' = 해당 부위 */
  cropped: 'no' | 'tail' | 'ears' | 'both' | null
}

const EMPTY: SwissExtra = {
  entry_purpose: null,
  entry_date: null,
  entry_airport: null,
  email: null,
  cropped: null,
}

const DATA_KEY = 'switzerland_extra'

const PURPOSE_OPTIONS = [
  { value: 'temporary', label: 'Temporary (단기 체류)' },
  { value: 'relocation', label: 'Relocation (이주)' },
  { value: 'reentry', label: 'Re-entry (재입국)' },
]

const AIRPORT_OPTIONS = [
  { value: 'zurich', label: 'Zürich' },
  { value: 'geneva', label: 'Geneva' },
  { value: 'basel', label: 'Basel' },
]

const CROPPED_OPTIONS = [
  { value: 'no', label: '없음' },
  { value: 'tail', label: '꼬리' },
  { value: 'ears', label: '귀' },
  { value: 'both', label: '꼬리+귀' },
]

export function SwissExtraField({ caseId, caseRow, sectionNumber }: { caseId: string; caseRow: CaseRow; sectionNumber: string }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra: SwissExtra = { ...EMPTY, ...((data[DATA_KEY] as Partial<SwissExtra>) ?? {}) }

  // Crop 필드는 강아지 전용이지만, species 가 아직 비어있거나 'cat' 이 아니면 노출.
  const species = String(data.species ?? '').toLowerCase()
  const showCropped = species !== 'cat'

  const [editingField, setEditingField] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(false)
  const [inputText, setInputText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditingField(null)
    setExtracting(false)
    setExtractMsg(null)
    setShowInput(false)
    setInputText('')
  }, [caseId])

  // 해외주소는 top-level data.address_overseas 에 단일 문자열로 저장.
  // PDF 생성 시 parse 해서 street / postcode / city 로 분리 출력.
  const addressValue = (data.address_overseas as string | null) ?? null

  async function saveExtra(next: SwissExtra) {
    const hasAny = Object.values(next).some(v => v !== null)
    const val = hasAny ? next : null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditingField(null)
  }

  function saveField<K extends keyof SwissExtra>(key: K, value: SwissExtra[K]) {
    saveExtra({ ...extra, [key]: value })
  }

  async function saveAddress(value: string | null) {
    const v = value?.trim() || null
    const r = await updateCaseField(caseId, 'data', 'address_overseas', v)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'address_overseas', v)
    setEditingField(null)
  }

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractExtra({ country: 'switzerland', ...input })
      if (result.ok) {
        const merged: SwissExtra = { ...extra }
        if (result.data.entry_date) merged.entry_date = result.data.entry_date
        if (result.data.entry_airport) merged.entry_airport = result.data.entry_airport
        if (result.data.email) merged.email = result.data.email
        const r = await updateCaseField(caseId, 'data', DATA_KEY, merged)
        if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, merged)
        if (result.data.address_overseas) {
          const addr = result.data.address_overseas
          const r2 = await updateCaseField(caseId, 'data', 'address_overseas', addr)
          if (r2.ok) updateLocalCaseField(caseId, 'data', 'address_overseas', addr)
        }
        setExtractMsg('정보가 입력되었습니다')
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

  async function handleFiles(files: File[]) {
    const extractable = files.filter(isExtractableFile)
    if (extractable.length === 0) return
    for (const file of extractable) {
      uploadFileToNotes(caseId, caseRow, file, updateLocalCaseField).catch(() => {})
    }
    const images = await filesToBase64(extractable)
    if (images.length > 0) tryExtract({ images })
  }

  function handleTextSubmit() {
    const text = inputText.trim()
    if (!text) return
    setShowInput(false)
    setInputText('')
    tryExtract({ text })
  }

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!dropRef.current) return
      const active = document.activeElement
      const inSection = dropRef.current.contains(active) || dropRef.current.matches(':hover')
      if (!inSection) return
      if (active instanceof HTMLInputElement || (active instanceof HTMLTextAreaElement && active !== textRef.current)) return
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        handleFiles(imageFiles)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  })

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragOver(true) }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(isExtractableFile)
    if (files.length > 0) handleFiles(files)
  }

  function renderSelect(key: keyof SwissExtra, label: string, options: { value: string; label: string }[]) {
    const val = extra[key] as string | null
    return (
      <SwissFieldRow
        key={key as string}
        label={label}
        value={val}
        type="select"
        options={options}
        isEditing={editingField === key}
        onStartEdit={() => setEditingField(key as string)}
        onCancelEdit={() => setEditingField(null)}
        onSave={(v) => saveField(key, (v as SwissExtra[typeof key]))}
      />
    )
  }

  function renderDate(key: keyof SwissExtra, label: string) {
    const val = extra[key] as string | null
    return (
      <SwissFieldRow
        key={key as string}
        label={label}
        value={val}
        type="date"
        isEditing={editingField === key}
        onStartEdit={() => setEditingField(key as string)}
        onCancelEdit={() => setEditingField(null)}
        onSave={(v) => saveField(key, (v as SwissExtra[typeof key]))}
      />
    )
  }

  function renderText(key: keyof SwissExtra, label: string, placeholder: string) {
    const val = extra[key] as string | null
    return (
      <SwissFieldRow
        key={key as string}
        label={label}
        value={val}
        type="text"
        placeholder={placeholder}
        isEditing={editingField === key}
        onStartEdit={() => setEditingField(key as string)}
        onCancelEdit={() => setEditingField(null)}
        onSave={(v) => saveField(key, (v as SwissExtra[typeof key]))}
      />
    )
  }

  return (
    <ExtraSectionShell
      sectionNumber={sectionNumber}
      placeholder="입국 정보를 붙여넣으세요 (Enter로 추출)"
      dropRef={dropRef}
      textRef={textRef}
      fileRef={fileRef}
      extracting={extracting}
      extractMsg={extractMsg}
      dragOver={dragOver}
      inputText={inputText}
      setInputText={setInputText}
      showInput={showInput}
      setShowInput={setShowInput}
      handleFiles={handleFiles}
      handleTextSubmit={handleTextSubmit}
      handleDragOver={handleDragOver}
      handleDragLeave={handleDragLeave}
      handleDrop={handleDrop}
    >
      <div className="space-y-1">
      {renderSelect('entry_purpose', '입국목적', PURPOSE_OPTIONS)}
      {renderDate('entry_date', '입국일')}
      {renderSelect('entry_airport', '입국공항', AIRPORT_OPTIONS)}

      {/* 해외주소 — 단일 문자열. "Rue du Lac 12, 1800 Vevey, Switzerland" 포맷.
          PDF 생성 시 자동 파싱해 Address/Postcode/City 로 분리 출력. */}
      <SwissFieldRow
        label="해외주소"
        value={addressValue}
        type="text"
        placeholder="Rue du Lac 12, 1800 Vevey, Switzerland"
        isEditing={editingField === 'address_overseas'}
        onStartEdit={() => setEditingField('address_overseas')}
        onCancelEdit={() => setEditingField(null)}
        onSave={(v) => saveAddress(v)}
      />
      {renderText('email', '이메일', 'owner@example.com')}

      {showCropped && renderSelect('cropped', '단미·단이', CROPPED_OPTIONS)}
      </div>
    </ExtraSectionShell>
  )
}

function SwissFieldRow({
  label, value, type, options, placeholder, isEditing, onStartEdit, onCancelEdit, onSave,
}: {
  label: string
  value: string | null
  type: 'text' | 'date' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (v: string | null) => void
}) {
  const editMode = useSectionEditMode()
  const display = type === 'select' && value ? options?.find(o => o.value === value)?.label ?? value : value
  const valueCls = cn(
    'rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground',
    !value && 'text-muted-foreground/60',
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <SectionLabel className="pt-1">{label}</SectionLabel>
      {editMode && isEditing ? (
        type === 'select' ? (
          <SelectInput options={options ?? []} initial={value ?? ''} onSave={onSave} onCancel={onCancelEdit} />
        ) : (
          <InlineInput type={type} initial={value ?? ''} placeholder={placeholder ?? ''} onSave={onSave} onCancel={onCancelEdit} />
        )
      ) : (
        <div className="group/val inline-flex items-baseline">
          {editMode ? (
            <button
              type="button"
              onClick={onStartEdit}
              className={cn('text-left transition-colors hover:bg-accent/60 cursor-text', valueCls)}
            >
              {display || '—'}
            </button>
          ) : (
            <span className={valueCls}>{display || '—'}</span>
          )}
          {display && (
            <>
              <CopyButton value={display} className="ml-1 opacity-0 group-hover/val:opacity-100" />
              {editMode && <ClearButton onClick={() => onSave(null)} />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="삭제"
      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover/val:opacity-100"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}

function InlineInput({ type, initial, placeholder, onSave, onCancel }: {
  type: 'text' | 'date'
  initial: string
  placeholder: string
  onSave: (v: string | null) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initial)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <input
      ref={ref}
      type={type}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSave(val.trim() || null) }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => setTimeout(() => onSave(val.trim() || null), 150)}
      placeholder={placeholder}
      className="h-7 w-full max-w-[320px] rounded-md border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

function SelectInput({ options, initial, onSave, onCancel }: {
  options: { value: string; label: string }[]
  initial: string
  onSave: (v: string | null) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <select
      ref={ref}
      defaultValue={initial}
      onChange={(e) => onSave(e.target.value || null)}
      onBlur={() => setTimeout(onCancel, 150)}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className="h-7 rounded-md border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    >
      <option value="">선택</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
