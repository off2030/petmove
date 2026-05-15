/**
 * 케이스 첨부 서류 모델 — case.data.documents 배열.
 *
 * journey step 의 '첨부' 영역에서 업로드되고, 서류 탭(보관 중인 서류)에서도 함께
 * 노출된다. 실제 파일은 admin 과 동일한 `attachments` 버킷에 저장 (lib/actions/documents.ts).
 * admin 의 case.data.notes 와는 분리 — portal 전용 기록.
 */

export interface CaseDocument {
  id: string
  name: string
  /** attachments 버킷 내 경로 ({caseId}/{ts}_{name}). */
  path: string
  size: number
  mime: string
  /** 업로드된 journey step id. */
  stepId: string
  uploadedAt: string
}

/** case.data 에서 documents 배열을 안전하게 읽는다. */
export function readCaseDocuments(
  data: Record<string, unknown> | null | undefined,
): CaseDocument[] {
  const raw = (data ?? {})['documents']
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (d): d is CaseDocument =>
      !!d && typeof d === 'object' && typeof (d as CaseDocument).path === 'string',
  )
}

/** 파일 크기(bytes)를 사람이 읽는 문자열로. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
