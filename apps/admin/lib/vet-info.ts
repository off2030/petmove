/**
 * 중앙 수의사/병원(회사) 정보.
 * 증명서 템플릿에 들어가는 서명란·연락처 정보를 한 곳에서 관리한다.
 * 모든 PDF 매핑은 transform "vet:<key>" 로 이 값을 참조한다.
 *
 * 기본값은 아래 DEFAULT_VET_INFO. Supabase `app_settings` 의
 * key='company_info' 행에 저장된 override 값으로 덮어쓸 수 있다.
 * PDF 생성 server action 진입 시 loadVetInfo() 를 호출해 캐시를 갱신한다.
 */

import { withActiveVetApplied, type VetEntry } from './vet-entry'
export { activeVet, emptyVetEntry, listVets, withActiveVetApplied, VET_ENTRY_KEYS } from './vet-entry'
export type { VetEntry, VetEntryKey } from './vet-entry'

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
  /** 상세주소(층·호·건물명). 입력은 별도 칸이지만 저장은 address_ko 에 "도로명, 상세"로
   *  합쳐 넣는다(PDF·펫무브가 address_ko 한 필드를 읽으므로). 여기엔 재검색 시 다시
   *  붙일 수 있게 상세만 따로도 보관. */
  address_detail_ko?: string

  // 영문
  name_en: string
  /** 영문 이름 (First) — 케이스 상세의 customer_first_name_en 와 동일한 split 패턴.
   *  설정 페이지에서 First/Last 분리 입력. 저장 시 name_en = "First Last" 로 자동 합성. */
  name_first_en: string
  /** 영문 성 (Last) */
  name_last_en: string
  clinic_en: string
  address_en: string
  /** 영문 상세주소 — address_en 에 "road, detail"로 합쳐 보관(한글과 동일 방식). */
  address_detail_en?: string
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

  // 보호자 안내용 외부 연결 — 펫무브 보호자 [내 정보 > 담당 동물병원] 카드의
  // '네이버예약'·'카카오톡' 버튼이 이 URL 로 연결된다. 병원만 입력(운송회사 무관).
  naver_booking_url: string
  kakao_chat_url: string

  // 운송회사 정보 — 동물병원 정보와 독립. 같은 org 가 둘 다 입력해도 서로 영향 없음.
  // 동물병원의 (병원/수의사) 구성과 평행: (회사/담당자) 두 그룹.
  // 우편번호·휴대폰·추가정보 등 모든 키가 별도 저장이라 한 조직이 양쪽 토글 사이에서
  // 실수로 서로의 값을 덮어쓰지 않도록.
  transport_company_ko: string
  transport_company_en: string
  transport_address_ko: string
  /** 운송 상세주소(한글) — transport_address_ko 에 합쳐 보관. */
  transport_address_detail_ko?: string
  transport_address_en: string
  /** 운송 상세주소(영문) — transport_address_en 에 합쳐 보관. */
  transport_address_detail_en?: string
  transport_postal_code: string
  transport_phone: string
  transport_email: string
  transport_contact_ko: string
  /** 담당자 영문명 (합성). transport_contact_first_en + transport_contact_last_en 자동 결합. */
  transport_contact_en: string
  transport_contact_first_en: string
  transport_contact_last_en: string
  transport_mobile_phone: string

  /**
   * 수의사 명단. 위의 평면 수의사 필드(name_* / mobile_phone / license_no)는 이 중
   * 선택된 한 명의 사본이다.
   *
   * key 자체가 **없으면** 명단 도입 이전 데이터로 보고 평면 필드를 첫 수의사로 승격한다
   * (listVets). 빈 배열([])은 "수의사를 모두 지웠다"는 뜻이라 승격하지 않는다 — 그래야
   * 지운 게 실제로 증명서에서 사라진다.
   */
  vets?: VetEntry[]
  /** 증명서에 쓸 수의사 id. 비었거나 명단에 없으면 첫 번째. */
  active_vet_id?: string

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
  address_detail_ko: '',
  name_en: '',
  name_first_en: '',
  name_last_en: '',
  clinic_en: '',
  address_en: '',
  address_detail_en: '',
  address_street_en: '',
  address_locality_en: '',
  phone: '',
  phone_intl: '',
  mobile_phone: '',
  email: '',
  postal_code: '',
  license_no: '',
  naver_booking_url: '',
  kakao_chat_url: '',
  transport_company_ko: '',
  transport_company_en: '',
  transport_address_ko: '',
  transport_address_detail_ko: '',
  transport_address_en: '',
  transport_address_detail_en: '',
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
export type VetInfoKey = Exclude<keyof VetInfo, 'custom_fields' | 'transport_custom_fields' | 'vets' | 'active_vet_id'>

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
 *
 * 증명서에 나가는 조직 정보의 **유일한 출처**. 설정 → 조직정보 화면에서 보이는 값이
 * 그대로 발급되고, 비운 칸은 빈 채로 나간다.
 *
 * 2026-08-28 이전에는 여기에 profiles.contact_info(user-level)를 덧씌우는
 * loadEffectiveVetInfo() 가 있었다. 발급자 본인이 이름·휴대폰·면허를 비워두면 조직값이
 * 조용히 대신 들어가서, 화면에서 지워도 출력이 그대로인 문제가 있어 한 층으로 정리.
 */
export async function loadVetInfo(orgId?: string): Promise<VetInfo> {
  try {
    const { createClient } = await import('@petmove/auth/server')
    const supabase = await createClient()
    const targetOrg = orgId ?? (await (await import('@/lib/supabase/active-org')).getActiveOrgId())
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', targetOrg)
      .eq('key', 'company_info')
      .maybeSingle()
    const override = (data?.value as Partial<VetInfo> | null) ?? {}
    const result = withActiveVetApplied({ ...DEFAULT_VET_INFO, ...override })
    // 활성 조직 조회일 때만 PDF용 module 캐시 갱신. 슈퍼어드민이 남의 조직(orgId 지정)을
    // 조회할 때는 캐시를 건드리지 않는다(PDF 발급자 정보 오염 방지).
    if (!orgId) _cached = result
    return result
  } catch {
    if (!orgId) _cached = DEFAULT_VET_INFO
    return DEFAULT_VET_INFO
  }
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
export async function saveVetInfo(patch: Partial<VetInfo>, orgId?: string): Promise<VetInfo> {
  const { createClient } = await import('@petmove/auth/server')
  const supabase = await createClient()
  const targetOrg = orgId ?? (await (await import('@/lib/supabase/active-org')).getActiveOrgId())
  const { data: existingRow } = await supabase
    .from('organization_settings')
    .select('value')
    .eq('org_id', targetOrg)
    .eq('key', 'company_info')
    .maybeSingle()
  const existing = (existingRow?.value as Partial<VetInfo> | null) ?? {}
  const merged: VetInfo = withActiveVetApplied({ ...DEFAULT_VET_INFO, ...existing, ...patch })
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: targetOrg, key: 'company_info', value: merged, updated_at: new Date().toISOString() })
  if (error) {
    console.error('[saveVetInfo] upsert error:', error)
    throw new Error(error.message)
  }
  // 활성 조직 저장일 때만 캐시 갱신 (슈퍼어드민의 타 조직 저장은 캐시 오염 방지).
  if (!orgId) _cached = merged
  return merged
}
