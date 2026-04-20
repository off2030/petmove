'use server'

import { createClient } from '@/lib/supabase/server'
import type { CaseRow } from '@/lib/supabase/types'

const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface ApplyInput {
  // 1. 목적지
  destination: string
  // 2. 고객정보
  customer_name: string
  customer_last_name_en: string
  customer_first_name_en: string
  phone: string
  address_kr: string
  address_en?: string
  address_zipcode?: string
  address_sido?: string
  address_sigungu?: string
  email: string
  // 3. 동물정보
  pet_name: string
  pet_name_en: string
  birth_date: string
  species: string
  breed: string
  breed_en: string
  color: string
  color_en: string
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
    customer_last_name_en: input.customer_last_name_en,
    customer_first_name_en: input.customer_first_name_en,
    phone: input.phone,
    email: input.email,
    address_kr: input.address_kr,
    address_en: input.address_en || null,
    address_zipcode: input.address_zipcode || null,
    address_sido: input.address_sido || null,
    address_sigungu: input.address_sigungu || null,
    address_country: 'Republic of Korea',
    birth_date: input.birth_date,
    species: input.species,
    breed: input.breed,
    breed_en: input.breed_en,
    color: input.color,
    color_en: input.color_en,
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
      customer_name_en: `${input.customer_first_name_en} ${input.customer_last_name_en}`,
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
