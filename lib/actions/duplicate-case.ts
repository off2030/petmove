'use server'

import { createClient } from '@/lib/supabase/server'
import type { CaseRow } from '@/lib/supabase/types'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

/** 동물 개체 정보 키 (복제 시 제외) */
const ANIMAL_DATA_KEYS = new Set([
  'birth_date', 'age', 'species', 'breed', 'breed_en',
  'sex', 'sex_en', 'color', 'color_en', 'weight',
  'microchip_secondary',
])

export async function duplicateCase(sourceId: string): Promise<
  { ok: true; case: CaseRow } | { ok: false; error: string }
> {
  const supabase = await createClient()

  // Fetch source case
  const { data: source, error: fetchErr } = await supabase
    .from('cases')
    .select('*')
    .eq('id', sourceId)
    .single()

  if (fetchErr || !source) return { ok: false, error: fetchErr?.message ?? 'Case not found' }

  // Copy all data except animal-specific keys
  const sourceData = (source.data ?? {}) as Record<string, unknown>
  const newData: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(sourceData)) {
    if (!ANIMAL_DATA_KEYS.has(key) && val !== undefined && val !== null) {
      newData[key] = val
    }
  }

  const { data, error } = await supabase
    .from('cases')
    .insert({
      org_id: ORG_ID,
      customer_name: source.customer_name,
      customer_name_en: source.customer_name_en,
      destination: source.destination,
      microchip: null,
      pet_name: null,
      pet_name_en: null,
      status: 'applied',
      data: newData,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, case: data as CaseRow }
}
