'use server'

/**
 * 케이스 ↔ 펫무브 고객앱(portal) 계정 연결 조회.
 *
 * 케이스 소유권은 `case_customer_links` 의 user_id 로 영구 고정된다(A안, 20260627000001).
 * 이메일은 최초 연결 단서일 뿐이라 — 관리자가 케이스 이메일을 서류용으로 고쳐도 소유권은
 * 안 흔들린다 — 상세 화면의 이메일만 봐서는 "이 고객이 앱을 쓰고 있는지" 알 수 없다.
 * 이 액션이 그 답을 준다: 실제로 링크된 계정 목록 + (미연결일 때) 같은 이메일로 가입한
 * 계정이 있는지.
 *
 * 권한: 케이스 소속 org 멤버 또는 super_admin 만. 계정 정보(로그인 이메일·로그인 수단)는
 * customer_profiles / auth.users 라 RLS 로는 안 보인다 — 권한을 명시 검증한 뒤
 * service-role 로 읽는다 (permanentDeleteCase 와 같은 패턴).
 */

import { reportActionError } from './_report-error'
import { getCurrentUser } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export type LinkedVia = 'share-token' | 'email-match' | 'phone-match' | 'manual'

export interface LinkedAppAccount {
  userId: string
  /** 고객앱 프로필 이름 (없으면 소셜 계정 이름 폴백). */
  displayName: string | null
  /** 로그인 이메일 — Apple '이메일 가리기' 는 릴레이 주소가 들어온다. */
  loginEmail: string | null
  phone: string | null
  /** 'google' | 'apple' | 'kakao' | 'naver' | 'email' … */
  provider: string | null
  linkedAt: string
  linkedVia: LinkedVia
  lastSignInAt: string | null
}

export interface CaseAppLinkInfo {
  accounts: LinkedAppAccount[]
  /**
   * 링크가 하나도 없을 때만 채워진다 — 케이스 이메일과 같은 이메일로 가입한 고객앱 계정 수.
   * 0 이면 "아직 앱 가입 안 함", ≥1 이면 "가입은 했는데 링크가 끊겨 있음"(수동 연결 필요).
   */
  emailCandidates: number
  /** 매칭 기준이 된 케이스 이메일 (없으면 null — 이메일 자체가 비어 자동 매칭 불가). */
  caseEmail: string | null
}

export async function getCaseAppLink(caseId: string): Promise<Result<CaseAppLinkInfo>> {
  try {
    if (!caseId) return { ok: false, error: 'caseId is required' }

    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증이 필요합니다.' }

    const admin = createAdminClient()

    const { data: caseRow, error: caseErr } = await admin
      .from('cases')
      .select('org_id, data')
      .eq('id', caseId)
      .maybeSingle()
    if (caseErr) return { ok: false, error: caseErr.message }
    if (!caseRow) return { ok: false, error: '케이스를 찾을 수 없습니다.' }

    // 권한: 케이스 소속 org 멤버 또는 super_admin.
    const [{ data: profile }, { data: membership }] = await Promise.all([
      admin.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
      admin
        .from('memberships')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('org_id', (caseRow as { org_id: string }).org_id)
        .maybeSingle(),
    ])
    if (!profile?.is_super_admin && !membership) {
      return { ok: false, error: '이 케이스의 계정 연결을 볼 권한이 없습니다.' }
    }

    // customer_profiles.email_normalized 와 같은 기준으로 정규화 (트리거와 동일).
    const data = ((caseRow as { data: Record<string, unknown> | null }).data ?? {}) as Record<string, unknown>
    const caseEmail = String(data.email ?? '').trim().toLowerCase() || null

    const { data: links, error: linkErr } = await admin
      .from('case_customer_links')
      .select('user_id, linked_at, linked_via')
      .eq('case_id', caseId)
      .order('linked_at', { ascending: true })
    if (linkErr) return { ok: false, error: linkErr.message }

    const rows = (links ?? []) as { user_id: string; linked_at: string; linked_via: LinkedVia }[]

    if (rows.length === 0) {
      // 미연결 — 같은 이메일로 가입한 계정이 있는지만 확인 (있으면 수동 연결 대상).
      let emailCandidates = 0
      if (caseEmail) {
        const { count } = await admin
          .from('customer_profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('email_normalized', caseEmail)
        emailCandidates = count ?? 0
      }
      return { ok: true, value: { accounts: [], emailCandidates, caseEmail } }
    }

    const userIds = rows.map((r) => r.user_id)
    const { data: profiles } = await admin
      .from('customer_profiles')
      .select('user_id, display_name, phone, email_normalized')
      .in('user_id', userIds)
    const profileByUser = new Map(
      ((profiles ?? []) as { user_id: string; display_name: string | null; phone: string | null; email_normalized: string | null }[])
        .map((p) => [p.user_id, p]),
    )

    // 로그인 수단·최근 로그인은 auth.users 에만 있다 — 링크 수가 몇 개 안 되므로 개별 조회.
    const authUsers = await Promise.all(
      userIds.map(async (id) => {
        try {
          const { data: u } = await admin.auth.admin.getUserById(id)
          return [id, u?.user ?? null] as const
        } catch {
          return [id, null] as const
        }
      }),
    )
    const authByUser = new Map(authUsers)

    const accounts: LinkedAppAccount[] = rows.map((r) => {
      const p = profileByUser.get(r.user_id)
      const au = authByUser.get(r.user_id)
      const meta = (au?.user_metadata ?? {}) as Record<string, unknown>
      const provider =
        (au?.app_metadata?.provider as string | undefined) ??
        au?.identities?.[0]?.provider ??
        null
      return {
        userId: r.user_id,
        displayName:
          p?.display_name ??
          (typeof meta.name === 'string' ? meta.name : null) ??
          (typeof meta.full_name === 'string' ? meta.full_name : null),
        loginEmail: p?.email_normalized ?? au?.email ?? null,
        phone: p?.phone ?? null,
        provider,
        linkedAt: r.linked_at,
        linkedVia: r.linked_via,
        lastSignInAt: au?.last_sign_in_at ?? null,
      }
    })

    return { ok: true, value: { accounts, emailCandidates: 0, caseEmail } }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'case-app-link.getCaseAppLink') }
  }
}
