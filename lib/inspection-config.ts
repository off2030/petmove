/**
 * 검사기관 설정 server-only load/save. client 는 @/lib/inspection-config-defaults 사용.
 */
import {
  DEFAULT_INSPECTION_CONFIG,
  type InspectionConfig,
  type InspectionLabOverride,
} from '@/lib/inspection-config-defaults'

export { DEFAULT_INSPECTION_CONFIG }
export type { InspectionConfig, InspectionLabOverride }

const APP_SETTINGS_KEY = 'inspection_config'

function isValidOverride(o: unknown): o is InspectionLabOverride {
  return !!o && typeof o === 'object'
    && typeof (o as InspectionLabOverride).country === 'string'
    && typeof (o as InspectionLabOverride).lab === 'string'
}

function isValidConfig(v: unknown): v is InspectionConfig {
  if (!v || typeof v !== 'object') return false
  const c = v as Partial<InspectionConfig>
  return typeof c.titerDefault === 'string'
    && typeof c.infectiousDefault === 'string'
    && Array.isArray(c.titerOverrides) && c.titerOverrides.every(isValidOverride)
    && Array.isArray(c.infectiousOverrides) && c.infectiousOverrides.every(isValidOverride)
}

export async function loadInspectionConfig(): Promise<InspectionConfig> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', APP_SETTINGS_KEY)
      .maybeSingle()
    if (data?.value && isValidConfig(data.value)) return data.value
    return DEFAULT_INSPECTION_CONFIG
  } catch {
    return DEFAULT_INSPECTION_CONFIG
  }
}

export async function saveInspectionConfig(config: InspectionConfig): Promise<InspectionConfig> {
  // normalize: trim country, dedup per (country)
  const dedupe = (list: InspectionLabOverride[]) => {
    const seen = new Map<string, InspectionLabOverride>()
    for (const o of list) {
      const country = o.country.trim()
      const lab = o.lab.trim()
      if (!country || !lab) continue
      seen.set(country, { country, lab })
    }
    return Array.from(seen.values())
  }
  const normalized: InspectionConfig = {
    titerDefault: config.titerDefault.trim() || DEFAULT_INSPECTION_CONFIG.titerDefault,
    titerOverrides: dedupe(config.titerOverrides),
    infectiousDefault: config.infectiousDefault.trim() || DEFAULT_INSPECTION_CONFIG.infectiousDefault,
    infectiousOverrides: dedupe(config.infectiousOverrides),
  }
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: APP_SETTINGS_KEY, value: normalized, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return normalized
}
