'use server'

/**
 * '필수 서류' 의 수기 완료 표시 토글. case.data.required_doc_flags[docId] = true|undefined.
 * step.done 으로 자동 판정되는 항목(rabies-titer-result, advance-notification-approval)은
 * 이 플래그를 보지 않으므로 호출해도 verified 가 바뀌지 않는다.
 */

import { createAdminClient } from '@petmove/auth'
import type { CaseRow } from '@petmove/domain'
import { assertCaseAccess, type Result } from './_shared'

export async function setRequiredDocComplete(
  caseId: string,
  docId: string,
  complete: boolean,
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
    const flagsRaw = prev.required_doc_flags
    const prevFlags: Record<string, boolean> =
      flagsRaw && typeof flagsRaw === 'object'
        ? Object.fromEntries(
            Object.entries(flagsRaw as Record<string, unknown>).filter(([, v]) => v === true),
          ) as Record<string, boolean>
        : {}
    const nextFlags: Record<string, boolean> = { ...prevFlags }
    if (complete) nextFlags[docId] = true
    else delete nextFlags[docId]

    const nextData: Record<string, unknown> = { ...prev, required_doc_flags: nextFlags }

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
