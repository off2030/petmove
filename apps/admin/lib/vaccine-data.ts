/**
 * Org-scoped vaccine product data loader.
 *
 * 서버 측에서 active org 의 `org_vaccine_products` 를 읽어
 * `VaccineProductsData` 형태로 normalize. `createVaccineLookups(data)` 에 그대로 전달 가능.
 *
 * React `cache()` 로 같은 요청 내에서는 DB 재조회 안 함.
 */
import 'server-only'
import { cache } from 'react'
import {
  createVaccineLookups,
  emptyVaccineProductsData,
  type VaccineLookups,
  type VaccineProduct,
  type VaccineProductsData,
} from '@petmove/domain'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { loadVaccineDefaults, type VaccineDefaults } from '@/lib/vaccine-defaults'

interface OrgProductRow {
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

function rowToVaccineProduct(row: OrgProductRow): VaccineProduct {
  return {
    id: row.parasite_id ?? undefined,
    vaccine: row.vaccine ?? undefined,
    product: row.product ?? undefined,
    manufacturer: row.manufacturer,
    batch: row.batch,
    expiry: row.expiry,
    year: row.year ?? undefined,
    weightMin: row.weight_min ?? undefined,
    weightMax: row.weight_max ?? undefined,
    size: row.size ?? undefined,
  }
}

export function orgProductsToData(rows: OrgProductRow[]): VaccineProductsData {
  const data = emptyVaccineProductsData()
  for (const row of rows) {
    const key = row.category as keyof VaccineProductsData
    if (!(key in data)) continue
    data[key].push(rowToVaccineProduct(row))
  }
  return data
}

/**
 * Active org 의 vaccine product data 를 `VaccineProductsData` 형태로 반환.
 * 같은 요청에서 여러 번 호출돼도 DB 는 한 번만 조회 (React cache).
 */
export const getOrgVaccineData = cache(async (): Promise<VaccineProductsData> => {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('org_vaccine_products')
      .select('id, category, vaccine, product, manufacturer, batch, expiry, year, weight_min, weight_max, size, parasite_id')
      .eq('org_id', orgId)
    if (error || !data) return emptyVaccineProductsData()
    return orgProductsToData(data as OrgProductRow[])
  } catch {
    return emptyVaccineProductsData()
  }
})

/** Server helper: active org 의 org-scoped lookup bundle 을 반환. defaults 도 함께 바인딩. */
export async function getOrgVaccineLookups(): Promise<VaccineLookups> {
  const [data, defaults] = await Promise.all([getOrgVaccineData(), getOrgVaccineDefaults()])
  return createVaccineLookups(data, defaults)
}

/** active org 의 vaccine defaults — 같은 요청 내에서 cache. */
export const getOrgVaccineDefaults = cache(async (): Promise<VaccineDefaults> => {
  return loadVaccineDefaults()
})
