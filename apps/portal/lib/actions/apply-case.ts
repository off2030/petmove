'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
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

// honeypot/Turnstile 차단 시 봇에게 돌려줄 가짜 성공 case id (DB 쓰기 없음).
// 오류 대신 성공으로 위장해야 봇이 retry/적응하지 못한다.
const FAKE_OK_CASE_ID = '00000000-0000-0000-0000-000000000000'

// 입력 길이 상한 — 정상 사용자는 한참 못 미치는 값. 초과 = 비정상(봇/오버사이즈 페이로드) → 거부.
const MAX_LEN = { short: 120, medium: 300, email: 254 }
function over(v: string | undefined | null, max: number): boolean {
  return typeof v === 'string' && v.length > max
}

/**
 * Cloudflare Turnstile token 검증.
 *   - secret 미설정(dev/키 미입력): true 반환(검증 스킵 — graceful degrade).
 *   - token 누락 또는 검증 실패: false (호출 측이 silent reject).
 *   - 네트워크 에러는 fail-closed(false) — 봇 친화적 fail-open 회피.
 */
async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false
  const formData = new URLSearchParams()
  formData.append('secret', secret)
  formData.append('response', token)
  if (remoteIp) formData.append('remoteip', remoteIp)
  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(5_000),
      },
    )
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

// 동물 1마리 단위 정보 (한 신청에 여러 마리 = 여러 case).
interface PetInput {
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
  // 선택 항목
  microchip?: string
  microchip_implant_date?: string
  rabies_date?: string
}

interface ApplyInput {
  // 신청 대상 조직 id (조직별 링크면 그 org, 없으면 직영). 서버에서 존재 검증 후 사용.
  org_id?: string
  // 1. 목적지
  destination: string
  trip_type?: 'round' | 'one_way'
  // 2. 고객정보 (한 신청 = 한 보호자, 여러 동물 공유)
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
  // 3. 동물정보 — 1마리 이상.
  pets: PetInput[]
  // ── anti-abuse (공개 신청폼 전용) ──
  // honeypot — 사람에겐 숨김 필드. 봇이 채우면 silent success 로 차단.
  website?: string
  // Cloudflare Turnstile token — 공개(미로그인) 제출만 검증. 1회용이라 제출당 1회만 검증.
  cf_turnstile_token?: string
}

export async function applyCase(input: ApplyInput): Promise<
  { ok: true; caseIds: string[] } | { ok: false; error: string }
