'use server'

/**
 * 공유 링크 프리셋 — organization_settings 의 'share_link_presets' jsonb 에 배열 저장.
 * 조직 단위, 멤버 모두 공유. CRUD 는 admin 권한 RLS 로 제어 (organization_settings RLS 위임).
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import type { SharePreset } from '@/lib/share-presets-types'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const KEY = 'share_link_presets'

function sanitize(presets: unknown): SharePreset[] {
  if (!Array.isArray(presets)) return []
  const out: SharePreset[] = []
  for (const p of presets) {
    if (!p || typeof p !== 'object') continue
    const obj = p as Record<string, unknown>
    const id = typeof obj.id === 'string' ? obj.id : ''
    const name = typeof obj.name === 'string' ? obj.name.trim() : ''
    const keys = Array.isArray(obj.field_keys)
      ? (obj.field_keys as unknown[]).filter((k): k is string => typeof k === 'string')
      : []
    if (!id || !name) continue
    out.push({ id, name, field_keys: keys })
  }
  return out
}

export async function listSharePresets(): Promise<Result<SharePreset[]>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data, error } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', KEY)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    const presets = sanitize((data?.value as { presets?: unknown } | null)?.presets ?? [])
    return { ok: true, value: presets }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function saveSharePresets(presets: SharePreset[]): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const cleaned = sanitize(presets)
    const { error } = await supabase
      .from('organization_settings')
      .upsert(
        { org_id: orgId, key: KEY, value: { presets: cleaned } },
        { onConflict: 'org_id,key' },
      )
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    revalidatePath('/cases')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
