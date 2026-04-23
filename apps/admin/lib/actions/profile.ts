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
