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

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@petmove/auth'
import type { CaseRow } from '@petmove/domain'
import { type CaseDocument, MAX_DOCUMENT_BYTES, readCaseDocuments } from '@/lib/documents'
import { assertCaseAccess, type Result } from './_shared'

const BUCKET = 'attachments'

function isAllowedMime(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf'
}

/**
 * step 첨부 파일 업로드. FormData 키: file / caseId / stepId.
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
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${caseId}/${Date.now()}_${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (uploadErr) return { ok: false, error: uploadErr.message }

    // data 의 다른 키 보존을 위해 fetch → merge → update.
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) {
      await admin.storage.from(BUCKET).remove([path])
      return { ok: false, error: fetchErr.message }
    }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const doc: CaseDocument = {
      id: randomUUID(),
      name: file.name,
      path,
      size: file.size,
      mime: file.type,
      stepId,
      uploadedAt: new Date().toISOString(),
    }
    const nextData: Record<string, unknown> = { ...prev, documents: [...readCaseDocuments(prev), doc] }
    // 사전신고 첨부 = 완료 시그널. admin 이 진행중으로 demote 한 상태였더라도
    // 보호자가 새 허가증을 첨부하면 자동 해제 — 다시 완료로 derive.
    if (stepId === 'advance-notification') {
      delete nextData.advance_notification_admin_demoted_at
      // stored 클리어해 derive 모드 전환.
      delete nextData.import_import_status
    }

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) {
      await admin.storage.from(BUCKET).remove([path])
      return { ok: false, error: error.message }
    }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * step 첨부 파일 삭제 — case.data.documents 에서 제거 + 스토리지 객체 삭제.
 */
export async function deleteStepDocument(
  caseId: string,
  docId: string,
): Promise<Result<CaseRow>> {
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

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const docs = readCaseDocuments(prev)
    const target = docs.find((d) => d.id === docId)
    if (!target) return { ok: false, error: '파일을 찾을 수 없습니다.' }

    const nextData: Record<string, unknown> = { ...prev, documents: docs.filter((d) => d.id !== docId) }
    // 사전신고 첨부 삭제 = portal 보호자의 명시적 액션 — stored 클리어해 derive 전환.
    if (target.stepId === 'advance-notification') {
      delete nextData.import_import_status
    }
    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }

    // 스토리지 객체 제거 — 실패해도 DB 기록은 이미 지워졌으니 결과엔 영향 없음.
    await admin.storage.from(BUCKET).remove([target.path])
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * step 첨부 파일 열람용 signed URL (1시간). docId 로 케이스의 documents 에서 path 를
 * 찾아 서명 — 호출자가 임의 경로를 서명할 수 없게 한다.
 */
export async function getStepDocumentUrl(
  caseId: string,
  docId: string,
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

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(doc.path, 60 * 60)
    if (error || !data?.signedUrl) {
      return { ok: false, error: error?.message ?? '링크 생성에 실패했습니다.' }
    }
    return { ok: true, value: data.signedUrl }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
