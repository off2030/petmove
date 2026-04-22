'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/supabase/active-org'

export type InviteRole = 'owner' | 'admin' | 'member'

export interface InviteRow {
  id: string
  email: string
  role: InviteRole
  token: string
  expires_at: string
  created_at: string
  accepted_at: string | null
}

export interface MemberRow {
  user_id: string
  email: string
  name: string | null
  role: InviteRole
  joined_at: string
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** 현재 org 의 pending + 만료되지 않은 초대 목록. */
export async function listInvites(): Promise<Result<InviteRow[]>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('organization_invites')
      .select('id, email, role, token, expires_at, created_at, accepted_at')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as InviteRow[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 현재 org 의 멤버 목록 (profiles 조인). */
export async function listMembers(): Promise<Result<MemberRow[]>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('memberships')
      .select('user_id, role, created_at, profiles!inner(email, name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    if (error) return { ok: false, error: error.message }
    type Row = {
      user_id: string
      role: InviteRole
      created_at: string
      profiles: { email: string; name: string | null } | { email: string; name: string | null }[] | null
    }
    const rows: MemberRow[] = ((data ?? []) as unknown as Row[]).map((r) => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        user_id: r.user_id,
        email: prof?.email ?? '',
        name: prof?.name ?? null,
        role: r.role,
        joined_at: r.created_at,
      }
    })
    return { ok: true, value: rows }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 초대 생성 — owner/admin 권한 RLS 로 체크됨. */
export async function createInvite(input: {
  email: string
  role: InviteRole
}): Promise<Result<{ token: string }>> {
  const email = normalizeEmail(input.email)
  if (!email || !email.includes('@')) {
    return { ok: false, error: '유효한 이메일이 아닙니다' }
  }
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { data, error } = await supabase
      .from('organization_invites')
      .insert({ org_id: orgId, email, role: input.role, created_by: user.id })
      .select('token')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: { token: data.token as string } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 초대 취소. */
export async function revokeInvite(id: string): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('organization_invites')
      .delete()
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 초대 수락 — /invite/[token] 페이지에서 호출.
 * Service role 로 RLS 우회 (수락자는 아직 org 멤버가 아니므로 select 권한 없음).
 * 이메일 일치 검증 후 membership 생성.
 */
export async function acceptInvite(token: string): Promise<Result<{ orgId: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }

  const admin = createAdminClient()

  const { data: invite, error: findErr } = await admin
    .from('organization_invites')
    .select('id, org_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()
  if (findErr) return { ok: false, error: findErr.message }
  if (!invite) return { ok: false, error: '유효하지 않은 초대 링크' }
  if (invite.accepted_at) return { ok: false, error: '이미 수락된 초대' }
  if (new Date(invite.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: '만료된 초대' }
  }
  if (normalizeEmail(user.email ?? '') !== normalizeEmail(invite.email as string)) {
    return { ok: false, error: `이 초대는 ${invite.email} 전용입니다 (현재 로그인: ${user.email})` }
  }

  const orgId = invite.org_id as string
  const role = invite.role as InviteRole

  // membership 추가 (이미 있으면 role upgrade)
  const { error: memErr } = await admin
    .from('memberships')
    .upsert({ user_id: user.id, org_id: orgId, role }, { onConflict: 'user_id,org_id' })
  if (memErr) return { ok: false, error: memErr.message }

  const { error: markErr } = await admin
    .from('organization_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', invite.id as string)
  if (markErr) return { ok: false, error: markErr.message }

  return { ok: true, value: { orgId } }
}
