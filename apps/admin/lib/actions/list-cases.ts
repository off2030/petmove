'use server'
// 활성 조직의 케이스 목록 — 레이아웃 초기 로드 + Realtime 재연결 시 공백 보충용.

import { createClient } from '@petmove/auth/server'
import type { CaseRow } from '@petmove/domain'
import { getActiveOrgId } from '@/lib/supabase/active-org'

const CASE_COLUMNS =
  'id, org_id, microchip, microchip_extra, customer_name, customer_name_en, pet_name, pet_name_en, destination, departure_date, assigned_to, avatar_emoji, avatar_color, data, created_at, updated_at, deleted_at'

/**
 * 활성 조직의 모든(미삭제) 케이스를 created_at 내림차순으로 반환.
 * Supabase 기본 1000행 cap 을 batched pagination 으로 우회.
 */
export async function listActiveOrgCases(): Promise<CaseRow[]> {
  const supabase = await createClient()
  let orgId: string
  try {
    orgId = await getActiveOrgId()
  } catch {
    return []
  }

  const all: CaseRow[] = []
  const batchSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select(CASE_COLUMNS)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + batchSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...(data as CaseRow[]))
    if (data.length < batchSize) break
    from += batchSize
  }
  return all
}

/**
 * URL 에 남아 있는 상세 case id 를 복원하기 위한 단일 조회.
 *
 * listActiveOrgCases() 가 인증 refresh/RLS/org lookup 타이밍 문제로 일시적으로
 * 빈 목록을 반환하더라도, URL 의 case id 를 곧장 버리지 않고 한 번 더 확인한다.
 */
export async function getActiveOrgCaseById(
  caseId: string,
): Promise<{ ok: true; case: CaseRow | null } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()
  let orgId: string
  try {
    orgId = await getActiveOrgId()
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'active org lookup failed',
    }
  }

  const { data, error } = await supabase
    .from('cases')
    .select(CASE_COLUMNS)
    .eq('id', caseId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  return { ok: true, case: (data as CaseRow | null) ?? null }
}
