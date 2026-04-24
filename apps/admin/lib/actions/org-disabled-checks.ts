'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { revalidatePath } from 'next/cache'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export async function listOrgDisabledChecks(): Promise<Result<string[]>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('org_disabled_checks')
      .select('check_id')
      .eq('org_id', orgId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []).map((r) => r.check_id as string) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function setOrgDisabledCheck(
  checkId: string,
  disabled: boolean,
): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (disabled) {
      const { error } = await supabase
        .from('org_disabled_checks')
        .upsert(
          { org_id: orgId, check_id: checkId, disabled_by: user?.id ?? null },
          { onConflict: 'org_id,check_id' },
        )
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase
        .from('org_disabled_checks')
        .delete()
        .eq('org_id', orgId)
        .eq('check_id', checkId)
      if (error) return { ok: false, error: error.message }
    }
    revalidatePath('/settings')
    revalidatePath('/')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
