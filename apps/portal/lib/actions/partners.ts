'use server'

/**
 * 보호자가 [내 정보 > 담당 동물병원·운송업체] 카드에서 조직을 연결·해제하는
 * server actions. 보호자 단위 통일 정책 — 본인 모든 케이스에 일괄 적용.
 *
 * - listAvailableOrgs(role): 카탈로그 조회 (hospital/transport/both)
 * - setVetOrg / setTransportOrg(orgId): 일괄 연결
 * - unsetVetOrg / unsetTransportOrg(): 일괄 해제
 *
 * RLS 컨텍스트:
 *   - organizations SELECT 는 보호자 카탈로그 노출 정책으로 hospital/transport/both 허용.
 *   - cases UPDATE 정책은 조직 멤버만 허용 → 보호자(어느 조직 멤버 아님)는 직접 UPDATE
 *     못함. service-role admin 클라이언트로 우회. 안전선은 case_customer_links 범위
 *     제한(본인이 링크된 케이스만 갱신).
 *
 * 봇 알림(연결·해제 시 운영자 봇방 메시지) 은 다음 단계에서 추가 — Step 5.
 */

import { createClient, getCurrentUser } from '@petmove/auth/server'
import { revalidatePath } from 'next/cache'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export type PartnerRole = 'vet' | 'transport'

export interface PartnerOrg {
  id: string
  name: string
  name_en: string | null
  org_type: 'hospital' | 'transport' | 'both'
}

const PARTNER_TYPES_BY_ROLE: Record<PartnerRole, readonly string[]> = {
  vet: ['hospital', 'both'],
  transport: ['transport', 'both'],
}

/**
 * 보호자의 현재 연결 조직 — 본인 첫 케이스의 vet_org_id / transport_org_id 를 보고
 * 조직 정보를 한 번에 반환. 통일 정책 전제(모든 본인 케이스 동일 값). 케이스 없거나
 * 미연결이면 해당 키 null. [내 정보] 허브에서 카드별 이름 표시용.
 */
export async function getMyPartnerOrgs(): Promise<
  Result<{ vet: PartnerOrg | null; transport: PartnerOrg | null }>
> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()
    const { data: links, error: linksError } = await supabase
      .from('case_customer_links')
      .select('case_id')
      .eq('user_id', user.id)
      .limit(1)
    if (linksError) return { ok: false, error: linksError.message }
    if (!links?.length) return { ok: true, value: { vet: null, transport: null } }

    const caseId = (links[0] as { case_id: string }).case_id
    const { data: caseRow, error: caseError } = await supabase
      .from('cases')
      .select('vet_org_id, transport_org_id')
      .eq('id', caseId)
      .maybeSingle()
    if (caseError) return { ok: false, error: caseError.message }

    const vetId = (caseRow as { vet_org_id: string | null } | null)?.vet_org_id ?? null
    const tspId =
      (caseRow as { transport_org_id: string | null } | null)?.transport_org_id ?? null
    const ids = [vetId, tspId].filter((v): v is string => !!v)
    if (ids.length === 0) return { ok: true, value: { vet: null, transport: null } }

    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, name_en, org_type')
      .in('id', ids)
    if (orgsError) return { ok: false, error: orgsError.message }

    const byId = new Map((orgs ?? []).map((o) => [(o as PartnerOrg).id, o as PartnerOrg]))
    return {
      ok: true,
      value: {
        vet: vetId ? byId.get(vetId) ?? null : null,
        transport: tspId ? byId.get(tspId) ?? null : null,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 카드 바텀시트에 노출할 조직 목록. role 에 따라 hospital/both 또는 transport/both 만.
 * platform 은 RLS 정책에서 제외되어 자동으로 안 보임 — 보호자가 직영 조직을 잘못
 * 선택할 가능성 차단.
 */
export async function listAvailableOrgs(role: PartnerRole): Promise<Result<PartnerOrg[]>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, name_en, org_type')
      .in('org_type', PARTNER_TYPES_BY_ROLE[role] as unknown as string[])
      .order('name', { ascending: true })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as PartnerOrg[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 본인 모든 케이스에 vet_org_id 일괄 갱신. */
export async function setVetOrg(orgId: string): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('vet', orgId)
}

/** 본인 모든 케이스에 transport_org_id 일괄 갱신. */
export async function setTransportOrg(orgId: string): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('transport', orgId)
}

/** vet_org_id 해제 — 본인 모든 케이스의 컬럼을 NULL. */
export async function unsetVetOrg(): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('vet', null)
}

/** transport_org_id 해제 — 본인 모든 케이스의 컬럼을 NULL. */
export async function unsetTransportOrg(): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('transport', null)
}

// ─────────────────────────────────────────────────
// 공용 헬퍼
// ─────────────────────────────────────────────────

const COLUMN_BY_ROLE: Record<PartnerRole, 'vet_org_id' | 'transport_org_id'> = {
  vet: 'vet_org_id',
  transport: 'transport_org_id',
}

/**
 * role 에 따라 cases.vet_org_id 또는 transport_org_id 를 일괄 갱신.
 *
 * - orgId 가 null 이면 해제, 값이면 유효성 검증 후 갱신.
 * - 검증: 조직 존재 + org_type 가 role 에 허용된 타입인지 확인 (RLS 도 차단하지만
 *   사용자 친화 에러 메시지를 위해 server 단에서 먼저 검사).
 * - 본인이 링크된 케이스 범위(case_customer_links.user_id = auth.uid()) 로 제한.
 *   service-role 우회는 이 범위 안에서만 안전.
 */
async function setPartnerOrg(
  role: PartnerRole,
  orgId: string | null,
): Promise<Result<{ updated: number }>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    if (orgId !== null) {
      const supabase = await createClient()
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, org_type')
        .eq('id', orgId)
        .maybeSingle()
      if (orgError) return { ok: false, error: orgError.message }
      if (!org) return { ok: false, error: '조직을 찾을 수 없습니다.' }
      if (!PARTNER_TYPES_BY_ROLE[role].includes((org as { org_type: string }).org_type)) {
        return { ok: false, error: '선택할 수 없는 조직 유형입니다.' }
      }
    }

    // service-role 로 case 업데이트 — 본인 case_customer_links 범위 제한.
    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()
    const { data: links, error: linksError } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('user_id', user.id)
    if (linksError) return { ok: false, error: linksError.message }

    const caseIds = (links ?? []).map((l) => (l as { case_id: string }).case_id)
    if (caseIds.length === 0) return { ok: true, value: { updated: 0 } }

    const { error: updateError } = await admin
      .from('cases')
      .update({ [COLUMN_BY_ROLE[role]]: orgId })
      .in('id', caseIds)
    if (updateError) return { ok: false, error: updateError.message }

    revalidatePath('/me')
    revalidatePath('/me/vet')
    revalidatePath('/me/agency')
    return { ok: true, value: { updated: caseIds.length } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
