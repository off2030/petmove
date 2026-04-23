'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { extractFlightInfo } from '@/lib/actions/extract-flight'
import type { FlightEntry, FlightExtractResult } from '@/lib/actions/extract-flight'
import { CopyButton } from './copy-button'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'

/* ── Types ── */

interface JapanExtra {
  inbound: FlightEntry
  outbound: FlightEntry
  email: string | null
  address_overseas: string | null
  certificate_no: string | null
}

const EMPTY_FLIGHT: FlightEntry = {
  date: null, departure_airport: null, arrival_airport: null, transport: null, flight_number: null,
}

const TRANSPORT_OPTIONS = [
  { value: 'Checked-baggage', label: 'Hand luggage (Checked-baggage)' },
  { value: 'Carry-on', label: 'Hand luggage (Carry-on)' },
  { value: 'Cargo', label: 'Cargo' },
  { value: 'Cargo(Sea)', label: 'Cargo (Sea)' },
]

const FLIGHT_FIELDS: { key: keyof FlightEntry; label: string; type: 'text' | 'date' | 'select'; placeholder?: string }[] = [
  { key: 'date', label: '날짜', type: 'date' },
  { key: 'departure_airport', label: '출국공항', type: 'text', placeholder: 'ICN' },
  { key: 'arrival_airport', label: '입국공항', type: 'text', placeholder: 'NRT' },
  { key: 'transport', label: '운송방법', type: 'select' },
  { key: 'flight_number', label: '항공편명', type: 'text', placeholder: 'KE713' },
]

const DATA_KEY = 'japan_extra'

/* ── Component ── */

