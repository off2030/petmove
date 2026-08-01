'use server'
// 펫무브워크 봇 — 시스템 메시지 발신자. 슈퍼 어드민만 프로필 편집 가능.
//
// 봇은 실제 auth.users + profiles 행 한 개로 모델링한다 (이메일=PETMOVE_BOT_EMAIL 고정).
// 일반 1:1 대화의 다른 참가자처럼 자연스럽게 이름·아바타가 표시되도록 하기 위함.
// 비밀번호로 로그인할 일은 없고, ensurePetmoveBot() 이 idempotent 하게 행을 보장한다.

import { revalidatePath } from 'next/cache'
import { createClient } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'
import { PETMOVE_BOT_EMAIL } from '@/lib/petmove-bot-constants'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_super_admin) return { ok: false, error: '권한 없음 (super_admin 전용)' }
  return { ok: true, userId: user.id }
}

/**
 * ensurePetmoveBot 인증 가드 — 'use server' export 가 createAdminClient(RLS 우회)를 쓰므로
 * 자체 검증 필수 (admin CLAUDE.md 규칙 6).
 *
 * 수위 선택: requireSuperAdmin 을 걸면 evaluateAndNotify(system-notifications.ts — 일반 org
 * 멤버가 케이스를 저장할 때마다 실행되는 시스템 알림 경로)가 깨진다. 반대로 로그인만으로는
 * memberships 0 인 계정(invite-only 밖)도 봇 생성이 가능해진다. 따라서
 * '로그인 + (org 멤버십 보유 또는 슈퍼 어드민)' 으로 가드 — 두 호출부(시스템 알림 발송,
 * 설정>시스템 봇 섹션의 생성 버튼) 모두 통과하면서 외부인은 차단.
 */
async function requireMemberOrSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle(),
  ])
  if (!membership && !profile?.is_super_admin) return { ok: false, error: '권한이 없습니다' }
  return { ok: true }
}

/**
 * 봇 사용자가 존재함을 보장하고 ID 반환. idempotent.
 *
 * - 이메일로 lookup: 있으면 그 ID 반환
 * - 없으면 auth.admin.createUser 로 생성 (handle_new_user 트리거가 profile 도 같이 만듦)
 *
 * 호출자는 server action 또는 server-side 코드여야 한다 (admin client 필요).
 * 'use server' export 라 클라이언트가 직접 호출할 수 있으므로 인증 가드를 자체 수행.
 */
export async function ensurePetmoveBot(): Promise<Result<{ userId: string }>> {
  try {
    const gate = await requireMemberOrSuperAdmin()
    if (!gate.ok) return gate
    const admin = createAdminClient()
    // 1) 이메일로 기존 봇 조회 — profiles 가 가장 직접적.
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('email', PETMOVE_BOT_EMAIL)
      .maybeSingle()
    if (existing) return { ok: true, value: { userId: existing.id as string } }

    // 2) 없으면 auth admin API 로 생성 (handle_new_user 트리거가 profiles 행 자동 생성).
    // 비밀번호는 랜덤 — 직접 로그인 안 함.
    const password = `bot-${crypto.randomUUID()}`
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: PETMOVE_BOT_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: '펫무브워크' },
    })
    if (createErr || !created.user) return { ok: false, error: createErr?.message ?? '봇 생성 실패' }
    const botId = created.user.id

    // 트리거가 profile 을 만들면서 name 을 email 로 채우는 케이스가 있어 한 번 더 보정.
    await admin
      .from('profiles')
      .update({ name: '펫무브워크' })
      .eq('id', botId)

    return { ok: true, value: { userId: botId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '알 수 없는 오류' }
  }
}

export interface PetmoveBotProfile {
  user_id: string
  name: string
  avatar_url: string | null
  exists: boolean
}

/**
 * 봇 프로필 조회. 슈퍼 어드민 전용.
 * 봇이 아직 없으면 `exists: false` — UI 가 생성 버튼을 노출.
 */
export async function getPetmoveBotProfile(): Promise<Result<PetmoveBotProfile>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('email', PETMOVE_BOT_EMAIL)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) {
    return { ok: true, value: { user_id: '', name: '펫무브워크', avatar_url: null, exists: false } }
  }
  return {
    ok: true,
    value: {
      user_id: data.id as string,
      name: (data.name as string | null) ?? '펫무브워크',
      avatar_url: (data.avatar_url as string | null) ?? null,
      exists: true,
    },
  }
}

