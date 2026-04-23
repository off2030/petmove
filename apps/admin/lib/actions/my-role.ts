'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'

export type MyOrgRole = {
  role: 'admin' | 'member' | null
  isAdmin: boolean
  isSuperAdmin: boolean
}

/**
 * 현재 유저의 활성 org 내 role + super_admin 여부.
 * UI 에서 편집 가능/읽기 전용 분기에 사용.
 */
export async function getMyOrgRole(): Promise<MyOrgRole> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { role: null, isAdmin: false, isSuperAdmin: false }

    const orgId = await getActiveOrgId()
    const [memRes, profRes] = await Promise.all([
      supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    const role = (memRes.data?.role as 'admin' | 'member' | undefined) ?? null
    const isSuperAdmin = Boolean(profRes.data?.is_super_admin)
    const isAdmin = role === 'admin' || isSuperAdmin
    return { role, isAdmin, isSuperAdmin }
  } catch {
    return { role: null, isAdmin: false, isSuperAdmin: false }
  }
}
