'use server'

/**
 * '필수 서류' 의 수기 상태 토글.
 *   - required_doc_flags[docId] = true  → 보호자 '완료' 표시
 *   - required_doc_na[docId]    = true  → 보호자 '해당없음' 표시 (체크리스트 카운트 제외)
 *
 * 둘은 상호 배타 — 하나를 켜면 다른 하나는 해제한다.
 *
 * step.done 으로 자동 판정되는 항목(rabies-titer-result, advance-notification-approval)은
 * required_doc_flags 를 보지 않으므로 setRequiredDocComplete 호출이 verified 를 바꾸지 않는다.
 */

import { createAdminClient } from '@petmove/auth'
import type { CaseRow } from '@petmove/domain'
import { parseDestinations, readByDestValue, writeByDestValue } from '@petmove/domain'
import { assertCaseAccess, type Result } from './_shared'

/** apply 가 쓰기 위치(전역 top-level vs by_dest[목적지])를 알 수 있게 전달하는 컨텍스트. */
interface DocStateScope {
  /** by_dest[destination] 에 쓸지 여부 — 다중 목적지 + destination 지정 시에만 true. */
  useByDest: boolean
  /** 활성 목적지 토큰 (useByDest 일 때 유효). */
  destination: string | null
}

export async function setRequiredDocComplete(
  caseId: string,
  docId: string,
  complete: boolean,
  destination?: string | null,
): Promise<Result<CaseRow>> {
  return mutateDocState(caseId, docId, destination, (data, scope) => {
    const flags = readScopedFlags(data, scope, 'required_doc_flags')
    const na = readScopedFlags(data, scope, 'required_doc_na')
    if (complete) {
      flags[docId] = true
      delete na[docId] // 완료로 표시하면 '해당없음' 해제.
    } else {
      delete flags[docId]
    }
    let next = writeScopedFlags(data, scope, 'required_doc_flags', flags)
    next = writeScopedFlags(next, scope, 'required_doc_na', na)
    return next
  })
}

/**
 * 여러 필수 서류를 한 번에 '있음'(required_doc_flags=true)으로 표시 — vet-visit 의
 * '모두 있어요' 버튼이 수기 서류(별지25·FormAC/RE 등)를 일괄 보유 처리할 때 사용.
 * 자동 판정 서류(kind='step')는 플래그를 안 보므로 영향 없음 — 호출부가 수기 서류 id 만 넘긴다.
 * '해당없음' 은 보유로 덮어쓴다(개별 토글과 동일 규칙). 스코핑은 단건 토글과 같다.
 */
export async function setRequiredDocsComplete(
  caseId: string,
  docIds: string[],
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (!caseId || !Array.isArray(docIds) || docIds.length === 0) {
      return { ok: false, error: '잘못된 요청입니다.' }
    }
    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data,destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const isMulti = parseDestinations(existing?.destination ?? null).length > 1
    const scope: DocStateScope = { useByDest: isMulti && !!destination, destination: destination ?? null }
    const flags = readScopedFlags(prev, scope, 'required_doc_flags')
    const na = readScopedFlags(prev, scope, 'required_doc_na')
    for (const id of docIds) {
      flags[id] = true
      delete na[id]
    }
    let next = writeScopedFlags(prev, scope, 'required_doc_flags', flags)
    next = writeScopedFlags(next, scope, 'required_doc_na', na)

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: next })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function setRequiredDocNa(
  caseId: string,
  docId: string,
  na: boolean,
  destination?: string | null,
): Promise<Result<CaseRow>> {
  return mutateDocState(caseId, docId, destination, (data, scope) => {
    const flags = readScopedFlags(data, scope, 'required_doc_flags')
    const naFlags = readScopedFlags(data, scope, 'required_doc_na')
    if (na) {
      naFlags[docId] = true
      delete flags[docId] // 해당없음으로 표시하면 '완료' 해제.
    } else {
      delete naFlags[docId]
    }
    let next = writeScopedFlags(data, scope, 'required_doc_flags', flags)
    next = writeScopedFlags(next, scope, 'required_doc_na', naFlags)
    return next
  })
}

/** docId 검증 + 권한 확인 + 케이스 data 갱신 공통 흐름. */
async function mutateDocState(
  caseId: string,
  docId: string,
  destination: string | null | undefined,
  apply: (data: Record<string, unknown>, scope: DocStateScope) => Record<string, unknown>,
): Promise<Result<CaseRow>> {
  try {
    if (!caseId || !docId) return { ok: false, error: '잘못된 요청입니다.' }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data,destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    // 다중 목적지 케이스 + 활성 목적지 지정 시에만 by_dest 로 분리 저장. 단일 목적지는 기존
    // top-level 동작 그대로(읽기 flatten 이 단일에선 top-level fallback 이라 정합).
    const isMulti = parseDestinations(existing?.destination ?? null).length > 1
    const useByDest = isMulti && !!destination
    const nextData = apply(prev, { useByDest, destination: destination ?? null })

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 활성 위치에서 boolean 맵을 읽어 가변 사본 반환 — true 값만 남긴다.
 * useByDest 면 by_dest[목적지][key] 만 본다(top-level 누수 미상속 — flatten strict 와 동일).
 * 단일/미지정이면 top-level data[key].
 */
function readScopedFlags(
  data: Record<string, unknown>,
  scope: DocStateScope,
  key: string,
): Record<string, boolean> {
  const raw = scope.useByDest && scope.destination
    ? readByDestValue(data, scope.destination, key)
    : data[key]
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, v]) => v === true),
  ) as Record<string, boolean>
}

/** boolean 맵을 활성 위치(by_dest[목적지] 또는 top-level)에 기록한 새 data 반환. */
function writeScopedFlags(
  data: Record<string, unknown>,
  scope: DocStateScope,
  key: string,
  map: Record<string, boolean>,
): Record<string, unknown> {
  if (scope.useByDest && scope.destination) {
    return writeByDestValue(data, scope.destination, key, map)
  }
  return { ...data, [key]: map }
}
