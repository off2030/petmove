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
