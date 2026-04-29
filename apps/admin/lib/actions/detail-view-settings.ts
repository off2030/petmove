'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import {
  DETAIL_VIEW_DEFAULTS,
  type DetailViewSettings,
} from '@/lib/detail-view-settings-types'

const SETTINGS_KEY = 'detail_view_display_mode'

function normalize(raw: unknown): DetailViewSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    species_bilingual: o.species_bilingual === true,
    breed_bilingual: o.breed_bilingual === true,
    color_bilingual: o.color_bilingual === true,
    sex_bilingual: o.sex_bilingual === true,
  }
}

export async function getDetailViewSettings(): Promise<DetailViewSettings> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', SETTINGS_KEY)
      .maybeSingle()
    return normalize(data?.value)
  } catch {
    return { ...DETAIL_VIEW_DEFAULTS }
  }
}

export async function updateDetailViewSettings(
  patch: Partial<DetailViewSettings>,
): Promise<{ ok: true; settings: DetailViewSettings } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const current = await getDetailViewSettings()
    const next: DetailViewSettings = { ...current, ...patch }
    const { error } = await supabase.from('organization_settings').upsert(
      {
        org_id: orgId,
        key: SETTINGS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,key' },
    )
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    revalidatePath('/')
    return { ok: true, settings: next }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
