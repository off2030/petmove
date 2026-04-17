'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { extractFlightInfo } from '@/lib/actions/extract-flight'
import { CopyButton } from './copy-button'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'

/* ── Types ── */

interface ThailandExtra {
  address_overseas: string | null
  passport_issue_date: string | null
  passport_expiry_date: string | null
  passport_nationality: string | null
  arrival_flight_number: string | null
  arrival_date: string | null
  arrival_time: string | null
  quarantine_location: string | null
}

const EMPTY: ThailandExtra = {
  address_overseas: null,
  passport_issue_date: null,
  passport_expiry_date: null,
  passport_nationality: null,
  arrival_flight_number: null,
  arrival_date: null,
  arrival_time: null,
  quarantine_location: null,
}

const QUARANTINE_OPTIONS = [
  { value: 'Bangkok', label: 'Bangkok' },
  { value: 'Phuket', label: 'Phuket' },
  { value: 'Chiang Mai', label: 'Chiang Mai' },
]

const DATA_KEY = 'thailand_extra'

/* ── Component ── */

export function ThailandExtraField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra: ThailandExtra = (data[DATA_KEY] as ThailandExtra) ?? { ...EMPTY }

  const [editingField, setEditingField] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [inputText, setInputText] = useState('')
  const [showInput, setShowInput] = useState(false)
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

  /* ── Save ── */

  async function saveExtra(next: ThailandExtra) {
    const hasAny = Object.values(next).some((v) => v !== null)
    const val = hasAny ? next : null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditingField(null)
  }

  function saveField<K extends keyof ThailandExtra>(key: K, value: string | null) {
    saveExtra({ ...extra, [key]: value || null })
  }

  /* ── AI extraction ── */

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractFlightInfo(input)
      if (result.ok) {
        const merged: ThailandExtra = { ...extra }
        if (result.data.address_overseas) merged.address_overseas = result.data.address_overseas
        if (result.data.passport_issue_date) merged.passport_issue_date = result.data.passport_issue_date
        if (result.data.passport_expiry_date) merged.passport_expiry_date = result.data.passport_expiry_date
        if (result.data.passport_nationality) merged.passport_nationality = result.data.passport_nationality
        // Arrival = inbound (Korea → Thailand)
        if (result.data.inbound.flight_number) merged.arrival_flight_number = result.data.inbound.flight_number
        if (result.data.inbound.date) merged.arrival_date = result.data.inbound.date
        if (result.data.arrival_time) merged.arrival_time = result.data.arrival_time
        if (result.data.quarantine_location) merged.quarantine_location = result.data.quarantine_location
        const r = await updateCaseField(caseId, 'data', DATA_KEY, merged)
        if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, merged)
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

  /* ── Paste ── */

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

  /* ── Drag & drop ── */

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

  /* ── Render helpers ── */

  const renderField = (key: keyof ThailandExtra, label: string, type: 'text' | 'date' | 'time' | 'select' = 'text', placeholder = '', options?: { value: string; label: string }[]) => {
    const val = extra[key] ?? null
    const isEditing = editingField === key
    const display = type === 'select' && val ? (options?.find((o) => o.value === val)?.label ?? val) : val
    return (
      <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1">
        <span className="text-sm text-muted-foreground pt-1">{label}</span>
        {isEditing ? (
          type === 'select' && options ? (
            <SelectInput options={options} initial={val ?? ''} onSave={(v) => saveField(key, v)} onCancel={() => setEditingField(null)} />
          ) : (
            <InlineInput type={type === 'time' ? 'time' : type === 'date' ? 'date' : 'text'} initial={val ?? ''} placeholder={placeholder} onSave={(v) => saveField(key, v)} onCancel={() => setEditingField(null)} />
          )
        ) : (
          <div className="group/val inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField(key)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-text',
                !val && 'text-muted-foreground/60 italic',
              )}
            >
              {display || '—'}
            </button>
            {val && <CopyButton value={String(display)} className="ml-1 opacity-0 group-hover/val:opacity-100" />}
          </div>
        )}
      </div>
    )
  }

  /* ── Render ── */

  return (
    <div
      ref={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'mt-2 pt-2 border-t border-border/40 space-y-1 rounded-md transition-colors',
        dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
      )}
    >
      {/* AI 입력 */}
      <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1">
        <span className="text-sm text-muted-foreground pt-1">AI 입력</span>
        <div className="min-w-0 space-y-1">
          {showInput ? (
            <textarea
              ref={textRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit() }
                if (e.key === 'Escape') { setShowInput(false); setInputText('') }
              }}
              placeholder="정보를 붙여넣으세요 (Enter로 추출)"
              className="w-full min-h-[3rem] rounded-md border border-border/50 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
            />
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setShowInput(true); setTimeout(() => textRef.current?.focus(), 50) }}
                disabled={extracting}
                className="text-left rounded-md px-2 py-1 -mx-2 text-sm text-muted-foreground/60 italic transition-colors hover:bg-accent/60 cursor-pointer disabled:opacity-50"
              >
                {extracting ? '추출 중...' : '텍스트·이미지·PDF 붙여넣기'}
              </button>
              <input ref={fileRef} type="file" accept="image/*,.pdf" multiple onChange={(e) => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = '' }} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={extracting} className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-30" title="파일 첨부">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
            </div>
          )}
          {extractMsg && (
            <div className={cn('text-xs', extractMsg.includes('실패') || extractMsg.includes('오류') ? 'text-red-600' : 'text-green-600')}>
              {extractMsg}
            </div>
          )}
          {dragOver && <div className="text-xs text-muted-foreground">이미지/PDF를 놓으면 자동 입력됩니다</div>}
        </div>
      </div>

      {/* 해외주소 */}
      {renderField('address_overseas', '해외주소', 'text', 'Destination address in Thailand')}

      {/* 여권정보 */}
      {renderField('passport_issue_date', '여권 발급일', 'date')}
      {renderField('passport_expiry_date', '여권 유효기간', 'date')}
      {renderField('passport_nationality', '국적', 'text', 'Republic of Korea')}

      {/* 항공권 (출국편 only) */}
      {renderField('arrival_flight_number', '항공편명', 'text', 'KE659')}
      {renderField('arrival_date', '도착일', 'date')}
      {renderField('arrival_time', '도착시간', 'time', 'HH:mm')}
      {renderField('quarantine_location', '검역장소', 'select', '', QUARANTINE_OPTIONS)}
    </div>
  )
}

/* ── Inputs ── */

function InlineInput({ type, initial, placeholder, onSave, onCancel }: {
  type: 'text' | 'date' | 'time'
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
      className="h-7 w-full max-w-[320px] rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
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
      className="h-7 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    >
      <option value="">선택</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
