'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { revalidatePath } from 'next/cache'

export interface AutoFillRule {
  id: string
  destination_key: string          // 'australia', 'us_hawaii', 'all'
  trigger_field: string            // 'departure_date', 'civ_dates[0]', 'vet_visit_date'
  target_field: string             // 'vet_visit_date', 'parasite_internal_dates', 'civ_dates[1]'
  offsets_days: number[]           // [-2], [-28, -2], [14]
  overwrite_existing: boolean
  enabled: boolean
  display_order: number
}

export interface AutoFillRuleInput {
  destination_key: string
  trigger_field: string
  target_field: string
  offsets_days: number[]
  overwrite_existing?: boolean
  enabled?: boolean
  display_order?: number
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const SELECT_COLS = 'id, destination_key, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order'

export async function listOrgAutoFillRules(): Promise<Result<AutoFillRule[]>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('org_auto_fill_rules')
      .select(SELECT_COLS)
      .eq('org_id', orgId)
      .order('destination_key', { ascending: true })
      .order('display_order', { ascending: true })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as AutoFillRule[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function createOrgAutoFillRule(
  input: AutoFillRuleInput,
): Promise<Result<AutoFillRule>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('org_auto_fill_rules')
      .insert({ ...input, org_id: orgId })
      .select(SELECT_COLS)
      .single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: data as AutoFillRule }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function updateOrgAutoFillRule(
  id: string,
  patch: Partial<AutoFillRuleInput>,
): Promise<Result<AutoFillRule>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('org_auto_fill_rules')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: data as AutoFillRule }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteOrgAutoFillRule(id: string): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('org_auto_fill_rules')
      .delete()
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
