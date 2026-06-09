'use server'

/**
 * 한 case(=동물) 안의 목적지 추가·제거 server actions — Phase 3 multi-destination.
 *
 * 데이터 모델 (admin 의 다중 목적지 모델 재사용):
 *   - cases.destination          = "일본, 베트남"  (쉼표+공백 구분, 순서 보존)
 *   - cases.data.trip_type       = { "일본": "round", "베트남": "one_way" }
 *   - cases.data.by_dest[dest]   = {}  (52개 destination-scoped 필드 초기값 공간)
 *
 * RLS: cases UPDATE 는 조직 멤버만 허용 → 보호자가 직접 못 함. service-role 우회,
 * 안전선은 case_customer_links 의 본인 매칭(addCaseDestination/removeCaseDestination
 * 진입에서 검증).
 *
 * 봇 알림: 목적지 추가/제거는 운영자에게 봇 메시지 발송 X (notify 패턴은 조직 연결
 * 변경에만 — 목적지는 운영자가 view 에서 자연스럽게 확인).
 */

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@petmove/auth/server'
import {
  summarizeJourney,
  resolveDone,
  DESTINATION_SCOPED_FIELD_KEYS,
  type PastJourneySummary,
  type CaseRow,
} from '@petmove/domain'
import { activeDestinationView } from '@/lib/cases/active-destination'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
type TripType = 'round' | 'one_way'

