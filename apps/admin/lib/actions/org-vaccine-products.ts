'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { revalidatePath } from 'next/cache'

export interface OrgVaccineProduct {
  id: string
  category: string
  vaccine: string | null
  product: string | null
  manufacturer: string
  batch: string | null
  expiry: string | null
  year: number | null
  weight_min: number | null
  weight_max: number | null
  size: string | null
  parasite_id: string | null
}

export interface OrgVaccineProductInput {
  category: string
  vaccine?: string | null
  product?: string | null
  manufacturer: string
  batch?: string | null
  expiry?: string | null
  year?: number | null
  weight_min?: number | null
  weight_max?: number | null
  size?: string | null
  parasite_id?: string | null
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export async function listOrgVaccineProducts(): Promise<Result<OrgVaccineProduct[]>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('org_vaccine_products')
      .select('id, category, vaccine, product, manufacturer, batch, expiry, year, weight_min, weight_max, size, parasite_id')
      .eq('org_id', orgId)
      .order('category', { ascending: true })
      .order('expiry', { ascending: true, nullsFirst: false })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as OrgVaccineProduct[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function createOrgVaccineProduct(
  input: OrgVaccineProductInput,
): Promise<Result<OrgVaccineProduct>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('org_vaccine_products')
      .insert({ ...input, org_id: orgId })
      .select('id, category, vaccine, product, manufacturer, batch, expiry, year, weight_min, weight_max, size, parasite_id')
      .single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: data as OrgVaccineProduct }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function updateOrgVaccineProduct(
  id: string,
  patch: Partial<OrgVaccineProductInput>,
): Promise<Result<OrgVaccineProduct>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('org_vaccine_products')
      .update(patch)
      .eq('id', id)
      .select('id, category, vaccine, product, manufacturer, batch, expiry, year, weight_min, weight_max, size, parasite_id')
      .single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: data as OrgVaccineProduct }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteOrgVaccineProduct(id: string): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('org_vaccine_products')
      .delete()
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
