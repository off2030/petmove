'use client'

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { createClient } from '@supabase/supabase-js'

interface Attachment {
  name: string
  url: string
  size: number
  uploadedAt: string
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export interface AttachmentsFieldHandle {
  triggerUpload: () => void
  uploading: boolean
}

export const AttachmentsField = forwardRef<AttachmentsFieldHandle, { caseId: string; caseRow: CaseRow; hideAddButton?: boolean }>(function AttachmentsField({ caseId, caseRow, hideAddButton }, ref) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const attachments = (data.attachments as Attachment[]) ?? []

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    triggerUpload: () => fileRef.current?.click(),
    uploading,
  }), [uploading])

  useEffect(() => { setError(null) }, [caseId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setError(null)

    const newAttachments = [...attachments]

    for (const file of Array.from(files)) {
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

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(path)

      newAttachments.push({
        name: file.name,
        url: urlData.publicUrl,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      })
    }

    // Save to case data
    const r = await updateCaseField(caseId, 'data', 'attachments', newAttachments)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'attachments', newAttachments)

    setUploading(false)
    // Reset file input
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(idx: number) {
    const att = attachments[idx]
    // Extract path from URL
    const urlParts = att.url.split('/attachments/')
    const path = urlParts[urlParts.length - 1]

    // Delete from storage
    await supabase.storage.from('attachments').remove([path])

    // Update case data
    const newAttachments = attachments.filter((_, i) => i !== idx)
    const r = await updateCaseField(caseId, 'data', 'attachments', newAttachments.length > 0 ? newAttachments : null)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'attachments', newAttachments.length > 0 ? newAttachments : null)
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + 'B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
      <div className="flex items-center gap-xs pt-1">
        <span className="text-base text-primary">첨부파일</span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-muted-foreground/40 hover:text-foreground text-lg font-semibold leading-none transition-colors"
          title="파일 첨부"
        >
          {uploading ? '...' : '+'}
        </button>
      </div>
      <div className="min-w-0">
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
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline truncate"
                >
                  {att.name}
                </a>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(att.size)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/item:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {attachments.length === 0 && (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="text-left rounded-md px-2 py-1 -mx-2 text-base text-primary/60 italic transition-colors hover:bg-accent/60 cursor-pointer">
            —
          </button>
        )}

        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </div>
    </div>
  )
})
