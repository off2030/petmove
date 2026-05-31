/**
 * 사용자(로그인 멤버) 개인 담당자 정보.
 *
 * profiles.contact_info (jsonb) 에 저장. 한 조직에 멤버가 여럿일 때 각자 본인의
 * 이름·휴대폰·면허번호 를 따로 보관 — cert PDF 발급 시점에 본인 정보로 채워지도록.
 *
 * 회사·병원 공유 정보 (주소·우편번호·이메일 등) 는 organization_settings.company_info
 * 에 그대로 — UserContactInfo 는 발급자 본인 식별 정보만 담는다.
 *
 * vet-info.ts 의 loadVetInfo() 가 org info 를 base 로 하고 그 위에 본 user contact
 * info 를 overlay (org_type 에 따라 hospital 키 vs transport 키로 매핑).
 */

import 'server-only'

export interface UserContactInfo {
  // ── 동물병원(수의사) 발급자 ──
  /** 한글 이름 — 수의사 */
  name_ko: string
  /** 영문 이름 (First) */
  name_first_en: string
  /** 영문 성 (Last) */
  name_last_en: string
  /** 합성 영문명 — name_first_en + name_last_en, save 시 자동 갱신 */
  name_en: string
  /** 휴대폰 (한국 형식, 자동 정규화는 settings 페이지에서) */
  mobile_phone: string
  /** 수의사 면허번호 — hospital org 에서만 의미 */
  license_no: string

  // ── 운송회사(담당자) 발급자 — 수의사와 완전 독립(따로 입력·삭제) ──
  /** 한글 이름 — 운송 담당자 */
  transport_name_ko: string
  /** 담당자 영문 이름 (First) */
  transport_name_first_en: string
  /** 담당자 영문 성 (Last) */
  transport_name_last_en: string
  /** 합성 영문명 — transport_name_first_en + transport_name_last_en */
  transport_name_en: string
  /** 담당자 휴대폰 */
  transport_mobile_phone: string
}

export const DEFAULT_USER_CONTACT_INFO: UserContactInfo = {
  name_ko: '',
  name_first_en: '',
  name_last_en: '',
  name_en: '',
  mobile_phone: '',
  license_no: '',
  transport_name_ko: '',
  transport_name_first_en: '',
  transport_name_last_en: '',
  transport_name_en: '',
  transport_mobile_phone: '',
}

/** 단순 string 키 — settings 페이지 input 매핑용. */
export type UserContactKey = keyof UserContactInfo

let _cached: { userId: string; info: UserContactInfo } | null = null

/**
 * 로그인 사용자의 contact_info 를 읽어 정규화. 비로그인·실패 시 DEFAULT 반환.
 *
 * NOTE: module-level _cached 는 saveVetInfo wipe 사고와 동일한 위험 — 그래서 본 함수
 * 의 캐시는 userId scope 로 한정하고, save 경로에서는 절대 _cached 를 base 로 merge
 * 하지 않는다 (saveUserContactInfo 가 항상 DB 직접 read).
 */
export async function loadUserContactInfo(): Promise<UserContactInfo> {
  try {
    const { createClient } = await import('@petmove/auth/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      _cached = null
      return DEFAULT_USER_CONTACT_INFO
    }
    const { data } = await supabase
      .from('profiles')
      .select('contact_info')
      .eq('id', user.id)
      .maybeSingle()
    const override = (data?.contact_info as Partial<UserContactInfo> | null) ?? {}
    const info = { ...DEFAULT_USER_CONTACT_INFO, ...override }
    _cached = { userId: user.id, info }
    return info
  } catch {
    _cached = null
    return DEFAULT_USER_CONTACT_INFO
  }
}

/**
 * 부분 업데이트. merge base 는 DB 현재 값 (saveVetInfo 와 동일 패턴 — 캐시 wipe
 * 사고 방지).
 */
export async function saveUserContactInfo(patch: Partial<UserContactInfo>): Promise<UserContactInfo> {
  const { createClient } = await import('@petmove/auth/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { data: existingRow } = await supabase
    .from('profiles')
    .select('contact_info')
    .eq('id', user.id)
    .maybeSingle()
  const existing = (existingRow?.contact_info as Partial<UserContactInfo> | null) ?? {}
  const merged: UserContactInfo = { ...DEFAULT_USER_CONTACT_INFO, ...existing, ...patch }
  const { error } = await supabase
    .from('profiles')
    .update({ contact_info: merged, updated_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) {
    console.error('[saveUserContactInfo] update error:', error)
    throw new Error(error.message)
  }
  _cached = { userId: user.id, info: merged }
  return merged
}
