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

  // 운송회사 전용 (org_type='transport' 일 때만 UI 노출)
  // 우편번호·휴대폰은 동물병원과 분리해 독립 저장 — 한 조직이 양쪽 토글 사이에서
  // 실수로 서로의 값을 덮어쓰지 않도록.
  transport_company_ko: string
  transport_company_en: string
  transport_contact_ko: string
  transport_contact_en: string
  transport_postal_code: string
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
  transport_contact_ko: '',
  transport_contact_en: '',
  transport_postal_code: '',
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
