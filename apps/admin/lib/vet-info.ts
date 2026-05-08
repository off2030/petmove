/**
 * 중앙 수의사/병원(회사) 정보.
 * 증명서 템플릿에 들어가는 서명란·연락처 정보를 한 곳에서 관리한다.
 * 모든 PDF 매핑은 transform "vet:<key>" 로 이 값을 참조한다.
 *
 * 기본값은 아래 DEFAULT_VET_INFO. Supabase `app_settings` 의
 * key='company_info' 행에 저장된 override 값으로 덮어쓸 수 있다.
 * PDF 생성 server action 진입 시 loadVetInfo() 를 호출해 캐시를 갱신한다.
 */

/**
 * 사용자가 임의로 추가하는 조직 메타데이터(주차정보·세무번호 등 고정 필드 외).
 * organization_settings.company_info 의 같은 JSON blob 안에 저장.
 */
export interface CustomField {
  id: string
  label: string
  value: string
}

export interface VetInfo {
  // 한글
  name_ko: string
  clinic_ko: string
  address_ko: string

  // 영문
  name_en: string
  /** 영문 이름 (First) — 케이스 상세의 customer_first_name_en 와 동일한 split 패턴.
   *  설정 페이지에서 First/Last 분리 입력. 저장 시 name_en = "First Last" 로 자동 합성. */
  name_first_en: string
  /** 영문 성 (Last) */
  name_last_en: string
  clinic_en: string
  address_en: string
  /** 주소 1줄 (street) / 2줄 (locality) 분리 */
  address_street_en: string
  address_locality_en: string

  // 연락처
  phone: string
  phone_intl: string
  mobile_phone: string
  email: string
  postal_code: string

  // 면허
  license_no: string

  // 운송회사 정보 — 동물병원 정보와 독립. 같은 org 가 둘 다 입력해도 서로 영향 없음.
  // 동물병원의 (병원/수의사) 구성과 평행: (회사/담당자) 두 그룹.
  // 우편번호·휴대폰·추가정보 등 모든 키가 별도 저장이라 한 조직이 양쪽 토글 사이에서
  // 실수로 서로의 값을 덮어쓰지 않도록.
  transport_company_ko: string
  transport_company_en: string
  transport_address_ko: string
  transport_address_en: string
  transport_postal_code: string
  transport_phone: string
  transport_email: string
  transport_contact_ko: string
  /** 담당자 영문명 (합성). transport_contact_first_en + transport_contact_last_en 자동 결합. */
  transport_contact_en: string
  transport_contact_first_en: string
  transport_contact_last_en: string
  transport_mobile_phone: string

  /** 사용자 정의 추가 필드 — 동물병원 토글에서 입력. UI 의 "정보 추가 +" 로 자유롭게 늘릴 수 있음. */
  custom_fields?: CustomField[]
  /** 사용자 정의 추가 필드 — 운송회사 토글에서 입력. 동물병원과 독립 저장. */
  transport_custom_fields?: CustomField[]
}

/**
 * 빈 기본값. 실제 값은 organization_settings 의 company_info 에서 로드.
 * 각 org 는 Settings → 병원 정보 에서 값 입력. 여러 테넌트 지원을 위해 여기에는
 * 특정 조직 데이터를 하드코딩하지 않는다. 로잔 값은 DB seed 에 있음 (20260422000007_seed_rojan_company_info.sql).
 */
export const DEFAULT_VET_INFO: VetInfo = {
  name_ko: '',
  clinic_ko: '',
  address_ko: '',
  name_en: '',
  name_first_en: '',
  name_last_en: '',
  clinic_en: '',
  address_en: '',
  address_street_en: '',
  address_locality_en: '',
  phone: '',
  phone_intl: '',
  mobile_phone: '',
  email: '',
  postal_code: '',
  license_no: '',
  transport_company_ko: '',
  transport_company_en: '',
  transport_address_ko: '',
  transport_address_en: '',
  transport_postal_code: '',
  transport_phone: '',
  transport_email: '',
  transport_contact_ko: '',
  transport_contact_en: '',
  transport_contact_first_en: '',
  transport_contact_last_en: '',
  transport_mobile_phone: '',
  custom_fields: [],
  transport_custom_fields: [],
}

/** custom_fields 를 제외한 단순 문자열 필드 키. UI 에서 input/textarea 로 편집됨. */
export type VetInfoKey = Exclude<keyof VetInfo, 'custom_fields' | 'transport_custom_fields'>

let _cached: VetInfo = DEFAULT_VET_INFO

/** Sync access for PDF mapping code. 항상 즉시 반환. */
export function getVetInfo(): VetInfo {
  return _cached
}

/** Legacy export — 점진적으로 getVetInfo() 로 마이그레이션. */
export const VET_INFO = new Proxy({} as VetInfo, {
  get(_t, key) {
    return (_cached as unknown as Record<string, unknown>)[key as string]
  },
})

/**
 * Supabase 에서 organization_settings.company_info override 를 읽어 캐시 갱신.
 * 조직 공유 정보(회사명·주소·우편번호 등) 만 — 발급자 본인 정보(이름·휴대폰·면허) 는
 * loadEffectiveVetInfo() 가 user-level overlay 로 덧씌움.
 *
 * 설정 페이지(병원/회사 정보 편집) 가 사용 — 해당 화면은 org-level 만 보고 편집.
 *
 * PDF 생성 경로는 loadEffectiveVetInfo() 사용해야 본인 정보가 cert 에 반영됨.
 */
