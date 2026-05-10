'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@petmove/auth'

/** Soft-delete: set deleted_at timestamp */
export async function deleteCase(
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cases')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', caseId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/cases')
  return { ok: true }
}

/** Restore: clear deleted_at */
export async function restoreCase(
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cases')
    .update({ deleted_at: null })
    .eq('id', caseId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/cases')
  return { ok: true }
}

/**
 * Permanent delete — cases 행 삭제 + 같은 caseId 폴더의 storage 첨부파일도 정리.
 *
 * P2 — 이전엔 cases.delete 만 호출 → attachments 버킷의 `{caseId}/...` 파일이
 * orphan 으로 남아 무한 누적. private 버킷이라 권한적 위험은 없으나 스토리지
 * 비용·관리 측면에서 정리 필요. RLS (attachments_delete) 가 org 멤버 + 같은
 * cases.id 폴더만 통과시키므로 cases.delete 전에 storage 청소 (먼저 cases 가
 * 사라지면 RLS 매칭이 실패해 storage 행이 남음).
 */
export async function permanentDeleteCase(
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()

  // 1) Storage 첨부파일 cleanup — best-effort. 권한 없거나 파일 없으면 빈 결과 반환.
  //    cases.delete 가 먼저 일어나면 RLS 가 더 이상 매칭 안 돼 storage 행을 못 지움.
  try {
    const { data: files } = await supabase.storage
      .from('attachments')
      .list(caseId, { limit: 1000 })
    if (files && files.length > 0) {
      const paths = files.map((f) => `${caseId}/${f.name}`)
      await supabase.storage.from('attachments').remove(paths)
    }
  } catch {
    // 파일 cleanup 실패는 cases 삭제를 막지 않음 — orphan 파일은 향후 cron 으로 청소 가능.
  }

  // 2) cases 행 영구 삭제 — case_history 등은 FK cascade 로 자동 정리.
  const { error } = await supabase.from('cases').delete().eq('id', caseId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/cases')
  return { ok: true }
}
