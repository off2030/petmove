'use server'

/**
 * 스태프(펫무브워크)가 한 목적지를 케이스에서 삭제 — portal removeCaseDestination 과 동일 정리.
 * markJourneyCompleteAdmin(완료 처리)과 달리 past_journeys 요약을 남기지 않는다(삭제 = 잘못
 * 넣은 목적지 빼기). 정리 범위는 완료 처리와 동일:
 *   - by_dest[dest]·trip_type[dest]·arrival_confirmed[dest]·completion_prompt_dismissed[dest] 제거
 *   - top-level destination-scoped 잔존 + departure_date 컬럼 비움 — 단일 목적지 케이스는
 *     scoped 필드가 top-level 에 살아서, 안 비우면 다음에 넣는 목적지가 이전 목적지의
 *     추가정보(항공편·해외주소·허가번호)·출국일·검역일을 물려받는다. 백신·항체(동물 단위)는 유지.
 */

import { createClient } from '@petmove/auth/server'
import { DESTINATION_SCOPED_FIELD_KEYS, parseDestinations } from '@petmove/domain'

type Result = { ok: true } | { ok: false; error: string }

export async function removeCaseDestinationAdmin(
  caseId: string,
  destination: string,
): Promise<Result> {
  const dest = destination.trim()
  if (!caseId || !dest) return { ok: false, error: 'caseId·목적지가 필요합니다.' }

  const supabase = await createClient()

  const { data: row, error: fetchErr } = await supabase
    .from('cases')
    .select('destination, data')
    .eq('id', caseId)
    .single()
  if (fetchErr || !row) return { ok: false, error: fetchErr?.message ?? '케이스를 찾을 수 없습니다.' }

  const r = row as { destination: string | null; data: Record<string, unknown> | null }
  const tokens = parseDestinations(r.destination)
  if (!tokens.includes(dest)) return { ok: true } // 이미 없음 — 멱등 성공.

  const nextTokens = tokens.filter((t) => t !== dest)
  const nextDest = nextTokens.length > 0 ? nextTokens.join(', ') : null

  const data = (r.data ?? {}) as Record<string, unknown>
  const tripTypeAll = { ...((data.trip_type as Record<string, unknown> | undefined) ?? {}) }
  delete tripTypeAll[dest]
  const byDestAll = {
    ...((data.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}),
  }
  delete byDestAll[dest]
  const nextData: Record<string, unknown> = { ...data, trip_type: tripTypeAll, by_dest: byDestAll }

  for (const k of DESTINATION_SCOPED_FIELD_KEYS) delete nextData[k]
  const ac = { ...((nextData.arrival_confirmed as Record<string, unknown> | undefined) ?? {}) }
  delete ac[dest]
  nextData.arrival_confirmed = ac
  const cpd = {
    ...((nextData.completion_prompt_dismissed as Record<string, unknown> | undefined) ?? {}),
  }
  delete cpd[dest]
  nextData.completion_prompt_dismissed = cpd

  const { error: updErr } = await supabase
    .from('cases')
    .update({ destination: nextDest, data: nextData, departure_date: null })
    .eq('id', caseId)
  if (updErr) return { ok: false, error: updErr.message }

  return { ok: true }
}
