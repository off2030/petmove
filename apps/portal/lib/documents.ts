/**
 * 케이스 첨부 서류 모델 — case.data.documents 배열.
 *
 * journey step 의 '첨부' 영역에서 업로드되고, 서류 탭(보관 중인 서류)에서도 함께
 * 노출된다. 실제 파일은 admin 과 동일한 `attachments` 버킷에 저장 (lib/actions/documents.ts).
 * admin 의 case.data.notes 와는 분리 — portal 전용 기록.
 */

/** 첨부 파일 1건 최대 크기 (12MB). 클라이언트 검증과 server action 이 공유. */
export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024

export interface CaseDocument {
  id: string
  name: string
  /** attachments 버킷 내 경로 ({caseId}/{ts}_{name}). */
  path: string
  size: number
  mime: string
  /** 업로드된 journey step id. */
  stepId: string
  /**
   * 업로드 당시의 활성 목적지 토큰('일본' 등). 미기재 = legacy/케이스 공유(전 목적지 인정).
   * 다중 목적지에서 A 목적지 첨부가 B 목적지 필수서류 체크리스트(공유 previewStepId spec)를
   * 완료시키는 교차 누수를 판정(domain attachmentInDestinationScope)에서 걸러내기 위한 태그
   * (2026-08-01). 서류함(보관함) 목록은 필터하지 않는다 — 전부 한곳에서 보이는 게 확정 사항.
   */
  destination?: string
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
