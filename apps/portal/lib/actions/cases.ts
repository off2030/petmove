'use server'

/**
 * Portal 보호자가 본인에게 링크된 케이스를 조회하는 read-only server actions.
 *
 * 인증된 사용자 클라이언트 (createClient) 로 호출 — `cases_select` RLS 정책이
 * `is_case_customer(case.id)` 헬퍼로 자동 필터링하므로 본인 케이스만 보임. service
 * role 우회 없음 (anon token 흐름이 아니므로).
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
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as CaseRow[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 단일 케이스 상세. RLS 가 본인 케이스만 통과시킴 — 다른 케이스 ID 를 직접 요청해도
 * 빈 결과 (= not found).
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
      .select('*')
      .eq('id', caseId)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data as CaseRow | null) ?? null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