/**
 * 봇 프로필 업데이트. 슈퍼 어드민 전용. 봇이 없으면 먼저 생성.
 * `name` 빈 문자열은 거절 (사용자에게 표시할 이름이 사라짐).
 */
export async function updatePetmoveBotProfile(input: {
  name?: string
  avatar_url?: string | null
}): Promise<Result<PetmoveBotProfile>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate

  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    if (!trimmed) return { ok: false, error: '이름은 비울 수 없습니다' }
    if (trimmed.length > 50) return { ok: false, error: '이름은 50자 이하' }
  }

  const ensured = await ensurePetmoveBot()
  if (!ensured.ok) return ensured
  const botId = ensured.value.userId

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url || null

  if (Object.keys(patch).length > 0) {
    const admin = createAdminClient()
    const { error } = await admin.from('profiles').update(patch).eq('id', botId)
    if (error) return { ok: false, error: error.message }
    // Dashboard layout 이 prefetch 한 conversations 의 봇 participant.name/avatar 를
    // 다음 요청부터 갱신 — 메시지 모듈, 헤더 등 모든 곳에 반영.
    revalidatePath('/', 'layout')
  }

  return getPetmoveBotProfile()
}

/**
 * 봇 아바타 이미지 업로드. FormData 의 'file' 필드에 이미 클라이언트에서 정사각 512px JPEG 로
 * 리사이즈된 Blob 이 들어 있어야 한다.
 *
 * user-avatars 버킷 RLS 는 첫 폴더 = auth.uid() 만 허용해 슈퍼 어드민이 봇 폴더에
 * 직접 쓸 수 없다. admin client 로 우회.
 */
export async function uploadPetmoveBotAvatar(formData: FormData): Promise<Result<PetmoveBotProfile>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate

  const file = formData.get('file')
  if (!(file instanceof Blob)) return { ok: false, error: '파일이 없습니다' }
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: '파일이 너무 큽니다 (최대 5MB)' }

  const ensured = await ensurePetmoveBot()
  if (!ensured.ok) return ensured
  const botId = ensured.value.userId

  const admin = createAdminClient()

  // 기존 아바타 경로 추출 — 업로드 성공 후 정리.
  const { data: prev } = await admin
    .from('profiles')
    .select('avatar_url')
    .eq('id', botId)
    .maybeSingle()
  const oldUrl = (prev?.avatar_url as string | null) ?? null

  const path = `${botId}/${crypto.randomUUID()}.jpg`
  const buffer = await file.arrayBuffer()
  const { error: upErr } = await admin.storage
    .from('user-avatars')
    .upload(path, buffer, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' })
  if (upErr) return { ok: false, error: `업로드 실패: ${upErr.message}` }

  const { data: pub } = admin.storage.from('user-avatars').getPublicUrl(path)
  const publicUrl = pub.publicUrl

  const { error: updErr } = await admin
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', botId)
  if (updErr) {
    await admin.storage.from('user-avatars').remove([path])
    return { ok: false, error: updErr.message }
  }

  if (oldUrl) {
    const oldPath = oldUrl.split('/user-avatars/')[1]
    if (oldPath) await admin.storage.from('user-avatars').remove([oldPath])
  }

  revalidatePath('/', 'layout')
  return getPetmoveBotProfile()
}

/** 봇 아바타 제거. 슈퍼 어드민 전용. */
export async function removePetmoveBotAvatar(): Promise<Result<PetmoveBotProfile>> {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate

  const admin = createAdminClient()
  const { data: prev } = await admin
    .from('profiles')
    .select('id, avatar_url')
    .eq('email', PETMOVE_BOT_EMAIL)
    .maybeSingle()
  if (!prev) return { ok: false, error: '봇이 없습니다' }
  const botId = prev.id as string
  const oldUrl = (prev.avatar_url as string | null) ?? null

  const { error } = await admin.from('profiles').update({ avatar_url: null }).eq('id', botId)
  if (error) return { ok: false, error: error.message }

  if (oldUrl) {
    const oldPath = oldUrl.split('/user-avatars/')[1]
    if (oldPath) await admin.storage.from('user-avatars').remove([oldPath])
  }

  revalidatePath('/', 'layout')
  return getPetmoveBotProfile()
}
