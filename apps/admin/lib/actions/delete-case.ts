'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Soft-delete: set deleted_at timestamp */
export async function deleteCase(
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cases')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', caseId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/cases')
  return { ok: true }
}

/** Restore: clear deleted_at */
export async function restoreCase(
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cases')
    .update({ deleted_at: null })
    .eq('id', caseId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/cases')
  return { ok: true }
}

/** Permanent delete */
export async function permanentDeleteCase(
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('cases').delete().eq('id', caseId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/cases')
  return { ok: true }
}