/** "일본, 베트남" → ["일본", "베트남"]. 공백 trim + 빈 토큰 제거. */
function parseDestTokens(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** ["일본", "베트남"] → "일본, 베트남" (admin 의 joinDests 와 동일 톤). */
function joinDestTokens(tokens: string[]): string {
  return tokens.join(', ')
}

/**
 * 같은 동물(=case)에 새 목적지 추가.
 *
 * - 이미 같은 목적지가 들어 있으면 no-op (성공으로 반환).
 * - cases.destination 토큰 끝에 push, data.trip_type[dest]=tripType, data.by_dest[dest]={}.
 * - 추가 직후 그 목적지가 active 가 되도록 URL 측에서 ?dest=<신규> 로 분기 (UI 측 책임).
 */
export async function addCaseDestination(
  caseId: string,
  destination: string,
  tripType: TripType = 'round',
): Promise<Result<{ destinations: string[]; added: boolean }>> {
  try {
    const dest = destination.trim()
    if (!dest) return { ok: false, error: '목적지가 비어 있습니다.' }

    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    // 본인 case 검증 — case_customer_links 매칭.
    const { data: link } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!link) return { ok: false, error: '이 여정에 접근 권한이 없습니다.' }

    const { data: row, error: rowErr } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? '여정을 찾을 수 없습니다.' }

    const caseRow = row as CaseRow
    const tokens = parseDestTokens(caseRow.destination)
    if (tokens.includes(dest)) {
      return { ok: true, value: { destinations: tokens, added: false } }
    }
    const data = (caseRow.data ?? {}) as Record<string, unknown>

    // 완료(has-arrived)된 기존 여정을 지난 여정으로 내림 — **새 목적지가 생길 때만**.
    // (완료 즉시 제거 X — 완료 카드는 진행 중 다른 여정이 없으면 그대로 유지. design §4·§6)
    const byDestAll = {
      ...((data.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}),
    }
    const tripTypeAll = { ...((data.trip_type as Record<string, TripType> | undefined) ?? {}) }
    const pastJourneys: PastJourneySummary[] = [
      ...((data.past_journeys as PastJourneySummary[] | undefined) ?? []),
    ]
    const today = new Date().toISOString().slice(0, 10)
    const demoted: string[] = []
    let remaining = [...tokens]
    for (const token of tokens) {
      const view = activeDestinationView(caseRow, token)
      if (!resolveDone('has-arrived', view)) continue // 미완료 여정은 그대로 (병렬 유지)
      const viewData = (view.data ?? {}) as Record<string, unknown>
      pastJourneys.push(
        summarizeJourney(
          {
            destination: token,
            tripType: tripTypeAll[token] ?? 'round',
            departureDate: (view.departure_date ?? null) as string | null,
            returnDate: (viewData.return_date ?? null) as string | null,
          },
          'done',
          today,
        ),
      )
      delete byDestAll[token]
      delete tripTypeAll[token]
      remaining = remaining.filter((t) => t !== token)
      demoted.push(token)
    }

    // 새 목적지 추가
    remaining.push(dest)
    tripTypeAll[dest] = tripType
    byDestAll[dest] = {}
    const nextDest = joinDestTokens(remaining)
    const nextData: Record<string, unknown> = {
      ...data,
      trip_type: tripTypeAll,
      by_dest: byDestAll,
      past_journeys: pastJourneys,
    }
    const updatePayload: Record<string, unknown> = { destination: nextDest, data: nextData }

    // demote 로 완료 여정을 내린 뒤, 남은(+새) 목적지가 직전 여정의 '공용' 잔존(도착확인·출국일 컬럼)을
    // 물려받지 않게 정리한다. ⚠️ 임시패치 아님 — 영구 로직. 핵심은 **결과가 단일 목적지가 되는 경우**
    // (완료된 유일 여정 자리에 새 목적지): 단일은 읽기 가드(다중 전용)가 적용 안 돼 컬럼/top-level
    // fallback 이 살아있으므로, 안 비우면 새 목적지가 이전 출국일/도착확인을 물려받아 '완료'로 오판된다.
    // (다중 결과는 읽기 가드가 처리하지만, 단일 결과 대비 + 방어로 항상 비운다.) 백신·항체(동물 단위)는 유지.
    if (demoted.length > 0) {
      // top-level scoped 잔존 방어 비움 — B(by_dest 통일) 후 정상 상태엔 없어 보통 no-op이지만,
      // scope 미지정 다중 share-link 등 엣지에서 top-level 에 들어올 수 있어 단일 결과 누수를 막는다.
      for (const k of DESTINATION_SCOPED_FIELD_KEYS) {
        delete nextData[k]
      }
      // 내려간 여정의 도착확인 플래그 제거 — 지난 여정 이동에 따른 demote 정리(누수와 무관, 필수).
      const ac = { ...((nextData.arrival_confirmed as Record<string, unknown> | undefined) ?? {}) }
      for (const t of demoted) delete ac[t]
      nextData.arrival_confirmed = ac
      // 출국일 컬럼 비움 — 새(특히 단일 결과) 목적지가 이전 출국일을 컬럼으로 물려받지 않게(필수).
      updatePayload.departure_date = null
    }

    const { error: updErr } = await admin
      .from('cases')
      .update(updatePayload)
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    revalidatePath('/me')
    revalidatePath(`/me/animal/${caseId}`)
    revalidatePath('/cases')
    revalidatePath(`/cases/${caseId}/journey`)
    return { ok: true, value: { destinations: remaining, added: true } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 같은 동물(=case)에서 목적지 제거.
 *
 * - cases.destination 에서 토큰 제거, data.trip_type[dest] + data.by_dest[dest] 삭제.
 * - 모든 목적지를 다 제거하면 destination=""(빈 값) — UI 에서 "+ 첫 목적지" 추가 유도.
 * - 본인 case + 토큰 존재 검증.
 */
export async function removeCaseDestination(
  caseId: string,
  destination: string,
): Promise<Result<{ destinations: string[] }>> {
  try {
    const dest = destination.trim()
    if (!dest) return { ok: false, error: '목적지가 비어 있습니다.' }

    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    const { data: link } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!link) return { ok: false, error: '이 여정에 접근 권한이 없습니다.' }

    const { data: row, error: rowErr } = await admin
      .from('cases')
      .select('destination, data')
      .eq('id', caseId)
      .single()
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? '여정을 찾을 수 없습니다.' }

    const r = row as { destination: string | null; data: Record<string, unknown> | null }
    const tokens = parseDestTokens(r.destination)
    if (!tokens.includes(dest)) {
      return { ok: true, value: { destinations: tokens } }
    }
    const nextTokens = tokens.filter((t) => t !== dest)
    const nextDest = joinDestTokens(nextTokens)

    const data = (r.data ?? {}) as Record<string, unknown>
    const tripType = { ...((data.trip_type as Record<string, TripType> | undefined) ?? {}) }
    delete tripType[dest]
    const byDest = { ...((data.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}) }
    delete byDest[dest]
    const nextData = { ...data, trip_type: tripType, by_dest: byDest }

    const { error: updErr } = await admin
      .from('cases')
      .update({ destination: nextDest, data: nextData })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    revalidatePath('/me')
    revalidatePath(`/me/animal/${caseId}`)
    revalidatePath('/cases')
    revalidatePath(`/cases/${caseId}/journey`)
    return { ok: true, value: { destinations: nextTokens } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 한 목적지의 왕복/편도 토글. data.trip_type[dest] 만 갱신.
 * TravelFormSections 안의 SegmentField "왕복·편도" 가 호출.
 */
export async function setCaseDestinationTripType(
  caseId: string,
  destination: string,
  tripType: TripType,
): Promise<Result<true>> {
  try {
    const dest = destination.trim()
    if (!dest) return { ok: false, error: '목적지가 비어 있습니다.' }

    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    const { data: link } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!link) return { ok: false, error: '이 여정에 접근 권한이 없습니다.' }

    const { data: row, error: rowErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? '여정을 찾을 수 없습니다.' }
    const data = ((row as { data: Record<string, unknown> | null }).data ?? {}) as Record<
      string,
      unknown
    >
    const nextTripType: Record<string, TripType> = {
      ...((data.trip_type as Record<string, TripType> | undefined) ?? {}),
      [dest]: tripType,
    }
    const nextData = { ...data, trip_type: nextTripType }

    const { error: updErr } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    revalidatePath('/me')
    revalidatePath(`/me/animal/${caseId}`)
    revalidatePath('/cases')
    revalidatePath(`/cases/${caseId}/journey`)
    return { ok: true, value: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 한 case(동물)의 '함께 준비'(co_progress) 토글 — data.co_progress 만 갱신, 즉시 저장.
 * 목적지 카드의 SegmentField "함께 준비" 가 호출 (왕복·편도와 동일하게 즉시 반영).
 *
 * 값은 케이스 단위 1개 — DB 트리거 cases_sync_co_progress 가 같은 보호자(이름+전화) 형제에게
 * 절차·일정을 부분 연동(동시값만)한다. 트리거는 보호자 단위라 목적지 무관 — 이 토글의
 * 목적지별 노출은 UI 차원이고, 켜고 끄는 값 자체는 동물 1마리에 1개다.
 */
export async function setCaseCoProgress(
  caseId: string,
  value: boolean,
): Promise<Result<true>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    const { data: link } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!link) return { ok: false, error: '이 여정에 접근 권한이 없습니다.' }

    const { data: row, error: rowErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? '여정을 찾을 수 없습니다.' }
    const data = ((row as { data: Record<string, unknown> | null }).data ?? {}) as Record<
      string,
      unknown
    >
    const nextData = { ...data, co_progress: value }

    const { error: updErr } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    revalidatePath('/me')
    revalidatePath(`/me/animal/${caseId}`)
    revalidatePath('/cases')
    revalidatePath(`/cases/${caseId}/journey`)
    return { ok: true, value: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 완료 확인 prompt 를 "진행 중"으로 닫음 — 그 목적지의 기준 날짜(anchorDate)를 기록.
 * 같은 anchorDate 면 재발동 안 함. 출국/귀국일이 바뀌면 anchorDate 가 변해 다시 뜬다. (design §4.2)
 */
export async function dismissCompletionPrompt(
  caseId: string,
  destination: string,
  anchorDate: string,
): Promise<Result<true>> {
  try {
    const dest = destination.trim()
    if (!dest) return { ok: false, error: '목적지가 비어 있습니다.' }

    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    const { data: link } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!link) return { ok: false, error: '이 여정에 접근 권한이 없습니다.' }

    const { data: row, error: rowErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? '여정을 찾을 수 없습니다.' }

    const data = ((row as { data: Record<string, unknown> | null }).data ?? {}) as Record<
      string,
      unknown
    >
    const dismissed = {
      ...((data.completion_prompt_dismissed as Record<string, string> | undefined) ?? {}),
      [dest]: anchorDate,
    }
    const nextData = { ...data, completion_prompt_dismissed: dismissed }

    const { error: updErr } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    revalidatePath(`/cases/${caseId}/journey`)
    return { ok: true, value: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 보호자 완료 확인 — '잘 다녀왔어요'. 도착 확인 플래그를 목적지별로 set → has-arrived 가
 * 인정 → 완료 카드(도착 배너)가 뜬다. **여정을 제거하지 않는다** (지난 여정 이동은
 * 새 목적지 추가 시 / 스태프 전환). design journey-lifecycle §4.2
 */
export async function confirmArrival(caseId: string, destination: string): Promise<Result<true>> {
  try {
    const dest = destination.trim()
    if (!dest) return { ok: false, error: '목적지가 비어 있습니다.' }

    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    const { data: link } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!link) return { ok: false, error: '이 여정에 접근 권한이 없습니다.' }

    const { data: row, error: rowErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? '여정을 찾을 수 없습니다.' }

    const data = ((row as { data: Record<string, unknown> | null }).data ?? {}) as Record<
      string,
      unknown
    >
    const arrival = {
      ...((data.arrival_confirmed as Record<string, boolean> | undefined) ?? {}),
      [dest]: true,
    }
    const nextData = { ...data, arrival_confirmed: arrival }

    const { error: updErr } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    revalidatePath('/me')
    revalidatePath('/cases')
    revalidatePath(`/cases/${caseId}/journey`)
    return { ok: true, value: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
