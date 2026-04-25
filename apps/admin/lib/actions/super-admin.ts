'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, inviteFromAddress } from '@/lib/email/resend'
import { inviteEmailHtml, inviteEmailSubject } from '@/lib/email/invite-template'
import type { InviteRole } from './invites'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ROLE_LABEL: Record<InviteRole, string> = { admin: '관리자', member: '멤버' }

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

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
  business_number: string | null
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
      .select('id, name, business_number, created_at')
      .eq('id', orgId)
      .maybeSingle()
    if (orgErr) return { ok: false, error: orgErr.message }
    if (!org) return { ok: false, error: '조직을 찾을 수 없음' }

    // memberships → profiles 직접 FK 부재로 2회 쿼리 후 merge.
    const { data: memRows } = await admin
      .from('memberships')
      .select('user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })

    const userIds = (memRows ?? []).map((r) => (r as { user_id: string }).user_id)
    const profMap = new Map<string, { email: string; name: string | null }>()
    if (userIds.length > 0) {
      const { data: profRows } = await admin
        .from('profiles')
        .select('id, email, name')
        .in('id', userIds)
      for (const p of profRows ?? []) {
        profMap.set((p as { id: string }).id, {
          email: (p as { email: string }).email,
          name: (p as { name: string | null }).name,
        })
      }
    }

    const members = (memRows ?? []).map((r) => {
      const row = r as { user_id: string; role: string; created_at: string }
      const prof = profMap.get(row.user_id)
      return {
        user_id: row.user_id,
        email: prof?.email ?? '',
        name: prof?.name ?? null,
        role: row.role,
        joined_at: row.created_at,
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
        business_number: (org.business_number as string | null) ?? null,
        created_at: org.created_at as string,
        members,
        invites,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function updateOrgBusinessNumber(input: {
  orgId: string
  businessNumber: string | null
}): Promise<Result<{ business_number: string | null }>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  const raw = (input.businessNumber ?? '').trim()
  const normalized = raw === '' ? null : raw
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .update({ business_number: normalized })
      .eq('id', input.orgId)
      .select('business_number')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: { business_number: (data.business_number as string | null) ?? null } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * super_admin 이 임의의 조직에 초대 생성. service role 로 RLS 우회.
 * 이메일 발송은 best-effort (실패해도 초대 자체는 생성됨).
 */
export async function inviteToOrg(input: {
  orgId: string
  email: string
  role: InviteRole
}): Promise<Result<{ token: string; emailSent: boolean; emailError?: string }>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  const email = normalizeEmail(input.email)
  if (!email || !email.includes('@')) {
    return { ok: false, error: '유효한 이메일이 아닙니다' }
  }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('organization_invites')
      .insert({
        org_id: input.orgId,
        email,
        role: input.role,
        created_by: user?.id ?? null,
      })
      .select('token, expires_at')
      .single()
    if (error) return { ok: false, error: error.message }

    const token = data.token as string
    const expiresAt = new Date(data.expires_at as string)

    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', input.orgId)
      .maybeSingle()
    const orgName = (org?.name as string | undefined) ?? '펫무브워크'

    const hdrs = await headers()
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'petmove.vercel.app'
    const proto = hdrs.get('x-forwarded-proto') || 'https'
    const inviteUrl = `${proto}://${host}/invite/${token}`

    let emailSent = false
    let emailError: string | undefined
    try {
      const result = await sendEmail({
        from: inviteFromAddress(),
        to: email,
        subject: inviteEmailSubject(orgName),
        html: inviteEmailHtml({
          orgName,
          inviteUrl,
          roleLabel: ROLE_LABEL[input.role],
          expiresAt,
        }),
        replyTo: user?.email ?? undefined,
      })
      emailSent = result !== null
    } catch (e) {
      emailError = (e as Error).message
    }

    return { ok: true, value: { token, emailSent, emailError } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** super_admin 이 임의의 조직 멤버 제거. 자기 자신 + last-admin 보호 동일. */
export async function removeMemberFromOrg(input: {
  orgId: string
  userId: string
}): Promise<Result<null>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id === input.userId) {
      return { ok: false, error: '자기 자신은 제거할 수 없습니다' }
    }
    const admin = createAdminClient()
    const { error } = await admin
      .from('memberships')
      .delete()
      .eq('org_id', input.orgId)
      .eq('user_id', input.userId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** super_admin 이 임의의 초대 취소. */
export async function revokeOrgInvite(inviteId: string): Promise<Result<null>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('organization_invites')
      .delete()
      .eq('id', inviteId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: null }
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
