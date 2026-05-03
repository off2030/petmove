'use server'

/**
 * 케이스 담당자 (assigned_to) 설정.
 * 조직 단위 토글이 on 일 때만 UI 노출되지만, 토글 자체는 표시 여부만 결정.
 * DB 컬럼은 항상 존재하고 누구나 본인 조직 케이스의 담당자를 변경할 수 있음.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export async function setCaseAssignee(
  caseId: string,
  userId: string | null,
): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()

    if (userId) {
      const { data: mem } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!mem) return { ok: false, error: '해당 사용자는 본인 조직 멤버가 아닙니다' }
    }

    const { error } = await supabase
      .from('cases')
      .update({ assigned_to: userId })
      .eq('id', caseId)
      .eq('org_id', orgId)
    if (error) return { ok: false, error: error.message }

    revalidatePath('/cases')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
