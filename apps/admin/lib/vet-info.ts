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

  // 운송회사 전용 (org_type='transport' 일 때만 UI 노출)
  transport_company_ko: string
  transport_company_en: string
  transport_contact_ko: string
  transport_contact_en: string

  /** 사용자 정의 추가 필드. UI 의 "정보 추가 +" 로 자유롭게 늘릴 수 있음. */
  custom_fields?: CustomField[]
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
  transport_contact_ko: '',
  transport_contact_en: '',
  custom_fields: [],
}

/** custom_fields 를 제외한 단순 문자열 필드 키. UI 에서 input/textarea 로 편집됨. */
export type VetInfoKey = Exclude<keyof VetInfo, 'custom_fields'>

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
 * Supabase 에서 override 를 읽어 캐시를 갱신.
 * 각 PDF 생성 server action 진입 시 await 한 번 호출.
 * 실패 시 기본값 유지.
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

/** 설정 화면에서 호출 — 부분 업데이트 후 캐시 갱신. */
export async function saveVetInfo(patch: Partial<VetInfo>): Promise<VetInfo> {
  const { createClient } = await import('@/lib/supabase/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const merged: VetInfo = { ...getVetInfo(), ...patch }
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, key: 'company_info', value: merged, updated_at: new Date().toISOString() })
  if (error) {
    console.error('[saveVetInfo] upsert error:', error)
    throw new Error(error.message)
  }
  _cached = { ...DEFAULT_VET_INFO, ...merged }
  return _cached
}
