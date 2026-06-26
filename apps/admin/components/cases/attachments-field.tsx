'use client'

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { SectionLabel } from '@/components/ui/section-label'
import { AttachButton } from '@/components/ui/attach-button'
import { roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@petmove/domain'
import { createClient } from '@supabase/supabase-js'
import { useSectionEditMode } from './section-edit-mode-context'
import { signAttachmentUrls } from '@/lib/actions/attachment-urls'

interface Attachment {
  name: string
  /** Storage path (`{caseId}/{filename}`). 신규 업로드는 항상 path 사용. */
  path?: string
  /** Legacy public URL — 버킷 private 화 이전 데이터. path 추출용으로만 사용. */
  url?: string
  size: number
  uploadedAt: string
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

function derivePath(item: { path?: string; url?: string }): string | null {
  if (item.path) return item.path
  if (!item.url) return null
  const parts = item.url.split('/attachments/')
  return parts.length > 1 ? parts[parts.length - 1] : null
}

export interface AttachmentsFieldHandle {
  triggerUpload: () => void
  uploading: boolean
}

export const AttachmentsField = forwardRef<AttachmentsFieldHandle, { caseId: string; caseRow: CaseRow }>(function AttachmentsField({ caseId, caseRow }, ref) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const attachments = (data.attachments as Attachment[]) ?? []

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    triggerUpload: () => fileRef.current?.click(),
    uploading,
  }), [uploading])

  useEffect(() => { setError(null) }, [caseId])

  // 첨부파일 path → signed URL 매핑 갱신. private 버킷이라 매번 발급 필요.
  useEffect(() => {
    const paths: string[] = []
    // path → 표시명: 다운로드 시 storage safeName 대신 업로드명을 쓰도록.
    const names: Record<string, string> = {}
    for (const att of attachments) {
      const p = derivePath(att)
      if (!p) continue
      paths.push(p)
      names[p] = att.name
    }
    if (paths.length === 0) { setSignedUrls({}); return }
    let cancelled = false
    signAttachmentUrls(paths, names).then((map) => {
      if (!cancelled) setSignedUrls(map)
    }).catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, attachments.length])

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return

    setUploading(true)
    setError(null)

    const newAttachments = [...attachments]

    for (const file of files) {
      // Upload to Supabase Storage
      // Sanitize filename: replace non-ASCII and spaces with underscores
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${caseId}/${Date.now()}_${safeName}`
      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(path, file)

      if (uploadErr) {
        setError(`업로드 실패: ${file.name} (${uploadErr.message})`)
        continue
      }

      newAttachments.push({
        name: file.name,
        path,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      })
    }

    // Save to case data
    const r = await updateCaseField(caseId, 'data', 'attachments', newAttachments)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'attachments', newAttachments)

    setUploading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFiles(Array.from(files))
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDelete(idx: number) {
    const att = attachments[idx]
    const newAttachments = attachments.filter((_, i) => i !== idx)
    const nextVal = newAttachments.length > 0 ? newAttachments : null
    const prev = attachments
    // Optimistic — UI 즉시 반영. 스토리지 삭제는 백그라운드.
    updateLocalCaseField(caseId, 'data', 'attachments', nextVal)
    void (async () => {
      const path = derivePath(att)
      if (path) void supabase.storage.from('attachments').remove([path])
      const r = await updateCaseField(caseId, 'data', 'attachments', nextVal)
      if (!r.ok) updateLocalCaseField(caseId, 'data', 'attachments', prev)
    })()
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + 'B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel>첨부파일</SectionLabel>
      </div>
      <div className="min-w-0 flex items-start gap-md">
        <div className="flex-1 min-w-0">
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
          />

          {/* File list */}
          {attachments.length > 0 && (
            <ul className="space-y-1">
              {attachments.map((att, i) => (
                <li key={i} className="group/item flex items-center gap-sm text-sm">
                  <a
                    href={(() => { const p = derivePath(att); return (p && signedUrls[p]) || '#' })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      const p = derivePath(att)
                      if (!p || !signedUrls[p]) e.preventDefault()
                    }}
                    className="text-foreground hover:underline truncate"
                  >
                    {att.name}
                  </a>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatSize(att.size)}
                  </span>
                  {editMode && (
                    <button
                      type="button"
                      onClick={() => handleDelete(i)}
                      className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors shrink-0 opacity-0 group-hover/item:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {attachments.length === 0 && (
            editMode ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="text-left rounded-md px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/50 transition-colors hover:text-muted-foreground cursor-pointer">
                —
              </button>
            ) : (
              <span className="px-2 py-1 -mx-2 font-sans text-[13px] italic text-muted-foreground/40">—</span>
            )
          )}

          {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
        </div>

        {editMode && (
          <div className="shrink-0 flex items-center gap-[6px]">
            <AttachButton
              multiple
              onFile={(file) => uploadFiles([file])}
              disabled={uploading}
              title="파일 첨부"
              className={roundIconBtn}
            >
              {uploading ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              )}
            </AttachButton>
          </div>
        )}
      </div>
    </div>
  )
})
