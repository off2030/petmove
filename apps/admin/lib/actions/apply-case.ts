'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { formatMicrochip } from '@/lib/fields'
import type { CaseRow } from '@/lib/supabase/types'

// apply 는 공개(비인증) 플로우 — getActiveOrgId() 사용 불가.
// Phase 5 RLS 활성화 시 이 엔드포인트만 service role 로 우회하거나 anon INSERT policy 추가 필요.
// Phase 6+ 다중 테넌트 확장 시 /apply URL 이 org 선택을 받도록 수정.
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
  // 공개 신청폼 — anon key 로는 INSERT 후 SELECT (RETURNING) 단계가 cases_select RLS 에 막혀
  // "RLS 위반" 에러가 발생하므로, 신뢰된 서버 액션 안에서 service-role 로 우회한다.
  // org_id 는 코드에서 하드코딩 (사용자 입력 아님) 이므로 보안 영향 없음.
  const supabase = createAdminClient()

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
    // 신청폼으로 들어온 광견병 접종은 본 병원에서 이뤄지지 않았으므로 타병원 접종으로 표시.
    data.rabies_dates = [{ date: input.rabies_date, other_hospital: true }]
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
      microchip: formatMicrochip(input.microchip),
      status: 'Applied',
      data,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, caseId: row.id }
}
