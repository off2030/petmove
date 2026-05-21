'use server'

/**
 * 외부 정보 입력용 매직 링크 — 발신자(스태프) 측 액션.
 *
 * 발급 흐름:
 *   - createShareLink: 케이스 + fieldKeys 화이트리스트 + 만료일로 토큰 생성 → URL 복사 후
 *     본인 채널(카톡·이메일)로 전달.
 *   - listShareLinksForCase: 케이스 상세에서 발급 이력 조회.
 *   - revokeShareLink: 발급된 링크 무효화 (수신자 제출 전이라면 막음).
 *
 * 수신자(보호자) 측 흐름은 portal 의 apps/portal/lib/actions/share-links.ts 가
 * 호스팅. portal 이 service role 로 case·share-link 직접 조회/수정.
 */

import { createClient } from '@petmove/auth/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import type { ShareLinkRow } from '@petmove/domain'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface CreateShareLinkInput {
  caseId: string
  template: string | null
  fieldKeys: string[]
  fieldIds?: string[]
  destinationScope?: string | null
  title?: string | null
  expiresInDays?: number
}

export async function createShareLink(
  input: CreateShareLinkInput,
): Promise<Result<{ id: string; token: string; expiresAt: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const orgId = await getActiveOrgId()

    if (input.fieldKeys.length === 0) {
      return { ok: false, error: '최소 1개 이상의 필드를 선택해주세요' }
    }

    // 케이스 소유 확인
    const { data: caseRow, error: cErr } = await supabase
      .from('cases')
      .select('id, org_id')
      .eq('id', input.caseId)
      .maybeSingle()
    if (cErr) return { ok: false, error: cErr.message }
    if (!caseRow || (caseRow as { org_id: string }).org_id !== orgId) {
      return { ok: false, error: '본인 조직의 케이스만 공유 링크를 만들 수 있습니다' }
    }

    const days = Math.max(1, Math.min(input.expiresInDays ?? 30, 365))
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('case_share_links')
      .insert({
        case_id: input.caseId,
        org_id: orgId,
        template: input.template,
        field_keys: input.fieldKeys,
        field_ids: input.fieldIds ?? input.fieldKeys,
        destination_scope: input.destinationScope?.trim() || null,
        title: input.title?.trim() || null,
        created_by: user.id,
        expires_at: expiresAt,
      })
      .select('id, token, expires_at')
      .single()
    if (error) return { ok: false, error: error.message }

    // revalidatePath 미사용 — share-link 목록은 ShareLinkDialog 가 listShareLinksForCase
    // 로 매번 직접 조회. layout 의 initialCases 와 무관해 RSC refetch 가 필요 없다.
    return {
      ok: true,
      value: {
        id: data.id as string,
        token: data.token as string,
        expiresAt: data.expires_at as string,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function listShareLinksForCase(caseId: string): Promise<Result<ShareLinkRow[]>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('case_share_links')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as ShareLinkRow[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function revokeShareLink(id: string): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const { error } = await supabase
      .from('case_share_links')
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq('id', id)
      .is('revoked_at', null)
    if (error) return { ok: false, error: error.message }
    // revalidatePath 미사용 — ShareLinkDialog 가 dialog open 마다 listShareLinksForCase
    // 로 fresh 조회.
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
