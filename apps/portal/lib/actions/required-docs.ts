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
import { assertCaseAccess, type Result } from './_shared'

export async function setRequiredDocComplete(
  caseId: string,
  docId: string,
  complete: boolean,
): Promise<Result<CaseRow>> {
  return mutateDocState(caseId, docId, (data) => {
    const flags = readFlags(data, 'required_doc_flags')
    const na = readFlags(data, 'required_doc_na')
    if (complete) {
      flags[docId] = true
      delete na[docId] // 완료로 표시하면 '해당없음' 해제.
    } else {
      delete flags[docId]
    }
    return { ...data, required_doc_flags: flags, required_doc_na: na }
  })
}

export async function setRequiredDocNa(
  caseId: string,
  docId: string,
  na: boolean,
): Promise<Result<CaseRow>> {
  return mutateDocState(caseId, docId, (data) => {
    const flags = readFlags(data, 'required_doc_flags')
    const naFlags = readFlags(data, 'required_doc_na')
    if (na) {
      naFlags[docId] = true
      delete flags[docId] // 해당없음으로 표시하면 '완료' 해제.
    } else {
      delete naFlags[docId]
    }
    return { ...data, required_doc_flags: flags, required_doc_na: naFlags }
  })
}

/** docId 검증 + 권한 확인 + 케이스 data 갱신 공통 흐름. */
async function mutateDocState(
  caseId: string,
  docId: string,
  apply: (data: Record<string, unknown>) => Record<string, unknown>,
): Promise<Result<CaseRow>> {
  try {
    if (!caseId || !docId) return { ok: false, error: '잘못된 요청입니다.' }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const nextData = apply(prev)

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

/** case.data[key] 를 boolean 맵으로 복사 — true 값만 남긴다(가변 사본 반환). */
function readFlags(data: Record<string, unknown>, key: string): Record<string, boolean> {
  const raw = data[key]
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, v]) => v === true),
  ) as Record<string, boolean>
}
