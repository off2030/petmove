'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface MyProfile {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  provider: string | null
  dm_visible: boolean
}

export async function getMyProfile(): Promise<MyProfile | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('profiles')
      .select('id, email, name, avatar_url, provider, dm_visible')
      .eq('id', user.id)
      .maybeSingle()
    if (!data) return null
    return data as MyProfile
  } catch {
    return null
  }
}

/**
 * 비밀번호 설정 — magic link 가입자가 처음 비번 설정.
 * supabase.auth.updateUser 후 profiles.password_set=true 마킹.
 */
export async function setMyPassword(password: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  try {
    if (!password || password.length < 8) {
      return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' }
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '로그인이 필요합니다.' }

    const { error: updErr } = await supabase.auth.updateUser({ password })
    if (updErr) return { ok: false, error: updErr.message }

    const { error: profErr } = await supabase
      .from('profiles')
      .update({ password_set: true, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (profErr) return { ok: false, error: profErr.message }

    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * OAuth 가입 시 박힌 외부 avatar_url(Google/Kakao/Naver CDN)을 우리 user-avatars 버킷으로 이전.
 * 이미 우리 버킷이면 no-op. 외부 fetch 실패 시 avatar_url 을 null 로 정리해 무한 재시도 방지.
 * 멱등 — DashboardShell 마운트 시 fire-and-forget 으로 호출됨.
 */
export async function migrateMyOAuthAvatar(): Promise<
  | { ok: true; avatar_url: string | null; migrated: boolean }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '로그인이 필요합니다.' }

    const { data: prof } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
    const current = (prof?.avatar_url as string | null) ?? null
    if (!current) return { ok: true, avatar_url: null, migrated: false }
    // 이미 우리 버킷 — 작업 없음
    if (current.includes('/storage/v1/object/public/user-avatars/')) {
      return { ok: true, avatar_url: current, migrated: false }
    }

    // 외부 URL fetch
    let buffer: ArrayBuffer
    let contentType = 'image/jpeg'
    try {
      const r = await fetch(current, { redirect: 'follow' })
      if (!r.ok) {
        await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
        return { ok: true, avatar_url: null, migrated: false }
      }
      buffer = await r.arrayBuffer()
      const ct = r.headers.get('content-type')
      if (ct && ct.startsWith('image/')) contentType = ct.split(';')[0].trim()
    } catch {
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
      return { ok: true, avatar_url: null, migrated: false }
    }

    const ext = contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage
      .from('user-avatars')
      .upload(path, buffer, { contentType, upsert: false, cacheControl: '3600' })
    if (up.error) return { ok: false, error: up.error.message }

    const { data: pub } = supabase.storage.from('user-avatars').getPublicUrl(path)
    const newUrl = pub.publicUrl

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: newUrl, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (updErr) {
      await supabase.storage.from('user-avatars').remove([path])
      return { ok: false, error: updErr.message }
    }
    revalidatePath('/', 'layout')
    return { ok: true, avatar_url: newUrl, migrated: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateMyProfile(patch: {
  name?: string | null
  avatar_url?: string | null
}): Promise<
  | { ok: true; profile: MyProfile }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '로그인이 필요합니다.' }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.name !== undefined) {
      const trimmed = (patch.name ?? '').trim()
      update.name = trimmed === '' ? null : trimmed
    }
    if (patch.avatar_url !== undefined) {
      update.avatar_url = patch.avatar_url
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('id, email, name, avatar_url, provider, dm_visible')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: '프로필을 찾을 수 없습니다.' }
    revalidatePath('/settings')
    revalidatePath('/messages')
    return { ok: true, profile: data as MyProfile }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
