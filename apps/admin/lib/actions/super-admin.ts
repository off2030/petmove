'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface OrgSummary {
  id: string
  name: string
  created_at: string
  member_count: number
  pending_invite_count: number
}

export interface OrgDetail {
  id: string
  name: string
  created_at: string
  members: { user_id: string; email: string; name: string | null; role: string; joined_at: string }[]
  invites: { id: string; email: string; role: string; token: string; expires_at: string; created_at: string }[]
}

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_super_admin) return { ok: false, error: '권한 없음 (super_admin 전용)' }
  return { ok: true }
}

export async function listAllOrgs(): Promise<Result<OrgSummary[]>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  try {
    const admin = createAdminClient()
    const { data: orgs, error } = await admin
      .from('organizations')
      .select('id, name, created_at')
      .order('created_at', { ascending: true })
    if (error) return { ok: false, error: error.message }

    const ids = (orgs ?? []).map((o) => o.id as string)
    if (ids.length === 0) return { ok: true, value: [] }

    const [{ data: memRows }, { data: invRows }] = await Promise.all([
      admin.from('memberships').select('org_id').in('org_id', ids),
      admin.from('organization_invites').select('org_id, accepted_at').in('org_id', ids),
    ])

    const memCount = new Map<string, number>()
    for (const r of memRows ?? []) {
      const k = r.org_id as string
      memCount.set(k, (memCount.get(k) ?? 0) + 1)
    }
    const invCount = new Map<string, number>()
    for (const r of invRows ?? []) {
      if ((r as { accepted_at: string | null }).accepted_at) continue
      const k = (r as { org_id: string }).org_id
      invCount.set(k, (invCount.get(k) ?? 0) + 1)
    }

    return {
      ok: true,
      value: (orgs ?? []).map((o) => ({
        id: o.id as string,
        name: o.name as string,
        created_at: o.created_at as string,
        member_count: memCount.get(o.id as string) ?? 0,
        pending_invite_count: invCount.get(o.id as string) ?? 0,
      })),
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function getOrgDetail(orgId: string): Promise<Result<OrgDetail>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  try {
    const admin = createAdminClient()
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('id, name, created_at')
      .eq('id', orgId)
      .maybeSingle()
    if (orgErr) return { ok: false, error: orgErr.message }
    if (!org) return { ok: false, error: '조직을 찾을 수 없음' }

    const { data: memRows } = await admin
      .from('memberships')
      .select('user_id, role, created_at, profiles!inner(email, name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })

    type MemRaw = {
      user_id: string
      role: string
      created_at: string
      profiles: { email: string; name: string | null } | { email: string; name: string | null }[] | null
    }
    const members = ((memRows ?? []) as unknown as MemRaw[]).map((r) => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        user_id: r.user_id,
        email: prof?.email ?? '',
        name: prof?.name ?? null,
        role: r.role,
        joined_at: r.created_at,
      }
    })

    const { data: invRows } = await admin
      .from('organization_invites')
      .select('id, email, role, token, expires_at, created_at, accepted_at')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    const invites = (invRows ?? []).map((r) => ({
      id: r.id as string,
      email: r.email as string,
      role: r.role as string,
      token: r.token as string,
      expires_at: r.expires_at as string,
      created_at: r.created_at as string,
    }))

    return {
      ok: true,
      value: {
        id: org.id as string,
        name: org.name as string,
        created_at: org.created_at as string,
        members,
        invites,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function createOrg(input: { name: string }): Promise<Result<{ id: string }>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  const name = input.name.trim()
  if (!name) return { ok: false, error: '조직 이름을 입력하세요' }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .insert({ name })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: { id: data.id as string } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
