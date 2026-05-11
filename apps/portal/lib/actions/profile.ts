'use server'

/**
 * Portal 보호자 본인 프로파일 조회·수정 server actions.
 *
 * 인증된 createClient 사용 — customer_profiles 의 self_select/self_update RLS 정책이
 * auth.uid() = user_id 행만 통과시킴. service role 우회 없음.
 *
 * 사용자가 직접 입력하는 필드 (phone, display_name, preferred_language, marketing_opt_in) 만
 * 갱신 허용. email_normalized 는 OAuth 정보라 자동 — 사용자 입력 X. 약관 동의 timestamp
 * (terms_accepted_at, privacy_accepted_at) 는 가입 흐름에서만 설정.
 */

import { createClient } from '@petmove/auth/server'
import { revalidatePath } from 'next/cache'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface CustomerProfileRow {
  user_id: string
  display_name: string | null
  phone: string | null
  email_normalized: string | null
  preferred_language: string
  marketing_opt_in: boolean
  terms_accepted_at: string | null
  privacy_accepted_at: string | null
  created_at: string
  updated_at: string
}

export async function getMyProfile(): Promise<Result<CustomerProfileRow | null>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { data, error } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data as CustomerProfileRow | null) ?? null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export interface UpdateProfileInput {
  display_name?: string | null
  /** digits-only 정규화는 호출 측 — 여기는 원문 그대로 저장 */
  phone?: string | null
  preferred_language?: 'ko' | 'en' | 'ja' | 'zh'
  marketing_opt_in?: boolean
}

export async function updateMyProfile(
  input: UpdateProfileInput,
): Promise<Result<CustomerProfileRow>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    // 빈 객체 호출은 no-op
    const patch: Record<string, unknown> = {}
    if (input.display_name !== undefined) patch.display_name = input.display_name?.trim() || null
    if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
    if (input.preferred_language !== undefined) patch.preferred_language = input.preferred_language
    if (input.marketing_opt_in !== undefined) patch.marketing_opt_in = input.marketing_opt_in

    if (Object.keys(patch).length === 0) {
      return getMyProfile() as Promise<Result<CustomerProfileRow>>
    }

    const { data, error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: '프로파일을 찾을 수 없습니다' }

    revalidatePath('/profile')
    return { ok: true, value: data as CustomerProfileRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 사용자가 phone 을 처음 입력했을 때 — 그 phone 으로 추가 case 자동 매칭.
 * email 매칭은 가입 시점 callback 에서 처리되지만 phone 은 사용자가 나중에 입력하므로
 * 별도 트리거.
 *
 * service role 우회 — case_customer_links insert 가 org_member 만 허용이라 (보호자 본인은
 * 임의 케이스 링크 못 함). 자동 매칭은 신뢰된 자동화 경로.
 */
export async function autoLinkCasesByPhone(): Promise<Result<{ linked: number }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('phone')
      .eq('user_id', user.id)
      .maybeSingle()
    const phone = (profile as { phone?: string | null } | null)?.phone
    if (!phone) return { ok: true, value: { linked: 0 } }

    // service role 로 cross-table insert
    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()
    const { data: cases } = await admin
      .from('cases')
      .select('id')
      .filter('data->>phone', 'eq', phone)
    if (!cases?.length) return { ok: true, value: { linked: 0 } }

    const rows = cases.map((c) => ({
      case_id: (c as { id: string }).id,
      user_id: user.id,
      linked_via: 'phone-match',
    }))
    const { error } = await admin
      .from('case_customer_links')
      .upsert(rows, { onConflict: 'case_id,user_id', ignoreDuplicates: true })
    if (error) return { ok: false, error: error.message }

    revalidatePath('/cases')
    return { ok: true, value: { linked: rows.length } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
