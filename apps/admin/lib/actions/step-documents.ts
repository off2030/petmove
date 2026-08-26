'use server'

/**
 * Admin 운영자가 portal step 첨부(case.data.documents 배열) 를 다루는 server actions.
 *
 * portal 의 동등 액션(apps/portal/lib/actions/documents.ts)과 같은 스토리지 버킷
 * (attachments)·같은 데이터 모델을 공유. 차이점은 RLS — 여기선 admin 세션
 * (org 멤버십)로 접근하고, portal 측은 case_customer_links 기반.
 *
 * 현재는 사전신고(advance-notification) 첨부에만 노출 — 운영자가 NACCS 허가서를
 * 추가 첨부하거나 보호자가 올린 파일을 검토하기 위한 용도.
 */

import { reportActionError } from './_report-error'
import { randomUUID } from 'node:crypto'
import { createClient } from '@petmove/auth/server'
import {
  clearLegacyReportStatusForStep,
  parseDestinations,
  resolveStepAttachmentName,
  type CaseRow,
} from '@petmove/domain'

const BUCKET = 'attachments'
const MAX_BYTES = 12 * 1024 * 1024

interface CaseDocument {
  id: string
  name: string
  path: string
  size: number
  mime: string
  stepId: string
  /**
   * 업로드 당시의 활성 여행지 토큰. 미기재 = legacy/케이스 공유. portal CaseDocument 와 동일
   * shape — 다중 여행지에서 A 여행지 첨부가 B 여행지 필수서류 체크리스트로 새는 교차 누수를
   * 판정(domain attachmentInDestinationScope)이 걸러내기 위한 태그(2026-08-01).
   */
  destination?: string
  uploadedAt: string
}

function readDocs(data: Record<string, unknown> | null | undefined): CaseDocument[] {
  const raw = (data ?? {}).documents
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (d): d is CaseDocument =>
      !!d && typeof d === 'object' && typeof (d as CaseDocument).path === 'string',
  )
}

function isAllowedMime(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf'
}

export type StepDocumentResult =
  | { ok: true; value: CaseRow }
  | { ok: false; error: string }

export async function uploadStepDocumentAdmin(formData: FormData): Promise<StepDocumentResult> {
  try {
    const caseId = formData.get('caseId')
    const stepId = formData.get('stepId')
    const file = formData.get('file')
    if (typeof caseId !== 'string' || typeof stepId !== 'string') {
      return { ok: false, error: '잘못된 요청입니다.' }
    }
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: '파일이 없습니다.' }
    }
    if (!isAllowedMime(file.type)) {
      return { ok: false, error: '이미지 또는 PDF 파일만 올릴 수 있습니다.' }
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: '파일 크기는 12MB 이하여야 합니다.' }
    }

    const supabase = await createClient()

    // 이름 결정에 기존 documents 가 필요하므로 storage 업로드 전에 먼저 조회.
    // (destination 은 첨부 여행지 태깅용.)
    const { data: existing, error: fetchErr } = await supabase
      .from('cases')
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const existingDocs = readDocs(prev)
    // 활성 여행지 태깅 — 클라이언트(상세 화면)의 활성 여행지 토큰이 케이스 여행지 목록에
    // 있으면 그 값, 아니면 첫 토큰(portal uploadStepDocument 와 동일 규칙).
    const destRaw = formData.get('destination')
    const caseTokens = parseDestinations(
      (existing as { destination?: string | null } | null)?.destination,
    )
    const attachDest =
      typeof destRaw === 'string' && destRaw && caseTokens.includes(destRaw)
        ? destRaw
        : (caseTokens[0] ?? null)
    const displayName = resolveStepAttachmentName(stepId, file.name, existingDocs)
    const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${caseId}/${Date.now()}_${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (uploadErr) return { ok: false, error: uploadErr.message }

    const uploadedAt = new Date().toISOString()
    const doc: CaseDocument = {
      id: randomUUID(),
      name: displayName,
      path,
      size: file.size,
      mime: file.type,
      stepId,
      ...(attachDest ? { destination: attachDest } : {}),
      uploadedAt,
    }
    // 메모(notes) 섹션 동기화 — admin·portal 양쪽에서 한눈에 보이도록.
    const existingNotes = Array.isArray(prev.notes) ? (prev.notes as unknown[]) : []
    const noteEntry = {
      type: 'file' as const,
      name: displayName,
      path,
      size: file.size,
      createdAt: uploadedAt,
    }
    const nextData: Record<string, unknown> = {
      ...prev,
      documents: [...existingDocs, doc],
      notes: [...existingNotes, noteEntry],
    }
    // 사전신고 첨부 = 완료 시그널. demote 자동 해제 + stored 클리어 (derive 전환).
    if (stepId === 'advance-notification') {
      delete nextData.advance_notification_admin_demoted_at
      clearLegacyReportStatusForStep(nextData, 'advance-notification', 'import')
    }

    const { data: updated, error } = await supabase
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      return { ok: false, error: error.message }
    }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'step-documents.uploadStepDocumentAdmin') }
  }
}

export async function deleteStepDocumentAdmin(
  caseId: string,
  docId: string,
): Promise<StepDocumentResult> {
  try {
    const supabase = await createClient()
    const { data: existing, error: fetchErr } = await supabase
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const docs = readDocs(prev)
    const target = docs.find((d) => d.id === docId)
    if (!target) return { ok: false, error: '파일을 찾을 수 없습니다.' }

    const nextDocs = docs.filter((d) => d.id !== docId)
    // 동일 path 의 notes 항목도 함께 제거 (orphan 방지) — admin 메모 섹션과 동기.
    const prevNotes = Array.isArray(prev.notes) ? (prev.notes as Array<Record<string, unknown>>) : []
    const nextNotes = prevNotes.filter((n) => n?.path !== target.path)
    const nextData: Record<string, unknown> = {
      ...prev,
      documents: nextDocs,
      notes: nextNotes.length > 0 ? nextNotes : null,
    }
    // 사전신고 첨부 삭제 = 운영자의 명시적 transition — stored 클리어해 derive 전환.
    if (target.stepId === 'advance-notification') {
      clearLegacyReportStatusForStep(nextData, 'advance-notification', 'import')
    }
    const { data: updated, error } = await supabase
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }

    await supabase.storage.from(BUCKET).remove([target.path])
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'step-documents.deleteStepDocumentAdmin') }
  }
}

export async function getStepDocumentUrlAdmin(
  caseId: string,
  docId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: existing, error: fetchErr } = await supabase
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const docs = readDocs((existing?.data ?? {}) as Record<string, unknown>)
    const target = docs.find((d) => d.id === docId)
    if (!target) return { ok: false, error: '파일을 찾을 수 없습니다.' }

    // storage 경로는 한글을 '_' 로 치환한 safeName 이라, download 옵션으로
    // Content-Disposition 파일명을 표시명(target.name)으로 강제해 업로드명과 통일.
    const { data: signed, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(target.path, 3600, { download: target.name })
    if (error || !signed) return { ok: false, error: error?.message ?? '서명 URL 생성 실패' }
    return { ok: true, url: signed.signedUrl }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'step-documents.getStepDocumentUrlAdmin') }
  }
}
