'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Trash2, Paperclip } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { AttachButton } from '@/components/ui/attach-button'
import { cn, roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@petmove/domain'
import { supabaseBrowser as supabase } from '@petmove/auth'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@petmove/ui'
import { signAttachmentUrls } from '@/lib/actions/attachment-urls'

/* ── Types ── */

interface TextNote {
  type: 'text'
  content: string
  createdAt: string
}

interface FileNote {
  type: 'file'
  name: string
  /** Storage path (`{caseId}/{filename}`). 신규 업로드는 항상 path 사용. */
  path?: string
  /** Legacy public URL — 버킷 private 화 이전 데이터. path 추출용으로만 사용. */
  url?: string
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

/** path 또는 legacy url 에서 storage path 추출. */
function derivePath(item: { path?: string; url?: string }): string | null {
  if (item.path) return item.path
  if (!item.url) return null
  const parts = item.url.split('/attachments/')
  return parts.length > 1 ? parts[parts.length - 1] : null
}

const DATA_KEY = 'notes'

/* ── Component ── */

export function NotesField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const notes = readNotes(data)

  const [saving] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [addingText, setAddingText] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditIdx(null)
    setAddingText(false)
    setError(null)
    setDragOver(false)
  }, [caseId])

  // 첨부파일 path 들 모아서 signed URL 일괄 발급. 버킷 private 이라 매 렌더마다 갱신 필요.
  // notes 의 file note 만 대상; text note 는 무관.
  useEffect(() => {
    const paths = notes
      .filter((n): n is FileNote => n.type === 'file')
      .map(derivePath)
      .filter((p): p is string => !!p)
    if (paths.length === 0) {
      setSignedUrls({})
      return
    }
    let cancelled = false
    signAttachmentUrls(paths).then((map) => {
      if (!cancelled) setSignedUrls(map)
    }).catch(() => {})
    return () => { cancelled = true }
  // notes 길이·path 시그니처 기반 리렌더 — JSON.stringify 보다 가벼운 비교를 위해 caseId+개수 사용.
  // path 변동(추가/삭제) 시는 saveNotes 흐름에서 caseRow 갱신으로 자연스럽게 트리거됨.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, notes.length])

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

      newNotes.push({
        type: 'file',
        name: file.name,
        path,
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
      const path = derivePath(note)
      if (path) {
        // portal 의 step 첨부·필수 서류 미리보기와 동기화 — 같은 path 를
        // 참조하는 data.documents 항목도 함께 제거. notes 만 지우면 portal 에
        // 끊긴 링크가 남는다 (admin 이 광견병 항체검사 같은 stepId 가 붙은
        // 업로드를 notes+documents 양쪽에 기록하기 때문).
        const docs = Array.isArray(data.documents)
          ? (data.documents as Array<Record<string, unknown>>)
          : []
        const nextDocs = docs.filter((d) => d?.path !== path)
        if (nextDocs.length !== docs.length) {
          const val = nextDocs.length > 0 ? nextDocs : null
          updateLocalCaseField(caseId, 'data', 'documents', val)
          void updateCaseField(caseId, 'data', 'documents', val)
        }
        void supabase.storage.from('attachments').remove([path])
      }
    }
  }

  /* ── Render ── */

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? () => setAddingText(true) : undefined}
          title={editMode ? '메모 추가' : undefined}
        >
          메모
        </SectionLabel>
        {/* 모바일 전용 첨부 — 데스크톱은 드래그·붙여넣기·메모추가 클립을 쓰지만
            모바일엔 그 경로가 없다. addingText 블록 밖에 두어 textarea blur 로
            언마운트되지 않게 함(언마운트 시 ScanFlow·input 이 사라져 저장 실패). */}
        <AttachButton
          multiple
          scan={false}
          onFile={(file) => uploadFiles([file])}
          className="md:hidden inline-flex ml-auto h-7 w-7 rounded-full border border-border/80 bg-popover"
          title="파일 첨부"
        >
          <Paperclip size={14} />
        </AttachButton>
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
              {note.createdAt && (
                <span
                  title={formatMemoDateFull(note.createdAt)}
                  className="shrink-0 mt-2 font-mono text-[10px] tracking-[0.3px] tabular-nums text-muted-foreground/50 whitespace-nowrap"
                >
                  {formatMemoDate(note.createdAt)}
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

          {/* ── Text input (new) — 입력칸 우측에 [저장][클립] 한 줄 배치, 같은 높이.
                저장은 NoteTextInput 내부, 클립은 외부 — 부모 flex 가 items-start 로 textarea
                상단에 두 버튼 모두 정렬해 textarea 가 multi-line 으로 늘어나도 어긋나지 않음. ── */}
          {addingText && (
            <div className="flex items-start gap-sm">
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
                scan={false}
                onFile={(file) => uploadFiles([file])}
                className="shrink-0 hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-popover text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                title="파일 첨부"
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
                  href={(() => { const p = derivePath(note); return (p && signedUrls[p]) || '#' })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground hover:underline truncate"
                  onClick={(e) => {
                    const p = derivePath(note)
                    if (!p || !signedUrls[p]) e.preventDefault()
                  }}
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
    <div className="flex items-start gap-sm flex-1 min-w-0">
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
        className="flex-1 min-w-0 min-h-[2rem] rounded-md border border-border/80 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSave(val.trim())}
        disabled={saving}
        className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 transition-colors disabled:opacity-50"
      >
        {saving ? '...' : '저장'}
      </button>
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

/** 메모 날짜 — 컴팩트 YY·MM·DD (Editorial 토큰 dot). 빈 문자열은 빈 결과. */
function formatMemoDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}·${mm}·${dd}`
}

/** 호버 시 보여줄 풀 시간 — 'YYYY-MM-DD HH:mm'. */
function formatMemoDateFull(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mm}-${dd} ${hh}:${mi}`
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
