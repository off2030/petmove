'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { useCases } from './cases-context'
import type { CaseRow } from '@petmove/domain'
import { supabaseBrowser as supabase } from '@/lib/supabase/browser'
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
  const { updateLocalCaseField, isCaseHydrated } = useCases()
  const editMode = useSectionEditMode()
  // 목록 초기 로드는 경량 행(data.notes·attachments 제외 — @/lib/case-list-lite)이라,
  // 풀 행 hydrate 전에는 읽기·쓰기 모두 막는다. 특히 saveNotes 는 배열 통째 저장이라
  // 경량(빈) 상태에서 저장하면 서버의 실제 메모·첨부를 지운다. 게다가 notes 가 빠진
  // data 로 readNotes 를 부르면 레거시 memo/memos 폴백이 "메모"로 둔갑해 보인다.
  const hydrated = isCaseHydrated(caseId)
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const notes = hydrated ? readNotes(data) : []

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
    const fileNotes = notes.filter((n): n is FileNote => n.type === 'file')
    const paths: string[] = []
    // path → 표시명: 다운로드 시 storage safeName(한글→'_') 대신 업로드명을 쓰도록.
    const names: Record<string, string> = {}
    for (const n of fileNotes) {
      const p = derivePath(n)
      if (!p) continue
      paths.push(p)
      names[p] = n.name
    }
    if (paths.length === 0) {
      setSignedUrls({})
      return
    }
    let cancelled = false
    signAttachmentUrls(paths, names).then((map) => {
      if (!cancelled) setSignedUrls(map)
    }).catch(() => {})
    return () => { cancelled = true }
  // notes 길이·path 시그니처 기반 리렌더 — JSON.stringify 보다 가벼운 비교를 위해 caseId+개수 사용.
  // path 변동(추가/삭제) 시는 saveNotes 흐름에서 caseRow 갱신으로 자연스럽게 트리거됨.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, notes.length])

  /* ── Persistence ── */

  async function saveNotes(next: NoteItem[]) {
    // 경량 행 위에서 저장 금지 — 빈 배열 기반 재구성이 서버 notes 를 덮어쓴다.
    if (!hydrated) return
    const val = next.length > 0 ? next : null
    // Optimistic — 실패해도 값 보존 + '다시 시도' 토스트(persistField).
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
    await persistField('메모', () => updateCaseField(caseId, 'data', DATA_KEY, val))
  }

  /* ── Text actions ── */

  async function saveNewText(value: string) {
    if (!value.trim()) { setAddingText(false); return }
    const item: TextNote = { type: 'text', content: value, createdAt: new Date().toISOString() }
    const next = [...notes, item]
    // 입력창은 즉시 닫는다 — saveNotes 의 optimistic 렌더(새 메모가 위에 뜸)와
    // 서버 응답을 기다리는 입력창이 겹쳐 화면이 아래로 밀리는 현상 방지.
    setAddingText(false)
    await saveNotes(next)
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
    if (!hydrated) return
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

  // 풀 행 hydrate 전 — 같은 레이아웃의 로딩 자리표시(케이스 선택 직후 한 번의 조회 동안만).
  if (!hydrated) {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80">
          <div className="flex items-center gap-[6px] pt-1">
            <SectionLabel>메모</SectionLabel>
          </div>
          <span className="px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/40 animate-pulse select-none">…</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0">
          <div className="flex items-center gap-[6px] pt-1">
            <SectionLabel>보관함</SectionLabel>
          </div>
          <span className="px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/40 animate-pulse select-none">…</span>
        </div>
      </>
    )
  }

  // 메모(텍스트)와 첨부 파일을 각각 별도 필드 행으로 분리 렌더 (아래 두 그리드 행).
  const hasText = notes.some((n) => n.type === 'text')
  const hasFile = notes.some((n) => n.type === 'file')

  return (
    <>
      {/* ── 메모 (텍스트) ── */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors">
        <div className="flex items-center gap-[6px] pt-1">
          <SectionLabel
            onClick={editMode ? () => setAddingText(true) : undefined}
            title={editMode ? '메모 추가' : undefined}
          >
            메모
          </SectionLabel>
        </div>

        <div className="min-w-0 space-y-1">
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

          {/* 빈 상태 — 텍스트 메모 없음 (클릭 시 메모 입력 시작). */}
          {!hasText && !addingText && (
            editMode ? (
              <button type="button" onClick={() => setAddingText(true)}
                className="text-left rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border cursor-pointer text-muted-foreground/40 select-none">
                —
              </button>
            ) : (
              <span className="text-muted-foreground/40 select-none px-2 py-1 -mx-2 inline-block" aria-hidden>—</span>
            )
          )}

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
            </div>
          )}
        </div>
      </div>

      {/* ── 첨부 파일 (메모와 분리) ── */}
      <div
        ref={dropRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors last:border-0 rounded-md',
          dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
        )}
      >
        <div className="flex items-center gap-[6px] pt-1">
          <SectionLabel onClick={() => fileRef.current?.click()} title="클릭 · 드래그 · Ctrl+V 로 첨부">
            보관함
          </SectionLabel>
        </div>

        <div className="min-w-0 space-y-1">
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={handleInputChange}
            className="hidden"
          />

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

          {/* 빈 상태 — 파일 없음. 클릭하면 파일 선택창. */}
          {!hasFile && !uploading && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-left rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border cursor-pointer text-muted-foreground/40 select-none"
            >
              —
            </button>
          )}

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
    </>
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
        // 저장 후 표시(font-serif 17px medium)와 동일 타이포·동일 좌표(px-2 -mx-2) —
        // 입력↔저장 전환 시 글씨가 바뀌거나 자리가 튀지 않도록.
        className="flex-1 min-w-0 min-h-[2rem] rounded-md border border-border/80 bg-background px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground focus-visible:outline-none resize-none"
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
