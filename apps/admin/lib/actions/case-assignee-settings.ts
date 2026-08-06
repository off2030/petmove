'use server'

/**
 * 담당자 표시 조직 설정 (organization_settings 의 'case_assignee' key).
 *
 * value shape: { enabled: boolean }
 * - enabled true → 케이스 상세에 담당자 드롭다운 노출
 * - enabled false (기본) → UI 미노출
 *
 * (구 파일명 transfer-settings — 조직 간 전달 기능과 함께 도입됐지만 전달은 2026-08-06
 *  폐지되고 담당자 설정만 남아 이름을 바로잡음.)
 */

import { reportActionError } from './_report-error'
import { revalidatePath } from 'next/cache'
import { createClient } from '@petmove/auth/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const KEY = 'case_assignee'

export async function getCaseAssigneeEnabled(): Promise<Result<boolean>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', KEY)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    const enabled = (data?.value as { enabled?: boolean } | null)?.enabled === true
    return { ok: true, value: enabled }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'case-assignee-settings.getCaseAssigneeEnabled') }
  }
}

export async function setCaseAssigneeEnabled(enabled: boolean): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { error } = await supabase
      .from('organization_settings')
      .upsert(
        { org_id: orgId, key: KEY, value: { enabled } },
        { onConflict: 'org_id,key' },
      )
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    revalidatePath('/cases')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'case-assignee-settings.setCaseAssigneeEnabled') }
  }
}
