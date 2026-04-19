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

interface UsaExtra {
  passport_number: string | null
  birth_date: string | null
  us_phone: string | null
  arrival_date: string | null
}

const EMPTY: UsaExtra = {
  passport_number: null,
  birth_date: null,
  us_phone: null,
  arrival_date: null,
}

const DATA_KEY = 'usa_extra'

/* ── Component ── */

export function UsaExtraField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra: UsaExtra = (data[DATA_KEY] as UsaExtra) ?? { ...EMPTY }

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

  async function saveExtra(next: UsaExtra) {
    const hasAny = Object.values(next).some((v) => v !== null)
    const val = hasAny ? next : null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditingField(null)
  }

  function saveField<K extends keyof UsaExtra>(key: K, value: string | null) {
    saveExtra({ ...extra, [key]: value || null })
  }

  /* ── AI extraction ── */

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractFlightInfo(input)
      if (result.ok) {
        const merged: UsaExtra = { ...extra }
        if (result.data.passport_number) merged.passport_number = result.data.passport_number
        // Arrival date = inbound (Korea → USA)
        if (result.data.inbound.date) merged.arrival_date = result.data.inbound.date
        const r = await updateCaseField(caseId, 'data', DATA_KEY, merged)
        if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, merged)
        // inbound.date = 한국 출국일 → 케이스의 departure_date 컬럼에도 동기화
        if (result.data.inbound.date) {
          const rd = await updateCaseField(caseId, 'column', 'departure_date', result.data.inbound.date)
          if (rd.ok) updateLocalCaseField(caseId, 'column', 'departure_date', result.data.inbound.date)
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

  const renderField = (key: keyof UsaExtra, label: string, type: 'text' | 'date' = 'text', placeholder = '') => {
    const val = extra[key] ?? null
    const isEditing = editingField === key
    return (
      <div className="grid grid-cols-[140px_1fr] items-start gap-md py-1">
        <span className="text-sm text-muted-foreground pt-1">{label}</span>
        {isEditing ? (
          <InlineInput type={type} initial={val ?? ''} placeholder={placeholder} onSave={(v) => saveField(key, v)} onCancel={() => setEditingField(null)} />
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
              {val || '—'}
            </button>
            {val && <CopyButton value={val} className="ml-1 opacity-0 group-hover/val:opacity-100" />}
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
      <div className="grid grid-cols-[140px_1fr] items-start gap-md py-1">
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
            <div className="flex items-center gap-xs">
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

      {renderField('passport_number', '여권번호', 'text')}
      {renderField('birth_date', '생년월일', 'date')}
      {renderField('us_phone', '미국 전화번호', 'text', '+1-...')}
      {renderField('arrival_date', '도착일', 'date')}
    </div>
  )
}

/* ── Inputs ── */

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
      className="h-7 w-full max-w-[320px] rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
