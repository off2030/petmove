'use server'

import { createClient } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'

// revalidatePath 의도적으로 호출하지 않음 — deleteCase 는 client 가 removeLocalCase 로
// 반영. restoreCase·permanentDeleteCase 는 trash modal 이 onRestore 에서 window.location
// .reload() 로 전체 새로고침을 강제하므로 어차피 fresh fetch. RSC refetch 트리거를 피해
// (dashboard) 레이아웃 리마운트로 인한 상세→목록 튕김 위험을 차단한다.

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

  // 인증 — 로그인 사용자.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  // 권한 검증 + 실제 삭제는 service-role 로. (이전엔 RLS 컨텍스트로 cases.delete 만 호출 →
  // 세션/RLS 경계에서 0행 삭제가 조용히 일어나 "삭제가 안 되는" 버그. 다른 관리자 쓰기
  // 액션과 동일하게 명시적 권한 검증 후 service-role 로 전환.)
  const admin = createAdminClient()

  const { data: caseRow, error: caseErr } = await admin
    .from('cases')
    .select('org_id')
    .eq('id', caseId)
    .maybeSingle()
  if (caseErr) return { ok: false, error: caseErr.message }
  if (!caseRow) return { ok: false, error: '케이스를 찾을 수 없습니다.' }

  // 권한: 해당 조직 멤버 또는 super_admin 만 영구삭제 가능.
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
    admin.from('memberships').select('user_id').eq('user_id', user.id).eq('org_id', caseRow.org_id).maybeSingle(),
  ])
  if (!profile?.is_super_admin && !membership) {
    return { ok: false, error: '이 케이스를 영구삭제할 권한이 없습니다.' }
  }

  // 1) Storage 첨부파일 cleanup — best-effort. cases.delete 전에 정리.
  try {
    const { data: files } = await admin.storage.from('attachments').list(caseId, { limit: 1000 })
    if (files && files.length > 0) {
      await admin.storage.from('attachments').remove(files.map((f) => `${caseId}/${f.name}`))
    }
  } catch {
    // 파일 cleanup 실패는 cases 삭제를 막지 않음.
  }

  // 2) cases 행 영구 삭제 — case_history 등은 FK cascade 로 자동 정리.
  const { error } = await admin.from('cases').delete().eq('id', caseId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
