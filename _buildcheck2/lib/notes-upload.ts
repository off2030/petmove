/**
 * 공통 헬퍼: 이미지 파일을 Supabase Storage에 업로드하고
 * 케이스의 메모(notes) 배열에 첨부파일로 추가한다.
 *
 * AI 추출용 이미지(일본/태국 추가정보, 백신 증명서 등)를
 * 모두 영구 보관하기 위해 사용.
 */

import { supabaseBrowser as supabase } from '@/lib/supabase/browser'
import { updateCaseField } from '@/lib/actions/cases'
import type { CaseRow } from '@/lib/supabase/types'

interface FileNote {
  type: 'file'
  name: string
  url: string
  size: number
  createdAt: string
}

interface TextNote {
  type: 'text'
  content: string
  createdAt: string
}

type NoteItem = TextNote | FileNote

interface LegacyAttachment {
  name: string
  url: string
  size: number
  uploadedAt: string
}

function readNotes(data: Record<string, unknown>): NoteItem[] {
  if (Array.isArray(data.notes)) return data.notes as NoteItem[]
  const items: NoteItem[] = []
  if (Array.isArray(data.memos)) {
    for (const m of data.memos as string[]) items.push({ type: 'text', content: m, createdAt: '' })
  } else if (typeof data.memo === 'string' && data.memo) {
    items.push({ type: 'text', content: data.memo, createdAt: '' })
  }
  if (Array.isArray(data.attachments)) {
    for (const a of data.attachments as LegacyAttachment[]) {
      items.push({ type: 'file', name: a.name, url: a.url, size: a.size, createdAt: a.uploadedAt || '' })
    }
  }
  return items
}

/**
 * 파일을 Supabase에 업로드하고 notes에 첨부파일로 추가한다.
 * @returns 성공 시 업로드된 URL, 실패 시 null
 */
export async function uploadFileToNotes(
  caseId: string,
  caseRow: CaseRow,
  file: File,
  updateLocalCaseField: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void,
): Promise<string | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${caseId}/${Date.now()}_${safeName}`

  const { error: uploadErr } = await supabase.storage
    .from('attachments')
    .upload(path, file)

  if (uploadErr) return null

  const { data: urlData } = supabase.storage
    .from('attachments')
    .getPublicUrl(path)

  const newFile: FileNote = {
    type: 'file',
    name: file.name,
    url: urlData.publicUrl,
    size: file.size,
    createdAt: new Date().toISOString(),
  }

  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const existingNotes = readNotes(data)
  const nextNotes = [...existingNotes, newFile]

  // Legacy keys 정리 + notes 저장
  if (data.memo) {
    await updateCaseField(caseId, 'data', 'memo', null)
    updateLocalCaseField(caseId, 'data', 'memo', null)
  }
  if (data.memos) {
    await updateCaseField(caseId, 'data', 'memos', null)
    updateLocalCaseField(caseId, 'data', 'memos', null)
  }
  if (data.attachments) {
    await updateCaseField(caseId, 'data', 'attachments', null)
    updateLocalCaseField(caseId, 'data', 'attachments', null)
  }

  const r = await updateCaseField(caseId, 'data', 'notes', nextNotes)
  if (r.ok) updateLocalCaseField(caseId, 'data', 'notes', nextNotes)

  return urlData.publicUrl
}
