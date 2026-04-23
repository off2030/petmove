'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { sendEmail, inviteFromAddress } from '@/lib/email/resend'
import { inviteEmailHtml, inviteEmailSubject } from '@/lib/email/invite-template'

const ROLE_LABEL: Record<'admin' | 'member', string> = {
  admin: '관리자',
  member: '멤버',
}

export type InviteRole = 'admin' | 'member'

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

/** 현재 org 의 멤버 목록. memberships → profiles 직접 FK 부재로 2회 쿼리 후 merge. */
export async function listMembers(): Promise<Result<MemberRow[]>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data: memRows, error: memErr } = await supabase
      .from('memberships')
      .select('user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    if (memErr) return { ok: false, error: memErr.message }
    const userIds = (memRows ?? []).map((r) => (r as { user_id: string }).user_id)
    if (userIds.length === 0) return { ok: true, value: [] }

    const { data: profRows, error: profErr } = await supabase
      .from('profiles')
      .select('id, email, name')
      .in('id', userIds)
    if (profErr) return { ok: false, error: profErr.message }
    const profMap = new Map<string, { email: string; name: string | null }>()
    for (const p of profRows ?? []) {
      profMap.set((p as { id: string }).id, {
        email: (p as { email: string }).email,
        name: (p as { name: string | null }).name,
      })
    }

    const rows: MemberRow[] = (memRows ?? []).map((r) => {
      const row = r as { user_id: string; role: InviteRole; created_at: string }
      const prof = profMap.get(row.user_id)
      return {
        user_id: row.user_id,
        email: prof?.email ?? '',
        name: prof?.name ?? null,
        role: row.role,
        joined_at: row.created_at,
      }
    })
    return { ok: true, value: rows }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 초대 생성 — admin 권한 RLS 로 체크됨. 이메일 발송은 best-effort. */
export async function createInvite(input: {
  email: string
  role: InviteRole
}): Promise<Result<{ token: string; emailSent: boolean; emailError?: string }>> {
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
      .select('token, expires_at')
      .single()
    if (error) return { ok: false, error: error.message }

    const token = data.token as string
    const expiresAt = new Date(data.expires_at as string)

    // 조직 이름 조회 — 이메일 템플릿에 표시용. RLS 통과 (본인 멤버쉽의 org).
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
    const orgName = (org?.name as string | undefined) ?? '펫무브워크'

    // 초대 링크 — 요청 origin 기반. 로컬 dev / Vercel preview / prod 모두 자동 대응.
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
        replyTo: user.email ?? undefined,
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
