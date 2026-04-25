'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface MyProfile {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  provider: string | null
}

export async function getMyProfile(): Promise<MyProfile | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('profiles')
      .select('id, email, name, avatar_url, provider')
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

export async function updateMyProfile(patch: { name?: string | null }): Promise<
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

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('id, email, name, avatar_url, provider')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: '프로필을 찾을 수 없습니다.' }
    revalidatePath('/settings')
    return { ok: true, profile: data as MyProfile }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
