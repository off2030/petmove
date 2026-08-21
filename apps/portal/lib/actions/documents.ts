'use server'

/**
 * Portal 보호자가 케이스의 journey step 에 서류(사진·PDF)를 첨부하는 server actions.
 *
 * 파일은 admin 과 동일한 `attachments` 버킷({caseId}/{ts}_{name})에 저장하되, 기록은
 * case.data.documents 배열에 — admin 의 data.notes 와 분리한 portal 전용 기록.
 * step 첨부 영역과 서류 탭(보관 중인 서류)이 이 배열을 함께 읽는다.
 *
 * attachments 버킷 RLS 는 org 멤버만 통과시키므로 모든 storage 작업은 service-role 로
 * 우회 — assertCaseAccess(case_customer_links) 로 본인 케이스 권한을 먼저 검증.
 */

import { reportActionError } from './_shared'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@petmove/auth'
import {
  clearLegacyReportStatusForStep,
  parseDestinations,
  resolveStepAttachmentName,
  stampDocsChecklistCompletion,
  type CaseRow,
} from '@petmove/domain'
import { type CaseDocument, MAX_DOCUMENT_BYTES, readCaseDocuments } from '@/lib/documents'
import { assertCaseAccess, type Result } from './_shared'

const BUCKET = 'attachments'

function isAllowedMime(mime: string): boolean {
  // SVG 는 이미지지만 스크립트를 담을 수 있어 제외(2026-08-01 보안 리뷰) — 인라인
  // signed URL 로 열면 실행된다. 실행 오리진은 supabase.co 라 앱 세션과 격리되지만
  // 저장 가치도 없는 형식이라 원천 차단.
  if (mime === 'image/svg+xml') return false
  return mime.startsWith('image/') || mime === 'application/pdf'
}

/**
 * 첨부에 태깅할 활성 목적지 토큰 해석 — 클라이언트가 보낸 ?dest= 토큰이 케이스 목적지 목록에
 * 있으면 그 값, 아니면 첫 토큰(buildCaseJourneyContext·activeDestinationView 와 동일 규칙이라
 * 보호자가 보고 있는 뷰의 목적지와 항상 일치). 목적지 없는 케이스는 null(태깅 생략).
 */
function resolveAttachDestination(
  caseDestination: string | null | undefined,
  requested: unknown,
): string | null {
  const tokens = parseDestinations(caseDestination)
  if (typeof requested === 'string' && requested && tokens.includes(requested)) return requested
  return tokens[0] ?? null
}

/**
 * step 첨부 파일 업로드. FormData 키: file / caseId / stepId / destination(선택, 활성 목적지).
 * attachments 버킷에 올린 뒤 case.data.documents 에 기록하고 갱신된 케이스를 반환.
 */
export async function uploadStepDocument(formData: FormData): Promise<Result<CaseRow>> {
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
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { ok: false, error: '파일 크기는 12MB 이하여야 합니다.' }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()

    // data 의 다른 키 보존을 위해 fetch → merge → update.
    // (이름 결정에 기존 documents 가 필요하므로 storage 업로드 전에 먼저 조회.)
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    // step 라벨 기반 이름 통일 (광견병 항체 검사 → '광견병 항체 검사 결과지').
    // 같은 step 의 기존 업로드 개수에 따라 '_2', '_3' (gap-fill).
    const existingDocs = readCaseDocuments(prev)
    const displayName = resolveStepAttachmentName(stepId, file.name, existingDocs)
    const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${caseId}/${Date.now()}_${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (uploadErr) return { ok: false, error: uploadErr.message }

    // 활성 목적지 태깅 — 다중 목적지에서 이 첨부가 다른 목적지 체크리스트로 새지 않게.
    // (무태그 = legacy/공유로 인정되므로 목적지 없는 케이스만 생략.)
    const attachDest = resolveAttachDestination(
      (existing as CaseRow | null)?.destination,
      formData.get('destination'),
    )
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
    // admin 의 메모(notes) 섹션에서도 보이도록 동시 기록. admin 의 notes-upload.ts 와
    // 동일 shape (type='file').
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
    // 사전신고 첨부 = 완료 시그널. admin 이 진행중으로 demote 한 상태였더라도
    // 보호자가 새 허가서를 첨부하면 자동 해제 — 다시 완료로 derive.
    if (stepId === 'advance-notification') {
      delete nextData.advance_notification_admin_demoted_at
      // stored 클리어해 derive 모드 전환.
      clearLegacyReportStatusForStep(nextData, 'advance-notification', 'import')
    }
    // 첨부가 마지막 필수 서류를 채우면 서류 체크리스트 완료일을 박는다 — 활성 목적지 스코프로
    // (미전달 시 첫 목적지에 박히던 버그 수정, 2026-08-01. admin cases.ts 와 동일).
    const finalData = stampDocsChecklistCompletion(existing as CaseRow, nextData, attachDest)

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: finalData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) {
      await admin.storage.from(BUCKET).remove([path])
      return { ok: false, error: error.message }
    }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'documents.uploadStepDocument') }
  }
}

/**
 * step 첨부 파일 삭제 — case.data.documents 에서 제거 + 스토리지 객체 삭제.
 * destination = 호출 화면의 활성 목적지(?dest=) — 완료일 재계산(stamp) 스코프용.
 */
