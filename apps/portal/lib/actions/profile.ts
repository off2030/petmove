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
import { createAdminClient } from '@petmove/auth'
import { createClient, getCurrentUser } from '@petmove/auth/server'
import type { CaseRow } from '@petmove/domain'
import { revalidatePath } from 'next/cache'
import { AVATAR_COLOR_IDS } from '@/lib/avatar'
import { autoLinkCasesByEmail, ensureCustomerProfile } from '@/lib/supabase/customer'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface CustomerProfileRow {
  user_id: string
  display_name: string | null
  phone: string | null
  email_normalized: string | null
  /** 보호자 연락처 — profile 이 권위 소유, 편집 시 모든 연결 케이스로 전파. (display_name=이름, phone=전화 재사용) */
  name_first_en: string | null
  name_last_en: string | null
  /** 연락용 이메일 — 로그인 이메일(email_normalized)과 구분. /me/guardian 에서 직접 편집. */
  contact_email: string | null
  address_kr: string | null
  address_detail_kr: string | null
  address_zipcode: string | null
  address_en: string | null
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
  /** 자기책임 모드 — 입력불가 차단 해제 + 주의/경고 숨김(안내는 유지). 설정>고급. 기본 false. */
  free_input_mode: boolean
  /** 일정 탭 단계 정적 설명문 숨김(상태 안내는 유지). 설정>고급. 기본 false. */
  hide_step_descriptions: boolean
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

/**
 * 프로필 행을 보장 — 없으면 생성 후 반환.
 *
 * Apple 로그인은 signInWithIdToken 으로 세션을 client 에서 잡고 바로 navigate 하므로
 * /auth/callback 을 거치지 않는다 → 거기서 하던 ensureCustomerProfile 이 호출되지 않아
 * 보호자 프로필 행이 아예 없다. 그 결과 updateMyProfile(색상·토글)은 행을 못 찾고
 * ("프로파일을 찾을 수 없습니다"), 아바타 업로드는 userId(profile.user_id) 가 비어
 * 스토리지 RLS 에 막힌다("new row violates row-level security policy").
 *
 * authed 레이아웃이 진입마다 이 함수로 프로필을 읽어, 누락 시 즉시 자가 생성한다(이미 있으면
 * select 1회로 no-op). 기존에 Apple 로 로그인해 둔 세션도 다음 진입에 자동 복구된다.
 */
export async function ensureMyProfile(): Promise<Result<CustomerProfileRow | null>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing) return { ok: true, value: existing as CustomerProfileRow }

    // 누락 — /auth/callback 과 동일하게 생성. self_insert RLS(auth.uid()=user_id)로 통과.
    const { created } = await ensureCustomerProfile(supabase, user).catch(() => ({ created: false }))
    if (created) {
      // 이메일 일치 기존 케이스 자동 링크(서비스롤 우회) — /auth/callback 과 동일. best-effort.
      try {
        await autoLinkCasesByEmail(createAdminClient(), user)
      } catch {
        /* best-effort */
      }
    }
    const { data } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
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
  /** 설정>고급 — 자기책임 모드 / 설명문 숨김. */
  free_input_mode?: boolean
  hide_step_descriptions?: boolean
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
    if (input.free_input_mode !== undefined) patch.free_input_mode = input.free_input_mode
    if (input.hide_step_descriptions !== undefined)
      patch.hide_step_descriptions = input.hide_step_descriptions

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

/** /me/guardian 편집 입력 — 보호자 연락처(profile 권위 소유). 모두 trim/검증은 서버에서. */
export interface GuardianContactInput {
  /** 이름(한글) — display_name 으로 저장. */
  display_name: string
  name_first_en: string
  name_last_en: string
  phone: string
  contact_email: string
  /** 도로명+상세 합본 (admin pdf splitKrAddress 가정과 동일 형식). */
  address_kr: string
  address_detail_kr: string
  address_zipcode: string
  address_en: string
}

/** 보호자 연락처를 각 케이스 row 로 materialize — 동물 고유 필드는 보존하고 보호자 칸만 덮는다. */
function applyGuardianToCase(input: GuardianContactInput, prevData: Record<string, unknown>) {
  const firstEn = input.name_first_en.trim()
  const lastEn = input.name_last_en.trim()
  const nameEnColumn = [firstEn, lastEn].filter(Boolean).join(' ').trim() || null
  const data = { ...prevData }
  const setOrDel = (key: string, v: string) => {
    if (v) data[key] = v
    else delete data[key]
  }
  // 영문 성·이름 분리 저장 (readForm·admin pdf-fill 권위 소스).
  setOrDel('customer_first_name_en', firstEn)
  setOrDel('customer_last_name_en', lastEn)
  setOrDel('phone', input.phone.trim())
  // A안: 연락 이메일은 cases.data.email(소유권 매칭키)에 전파하지 않는다. 매칭키를
  // 고객이 건드리면 추가 전용 트리거(20260627000001)에서 "남의 로그인 이메일로 바꿔
  // 타인 자동 링크" 누수가 생기고, 본인 소유권도 흔들린다. contact_email 은
  // customer_profiles 에만 저장(updateGuardianContact). 매칭키는 가입/케이스 생성 시점 고정.
  setOrDel('address_kr', input.address_kr.trim())
  setOrDel('address_detail_kr', input.address_detail_kr.trim())
  setOrDel('address_zipcode', input.address_zipcode.trim())
  setOrDel('address_en', input.address_en.trim())
  return {
    customer_name: input.display_name.trim() || null,
    customer_name_en: nameEnColumn,
    data,
  }
}

