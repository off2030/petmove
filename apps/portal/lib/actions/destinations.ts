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
      .select('destination, data')
      .eq('id', caseId)
      .single()
    if (rowErr || !row) return { ok: false, error: rowErr?.message ?? '여정을 찾을 수 없습니다.' }

    const r = row as { destination: string | null; data: Record<string, unknown> | null }
    const tokens = parseDestTokens(r.destination)
    if (tokens.includes(dest)) {
      return { ok: true, value: { destinations: tokens, added: false } }
    }
    const nextTokens = [...tokens, dest]
    const nextDest = joinDestTokens(nextTokens)

    const data = (r.data ?? {}) as Record<string, unknown>
    const nextTripType: Record<string, TripType> = {
      ...((data.trip_type as Record<string, TripType> | undefined) ?? {}),
      [dest]: tripType,
    }
    const nextByDest: Record<string, Record<string, unknown>> = {
      ...((data.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}),
      [dest]: {},
    }
    const nextData = { ...data, trip_type: nextTripType, by_dest: nextByDest }

    const { error: updErr } = await admin
      .from('cases')
      .update({ destination: nextDest, data: nextData })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    revalidatePath('/me')
    revalidatePath(`/me/animal/${caseId}`)
    revalidatePath('/cases')
    revalidatePath(`/cases/${caseId}/journey`)
    return { ok: true, value: { destinations: nextTokens, added: true } }
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
