import { ApplyForm, type OwnerPrefill } from './apply-form'
import { listMyCases } from '@/lib/actions/cases'
import { getMyProfile } from '@/lib/actions/profile'
import { getCurrentUser } from '@petmove/auth/server'

// 조직 표시 없는 /apply = 펫무브 직영(platform). 어느 병원/운송 업체에도 안 속하는
// 고객 직접 신청 → 직영 org 로 귀속, super_admin 만 관리. (조직별 신청은 /apply/<slug>)
const DIRECT_ORG_ID = '00000000-0000-0000-0000-000000000002'

/**
 * 기존 케이스(가장 최근)에서 보호자 정보를 뽑아 prefill. '동물 추가' 시 소유주 정보를
 * 다시 묻지 않도록. 케이스가 없으면(첫 신청) null → 일반 4단계 흐름.
 *
 * address_kr 은 이미 상세주소 합본이라 그대로 넘김(폼이 detail 빈 채 제출).
 * 영문 성·이름은 data 분리 키 우선, 없으면 customer_name_en("First Last") 폴백 split.
 */
async function loadOwnerPrefill(): Promise<OwnerPrefill | null> {
  const res = await listMyCases()
  if (!res.ok || res.value.length === 0) return null
  const c = res.value[0] // updated_at 최신순 정렬
  const data = (c.data ?? {}) as Record<string, unknown>
  const str = (k: string): string => {
    const v = data[k]
    return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
  }

  let firstNameEn = str('customer_first_name_en')
  let lastNameEn = str('customer_last_name_en')
  if (!firstNameEn && !lastNameEn) {
    const parts = (c.customer_name_en ?? '').trim().split(/\s+/).filter(Boolean)
    // apply 저장 컨벤션은 "First Last".
    firstNameEn = parts.slice(0, -1).join(' ') || parts[0] || ''
    lastNameEn = parts.length > 1 ? parts[parts.length - 1] : ''
  }

  const customerName = c.customer_name ?? ''
  const phone = str('phone').replace(/\D/g, '')
  // 보호자 정보가 사실상 비어 있으면(가짜 케이스 등) prefill 하지 않음.
  if (!customerName && !phone) return null

  return {
    customerName,
    lastNameEn,
    firstNameEn,
    phone,
    addressKr: str('address_kr') || str('address_ko'),
    addressEn: str('address_en') || str('address_overseas'),
    zipcode: str('address_zipcode') || str('postal_code') || str('zipcode'),
    sido: str('address_sido'),
    sigungu: str('address_sigungu'),
  }
}

export default async function ApplyPage() {
  // 직영(펫무브 플랫폼) 자체 신청 — 로그인 후 진입(계정 이메일 사용). isPublic=false.
  // 기존 케이스가 있으면 보호자 정보 prefill → 소유주 단계 건너뜀.
  const [prefillOwner, profileRes] = await Promise.all([loadOwnerPrefill(), getMyProfile()])

  // 첫 신청(케이스 prefill 없음)이라도 로그인 계정 이름(Apple·카카오·네이버·구글이 제공)을
  // 이름 칸에 prefill → 재입력 강요 방지(App Store Guideline 4.0). 단, display_name 이
  // 이메일 앞부분(이름 미제공 시 fallback)이면 가짜 이름이므로 prefill 하지 않는다.
  const profile = profileRes.ok ? profileRes.value : null
  const emailPrefix = profile?.email_normalized?.split('@')[0]?.toLowerCase() ?? null
  const rawName = profile?.display_name?.trim() ?? null
  const prefillName = rawName && rawName.toLowerCase() !== emailPrefix ? rawName : null

  // Apple 로그인 사용자는 온보딩에서 영문 이름을 필수로 받지 않는다(App Store Guideline 4.0:
  // Sign in with Apple 직후 이름 입력을 강요하면 반려). 영문 이름은 애플이 제공할 수 없는 값
  // (여권 일치 로마자 실명)이라 자동 채움이 불가 → 로그인 후 '내 정보 > 보호자 정보'에서
  // 입력·수정하고 서류 생성 시 반영. 구글·카카오 등 다른 로그인은 기존대로 필수 유지.
  // getCurrentUser 는 cache() 되어 getMyProfile 이 이미 부른 것을 재사용(추가 왕복 없음).
  const authUser = await getCurrentUser()
  const isAppleLogin = authUser?.app_metadata?.provider === 'apple'

  return (
    <ApplyForm
      orgId={DIRECT_ORG_ID}
      orgName="펫무브"
      isPublic={false}
      appDestinationsOnly
      prefillOwner={prefillOwner}
      prefillName={prefillName}
      isAppleLogin={isAppleLogin}
    />
  )
}
