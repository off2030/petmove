/**
 * 중앙 수의사/병원(회사) 정보.
 * 증명서 템플릿에 들어가는 서명란·연락처 정보를 한 곳에서 관리한다.
 * 모든 PDF 매핑은 transform "vet:<key>" 로 이 값을 참조한다.
 *
 * 기본값은 아래 DEFAULT_VET_INFO. Supabase `app_settings` 의
 * key='company_info' 행에 저장된 override 값으로 덮어쓸 수 있다.
 * PDF 생성 server action 진입 시 loadVetInfo() 를 호출해 캐시를 갱신한다.
 */

export const DEFAULT_VET_INFO = {
  // 한글
  name_ko: '이진원',
  clinic_ko: '로잔동물의료센터',
  address_ko: '대한민국 서울시 관악구 관악로 29길 3, 수안빌딩 1층',

  // 영문
  name_en: 'Jinwon Lee',
  clinic_en: 'Lausanne Veterinary Medical Center',
  address_en: '1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
  /** 주소 1줄 (street) / 2줄 (locality) 분리 */
  address_street_en: '1st floor, 3, Gwanak-ro 29-gil',
  address_locality_en: 'Gwanak-gu, Seoul, Republic of Korea',

  // 연락처
  phone: '02-872-7588',
  phone_intl: '+82-2-872-7588',
  email: 'petmove@naver.com',

  // 면허
  license_no: '9608',
} as const

export type VetInfo = typeof DEFAULT_VET_INFO
export type VetInfoKey = keyof VetInfo

let _cached: VetInfo = DEFAULT_VET_INFO

/** Sync access for PDF mapping code. 항상 즉시 반환. */
export function getVetInfo(): VetInfo {
  return _cached
}

/** Legacy export — 점진적으로 getVetInfo() 로 마이그레이션. */
export const VET_INFO = new Proxy({} as VetInfo, {
  get(_t, key) {
    return (_cached as Record<string, unknown>)[key as string]
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
    const supabase = await createClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
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
  const supabase = await createClient()
  const merged: VetInfo = { ...getVetInfo(), ...patch }
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'company_info', value: merged, updated_at: new Date().toISOString() })
  if (error) {
    console.error('[saveVetInfo] upsert error:', error)
    throw new Error(error.message)
  }
  _cached = { ...DEFAULT_VET_INFO, ...merged }
  return _cached
}
