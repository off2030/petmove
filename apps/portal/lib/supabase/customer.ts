import { randomUUID } from 'crypto'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createAdminClient } from '@petmove/auth'

/**
 * OAuth provider 가 준 프로필 사진 URL 추출.
 * Google/Kakao 는 Supabase 가 user_metadata 에 avatar_url/picture 로 넣어줌.
 * Naver 는 자체 콜백에서 ensureCustomerProfile 에 직접 전달 (opts.avatarUrl).
 */
function extractAvatarUrl(user: User): string | null {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>
  for (const key of ['avatar_url', 'picture', 'profile_image_url', 'profile_image']) {
    const v = m[key]
    if (typeof v === 'string' && /^https:\/\//.test(v)) return v
  }
  return null
}

/**
 * 외부(소셜) 프로필 사진을 user-avatars 버킷에 복사 후 public URL 반환.
 * 외부 URL 은 만료될 수 있고 아바타 저장 관례가 user-avatars 버킷이라 re-host.
 * best-effort — 실패(네트워크·형식·용량)하면 null → 아바타 없이 프로필 생성.
 */
async function rehostAvatarToBucket(
  userId: string,
  externalUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(externalUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) return null

    const admin = createAdminClient()
    const path = `${userId}/${randomUUID()}.jpg`
    const { error: upErr } = await admin.storage
      .from('user-avatars')
      .upload(path, bytes, { contentType, cacheControl: '3600', upsert: false })
    if (upErr) return null
    const { data } = admin.storage.from('user-avatars').getPublicUrl(path)
    return data.publicUrl ?? null
  } catch {
    return null
  }
}

/**
 * 첫 로그인 시 customer_profiles row 가 없으면 보호자 본인 정보로 생성.
 * - email_normalized 는 case 매칭 키 (lower)
 * - display_name 은 OAuth provider 가 제공한 이름 또는 이메일 prefix
 * - avatar_photo_url 은 소셜 프로필 사진을 user-avatars 버킷에 복사 (첫 생성 시에만,
 *   나중에 사용자가 직접 바꾼 아바타는 안 덮음 — 이미 있으면 no-op 이므로)
 *
 * 이 함수는 callback route 에서 session 교환 직후 호출. RLS 의 self_insert
 * 정책으로 본인 user_id row 만 생성 가능.
 */
export async function ensureCustomerProfile(
  supabase: SupabaseClient,
  user: User,
  opts?: { avatarUrl?: string | null },
): Promise<void> {
  // 이미 있으면 no-op
  const { data: existing } = await supabase
    .from('customer_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return

  const email = user.email ?? null
  const emailNormalized = email ? email.toLowerCase() : null
  const metaName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null
  const displayName = metaName ?? (email ? email.split('@')[0] : null)

  // 소셜 프로필 사진 → 보호자 아바타. best-effort: 실패해도 아래 insert 는 진행.
  const externalAvatar = opts?.avatarUrl ?? extractAvatarUrl(user)
  const avatarPhotoUrl = externalAvatar
    ? await rehostAvatarToBucket(user.id, externalAvatar)
    : null

  await supabase.from('customer_profiles').insert({
    user_id: user.id,
    display_name: displayName,
    email_normalized: emailNormalized,
    ...(avatarPhotoUrl ? { avatar_photo_url: avatarPhotoUrl } : {}),
    // phone 은 사용자가 프로파일에서 직접 입력 (OAuth 가 보장 못 함)
  })
}

/**
 * 가입 직후 (또는 customer_profile 생성 직후) 이메일 기준으로 기존 admin 케이스를
 * 자동 링크. cases.data->>email 이 user.email (소문자) 와 일치하는 모든 케이스를
 * case_customer_links 에 본인 user_id 로 INSERT.
 *
 * service role admin 클라이언트 사용 — case_customer_links 의 RLS insert 정책이
 * "is org_member or super_admin" 이라 보호자 본인은 통과 안 됨 (의도된 설계: 보호자가
 * 자기 마음대로 임의 케이스 링크하지 못하게). 자동 매칭은 신뢰된 자동화 경로라 우회.
 *
 * idempotent — 이미 링크된 (case_id, user_id) 는 PK 충돌 무시.
 */
export async function autoLinkCasesByEmail(
  supabaseAdmin: SupabaseClient,
  user: User,
): Promise<{ linked: number }> {
  const email = user.email?.toLowerCase()
  if (!email) return { linked: 0 }

  // cases.data.email 매칭 — apply-case.ts 가 data.email 로 저장.
  const { data: cases } = await supabaseAdmin
    .from('cases')
    .select('id')
    .filter('data->>email', 'eq', email)

  if (!cases?.length) return { linked: 0 }

  // upsert with onConflict — PK (case_id, user_id) 중복 무시
  const rows = cases.map((c) => ({
    case_id: (c as { id: string }).id,
    user_id: user.id,
    linked_via: 'email-match',
  }))

  const { error } = await supabaseAdmin
    .from('case_customer_links')
    .upsert(rows, { onConflict: 'case_id,user_id', ignoreDuplicates: true })

  if (error) {
    // 한 케이스 매칭 실패가 가입 자체를 망치면 안 됨. silent.
    console.warn('[autoLinkCasesByEmail] insert failed:', error.message)
    return { linked: 0 }
  }

  return { linked: rows.length }
}
