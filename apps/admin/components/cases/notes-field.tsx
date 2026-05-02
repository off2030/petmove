'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Trash2, Paperclip } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { AttachButton } from '@/components/ui/attach-button'
import { cn, roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { supabaseBrowser as supabase } from '@/lib/supabase/browser'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

/* ── Types ── */

interface TextNote {
  type: 'text'
  content: string
  createdAt: string
}

interface FileNote {
  type: 'file'
  name: string
  url: string
  size: number
  createdAt: string
}

type NoteItem = TextNote | FileNote

/* Legacy attachment shape (from attachments-field) */
interface LegacyAttachment {
  name: string
  url: string
  size: number
  uploadedAt: string
}

const DATA_KEY = 'notes'

/* ── Component ── */

export function NotesField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const notes = readNotes(data)

  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [addingText, setAddingText] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditIdx(null)
    setAddingText(false)
    setError(null)
    setDragOver(false)
  }, [caseId])

  /* ── Persistence ── */

  async function saveNotes(next: NoteItem[]) {
    const val = next.length > 0 ? next : null
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const prevSnapshot = notes
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    // Clear legacy keys on first save (fire-and-forget)
    if (data.memo) {
      updateLocalCaseField(caseId, 'data', 'memo', null)
      updateCaseField(caseId, 'data', 'memo', null).catch(() => {})
    }
    if (data.memos) {
      updateLocalCaseField(caseId, 'data', 'memos', null)
      updateCaseField(caseId, 'data', 'memos', null).catch(() => {})
    }
    if (data.attachments) {
      updateLocalCaseField(caseId, 'data', 'attachments', null)
      updateCaseField(caseId, 'data', 'attachments', null).catch(() => {})
    }
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (!r.ok) {
      updateLocalCaseField(caseId, 'data', DATA_KEY, prevSnapshot.length > 0 ? prevSnapshot : null)
    }
  }

  /* ── Text actions ── */

  async function saveNewText(value: string) {
    if (!value.trim()) { setAddingText(false); return }
    const item: TextNote = { type: 'text', content: value, createdAt: new Date().toISOString() }
    const next = [...notes, item]
    await saveNotes(next)
    setAddingText(false)
  }

  function updateText(idx: number, value: string) {
    if (!value.trim()) { deleteNote(idx); return }
    const next = notes.map((n, i) =>
      i === idx && n.type === 'text' ? { ...n, content: value } : n,
    )
    saveNotes(next).catch(() => {})
    setEditIdx(null)
  }

  /* ── File actions ── */

  async function uploadFiles(files: FileList | File[]) {
    if (!files || (files as FileList).length === 0) return

    setUploading(true)
    setError(null)
    const newNotes = [...notes]
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${caseId}/${Date.now()}_${safeName}`
      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(path, file)

      if (uploadErr) {
        setError(`업로드 실패: ${file.name} (${uploadErr.message})`)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(path)

      newNotes.push({
        type: 'file',
        name: file.name,
        url: urlData.publicUrl,
        size: file.size,
        createdAt: new Date().toISOString(),
      })

    }

    await saveNotes(newNotes)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(e.target.files)
  }

  /* ── Paste (Ctrl+V image) ── */

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      // Only handle if this component's drop zone is in the DOM
      if (!dropRef.current) return
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            // Name clipboard images with timestamp
            const ext = file.type.split('/')[1] || 'png'
            const named = new File([file], `clipboard_${Date.now()}.${ext}`, { type: file.type })
            imageFiles.push(named)
          }
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        uploadFiles(imageFiles)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, notes])

  /* ── Drag & drop ── */

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    // Only leave if actually exiting the drop zone
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  /* ── Delete ── */

  const confirm = useConfirm()
  async function deleteNote(idx: number) {
    const note = notes[idx]
    const ok = await confirm({
      message: note.type === 'file' ? '첨부파일을 삭제하시겠습니까?' : '메모를 삭제하시겠습니까?',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const next = notes.filter((_, i) => i !== idx)
    // Optimistic — saveNotes 가 즉시 로컬 반영. 스토리지 삭제는 백그라운드.
    saveNotes(next).catch(() => {})
    if (note.type === 'file') {
      const urlParts = note.url.split('/attachments/')
      const path = urlParts[urlParts.length - 1]
      void supabase.storage.from('attachments').remove([path])
    }
  }

  /* ── Render ── */

  const hasContent = notes.length > 0 || addingText || uploading

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? () => setAddingText(true) : undefined}
          title={editMode ? '메모 추가' : undefined}
        >
          메모
        </SectionLabel>
      </div>

      <div className="min-w-0 flex items-start gap-md">
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex-1 min-w-0 space-y-1 rounded-md transition-colors',
            dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
          )}
        >
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={handleInputChange}
            className="hidden"
          />

          {/* ── Text memos ── */}
          {notes.map((note, i) => note.type === 'text' && (
            <div key={i} className="group/item flex items-start gap-sm">
              {editMode && editIdx === i ? (
                <NoteTextInput
                  initial={note.content}
                  onSave={(v) => updateText(i, v)}
                  onCancel={() => setEditIdx(null)}
                  saving={saving}
                />
              ) : editMode ? (
                <button
                  type="button"
                  onClick={() => setEditIdx(i)}
                  className="text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text whitespace-pre-wrap flex-1 min-w-0"
                >
                  {note.content}
                </button>
              ) : (
                <span className="rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground whitespace-pre-wrap flex-1 min-w-0">
                  {note.content}
                </span>
              )}
              {editMode && (
                <button
                  type="button"
                  onClick={() => deleteNote(i)}
                  title="삭제"
                  className="shrink-0 inline-flex items-center justify-center rounded-md p-1 mt-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/item:opacity-70 hover:!opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}

          {/* ── Text input (new) — 입력칸 우측 중앙에 클립 아이콘으로 파일 첨부 ── */}
          {addingText && (
            <div className="flex items-center gap-sm">
              <div className="flex-1 min-w-0">
                <NoteTextInput
                  initial=""
                  onSave={saveNewText}
                  onCancel={() => setAddingText(false)}
                  saving={saving}
                />
              </div>
              <AttachButton
                multiple
                onFile={(file) => uploadFiles([file])}
                className={roundIconBtn}
                title="파일 첨부 (모바일 카메라 시 자동 크롭)"
              >
                <Paperclip size={14} />
              </AttachButton>
            </div>
          )}

          {/* ── File attachments ── */}
          {notes.map((note, i) => note.type === 'file' && (
            <div key={i} className="group/item flex items-start gap-sm">
              <div className="flex items-center gap-sm flex-1 min-w-0 py-1">
                <span className="text-muted-foreground/60 text-xs shrink-0">📎</span>
                <a
                  href={note.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground hover:underline truncate"
                >
                  {note.name}
                </a>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(note.size)}
                </span>
              </div>
              {editMode && (
                <button
                  type="button"
                  onClick={() => deleteNote(i)}
                  title="삭제"
                  className="shrink-0 inline-flex items-center justify-center rounded-md p-1 mt-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/item:opacity-70 hover:!opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}

          {uploading && (
            <div className="text-xs text-muted-foreground py-1">업로드 중...</div>
          )}

          {dragOver && (
            <div className="text-xs text-muted-foreground text-center py-2">
              놓으면 첨부
            </div>
          )}

          {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
        </div>

      </div>
    </div>
  )
}

/* ── Helpers ── */

function NoteTextInput({ initial, onSave, onCancel, saving }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void; saving: boolean
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [])

  return (
    <textarea
      ref={ref}
      value={val}
      onChange={(e) => {
        setVal(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(val.trim()) }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => setTimeout(() => { if (!saving) onSave(val.trim()) }, 150)}
      placeholder="메모 입력 (Shift+Enter로 줄바꿈)"
      className="w-full min-h-[2rem] rounded-md border border-border/80 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
    />
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

/**
 * Read notes from case data, with backward compat for legacy memos/attachments.
 * Merges legacy data into the unified NoteItem[] format, sorted by createdAt.
 */
function readNotes(data: Record<string, unknown>): NoteItem[] {
  // If new notes array exists, use it directly
  if (Array.isArray(data[DATA_KEY])) {
    return data[DATA_KEY] as NoteItem[]
  }

  // Otherwise, merge legacy data
  const items: NoteItem[] = []

  // Legacy memos
  if (Array.isArray(data.memos)) {
    for (const m of data.memos as string[]) {
      items.push({ type: 'text', content: m, createdAt: '' })
    }
  } else if (typeof data.memo === 'string' && data.memo) {
    items.push({ type: 'text', content: data.memo, createdAt: '' })
  }

  // Legacy attachments
  if (Array.isArray(data.attachments)) {
    for (const a of data.attachments as LegacyAttachment[]) {
      items.push({
        type: 'file',
        name: a.name,
        url: a.url,
        size: a.size,
        createdAt: a.uploadedAt || '',
      })
    }
  }

  return items
}
