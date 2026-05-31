'use server'

import { createAdminClient } from '@petmove/auth'
import { getCurrentUser } from '@petmove/auth/server'
import { formatMicrochip } from '@petmove/domain'

// 신청서 2종:
//   - 직영 /apply (로그인) → 계정 이메일 사용, 작성 본인(user_id)에 즉시 링크
//   - 조직별 /apply/<slug> (공개·미로그인) → 입력 이메일 사용, 익명 생성(링크 없음).
//     나중에 같은 이메일로 펫무브 가입 시 case_customer_links 트리거가 'email-match' 로 연결.
// 케이스 INSERT 와 case_customer_links INSERT 모두 admin client 로 수행:
//   - cases INSERT 는 org 멤버 RLS 만 허용
//   - case_customer_links INSERT 도 org 멤버 RLS 만 허용 (보호자 본인이 임의 케이스에
//     셀프 링크 못 하게 막는 의도된 설계). 신뢰된 server action 이라 우회 안전.
// 신청 대상 org: 조직별 링크(/apply/<slug>)면 그 org, 표시 없으면 직영(펫무브).
const DIRECT_ORG_ID = '00000000-0000-0000-0000-000000000002' // 펫무브 직영(platform)

interface ApplyInput {
  // 신청 대상 조직 id (조직별 링크면 그 org, 없으면 직영). 서버에서 존재 검증 후 사용.
  org_id?: string
  // 1. 목적지
  destination: string
  trip_type?: 'round' | 'one_way'
  // 2. 고객정보
  customer_name: string
  customer_last_name_en: string
  customer_first_name_en: string
  phone: string
  email?: string  // 공개(조직별) 폼 — 계정이 없으니 직접 입력. 직영은 계정 이메일 사용.
  address_kr: string
  address_en?: string
  address_zipcode?: string
  address_sido?: string
  address_sigungu?: string
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
  // 직영(로그인) 이면 user, 조직별 공개폼이면 null — 둘 다 허용.
  const user = await getCurrentUser()

  const supabase = createAdminClient()

  // 신청 대상 org 결정 — 유효한 조직 id 가 오면 그 org, 아니면 직영(펫무브).
  let orgId = DIRECT_ORG_ID
  if (input.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', input.org_id)
      .maybeSingle()
    if (org) orgId = org.id as string
  }

  const data: Record<string, unknown> = {
    customer_last_name_en: input.customer_last_name_en,
    customer_first_name_en: input.customer_first_name_en,
    phone: input.phone,
    email: user?.email ?? input.email?.trim() ?? null,
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
      org_id: orgId,
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

  // 케이스 ↔ 보호자 링크 — 로그인(직영) 이면 작성 본인 user_id 에 즉시 묶는다.
  // 공개(조직별) 폼은 익명이라 링크 생략 — 나중에 같은 이메일로 가입 시 트리거가 'email-match' 로 연결.
  if (user) {
    const { error: linkError } = await supabase
      .from('case_customer_links')
      .insert({
        case_id: row.id,
        user_id: user.id,
        linked_via: 'self-apply',
      })
    if (linkError) {
      // 링크 실패해도 case 자체는 생성되어 있으므로 성공 응답. 운영자가 후속 수동 링크 가능.
      console.warn('[applyCase] case_customer_links insert failed:', linkError.message)
    }
  }

  return { ok: true, caseId: row.id }
}
