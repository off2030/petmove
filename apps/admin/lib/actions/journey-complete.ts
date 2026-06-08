'use server'

/**
 * 스태프(펫무브워크)가 한 목적지(여정)를 완료/취소 처리 → 지난 여정으로 내림.
 * portal 의 markJourneyComplete 와 동일 로직 — admin 은 createClient(RLS·org 멤버)로 직접.
 * 설계: docs/journey-lifecycle-design.md §4·§5.
 *
 * 용도: 정상 완료여도 고객이 검역 '완료' 미체크하고 다녀온 경우, 또는 취소·중단 정리.
 */

import { createClient } from '@petmove/auth/server'
import { parseDestinations, summarizeJourney, type PastJourneySummary } from '@petmove/domain'

type TripType = 'round' | 'one_way'
type Result = { ok: true } | { ok: false; error: string }

export async function markJourneyCompleteAdmin(
  caseId: string,
  destination: string,
  outcome: 'done' | 'cancelled' = 'done',
  completedDate?: string,
): Promise<Result> {
  const dest = destination.trim()
  if (!caseId || !dest) return { ok: false, error: 'caseId·목적지가 필요합니다.' }

  const supabase = await createClient()

  const { data: row, error: fetchErr } = await supabase
    .from('cases')
    .select('destination, departure_date, data')
    .eq('id', caseId)
    .single()
  if (fetchErr || !row) return { ok: false, error: fetchErr?.message ?? '케이스를 찾을 수 없습니다.' }

  const r = row as {
    destination: string | null
    departure_date: string | null
    data: Record<string, unknown> | null
  }
  const tokens = parseDestinations(r.destination)
  if (!tokens.includes(dest)) return { ok: true } // 이미 진행 중에 없음 — 멱등 성공.

  const data = (r.data ?? {}) as Record<string, unknown>
  const byDestAll = {
    ...((data.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}),
  }
  const byDestEntry = (byDestAll[dest] ?? {}) as Record<string, unknown>
  const tripType = (((data.trip_type as Record<string, TripType> | undefined) ?? {})[dest] ??
    'round') as TripType

  const readScoped = (key: string, columnFallback?: unknown): unknown => {
    if (key in byDestEntry) return byDestEntry[key]
    return columnFallback !== undefined ? columnFallback : data[key] ?? null
  }
  const departureDate = (readScoped('departure_date', r.departure_date ?? null) as string | null) ?? null
  const returnDate = (readScoped('return_date') as string | null) ?? null

  const today = new Date().toISOString().slice(0, 10)
  const summary: PastJourneySummary = summarizeJourney(
    { destination: dest, tripType, departureDate, returnDate },
    outcome,
    completedDate ?? today,
  )

  const pastJourneys: PastJourneySummary[] = [
    ...((data.past_journeys as PastJourneySummary[] | undefined) ?? []),
    summary,
  ]

  delete byDestAll[dest]
  const tripTypeAll = { ...((data.trip_type as Record<string, TripType> | undefined) ?? {}) }
  delete tripTypeAll[dest]

  const nextTokens = tokens.filter((t) => t !== dest)
  const nextDest = nextTokens.join(', ')
  const nextData = {
    ...data,
    by_dest: byDestAll,
    trip_type: tripTypeAll,
    past_journeys: pastJourneys,
  }

  const { error: updErr } = await supabase
    .from('cases')
    .update({ destination: nextDest, data: nextData })
    .eq('id', caseId)
  if (updErr) return { ok: false, error: updErr.message }

  return { ok: true }
}
