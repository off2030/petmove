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
import { DateTextField } from '@/components/ui/date-text-field'

type ExtractOk = Extract<Awaited<ReturnType<typeof extractFlightInfo>>, { ok: true }>

export interface ExtractOutcome<T> {
  /** 병합된 extra. null이면 "정보를 찾지 못했습니다" 메시지 표시. */
  merged: T | null
  /** 성공 메시지 (기본: '정보가 입력되었습니다') */
  successMsg?: string
  /** merged=null일 때 노출할 실패 메시지 */
  noMatchMsg?: string
  /** 저장 후 실행할 추가 작업 (예: departure_date 동기화) */
  afterSave?: () => Promise<void>
}

export interface ExtractHelpers {
  syncDepartureDate: (date: string | null) => Promise<void>
}

export type ExtractHandler<T> = (result: ExtractOk, current: T, helpers: ExtractHelpers) => ExtractOutcome<T>

function hasAnyValue(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false
  if (typeof obj !== 'object') return true
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (hasAnyValue(v)) return true
  }
  return false
}

export function useExtraFieldShell<T extends object>(params: {
  caseId: string
  caseRow: CaseRow
  dataKey: string
  empty: T
  onExtract: ExtractHandler<T>
}) {
  const { caseId, caseRow, dataKey, empty, onExtract } = params
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra: T = (data[dataKey] as T) ?? empty

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

  async function saveExtra(next: T) {
    const val = hasAnyValue(next) ? next : null
    const r = await updateCaseField(caseId, 'data', dataKey, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', dataKey, val)
    setEditingField(null)
  }

  function saveField<K extends keyof T>(key: K, value: string | null) {
    saveExtra({ ...extra, [key]: (value || null) as T[K] })
  }

  async function syncDepartureDate(date: string | null) {
    if (!date) return
    const r = await updateCaseField(caseId, 'column', 'departure_date', date)
    if (r.ok) updateLocalCaseField(caseId, 'column', 'departure_date', date)
  }

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractFlightInfo(input)
      if (result.ok) {
        const { merged, successMsg, noMatchMsg, afterSave } = onExtract(result, extra, { syncDepartureDate })
        if (merged === null) {
          setExtractMsg(noMatchMsg ?? '추출 실패: 관련 정보를 찾지 못했습니다')
        } else {
          const r = await updateCaseField(caseId, 'data', dataKey, merged)
          if (r.ok) updateLocalCaseField(caseId, 'data', dataKey, merged)
          if (afterSave) await afterSave()
          setExtractMsg(successMsg ?? '정보가 입력되었습니다')
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

  return {
    extra,
    editingField, setEditingField,
    extracting, extractMsg,
    dragOver, inputText, setInputText, showInput, setShowInput,
    dropRef, textRef, fileRef,
    saveExtra, saveField,
    handleFiles, handleTextSubmit,
    handleDragOver, handleDragLeave, handleDrop,
    syncDepartureDate,
  }
}

export type ShellApi<T extends object> = ReturnType<typeof useExtraFieldShell<T>>

/** AI 입력 + 드래그드랍 감싸는 외곽 박스. children으로 국가별 필드 행을 받는다. */
export function ExtraFieldShell<T extends object>({
  shell, placeholder, children,
}: { shell: ShellApi<T>; placeholder: string; children: React.ReactNode }) {
  const {
    dropRef, textRef, fileRef,
    extracting, extractMsg, dragOver, inputText, setInputText, showInput, setShowInput,
    handleFiles, handleTextSubmit, handleDragOver, handleDragLeave, handleDrop,
  } = shell
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
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
        <div className="flex items-center gap-[6px] pt-1">
          <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">AI 입력</span>
          <input ref={fileRef} type="file" accept="image/*,.pdf" multiple onChange={(e) => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = '' }} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={extracting} className="shrink-0 rounded-md p-1 text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-30" title="이미지/PDF 첨부">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
        </div>
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
              placeholder={placeholder}
              className="w-full min-h-[3rem] rounded-md border border-border/50 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setShowInput(true); setTimeout(() => textRef.current?.focus(), 50) }}
              disabled={extracting}
              className="text-left rounded-md px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/50 transition-colors hover:text-muted-foreground cursor-pointer disabled:opacity-50"
            >
              {extracting ? '추출 중...' : '—'}
            </button>
          )}
          {extractMsg && (
            <div className={cn('text-xs', extractMsg.includes('실패') || extractMsg.includes('오류') ? 'text-red-600' : 'text-green-600')}>
              {extractMsg}
            </div>
          )}
          {dragOver && <div className="text-xs text-muted-foreground">놓으면 자동 입력</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

export interface FieldRowProps {
  label: string
  value: string | null
  isEditing: boolean
  onStartEdit: () => void
  onSave: (v: string | null) => void
  onCancelEdit: () => void
  type?: 'text' | 'date' | 'time' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
  uppercase?: boolean
  /** FlightBlock sub-field처럼 좁은 layout 원할 때 */
  compact?: boolean
  compactLabelClass?: string
  allowDelete?: boolean
}

export function FieldRow({
  label, value, isEditing, onStartEdit, onSave, onCancelEdit,
  type = 'text', placeholder = '', options, uppercase, compact, compactLabelClass, allowDelete = true,
}: FieldRowProps) {
  const isSelect = type === 'select'
  const display = isSelect && value ? (options?.find(o => o.value === value)?.label ?? value) : value
  const rowCls = compact
    ? 'flex items-center gap-sm'
    : 'grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0'
  const labelCls = compact
    ? (compactLabelClass ?? 'font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground w-16 shrink-0')
    : 'font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1'
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      {isEditing ? (
        isSelect ? (
          <SelectInput options={options ?? []} initial={value ?? ''} onSave={onSave} onCancel={onCancelEdit} />
        ) : (
          <InlineInput
            type={type}
            initial={value ?? ''}
            placeholder={placeholder}
            onSave={onSave}
            onCancel={onCancelEdit}
            uppercase={uppercase}
          />
        )
      ) : (
        <div className="group/val inline-flex items-baseline">
          <button
            type="button"
            onClick={onStartEdit}
            className={cn(
              'text-left rounded-md px-2 py-0.5 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text',
              !value && 'text-muted-foreground/60',
            )}
          >
            {display || '—'}
          </button>
          {value && (
            <>
              <CopyButton value={String(display)} className="ml-1 opacity-0 group-hover/val:opacity-100" />
              {allowDelete && (
                <button
                  type="button"
                  onClick={() => onSave(null)}
                  className="ml-0.5 rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 opacity-0 group-hover/val:opacity-100 transition-opacity"
                  title="삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function InlineInput({ type, initial, placeholder, onSave, onCancel, uppercase }: {
  type: 'text' | 'date' | 'time'
  initial: string
  placeholder: string
  onSave: (v: string | null) => void
  onCancel: () => void
  uppercase?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initial)
  useEffect(() => { if (type !== 'date') ref.current?.focus() }, [type])
  function save() { onSave(val.trim() || null) }

  if (type === 'date') {
    return (
      <DateTextField
        autoFocus
        value={initial}
        onChange={(v) => onSave(v || null)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        size="sm"
        className="w-full max-w-[200px] bg-transparent border-0 border-b border-primary text-base py-1 focus:outline-none"
      />
    )
  }

  return (
    <input
      ref={ref}
      type={type}
      value={val}
      onChange={(e) => setVal(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); save() }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => setTimeout(save, 150)}
      placeholder={placeholder}
      className="h-7 w-full max-w-[320px] rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

export function SelectInput({ options, initial, onSave, onCancel }: {
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