export function JapanExtraField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra: JapanExtra = (data[DATA_KEY] as JapanExtra) ?? {
    inbound: { ...EMPTY_FLIGHT }, outbound: { ...EMPTY_FLIGHT }, email: null, address_overseas: null, certificate_no: null,
  }

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

  // 기존 데이터 backfill — outbound.date는 있으나 data.return_date가 비어 있으면 동기화
  // (sync 로직 추가 이전에 저장된 케이스 대응)
  useEffect(() => {
    if (extra.outbound.date && !data.return_date) {
      syncReturnDate(extra.outbound.date)
    }
    if (extra.inbound.date && !caseRow.departure_date) {
      syncDepartureDate(extra.inbound.date)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  /* ── Save ── */

  async function saveExtra(next: JapanExtra) {
    const hasAny =
      Object.values(next.inbound).some((v) => v !== null) ||
      Object.values(next.outbound).some((v) => v !== null) ||
      next.email !== null ||
      next.address_overseas !== null ||
      next.certificate_no !== null
    const val = hasAny ? next : null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditingField(null)
  }

  function saveFlightField(direction: 'inbound' | 'outbound', key: keyof FlightEntry, value: string | null) {
    saveExtra({ ...extra, [direction]: { ...extra[direction], [key]: value || null } })
    // 한국 → 일본(inbound)의 날짜는 출국일과 동일 — 케이스의 departure_date에도 동기화
    if (direction === 'inbound' && key === 'date' && value) {
      syncDepartureDate(value)
    }
    // 일본 → 한국(outbound)의 날짜는 귀국일과 동일 — data.return_date에도 동기화
    if (direction === 'outbound' && key === 'date' && value) {
      syncReturnDate(value)
    }
  }

  async function syncDepartureDate(date: string | null) {
    if (!date) return
    const r = await updateCaseField(caseId, 'column', 'departure_date', date)
    if (r.ok) updateLocalCaseField(caseId, 'column', 'departure_date', date)
  }

  async function syncReturnDate(date: string | null) {
    if (!date) return
    const r = await updateCaseField(caseId, 'data', 'return_date', date)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'return_date', date)
  }

  function saveEmail(value: string | null) {
    saveExtra({ ...extra, email: value || null })
  }

  function saveAddress(value: string | null) {
    saveExtra({ ...extra, address_overseas: value || null })
  }

  function saveCertificate(value: string | null) {
    saveExtra({ ...extra, certificate_no: value || null })
  }

  /* ── AI extraction ── */

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractFlightInfo(input)
      if (result.ok) {
        const merged: JapanExtra = { ...extra }
        // Merge inbound
        for (const [k, v] of Object.entries(result.data.inbound)) {
          if (v !== null) (merged.inbound as unknown as Record<string, string | null>)[k] = v
        }
        // Merge outbound
        for (const [k, v] of Object.entries(result.data.outbound)) {
          if (v !== null) (merged.outbound as unknown as Record<string, string | null>)[k] = v
        }
        // Merge address & certificate & email
        if (result.data.address_overseas) merged.address_overseas = result.data.address_overseas
        if (result.data.certificate_no) merged.certificate_no = result.data.certificate_no
        if (result.data.email) merged.email = result.data.email
        const r = await updateCaseField(caseId, 'data', DATA_KEY, merged)
        if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, merged)
        // inbound.date = 한국 출국일 → 케이스의 departure_date 컬럼에도 동기화
        if (result.data.inbound.date) await syncDepartureDate(result.data.inbound.date)
        // outbound.date = 한국 귀국일 → data.return_date 에도 동기화
        if (result.data.outbound.date) await syncReturnDate(result.data.outbound.date)
        setExtractMsg('항공편 정보가 입력되었습니다')
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
      // Only handle if hovering over this section or textarea is focused
      const active = document.activeElement
      const inSection = dropRef.current.contains(active) || dropRef.current.matches(':hover')
      if (!inSection) return
      // Skip if editing a field input
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
        return
      }

      // Text paste — only if textarea is focused
      if (active === textRef.current) return // let textarea handle it normally
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

  /* ── Render ── */

  return (
    <div
      ref={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'mt-2 pt-2 border-t border-border/40 rounded-md transition-colors',
        dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
      )}
    >
      {/* ── Input zone ── */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
        <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1">AI 입력</span>
        <div className="min-w-0 space-y-1">
          {showInput ? (
            <div className="space-y-1">
              <textarea
                ref={textRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit() }
                  if (e.key === 'Escape') { setShowInput(false); setInputText('') }
                }}
                placeholder="항공권 정보를 붙여넣으세요 (Enter로 추출)"
                className="w-full min-h-[3rem] rounded-md border border-border/50 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
              />
            </div>
          ) : (
            <div className="flex items-center gap-xs">
              <button
                type="button"
                onClick={() => { setShowInput(true); setTimeout(() => textRef.current?.focus(), 50) }}
                disabled={extracting}
                className="text-left rounded-md px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/50 transition-colors hover:text-muted-foreground cursor-pointer disabled:opacity-50"
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
          {dragOver && <div className="text-xs text-muted-foreground">놓으면 자동 입력</div>}
        </div>
      </div>

      {/* ── Inbound ── */}
      <FlightBlock
        label="입국 항공편"
        direction="inbound"
        flight={extra.inbound}
        editingField={editingField}
        setEditingField={setEditingField}
        onSave={(key, val) => saveFlightField('inbound', key, val)}
      />

      {/* ── Outbound ── */}
      <FlightBlock
        label="출국 항공편"
        direction="outbound"
        flight={extra.outbound}
        editingField={editingField}
        setEditingField={setEditingField}
        onSave={(key, val) => saveFlightField('outbound', key, val)}
      />

      {/* ── Email ── */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
        <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1">이메일</span>
        {editingField === 'email' ? (
          <InlineInput
            type="text"
            initial={extra.email ?? ''}
            placeholder="email@example.com"
            onSave={(v) => saveEmail(v)}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group/val relative inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField('email')}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
                !extra.email && 'text-muted-foreground/60',
              )}
            >
              {extra.email || '—'}
            </button>
            {extra.email && (
              <>
                <CopyButton value={extra.email} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <button
                  type="button"
                  onClick={() => saveEmail(null)}
                  className="ml-0.5 rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 opacity-0 group-hover/val:opacity-100 transition-opacity"
                  title="삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Address ── */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
        <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1">해외주소</span>
        {editingField === 'address_overseas' ? (
          <InlineInput
            type="text"
            initial={extra.address_overseas ?? ''}
            placeholder="Destination address in Japan"
            onSave={(v) => saveAddress(v)}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group/val relative inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField('address_overseas')}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
                !extra.address_overseas && 'text-muted-foreground/60',
              )}
            >
              {extra.address_overseas || '—'}
            </button>
            {extra.address_overseas && (
              <>
                <CopyButton value={extra.address_overseas} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <button
                  type="button"
                  onClick={() => saveAddress(null)}
                  className="ml-0.5 rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 opacity-0 group-hover/val:opacity-100 transition-opacity"
                  title="삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Certificate No ── */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
        <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1">EQC No.</span>
        {editingField === 'certificate_no' ? (
          <InlineInput
            type="text"
            initial={extra.certificate_no ?? ''}
            placeholder=""
            onSave={(v) => saveCertificate(v)}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group/val relative inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField('certificate_no')}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
                !extra.certificate_no && 'text-muted-foreground/60',
              )}
            >
              {extra.certificate_no || '—'}
            </button>
            {extra.certificate_no && (
              <>
                <CopyButton value={extra.certificate_no} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <button
                  type="button"
                  onClick={() => saveCertificate(null)}
                  className="ml-0.5 rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 opacity-0 group-hover/val:opacity-100 transition-opacity"
                  title="삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Flight Block (display only, no drop) ── */

function FlightBlock({ label, direction, flight, editingField, setEditingField, onSave }: {
  label: string
  direction: string
  flight: FlightEntry
  editingField: string | null
  setEditingField: (v: string | null) => void
  onSave: (key: keyof FlightEntry, val: string | null) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
      <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1">{label}</span>
      <div className="min-w-0 space-y-0.5">
        {FLIGHT_FIELDS.map((f) => {
          const fieldId = `${direction}.${f.key}`
          const val = flight[f.key] ?? null
          const isEditing = editingField === fieldId
          return (
            <div key={f.key} className="flex items-center gap-sm">
              <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground w-16 shrink-0">{f.label}</span>
              {isEditing ? (
                f.type === 'select' ? (
                  <SelectInput
                    options={TRANSPORT_OPTIONS}
                    initial={val ?? ''}
                    onSave={(v) => onSave(f.key, v)}
                    onCancel={() => setEditingField(null)}
                  />
                ) : (
                  <InlineInput
                    type={f.type}
                    initial={val ?? ''}
                    placeholder={f.placeholder ?? ''}
                    onSave={(v) => onSave(f.key, v)}
                    onCancel={() => setEditingField(null)}
                    uppercase={f.type === 'text'}
                  />
                )
              ) : (
                <div className="group/val relative inline-flex items-baseline">
                  <button
                    type="button"
                    onClick={() => setEditingField(fieldId)}
                    className={cn(
                      'text-left rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
                      !val && 'text-muted-foreground/60',
                    )}
                  >
                    {f.type === 'select' && val
                      ? TRANSPORT_OPTIONS.find((o) => o.value === val)?.label ?? val
                      : val || '—'}
                  </button>
                  {val && (
                    <>
                      <CopyButton
                        value={f.type === 'select' ? TRANSPORT_OPTIONS.find((o) => o.value === val)?.label ?? val : val}
                        className="ml-1 opacity-0 group-hover/val:opacity-100"
                      />
                      <button
                        type="button"
                        onClick={() => onSave(f.key, null)}
                        className="ml-0.5 rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 opacity-0 group-hover/val:opacity-100 transition-opacity"
                        title="삭제"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Inputs ── */

function InlineInput({ type, initial, placeholder, onSave, onCancel, uppercase }: {
  type: 'text' | 'date'; initial: string; placeholder: string
  onSave: (v: string | null) => void; onCancel: () => void; uppercase?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initial)
  useEffect(() => { ref.current?.focus() }, [])
  function save() { onSave(val.trim() || null) }
  return (
    <input ref={ref} type={type} value={val}
      onChange={(e) => setVal(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() }; if (e.key === 'Escape') onCancel() }}
      onBlur={() => setTimeout(save, 150)} placeholder={placeholder}
      className="h-7 w-36 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

function SelectInput({ options, initial, onSave, onCancel }: {
  options: { value: string; label: string }[]; initial: string
  onSave: (v: string | null) => void; onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <select ref={ref} defaultValue={initial}
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
