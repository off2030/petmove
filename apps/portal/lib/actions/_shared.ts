import { createClient, getCurrentUser } from '@petmove/auth/server'

/** portal server action 공통 결과 타입. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * 본인 ↔ 케이스 link 확인. portal server action 들이 admin(service-role) 클라이언트로
 * RLS 를 우회하기 전 공통 권한 게이트 — case_customer_links 에 본인 link 가 있어야 통과.
 */
export async function assertCaseAccess(caseId: string): Promise<Result<true>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: '인증 필요' }
  const supabase = await createClient()
  const { data: link, error: linkErr } = await supabase
    .from('case_customer_links')
    .select('case_id')
    .eq('case_id', caseId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (linkErr) return { ok: false, error: linkErr.message }
  if (!link) return { ok: false, error: '이 여정에 접근 권한이 없습니다.' }
  return { ok: true, value: true }
}
