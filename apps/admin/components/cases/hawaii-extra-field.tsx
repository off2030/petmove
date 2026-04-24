'use client'

import { useRef, useState, useEffect } from 'react'
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

interface HawaiiExtra {
  passport_number: string | null
  passport_issuing_country: string | null
  passport_expiry_date: string | null
  date_of_birth: string | null
  email_address: string | null
  address_overseas: string | null
  postal_code: string | null
}

const EMPTY: HawaiiExtra = {
  passport_number: null,
  passport_issuing_country: null,
  passport_expiry_date: null,
  date_of_birth: null,
  email_address: null,
  address_overseas: null,
  postal_code: null,
}

const DATA_KEY = 'hawaii_extra'

export function HawaiiExtraField({ caseId, caseRow, sectionNumber }: { caseId: string; caseRow: CaseRow; sectionNumber: string }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra: HawaiiExtra = (data[DATA_KEY] as HawaiiExtra) ?? { ...EMPTY }

  const [editingField, setEditingField] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(false)
  const [inputText, setInputText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function saveExtra(next: HawaiiExtra) {
    const hasAny = Object.values(next).some((v) => v !== null)
    const val = hasAny ? next : null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditingField(null)
  }

  function saveField<K extends keyof HawaiiExtra>(key: K, value: string | null) {
    saveExtra({ ...extra, [key]: value || null })
  }

  /* ── AI extraction ── */

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractExtra({ country: 'hawaii', ...input })
      if (result.ok) {
        const merged: HawaiiExtra = { ...extra }
        for (const [k, v] of Object.entries(result.data)) {
          if (v !== null) (merged as unknown as Record<string, string | null>)[k] = v
        }
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
    if (images.length > 0) await tryExtract({ images })
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
        return
      }

      if (active === textRef.current) return
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

  const renderField = (key: keyof HawaiiExtra, label: string, type: 'text' | 'date' | 'email' = 'text', placeholder = '') => {
    const val = extra[key] ?? null
    const isEditing = editingField === key
    return (
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
        <SectionLabel className="pt-1">{label}</SectionLabel>
        {isEditing ? (
          <InlineInput type={type} initial={val ?? ''} placeholder={placeholder} onSave={(v) => saveField(key, v)} onCancel={() => setEditingField(null)} />
        ) : (
          <div className="group/val inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField(key)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
                !val && 'text-muted-foreground/60',
              )}
            >
              {val || '—'}
            </button>
            {val && (
              <>
                <CopyButton value={String(val)} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <button
                  type="button"
                  onClick={() => saveField(key, null)}
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
  }

  return (
    <ExtraSectionShell
      sectionNumber={sectionNumber}
      placeholder="여권/주소 정보를 붙여넣으세요 (Enter로 추출)"
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
      {renderField('passport_number', '여권번호', 'text', '마지막 4자리')}
      {renderField('passport_issuing_country', '발행국가', 'text', 'Republic of Korea')}
      {renderField('passport_expiry_date', '만료일', 'date')}
      {renderField('date_of_birth', '생년월일', 'date')}
      {renderField('email_address', '이메일주소', 'email')}
      {renderField('address_overseas', '해외주소', 'text')}
      {renderField('postal_code', '우편번호', 'text')}
    </ExtraSectionShell>
  )
}

function InlineInput({ type, initial, placeholder, onSave, onCancel }: {
  type: 'text' | 'date' | 'email'
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
