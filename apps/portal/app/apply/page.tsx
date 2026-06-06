import { ApplyForm, type OwnerPrefill } from './apply-form'
import { listMyCases } from '@/lib/actions/cases'

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
  const prefillOwner = await loadOwnerPrefill()
  return (
    <ApplyForm orgId={DIRECT_ORG_ID} orgName="펫무브" isPublic={false} prefillOwner={prefillOwner} />
  )
}