/**
 * 보호자 연락처 저장 — profile(권위) + 연결된 **모든** 케이스로 전파.
 *
 * 그동안 /me/guardian 이 primary 케이스 하나만 갱신해, 동물이 여러 마리면 한 마리만
 * 바뀌던 버그를 고친다. profile 은 RLS(self_update)로, 케이스는 admin client 로 쓴다
 * (cases_update 는 org 멤버만 허용 — link 확인 후 우회). 동물 고유 필드는 보존.
 */
export async function updateGuardianContact(
  input: GuardianContactInput,
): Promise<Result<{ profile: CustomerProfileRow; cases: CaseRow[] }>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    // 검증 — use-case-edit-form/updateCaseInfoFields 와 동일 규칙.
    const phone = input.phone.replace(/\D/g, '')
    if (phone && !/^010\d{8}$/.test(phone)) {
      return { ok: false, error: '전화번호는 010-XXXX-XXXX 형식으로 입력하세요.' }
    }
    const email = input.contact_email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: '이메일 형식이 올바르지 않습니다.' }
    }
    const normalized: GuardianContactInput = { ...input, phone, contact_email: email }

    const supabase = await createClient()

    // 1) profile 갱신 (권위 소유) — self_update RLS.
    const { data: prof, error: profErr } = await supabase
      .from('customer_profiles')
      .update({
        display_name: normalized.display_name.trim() || null,
        name_first_en: normalized.name_first_en.trim() || null,
        name_last_en: normalized.name_last_en.trim() || null,
        phone: phone || null,
        contact_email: email || null,
        address_kr: normalized.address_kr.trim() || null,
        address_detail_kr: normalized.address_detail_kr.trim() || null,
        address_zipcode: normalized.address_zipcode.trim() || null,
        address_en: normalized.address_en.trim() || null,
      })
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle()
    if (profErr) return { ok: false, error: profErr.message }
    if (!prof) return { ok: false, error: '프로파일을 찾을 수 없습니다' }

    // 2) 연결된 모든 케이스로 전파 — link 는 RLS 로 조회, 쓰기는 admin(cases_update org 전용 우회).
    const { data: linked, error: linkErr } = await supabase
      .from('cases')
      .select('*, case_customer_links!inner(user_id)')
      .eq('case_customer_links.user_id', user.id)
      .is('deleted_at', null)
    if (linkErr) return { ok: false, error: linkErr.message }

    const admin = createAdminClient()
    const updated: CaseRow[] = []
    for (const raw of linked ?? []) {
      const { case_customer_links: _l, ...rest } = raw as Record<string, unknown>
      const row = rest as unknown as CaseRow
      const patch = applyGuardianToCase(normalized, (row.data ?? {}) as Record<string, unknown>)
      const { data: u, error: upErr } = await admin
        .from('cases')
        .update(patch)
        .eq('id', row.id)
        .select('*')
        .single()
      if (upErr) return { ok: false, error: upErr.message }
      updated.push(u as CaseRow)
    }

    revalidatePath('/me')
    return { ok: true, value: { profile: prof as CustomerProfileRow, cases: updated } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 자기책임 모드(free_input_mode) 여부 — 서버 액션의 도메인 차단 우회 판정용.
 * client getSaveBlockError 가 free 모드에서 통과시킨 저장이 server 도메인 차단(광견병
 * 1·2차 순서·귀국편 순서 등)에 다시 막히지 않도록, 차단 직전에만 lazy 로 조회한다.
 * 형식·필드키 검증은 free 모드여도 유지(데이터 파싱 가능성 보존) — 여기선 도메인 차단만.
 */
export async function isFreeInputMode(): Promise<boolean> {
  try {
    const user = await getCurrentUser()
    if (!user) return false
    const supabase = await createClient()
    const { data } = await supabase
      .from('customer_profiles')
      .select('free_input_mode')
      .eq('user_id', user.id)
      .maybeSingle()
    return (data as { free_input_mode?: boolean } | null)?.free_input_mode === true
  } catch {
    return false
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
