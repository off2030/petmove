/**
 * 공통 헬퍼: 이미지 파일을 Supabase Storage에 업로드하고
 * 케이스의 메모(notes) 배열에 첨부파일로 추가한다.
 *
 * AI 추출용 이미지(일본/태국 추가정보, 백신 증명서 등)를
 * 모두 영구 보관하기 위해 사용.
 *
 * stepId 가 주어지면 동일 파일을 case.data.documents 에도 등록 — portal 의
 * journey step 첨부·필수 서류 미리보기와 자동 연동된다.
 */

import { supabaseBrowser as supabase } from '@petmove/auth'
import { updateCaseField } from '@/lib/actions/cases'
import { resolveAttachmentName, resolveStepAttachmentName, type CaseRow } from '@petmove/domain'

interface FileNote {
  type: 'file'
  name: string
  path?: string
  url?: string
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

/** portal 의 CaseDocument 와 동일 shape — packages 의존성 피해 인라인 정의. */
interface CaseDocumentRecord {
  id: string
  name: string
  path: string
  size: number
  mime: string
  stepId: string
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

function readDocuments(data: Record<string, unknown>): CaseDocumentRecord[] {
  const raw = data['documents']
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (d): d is CaseDocumentRecord =>
      !!d && typeof d === 'object' && typeof (d as CaseDocumentRecord).path === 'string',
  )
}

export interface UploadFileOptions {
  /** portal 연동용 step.id. case.data.documents 의 stepId 필드. */
  stepId?: string
  /**
   * 파일 표시 이름 라벨 (예: '일본 추가정보', '광견병'). 미설정 시 stepId 의
   * attachmentLabel 사용, 그것도 없으면 원본 파일명. label 이 직접 주어지면
   * stepId 의 catalog 라벨보다 우선.
   */
  label?: string
}

/**
 * 파일을 Supabase에 업로드하고 notes에 첨부파일로 추가한다.
 * stepId 주어지면 case.data.documents 에도 등록 — portal 연동.
 * label 또는 stepId 의 attachmentLabel 이 있으면 파일 이름을 그 라벨로 통일
 * (같은 라벨이 이미 있으면 '_2', '_3' 자동 접미사).
 * @returns 성공 시 storage path, 실패 시 null
 */
export async function uploadFileToNotes(
  caseId: string,
  caseRow: CaseRow,
  file: File,
  updateLocalCaseField: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void,
  options?: UploadFileOptions,
): Promise<string | null> {
  const stepId = options?.stepId
  const labelOverride = options?.label
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const existingDocs = readDocuments(data)
  const existingNotesAll = readNotes(data)
  // 표시 이름 결정 우선순위:
  //   1) label 직접 주어진 경우 → 그대로 사용, notes 의 같은 라벨 패턴 중 다음 번호로.
  //   2) stepId 만 주어진 경우 → catalog 의 attachmentLabel, documents 의 같은 stepId 중 다음 번호로.
  //   3) 둘 다 없으면 원본 파일명 유지 (메모 섹션 직접 업로드).
  let displayName: string
  if (labelOverride) {
    const existingNames = existingNotesAll
      .filter((n): n is FileNote => n.type === 'file')
      .map((n) => n.name)
    displayName = resolveAttachmentName(labelOverride, file.name, existingNames)
  } else if (stepId) {
    displayName = resolveStepAttachmentName(stepId, file.name, existingDocs)
  } else {
    displayName = file.name
  }
  const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${caseId}/${Date.now()}_${safeName}`

  const { error: uploadErr } = await supabase.storage
    .from('attachments')
    .upload(path, file)

  if (uploadErr) return null

  const createdAt = new Date().toISOString()
  const newFile: FileNote = {
    type: 'file',
    name: displayName,
    path,
    size: file.size,
    createdAt,
  }

  const nextNotes = [...existingNotesAll, newFile]

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

  // portal 의 step 첨부·필수 서류 미리보기 연동 — 동일 파일을 documents 에도 등록.
  if (stepId) {
    const newDoc: CaseDocumentRecord = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: displayName,
      path,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      stepId,
      uploadedAt: createdAt,
    }
    const nextDocs = [...existingDocs, newDoc]
    const dr = await updateCaseField(caseId, 'data', 'documents', nextDocs)
    if (dr.ok) updateLocalCaseField(caseId, 'data', 'documents', nextDocs)
  }

  return path
}