> {
  // ── 봇·악용 차단 (공개 신청폼 /apply/<slug> 대상) ──────────────────────────
  // honeypot — 사람에겐 숨김 필드. 봇이 채워 들어오면 DB 쓰기 없이 성공으로 위장.
  if (input.website && input.website.trim().length > 0) {
    return { ok: true, caseIds: [FAKE_OK_CASE_ID] }
  }

  // 직영(로그인) 이면 user, 조직별 공개폼이면 null — 둘 다 허용.
  const user = await getCurrentUser()

  // Cloudflare Turnstile — 미로그인(공개) 제출만 검증. 로그인 직영 흐름은 위젯도 없고
  // 검증도 스킵. secret 미설정 시엔 검증 스킵(graceful degrade) — honeypot 만 동작.
  // 검증 실패는 honeypot 과 동일하게 silent success 로 봇 retry 를 막는다.
  if (!user) {
    const hdrs = await headers()
    const remoteIp =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      hdrs.get('x-real-ip') ||
      null
    const turnstileOk = await verifyTurnstile(input.cf_turnstile_token, remoteIp)
    if (!turnstileOk) {
      return { ok: true, caseIds: [FAKE_OK_CASE_ID] }
    }
  }

  // ── 서버측 입력 검증 — 클라이언트 검증의 백스톱 + 오버사이즈 페이로드 차단 ──────
  // (봇은 위 honeypot/Turnstile 에서 이미 걸러지므로 여기 도달한 건 정상 경로.)
  const pets = Array.isArray(input.pets) ? input.pets : []
  if (pets.length === 0 || pets.length > 5) {
    return { ok: false, error: '반려동물 정보가 올바르지 않습니다.' }
  }
  // Apple 로그인 사용자는 영문 이름을 필수에서 제외(App Store Guideline 4.0 — 클라이언트
  // 검증과 동일한 백스톱). 영문 이름은 로그인 후 '내 정보 > 보호자 정보'에서 입력·수정 가능.
  const isAppleLogin = user?.app_metadata?.provider === 'apple'
  const sharedMissing =
    !input.destination?.trim() ||
    !input.customer_name?.trim() ||
    (!isAppleLogin &&
      (!input.customer_last_name_en?.trim() || !input.customer_first_name_en?.trim())) ||
    !input.phone?.trim() ||
    !input.address_kr?.trim()
  const petMissing = pets.some(
    (p) =>
      !p.pet_name?.trim() ||
      !p.pet_name_en?.trim() ||
      !p.birth_date?.trim() ||
      !p.species?.trim() ||
      !p.breed?.trim() ||
      !p.sex?.trim(),
  )
  if (sharedMissing || petMissing) {
    return { ok: false, error: '필수 항목이 누락되었습니다.' }
  }
  const lengthChecks: Array<[string | undefined, number]> = [
    [input.destination, MAX_LEN.short],
    [input.customer_name, MAX_LEN.short],
    [input.customer_last_name_en, MAX_LEN.short],
    [input.customer_first_name_en, MAX_LEN.short],
    [input.phone, MAX_LEN.short],
    [input.email, MAX_LEN.email],
    [input.address_kr, MAX_LEN.medium],
    [input.address_en, MAX_LEN.medium],
    [input.address_zipcode, MAX_LEN.short],
    [input.address_sido, MAX_LEN.short],
    [input.address_sigungu, MAX_LEN.short],
  ]
  for (const p of pets) {
    lengthChecks.push(
      [p.pet_name, MAX_LEN.short],
      [p.pet_name_en, MAX_LEN.short],
      [p.birth_date, MAX_LEN.short],
      [p.species, MAX_LEN.short],
      [p.breed, MAX_LEN.short],
      [p.breed_en, MAX_LEN.short],
      [p.color, MAX_LEN.medium],
      [p.color_en, MAX_LEN.medium],
      [p.sex, MAX_LEN.short],
      [p.weight, MAX_LEN.short],
      [p.microchip, MAX_LEN.short],
      [p.microchip_implant_date, MAX_LEN.short],
      [p.rabies_date, MAX_LEN.short],
    )
  }
  if (lengthChecks.some(([v, max]) => over(v, max))) {
    return { ok: false, error: '입력값이 너무 깁니다.' }
  }

  const supabase = createAdminClient()

  // 신청 조직의 org_type 에 따라 슬롯 분기 (docs/org-model-refactor.md 4단계):
  //   hospital → 담당 병원(org_id)
  //   transport → 운송(transport_org_id), 담당 병원은 미정(platform 유지)
  //   both → 둘 다 그 조직
  //   조직 미지정·기타 → 직영(platform) 유지 = 담당 미정
  let orgId = DIRECT_ORG_ID
  let transportOrgId: string | null = null
  if (input.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, org_type')
      .eq('id', input.org_id)
      .maybeSingle()
    if (org) {
      const o = org as { id: string; org_type: string }
      if (o.org_type === 'hospital') {
        orgId = o.id
      } else if (o.org_type === 'transport') {
        transportOrgId = o.id
      } else if (o.org_type === 'both') {
        orgId = o.id
        transportOrgId = o.id
      }
    }
  }

  // 고객 단위 담당 (docs/org-model-refactor.md 6단계) — 직영(담당 미지정) + 로그인이고
  // 기존 담당이 있으면 그 담당을 승계한다. 한 보호자의 동물은 같은 담당을 공유.
  // 공개 신청폼(input.org_id 지정)은 명시 병원이라 위 분기를 그대로 따른다.
  // (다른 병원 신청 시 기존 담당이 그 병원으로 이동하는 충돌 규칙은 둘째 병원 생길 때.)
  if (orgId === DIRECT_ORG_ID && transportOrgId === null && user) {
    const { data: links } = await supabase
      .from('case_customer_links')
      .select('case_id')
      .eq('user_id', user.id)
      .limit(50)
    const ids = (links ?? []).map((l) => (l as { case_id: string }).case_id)
    if (ids.length > 0) {
      const { data: existing } = await supabase
        .from('cases')
        .select('org_id, transport_org_id')
        .in('id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
      const e = existing?.[0] as
        | { org_id: string; transport_org_id: string | null }
        | undefined
      if (e) {
        orgId = e.org_id
        transportOrgId = e.transport_org_id
      }
    }
  }

  // 동물별로 case 생성 (한 신청 = 여러 동물 = 여러 case). 공통 보호자 정보 공유.
  const caseIds: string[] = []
  for (const p of pets) {
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
      birth_date: p.birth_date,
      species: p.species,
      breed: p.breed,
      breed_en: p.breed_en,
      color: p.color,
      color_en: p.color_en,
      sex: p.sex,
      weight: p.weight ? Number(p.weight) : null,
    }

    // 왕복/편도 — admin 의 case.data.trip_type 컨벤션과 동일. 목적지 키로 매핑.
    if (input.trip_type) {
      data.trip_type = { [input.destination]: input.trip_type }
    }

    // 선택 항목
    if (p.microchip_implant_date) {
      data.microchip_implant_date = p.microchip_implant_date
    }
    if (p.rabies_date) {
      // 신청폼으로 들어온 광견병 접종은 본 병원에서 이뤄지지 않았으므로 타병원 접종으로 표시.
      data.rabies_dates = [{ date: p.rabies_date, other_hospital: true }]
    }

    const { data: row, error } = await supabase
      .from('cases')
      .insert({
        org_id: orgId,
        transport_org_id: transportOrgId,
        // 공개 신청폼 출처 표시 — DB 트리거가 이 값으로 운영자 봇 알림을 발송한다.
        source: 'apply_form',
        customer_name: input.customer_name,
        // 영문 이름 미입력(Apple 로그인 후 나중 입력) 시 빈 문자열로 저장 — 외톨이 공백 방지.
        customer_name_en: `${input.customer_first_name_en} ${input.customer_last_name_en}`.trim(),
        pet_name: p.pet_name,
        pet_name_en: p.pet_name_en,
        destination: input.destination,
        microchip: formatMicrochip(p.microchip),
        data,
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    caseIds.push(row.id as string)

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
        // 링크 실패해도 case 자체는 생성되어 있으므로 계속 진행. 운영자가 후속 수동 링크 가능.
        console.warn('[applyCase] case_customer_links insert failed:', linkError.message)
      }
    }
  }

  // 제출 직후 /cases 로 이동했을 때 새 케이스가 바로 보이도록 라우터 캐시 무효화.
  // (안 하면 0건일 때 캐시된 '환영(EmptyState)' 화면이 그대로 떠서 새 케이스가 안 보임.)
  revalidatePath('/cases')
  revalidatePath('/', 'layout')

  return { ok: true, caseIds }
}
