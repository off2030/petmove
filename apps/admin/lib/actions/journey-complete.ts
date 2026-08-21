'use server'

/**
 * 스태프(펫무브워크)가 한 여행지(여정)를 완료/취소 처리 → 지난 여정으로 내림.
 * portal 의 markJourneyComplete 와 동일 로직 — admin 은 createClient(RLS·org 멤버)로 직접.
 * 설계: docs/journey-lifecycle-design.md §4·§5.
 *
 * 용도: 정상 완료여도 고객이 검역 '완료' 미체크하고 다녀온 경우, 또는 취소·중단 정리.
 */

import { createClient } from '@petmove/auth/server'
import {
  DESTINATION_SCOPED_FIELD_KEYS,
  captureJourneySnapshot,
  parseDestinations,
  planJourneyRestore,
  summarizeJourney,
  type PastJourneySummary,
} from '@petmove/domain'

type TripType = 'round' | 'one_way'
type Result = { ok: true } | { ok: false; error: string }

export async function markJourneyCompleteAdmin(
  caseId: string,
  destination: string,
  outcome: 'done' | 'cancelled' = 'done',
  completedDate?: string,
): Promise<Result> {
  const dest = destination.trim()
  if (!caseId || !dest) return { ok: false, error: 'caseId·여행지가 필요합니다.' }

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
  // ⚠️ 지우기 **전에** 원본을 담는다 — 지난 여정 목록의 '되돌리기'가 이걸로 복원한다.
  //   (칩의 작은 보관 버튼을 잘못 눌러도 일정·항공편·검역일이 날아가지 않게, 2026-08-21.)
  const summary: PastJourneySummary = {
    ...summarizeJourney(
      { destination: dest, tripType, departureDate, returnDate },
      outcome,
      completedDate ?? today,
    ),
    snapshot: captureJourneySnapshot({
      destination: dest,
      data,
      destinationColumn: r.destination,
      departureColumn: r.departure_date,
    }),
  }

  const pastJourneys: PastJourneySummary[] = [
    ...((data.past_journeys as PastJourneySummary[] | undefined) ?? []),
    summary,
  ]

  delete byDestAll[dest]
  const tripTypeAll = { ...((data.trip_type as Record<string, TripType> | undefined) ?? {}) }
  delete tripTypeAll[dest]

  const nextTokens = tokens.filter((t) => t !== dest)
  const nextDest = nextTokens.join(', ')
  const nextData: Record<string, unknown> = {
    ...data,
    by_dest: byDestAll,
    trip_type: tripTypeAll,
    past_journeys: pastJourneys,
  }
  const updatePayload: Record<string, unknown> = { destination: nextDest, data: nextData }

  // demote 정리 (portal finishJourney 와 동일) — 내려간 여정의 공용 잔존(top-level scoped 필드·
  // 도착확인·완료 prompt·출국일 컬럼)을 남은(특히 단일 결과) 여행지가 물려받지 않게 비운다.
  // 단일 여행지 케이스는 scoped 필드(예: return_date)가 top-level 에 사는데, 안 비우면 다음
  // 여정으로 새어 '수출검역 신청'이 잘못 '예정'으로 뜨는 등 누수가 생긴다. 백신·항체(동물 단위)는 유지.
  for (const k of DESTINATION_SCOPED_FIELD_KEYS) delete nextData[k]
  const ac = { ...((nextData.arrival_confirmed as Record<string, unknown> | undefined) ?? {}) }
  delete ac[dest]
  nextData.arrival_confirmed = ac
  const cpd = {
    ...((nextData.completion_prompt_dismissed as Record<string, unknown> | undefined) ?? {}),
  }
  delete cpd[dest]
  nextData.completion_prompt_dismissed = cpd
  updatePayload.departure_date = null

  const { error: updErr } = await supabase
    .from('cases')
    .update(updatePayload)
    .eq('id', caseId)
  if (updErr) return { ok: false, error: updErr.message }

  return { ok: true }
}

/**
 * 지난 여정 되돌리기 — 보관했던 여정 1건을 다시 진행 중으로 올린다.
 *
 * 보관(markJourneyCompleteAdmin)이 지우기 전에 담아 둔 스냅샷으로 복원한다. 스냅샷이 없는
 * 옛 기록은 복원할 수 없다(UI 가 버튼을 감춘다). 판정·계획은 전부 도메인의 순수 함수
 * [[planJourneyRestore]] 가 하고, 여기서는 읽기·쓰기와 메시지만 담당한다.
 *
 * `entryIndex` 는 **정렬 전 `data.past_journeys` 원본 인덱스** — 화면은 완료일 내림차순으로
 * 정렬해 보여주므로 표시 순서를 그대로 넘기면 엉뚱한 여정이 복원된다.
 */
export type RestoreResult =
  | {
      ok: true
      /** 복원된 여행지 토큰. */
      restored: string
      /** 낙관적 로컬 갱신용 — 저장된 최종 값 그대로. */
      destination: string
      departureDate: string | null
      data: Record<string, unknown>
    }
  | { ok: false; error: string }

export async function restoreJourneyFromPastAdmin(
  caseId: string,
  entryIndex: number,
): Promise<RestoreResult> {
  if (!caseId) return { ok: false, error: 'caseId 가 필요합니다.' }

  const supabase = await createClient()
  const { data: row, error: fetchErr } = await supabase
    .from('cases')
    .select('destination, departure_date, data')
    .eq('id', caseId)
    .single()
  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? '케이스를 찾을 수 없습니다.' }
  }
  const r = row as {
    destination: string | null
    departure_date: string | null
    data: Record<string, unknown> | null
  }

  const plan = planJourneyRestore(
    {
      destination: r.destination,
      departure_date: r.departure_date,
      data: (r.data ?? {}) as Record<string, unknown>,
    },
    entryIndex,
  )
  if ('reason' in plan) {
    const message: Record<typeof plan.reason, string> = {
      'not-found': '해당 지난 여정을 찾을 수 없습니다. 화면을 새로고침해 주세요.',
      'no-snapshot':
        '이 기록은 되돌리기 정보가 없어요. 되돌리기가 생기기 전(2026-08-21 이전)에 보관된 여정입니다.',
      'already-active': '이미 진행 중인 여행지예요.',
      'at-limit': `진행 중 여행지가 이미 최대치예요. 하나를 정리한 뒤 되돌려 주세요.`,
    }
    return { ok: false, error: message[plan.reason] }
  }

  const { error: updErr } = await supabase
    .from('cases')
    .update({
      destination: plan.destination,
      departure_date: plan.departure_date,
      data: plan.data,
    })
    .eq('id', caseId)
  if (updErr) return { ok: false, error: updErr.message }

  return {
    ok: true,
    restored: plan.restored,
    destination: plan.destination,
    departureDate: plan.departure_date,
    data: plan.data,
  }
}
