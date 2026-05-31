'use server'

import { createAdminClient } from '@petmove/auth'
import { getCurrentUser } from '@petmove/auth/server'
import { formatMicrochip } from '@petmove/domain'

// 신청서는 인증 사용자 전용 — 미로그인 진입은 proxy.ts 가 /login 으로 redirect.
// 케이스 INSERT 와 case_customer_links INSERT 모두 admin client 로 수행:
//   - cases INSERT 는 org 멤버 RLS 만 허용
//   - case_customer_links INSERT 도 org 멤버 RLS 만 허용 (보호자 본인이 임의 케이스에
//     셀프 링크 못 하게 막는 의도된 설계). 신뢰된 server action 이라 우회 안전.
// Phase 6+ 다중 테넌트 확장 시 org 선택 로직 추가.
const ORG_ID = '00000000-0000-0000-0000-000000000001'

interface ApplyInput {
  // 1. 목적지
  destination: string
  trip_type?: 'round' | 'one_way'
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
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

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

  // 왕복/편도 — admin 의 case.data.trip_type 컨벤션과 동일. 목적지 키로 매핑.
  if (input.trip_type) {
    data.trip_type = { [input.destination]: input.trip_type }
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
      // 공개 신청폼 출처 표시 — DB 트리거가 이 값으로 운영자 봇 알림을 발송한다.
      source: 'apply_form',
      customer_name: input.customer_name,
      customer_name_en: `${input.customer_first_name_en} ${input.customer_last_name_en}`,
      pet_name: input.pet_name,
      pet_name_en: input.pet_name_en,
      destination: input.destination,
      microchip: formatMicrochip(input.microchip),
      data,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  // 케이스 ↔ 보호자 링크 — 작성한 본인 user_id 에 즉시 묶는다. 같은 이메일로 admin 이
  // 만든 케이스가 있어도 case_customer_links 트리거가 별도로 'email-match' 로 묶음.
  const { error: linkError } = await supabase
    .from('case_customer_links')
    .insert({
      case_id: row.id,
      user_id: user.id,
      linked_via: 'self-apply',
    })

  if (linkError) {
    // 링크 실패해도 case 자체는 생성되어 있으므로 사용자한테 성공 응답.
    // 운영자가 후속으로 수동 링크 가능. 콘솔에만 남김.
    console.warn('[applyCase] case_customer_links insert failed:', linkError.message)
  }

  return { ok: true, caseId: row.id }
}
