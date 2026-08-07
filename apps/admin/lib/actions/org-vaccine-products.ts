'use server'

import { reportActionError } from './_report-error'
import { createClient } from '@petmove/auth/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { isValidExpiryDate, normalizeExpiryDate } from '@petmove/domain'
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

/**
 * expiry 를 표준형(YYYY-MM-DD / YYYY-MM)으로 정규화.
 * 폼·이미지 추출 양쪽이 이 액션을 거치므로 저장 직전 한 곳에서 막는다.
 * 인식 불가한 값은 저장하지 않고 에러 — 만료 상태가 조용히 '—' 로 남는 걸 방지.
 */
function normalizeExpiryField<T extends { expiry?: string | null }>(input: T): Result<T> {
  if (input.expiry == null || input.expiry.trim() === '') return { ok: true, value: input }
  const normalized = normalizeExpiryDate(input.expiry)
  if (!isValidExpiryDate(normalized)) {
    return { ok: false, error: `만료일 형식을 인식할 수 없습니다: "${input.expiry}" (예: 2028-10-11, 2028-10)` }
  }
  return { ok: true, value: { ...input, expiry: normalized } }
}

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
    return { ok: false, error: reportActionError(e, 'org-vaccine-products.listOrgVaccineProducts') }
  }
}

export async function createOrgVaccineProduct(
  input: OrgVaccineProductInput,
): Promise<Result<OrgVaccineProduct>> {
  try {
    const norm = normalizeExpiryField(input)
    if (!norm.ok) return norm
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('org_vaccine_products')
      .insert({ ...norm.value, org_id: orgId })
      .select('id, category, vaccine, product, manufacturer, batch, expiry, year, weight_min, weight_max, size, parasite_id')
      .single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: data as OrgVaccineProduct }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'org-vaccine-products.createOrgVaccineProduct') }
  }
}

export async function updateOrgVaccineProduct(
  id: string,
  patch: Partial<OrgVaccineProductInput>,
): Promise<Result<OrgVaccineProduct>> {
  try {
    const norm = normalizeExpiryField(patch)
    if (!norm.ok) return norm
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('org_vaccine_products')
      .update(norm.value)
      .eq('id', id)
      .select('id, category, vaccine, product, manufacturer, batch, expiry, year, weight_min, weight_max, size, parasite_id')
      .single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, value: data as OrgVaccineProduct }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'org-vaccine-products.updateOrgVaccineProduct') }
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
    return { ok: false, error: reportActionError(e, 'org-vaccine-products.deleteOrgVaccineProduct') }
  }
}
