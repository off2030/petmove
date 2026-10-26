'use server'

import { createClient } from '@petmove/auth/server'
import { destinationCountry, parseDestinations, planCaseDestinationAddition, todayKst, type CaseRow } from '@petmove/domain'

/** 같은 국가도 여정마다 별도 슬롯. 첫 여행의 정보 보존과 추가를 한 번에 저장한다. */
export async function addCaseDestinationAdmin(caseId: string, country: string, requestedToken: string): Promise<
  { ok: true; token: string; row: CaseRow } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: '다시 로그인해 주세요.' }
  const { data: row, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !row) return { ok: false, error: error?.message ?? '케이스를 찾을 수 없습니다.' }
  // 응답 유실 후 재시도해도 같은 요청이 3차 여행을 만들지 않는다.
  if (destinationCountry(requestedToken) !== destinationCountry(country)) {
    return { ok: false, error: '선택한 국가와 여정이 일치하지 않습니다.' }
  }
  if (parseDestinations(row.destination).includes(requestedToken)) {
    return { ok: true, token: requestedToken, row: row as CaseRow }
  }
  const plan = planCaseDestinationAddition(row as CaseRow, country, todayKst())
  if (!plan.ok) return plan
  if (plan.token !== requestedToken) return { ok: false, error: '여정이 변경되었습니다. 다시 선택해 주세요.' }
  const { data: saved, error: saveError } = await supabase.from('cases')
    .update({ destination: plan.destination, data: plan.data })
    .eq('id', caseId).eq('updated_at', row.updated_at).select('*').maybeSingle()
  if (saveError || !saved) return { ok: false, error: saveError?.message ?? '다른 변경이 저장되었습니다. 다시 시도해 주세요.' }
  await supabase.from('case_history').insert({
    case_id: caseId, org_id: row.org_id, field_storage: 'column', field_key: 'destination',
    old_value: row.destination, new_value: saved.destination,
  })
  return { ok: true, token: plan.token, row: saved as CaseRow }
}
