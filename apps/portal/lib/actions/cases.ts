'use server'

/**
 * Portal 보호자가 본인에게 링크된 케이스를 조회하는 read-only server actions.
 *
 * `case_customer_links` 를 명시적 inner join 해서 본인 link 가 있는 케이스만
 * 가져온다. cases_select RLS 의 super_admin/org_member 우회와 무관하게 portal
 * 사용자 관점("내 케이스") 만 보장.
 *
 * UI 가 진입하기 전 데이터 레이어만 — Phase 11.0.7 cases 페이지 디자인 freeze 후
 * 그대로 import 해서 wiring.
 */

import { createClient } from '@petmove/auth/server'
import type { CaseRow } from '@petmove/domain'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * 현재 사용자에게 case_customer_links 로 매핑된 모든 케이스.
 * 정렬: 업데이트 최신순. 빈 결과는 빈 배열 — error 아님.
 */
export async function listMyCases(): Promise<Result<CaseRow[]>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { data, error } = await supabase
      .from('cases')
      .select('*, case_customer_links!inner(user_id)')
      .eq('case_customer_links.user_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    const rows = (data ?? []).map(({ case_customer_links: _l, ...rest }) => rest) as CaseRow[]
    return { ok: true, value: rows }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 단일 케이스 상세. 본인 link 가 있는 케이스만 반환 — 그 외는 null.
 */
export async function getMyCase(caseId: string): Promise<Result<CaseRow | null>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { data, error } = await supabase
      .from('cases')
      .select('*, case_customer_links!inner(user_id)')
      .eq('id', caseId)
      .eq('case_customer_links.user_id', user.id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: true, value: null }
    const { case_customer_links: _l, ...rest } = data as Record<string, unknown>
    return { ok: true, value: rest as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