export async function loadVetInfo(): Promise<VetInfo> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const { getActiveOrgId } = await import('@/lib/supabase/active-org')
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', 'company_info')
      .maybeSingle()
    const override = (data?.value as Partial<VetInfo> | null) ?? {}
    _cached = { ...DEFAULT_VET_INFO, ...override }
  } catch {
    _cached = DEFAULT_VET_INFO
  }
  return _cached
}

/**
 * loadVetInfo() 결과(org-level)에 현재 로그인 사용자의 contact_info 를 overlay.
 * 한 조직에 멤버가 여럿일 때 발급자 본인의 이름·휴대폰·면허번호가 cert 에 반영되도록.
 *
 * Overlay 매핑은 org_type 별로 다름:
 *   hospital  → user.{name_ko/first_en/last_en/en/mobile_phone/license_no} 가
 *               vet.{name_ko/name_first_en/name_last_en/name_en/mobile_phone/license_no} 덮음.
 *   transport → user.{name_ko/first_en/last_en/en/mobile_phone} 가
 *               vet.{transport_contact_ko/_first_en/_last_en/_en, transport_mobile_phone} 덮음.
 *               (license_no 는 transport 에 의미 없음)
 *
 * 빈 user 값은 overlay 안 함 — 사용자가 본인 정보 미입력 상태면 org-level 기본값 그대로.
 *
 * PDF 생성 server action 진입 시 await 한 번 호출. _cached 도 effective 결과로 갱신
 * → VET_INFO Proxy 가 fillPdf 안 vet:* transform 에서 read 시점에 effective 값 반환.
 */
export async function loadEffectiveVetInfo(): Promise<VetInfo> {
  const org = await loadVetInfo()
  let userInfo: Partial<{
    name_ko: string; name_first_en: string; name_last_en: string; name_en: string;
    mobile_phone: string; license_no: string;
  }> = {}
  let orgType: 'hospital' | 'transport' = 'hospital'
  try {
    const { loadUserContactInfo } = await import('@/lib/user-contact')
    userInfo = await loadUserContactInfo()
    const { createClient } = await import('@/lib/supabase/server')
    const { getActiveOrgId } = await import('@/lib/supabase/active-org')
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase.from('organizations').select('org_type').eq('id', orgId).maybeSingle()
    if ((data as { org_type?: string } | null)?.org_type === 'transport') orgType = 'transport'
  } catch {
    // user 정보 fail 시 org-level 만 그대로 — cached 도 그대로.
    return org
  }
  const overlay: Partial<VetInfo> = {}
  // overlay only when user value is non-empty (preserve org defaults otherwise)
  if (orgType === 'hospital') {
    if (userInfo.name_ko) overlay.name_ko = userInfo.name_ko
    if (userInfo.name_first_en) overlay.name_first_en = userInfo.name_first_en
    if (userInfo.name_last_en) overlay.name_last_en = userInfo.name_last_en
    if (userInfo.name_en) overlay.name_en = userInfo.name_en
    if (userInfo.mobile_phone) overlay.mobile_phone = userInfo.mobile_phone
    if (userInfo.license_no) overlay.license_no = userInfo.license_no
  } else {
    if (userInfo.name_ko) overlay.transport_contact_ko = userInfo.name_ko
    if (userInfo.name_first_en) overlay.transport_contact_first_en = userInfo.name_first_en
    if (userInfo.name_last_en) overlay.transport_contact_last_en = userInfo.name_last_en
    if (userInfo.name_en) overlay.transport_contact_en = userInfo.name_en
    if (userInfo.mobile_phone) overlay.transport_mobile_phone = userInfo.mobile_phone
  }
  const effective: VetInfo = { ...org, ...overlay }
  _cached = effective
  return effective
}

/**
 * 설정 화면에서 호출 — 부분 업데이트 후 캐시 갱신.
 *
 * 중요: merge base 는 module-level _cached 가 아니라 **DB 현재 값** 사용.
 * _cached 는 서버 프로세스 재시작/HMR/콜드스타트 직후 비어 있을 수 있고, 그 상태에서
 * patch 만 merge 하면 다른 모든 필드가 DEFAULT_VET_INFO(빈 문자열)로 덮여 DB row 가
 * 통째로 wipe 되는 사고가 발생함. DB 의 현재 값을 base 로 잡으면 캐시 상태와 무관하게
 * 안전하게 부분 갱신.
 */
export async function saveVetInfo(patch: Partial<VetInfo>): Promise<VetInfo> {
  const { createClient } = await import('@/lib/supabase/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const { data: existingRow } = await supabase
    .from('organization_settings')
    .select('value')
    .eq('org_id', orgId)
    .eq('key', 'company_info')
    .maybeSingle()
  const existing = (existingRow?.value as Partial<VetInfo> | null) ?? {}
  const merged: VetInfo = { ...DEFAULT_VET_INFO, ...existing, ...patch }
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, key: 'company_info', value: merged, updated_at: new Date().toISOString() })
  if (error) {
    console.error('[saveVetInfo] upsert error:', error)
    throw new Error(error.message)
  }
  _cached = merged
  return merged
}
