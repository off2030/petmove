'use server'

import { createClient } from '@/lib/supabase/server'
import type { CaseRow } from '@/lib/supabase/types'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface ApplyInput {
  // 1. 목적지
  destination: string
  // 2. 고객정보
  customer_name: string
  customer_name_en: string
  phone: string
  address_kr: string
  email: string
  // 3. 동물정보
  pet_name: string
  pet_name_en: string
  birth_date: string
  species: string
  breed: string
  color: string
  sex: string
  weight: string
  // 4. 선택 항목
  microchip?: string
  microchip_implant_date?: string
  rabies_date?: string
}

export async function applyCase(input: ApplyInput): Promise<
  { ok: true; caseId: string } | { ok: false; error: string }
> {
  const supabase = await createClient()

  const data: Record<string, unknown> = {
    phone: input.phone,
    email: input.email,
    address_kr: input.address_kr,
    birth_date: input.birth_date,
    species: input.species,
    breed: input.breed,
    color: input.color,
    sex: input.sex,
    weight: input.weight ? Number(input.weight) : null,
  }

  // 선택 항목
  if (input.microchip_implant_date) {
    data.microchip_implant_date = input.microchip_implant_date
  }
  if (input.rabies_date) {
    data.rabies_dates = [input.rabies_date]
  }

  const { data: row, error } = await supabase
    .from('cases')
    .insert({
      org_id: ORG_ID,
      customer_name: input.customer_name,
      customer_name_en: input.customer_name_en,
      pet_name: input.pet_name,
      pet_name_en: input.pet_name_en,
      destination: input.destination,
      microchip: input.microchip || null,
      status: 'applied',
      data,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, caseId: row.id }
}
