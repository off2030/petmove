import { createClient } from '@/lib/supabase/server'

/**
 * 현재 로그인 유저의 활성 org_id 를 반환.
 * Phase 5: 단일 org 전제 — 유저가 속한 org 가 정확히 1개일 때만 성공.
 * Phase 6 에서 쿠키/스위처 도입 시 이 헬퍼만 교체하면 됨.
 *
 * super_admin 은 memberships 가 0개여도 통과해야 하는 경우가 있으니 주의 —
 * 현재는 super_admin 도 memberships 보유 가정 (로잔 owner).
 */
export async function getActiveOrgId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  const { data: rows, error } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)

  if (error) throw new Error(`memberships lookup failed: ${error.message}`)
  if (!rows || rows.length === 0) throw new Error('no org membership')
  if (rows.length > 1) {
    throw new Error('multiple org memberships — Phase 6 org switcher 필요')
  }
  return rows[0].org_id as string
}
