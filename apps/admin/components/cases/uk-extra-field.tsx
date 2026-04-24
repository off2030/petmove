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

const DATA_KEY = 'address_overseas'

export function UKExtraField({ caseId, caseRow, sectionNumber }: { caseId: string; caseRow: CaseRow; sectionNumber: string }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const address = (data[DATA_KEY] as string | null) ?? null

  const [editing, setEditing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(false)
  const [inputText, setInputText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setEditing(false) }, [caseId])

  async function saveAddress(v: string | null) {
    const val = v?.trim() || null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditing(false)
  }

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractExtra({ country: 'uk', ...input })
      if (result.ok && result.data.address_overseas) {
        await saveAddress(result.data.address_overseas)
        setExtractMsg('주소가 입력되었습니다')
      } else if (result.ok) {
        setExtractMsg('추출 실패: 주소를 찾지 못했습니다')
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

  return (
    <ExtraSectionShell
      sectionNumber={sectionNumber}
      placeholder="주소 정보를 붙여넣으세요 (Enter로 추출)"
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
      {/* ── 해외주소 ── */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
        <SectionLabel className="pt-1">해외주소</SectionLabel>
        {editing ? (
          <AddressInput
            initial={address ?? ''}
            onSave={saveAddress}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="group/val inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
                !address && 'text-muted-foreground/60',
              )}
            >
              {address || '—'}
            </button>
            {address && (
              <>
                <CopyButton value={address} className="ml-1 opacity-0 group-hover/val:opacity-100" />
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
    </ExtraSectionShell>
  )
}

function AddressInput({ initial, onSave, onCancel }: {
  initial: string
  onSave: (v: string | null) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initial)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <input
      ref={ref}
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSave(val.trim() || null) }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => setTimeout(() => onSave(val.trim() || null), 150)}
      placeholder="Destination address"
      className="h-7 w-full max-w-[400px] rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
