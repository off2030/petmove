'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const REGULAR_COLUMNS = new Set([
  'customer_name',
  'customer_name_en',
  'pet_name',
  'pet_name_en',
  'microchip',
  'destination',
  'status',
])

export type UpdateResult = { ok: true } | { ok: false; error: string }

/**
 * Update a single field on a case.
 *
 * - `column` storage: updates a regular column directly
 * - `data` storage  : merges into the `data` jsonb column (null/empty removes the key)
 */
export async function updateCaseField(
  caseId: string,
  storage: 'column' | 'data',
  key: string,
  value: unknown,
): Promise<UpdateResult> {
  if (!caseId || !key) return { ok: false, error: 'caseId and key are required' }

  const supabase = await createClient()

  if (storage === 'column') {
    if (!REGULAR_COLUMNS.has(key)) {
      return { ok: false, error: `column "${key}" is not updatable` }
    }
    const { error } = await supabase
      .from('cases')
      .update({ [key]: value })
      .eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  } else {
    // Fetch -> merge -> update. Simpler than jsonb_set via RPC for MVP.
    const { data: row, error: fetchErr } = await supabase
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const current: Record<string, unknown> =
      (row?.data as Record<string, unknown> | null) ?? {}
    const next = { ...current }
    if (value === null || value === undefined || value === '') {
      delete next[key]
    } else {
      next[key] = value
    }

    const { error } = await supabase
      .from('cases')
      .update({ data: next })
      .eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/cases')
  return { ok: true }
}
