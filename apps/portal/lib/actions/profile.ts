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

import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@petmove/auth/server'
import { revalidatePath } from 'next/cache'
import { AVATAR_COLOR_IDS } from '@/lib/avatar'

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
  /** 아바타 — 우선순위: avatar_photo_url > avatar_emoji+color > 기본(이니셜). */
  avatar_emoji: string | null
  avatar_color: string | null
  avatar_photo_url: string | null
  /** 회원 탈퇴 요청 시각. NULL = 활성, 값 있으면 +7일 후 cron 이 hard delete + 케이스 익명화. */
  deletion_scheduled_at: string | null
  created_at: string
  updated_at: string
}

export async function getMyProfile(): Promise<Result<CustomerProfileRow | null>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()

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
  /** 아바타 — null 로 보내면 reset. 색은 화이트리스트 검증, photo_url 은 도메인 검증. */
  avatar_color?: string | null
  avatar_photo_url?: string | null
}

// 화이트리스트 — 단일 출처(lib/avatar.ts)에서 import.
const ALLOWED_AVATAR_COLORS = new Set<string>(AVATAR_COLOR_IDS)

export async function updateMyProfile(
  input: UpdateProfileInput,
): Promise<Result<CustomerProfileRow>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()

    // 빈 객체 호출은 no-op
    const patch: Record<string, unknown> = {}
    if (input.display_name !== undefined) patch.display_name = input.display_name?.trim() || null
    if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
    if (input.preferred_language !== undefined) patch.preferred_language = input.preferred_language
    if (input.marketing_opt_in !== undefined) patch.marketing_opt_in = input.marketing_opt_in
    if (input.avatar_color !== undefined) {
      if (input.avatar_color && !ALLOWED_AVATAR_COLORS.has(input.avatar_color)) {
        return { ok: false, error: '허용되지 않은 아바타 색상입니다.' }
      }
      patch.avatar_color = input.avatar_color || null
    }
    if (input.avatar_photo_url !== undefined) {
      // user-avatars bucket 의 supabase URL 만 허용 — 외부 도메인 차단.
      const url = input.avatar_photo_url?.trim() || null
      if (url && !/\/storage\/v1\/object\/public\/user-avatars\//.test(url)) {
        return { ok: false, error: '허용되지 않은 사진 경로입니다.' }
      }
      patch.avatar_photo_url = url
    }

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

    revalidatePath('/me')
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
/**
 * 로그아웃 — 세션 종료 후 /login 으로 이동.
 *
 * server action 형태라 form action 으로 호출 가능 (`<form action={signOut}>`).
 * supabase.auth.signOut() 가 cookie 를 비우면 다음 요청부터 proxy.ts 가 미인증으로 인식.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  try {
    await supabase.auth.signOut()
  } catch {
    /* 이미 만료된 토큰이어도 cookie 정리는 진행 */
  }
  redirect('/login')
}

/**
 * 회원 탈퇴 요청 — customer_profiles.deletion_scheduled_at 에 현재 시각 기록.
 *
 * 유예 기간(요청 시각 +7일) 동안 cancelAccountDeletion 으로 취소 가능. 유예 종료
 * 후 cron 이 auth.users DELETE (cascade 로 customer_profiles + case_customer_links
 * 함께 삭제) + cases.customer_name / data.email / data.phone 익명화.
 *
 * 정책 근거: docs/legal/privacy.md §4 회원 탈퇴 및 정보 삭제.
 */
export async function requestAccountDeletion(): Promise<Result<{ scheduledAt: string }>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('customer_profiles')
      .update({ deletion_scheduled_at: now })
      .eq('user_id', user.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    revalidatePath('/settings/account-delete')
    return { ok: true, value: { scheduledAt: now } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 탈퇴 요청 취소 — deletion_scheduled_at = NULL. 유예 종료 전까지만 의미 있음. */
export async function cancelAccountDeletion(): Promise<Result<true>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()
    const { error } = await supabase
      .from('customer_profiles')
      .update({ deletion_scheduled_at: null })
      .eq('user_id', user.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    revalidatePath('/settings/account-delete')
    return { ok: true, value: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
