'use server'

import { createClient } from '@/lib/supabase/server'

export async function deleteCase(
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('cases').delete().eq('id', caseId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
