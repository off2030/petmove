import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export const IMPERSONATION_COOKIE = 'pm_impersonated_org'

/**
 * 현재 로그인 유저의 활성 org_id 를 반환.
 *
 * 우선순위:
 *   1. super_admin + impersonation cookie 가 가리키는 org (실재 확인)
 *   2. 본인의 첫 membership
 *
 * React cache() 로 request-scoped 메모이즈 — 같은 서버 액션/RSC 렌더 안에서
 * 여러 헬퍼가 호출해도 getUser() + memberships 쿼리는 한 번만 수행.
 */
export const getActiveOrgId = cache(async (): Promise<string> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  // 1) super_admin impersonation
  const cookieStore = await cookies()
  const impOrgId = cookieStore.get(IMPERSONATION_COOKIE)?.value
  if (impOrgId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (prof?.is_super_admin) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', impOrgId)
        .maybeSingle()
      if (org) return org.id as string
    }
  }

  // 2) 본인의 첫 membership
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
})

/**
 * 현재 super_admin 이 다른 org 를 임시 보기 중이면 정보 반환.
 * 본인 home org 가 같으면 null (impersonation 의미 없음).
 */
export async function getImpersonationInfo(): Promise<{ orgId: string; orgName: string } | null> {
  const cookieStore = await cookies()
  const impOrgId = cookieStore.get(IMPERSONATION_COOKIE)?.value
  if (!impOrgId) return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: prof } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!prof?.is_super_admin) return null

  // home org (본인 첫 membership) 와 같으면 impersonation 무의미
  const { data: mem } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (mem?.org_id === impOrgId) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', impOrgId)
    .maybeSingle()
  if (!org) return null
  return { orgId: org.id as string, orgName: org.name as string }
}
