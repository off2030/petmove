/**
 * 중앙 수의사/병원(회사) 정보.
 * 증명서 템플릿에 들어가는 서명란·연락처 정보를 한 곳에서 관리한다.
 * 모든 PDF 매핑은 transform "vet:<key>" 로 이 값을 참조한다.
 *
 * 기본값은 아래 DEFAULT_VET_INFO. Supabase `organization_settings` 의
 * key='company_info' 행에 저장된 override 값으로 덮어쓸 수 있다.
 *
 * Multi-tenancy 안전: PDF 생성 경로는 runWithVetInfo() 로 ALS 바인딩 후 실행.
 * module-level _cached 는 fallback (settings 페이지 등 single-tenant 컨텍스트)
 * 으로만 의미. 동시에 두 조직 사용자가 PDF 를 생성해도 서로의 vet info 가
 * 섞이지 않는다.
 */
import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

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

/**
 * Request-scoped VetInfo binding.
 *
 * PDF 생성 진입점은 반드시 `runWithVetInfo(info, () => fillPdf(...))` 안에서 실행.
 * Module-level _cached 만 쓰면 동시에 두 조직 사용자가 PDF 를 생성할 때 한쪽 요청
 * 도중에 다른쪽 loadVetInfo() 가 _cached 를 덮어써, 첫 요청의 PDF 가 다른 조직
 * 데이터로 채워지는 데이터 누설 race 가 발생한다. ALS 로 요청 단위 격리 보장.
 */
const vetInfoStore = new AsyncLocalStorage<VetInfo>()

/** ALS 컨텍스트에 vet info 를 바인딩한 채로 fn 실행. fn 안에서 호출되는 모든
 *  `getVetInfo()` / `VET_INFO` 접근은 이 info 를 본다. */
export function runWithVetInfo<T>(info: VetInfo, fn: () => Promise<T>): Promise<T> {
  return vetInfoStore.run(info, fn)
}

/** Sync access — ALS 컨텍스트 우선, 없으면 module cache fallback. PDF 생성 경로
 *  에서는 항상 ALS 가 채워져 있음. settings 페이지 등 single-tenant 컨텍스트에서는
 *  cache fallback 으로도 안전. */
export function getVetInfo(): VetInfo {
  return vetInfoStore.getStore() ?? _cached
}

/** Legacy export — getVetInfo() 위임. ALS 컨텍스트가 있으면 그쪽 우선. */
export const VET_INFO = new Proxy({} as VetInfo, {
  get(_t, key) {
    return (getVetInfo() as unknown as Record<string, unknown>)[key as string]
  },
})

/**
 * Supabase 에서 override 를 읽어 VetInfo 반환. module cache 도 함께 갱신 (legacy
 * 경로 호환 — settings 페이지 등에서 VET_INFO 즉시 접근하는 곳을 위함).
 *
 * PDF 생성 경로에서는 반환값을 받아 `runWithVetInfo(info, ...)` 로 감싸야
 * multi-tenant race 가 차단된다. 반환값을 무시하고 cache 만 의존하면 안전하지 않음.
 *
 * 실패 시 기본값 반환 + cache 갱신.
 */
export async function loadVetInfo(): Promise<VetInfo> {
  let info: VetInfo = DEFAULT_VET_INFO
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
    info = { ...DEFAULT_VET_INFO, ...override }
  } catch {
    info = DEFAULT_VET_INFO
  }
  _cached = info
  return info
}

/**
 * 설정 화면에서 호출 — 부분 업데이트 후 캐시 갱신.
 *
 * 중요: merge base 는 module-level _cached 가 아니라 **DB 현재 값** 사용.
 * _cached 는 프로세스 시작 직후 / 재시작 / 다른 조직 사용자의 loadVetInfo 호출로
 * 비어 있거나 다른 조직 데이터로 오염될 수 있음. 그 상태에서 patch 만 merge 하면
 * 다른 모든 필드가 DEFAULT_VET_INFO(빈 문자열)로 덮어써져 DB row 가 통째로 wipe 됨
 * → 이후 PDF 생성 시 vet:* transform 들이 빈 값 반환 → Invoice/ESD/증명서에
 * 조직·수의사 정보가 들어가지 않음.
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
  return _cached
}