export async function deleteStepDocument(
  caseId: string,
  docId: string,
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const docs = readCaseDocuments(prev)
    const target = docs.find((d) => d.id === docId)
    if (!target) return { ok: false, error: '파일을 찾을 수 없습니다.' }

    const nextDocs = docs.filter((d) => d.id !== docId)
    // 동일 path 의 notes 항목도 함께 제거 — admin 메모 섹션과 동기 (orphan 방지).
    const prevNotes = Array.isArray(prev.notes) ? (prev.notes as Array<Record<string, unknown>>) : []
    const nextNotes = prevNotes.filter((n) => n?.path !== target.path)
    const nextData: Record<string, unknown> = {
      ...prev,
      documents: nextDocs,
      notes: nextNotes.length > 0 ? nextNotes : null,
    }
    // 사전신고 첨부 삭제 = portal 보호자의 명시적 액션 — stored 클리어해 derive 전환.
    if (target.stepId === 'advance-notification') {
      clearLegacyReportStatusForStep(nextData, 'advance-notification', 'import')
    }
    // 첨부 삭제로 필수 서류가 미완료로 돌아가면 완료일을 지운다(재완료 시 다시 박힘).
    // 스코프 = 지운 파일의 목적지 태그 우선(그 목적지 체크리스트가 되돌아가는 것) → 없으면
    // 호출 화면의 활성 목적지.
    const stampDest =
      target.destination ?? resolveAttachDestination((existing as CaseRow | null)?.destination, destination)
    const finalData = stampDocsChecklistCompletion(existing as CaseRow, nextData, stampDest)
    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: finalData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }

    // 스토리지 객체 제거 — 실패해도 DB 기록은 이미 지워졌으니 결과엔 영향 없음.
    await admin.storage.from(BUCKET).remove([target.path])
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'documents.deleteStepDocument') }
  }
}

/**
 * step 첨부 파일 열람용 signed URL (1시간). docId 로 케이스의 documents 에서 path 를
 * 찾아 서명 — 호출자가 임의 경로를 서명할 수 없게 한다.
 */
export async function getStepDocumentUrl(
  caseId: string,
  docId: string,
  mode: 'view' | 'download' = 'view',
): Promise<Result<string>> {
  try {
    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const doc = readCaseDocuments(existing?.data as Record<string, unknown>).find(
      (d) => d.id === docId,
    )
    if (!doc) return { ok: false, error: '파일을 찾을 수 없습니다.' }

    // 'view'(기본) = 인라인 표시 — 이미지/PDF 를 새 화면에서 바로 본다. 모바일/네이티브에서
    // '열기'가 동작하려면 인라인이어야 한다(download 면 보기 대신 파일이 받아져 버림).
    // 'download' = 기기에 저장. storage 경로는 한글을 '_' 로 치환한 safeName 이라 그냥 받으면
    // 파일명이 깨지므로, download 옵션으로 Content-Disposition 파일명을 표시명(doc.name)으로 강제.
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(doc.path, 60 * 60, mode === 'download' ? { download: doc.name } : undefined)
    if (error || !data?.signedUrl) {
      return { ok: false, error: error?.message ?? '링크 생성에 실패했습니다.' }
    }
    return { ok: true, value: data.signedUrl }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'documents.getStepDocumentUrl') }
  }
}

/**
 * orphan 정리 — storage 객체가 없는 documents 기록(과 동일 path 의 notes 기록)을 제거.
 *
 * 삭제 동기화 이전에 메모에서 지운 파일 등은 documents 에 기록만 남아 portal 미리보기에
 * "Object not found" 로 표시된다. caseId 폴더의 실제 객체 목록과 대조해 없는 것만 정리.
 * 변경이 없으면 DB 쓰기 없이 현재 케이스를 그대로 반환.
 */
export async function pruneMissingStepDocuments(caseId: string): Promise<Result<CaseRow>> {
  try {
    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const docs = readCaseDocuments(prev)
    if (docs.length === 0) return { ok: true, value: existing as CaseRow }

    // caseId 폴더의 실제 객체 이름 → 전체 path 집합.
    const { data: objects, error: listErr } = await admin.storage
      .from(BUCKET)
      .list(caseId, { limit: 1000 })
    if (listErr) return { ok: false, error: listErr.message }
    const existingPaths = new Set((objects ?? []).map((o) => `${caseId}/${o.name}`))

    const orphanPaths = new Set(
      docs.filter((d) => !existingPaths.has(d.path)).map((d) => d.path),
    )
    if (orphanPaths.size === 0) return { ok: true, value: existing as CaseRow }

    const nextDocs = docs.filter((d) => !orphanPaths.has(d.path))
    const prevNotes = Array.isArray(prev.notes) ? (prev.notes as Array<Record<string, unknown>>) : []
    const nextNotes = prevNotes.filter(
      (n) => !(n && typeof n.path === 'string' && orphanPaths.has(n.path as string)),
    )

    const nextData: Record<string, unknown> = {
      ...prev,
      documents: nextDocs,
      notes: nextNotes.length > 0 ? nextNotes : null,
    }
    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'documents.pruneMissingStepDocuments') }
  }
}
