'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import type { CaseRow } from '@/lib/supabase/types'

export async function createCase(): Promise<
  { ok: true; case: CaseRow } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const orgId = await getActiveOrgId()

  const { data, error } = await supabase
    .from('cases')
    .insert({
      org_id: orgId,
      customer_name: '',
      status: 'Applied',
      data: {},
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, case: data as CaseRow }
}
