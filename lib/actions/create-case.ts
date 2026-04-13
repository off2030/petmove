'use server'

import { createClient } from '@/lib/supabase/server'
import type { CaseRow } from '@/lib/supabase/types'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function createCase(): Promise<
  { ok: true; case: CaseRow } | { ok: false; error: string }
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cases')
    .insert({
      org_id: ORG_ID,
      customer_name: '',
      status: '진행중',
      data: {},
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, case: data as CaseRow }
}
