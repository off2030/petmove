/**
 * 검사기관 설정 server-only load/save. client 는 @petmove/domain 사용.
 */
import {
  DEFAULT_INSPECTION_CONFIG,
  type InspectionConfig,
  type InspectionLabOption,
  type InspectionLabRule,
} from '@petmove/domain'

export { DEFAULT_INSPECTION_CONFIG }
export type { InspectionConfig, InspectionLabOption, InspectionLabRule }

const APP_SETTINGS_KEY = 'inspection_config'

/** 단일 규칙 정규화. 신·구 포맷 모두 수용. 유효하지 않으면 null. */
function normalizeRule(o: unknown): InspectionLabRule | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>

  // 신 포맷: { label?, countries: string[], labs: string[] }
  if (Array.isArray(r.countries) && Array.isArray(r.labs)) {
    const countries = r.countries
      .filter((x): x is string => typeof x === 'string')
      .map(x => x.trim())
      .filter(Boolean)
    const labs = r.labs
      .filter((x): x is string => typeof x === 'string')
      .map(x => x.trim())
      .filter(Boolean)
    if (countries.length === 0 || labs.length === 0) return null
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : undefined
    // 중복 제거
    const dedupCountries = Array.from(new Set(countries))
    const dedupLabs = Array.from(new Set(labs))
    return label ? { label, countries: dedupCountries, labs: dedupLabs } : { countries: dedupCountries, labs: dedupLabs }
  }

  // 구 포맷: { country: string, lab: string }
  if (typeof r.country === 'string' && typeof r.lab === 'string') {
    const country = r.country.trim()
    const lab = r.lab.trim()
    if (!country || !lab) return null
    return { countries: [country], labs: [lab] }
  }

  return null
}

function normalizeRules(raw: unknown): InspectionLabRule[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeRule).filter((r): r is InspectionLabRule => r !== null)
}

function normalizeLabOption(o: unknown): InspectionLabOption | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const value = typeof r.value === 'string' ? r.value.trim() : ''
  const label = typeof r.label === 'string' ? r.label.trim() : ''
  if (!value || !label) return null
  return { value, label }
}

function normalizeLabOptions(raw: unknown): InspectionLabOption[] {
  if (!Array.isArray(raw)) return []
  const out: InspectionLabOption[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const opt = normalizeLabOption(item)
    if (opt && !seen.has(opt.value)) {
      seen.add(opt.value)
      out.push(opt)
    }
  }
  return out
}

function normalize(raw: unknown): InspectionConfig {
  const src = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
  const titerDefault = typeof src.titerDefault === 'string' && src.titerDefault.trim()
    ? src.titerDefault.trim()
    : DEFAULT_INSPECTION_CONFIG.titerDefault
  // 구 포맷 키(titerOverrides/infectiousOverrides)도 수용
  const titerRaw = Array.isArray(src.titerRules) ? src.titerRules
    : Array.isArray(src.titerOverrides) ? src.titerOverrides : []
  const infectiousRaw = Array.isArray(src.infectiousRules) ? src.infectiousRules
    : Array.isArray(src.infectiousOverrides) ? src.infectiousOverrides : []
  const customTiterLabs = normalizeLabOptions(src.customTiterLabs)
  const customInfectiousLabs = normalizeLabOptions(src.customInfectiousLabs)
  return {
    titerDefault,
    titerRules: normalizeRules(titerRaw),
    infectiousRules: normalizeRules(infectiousRaw),
    ...(customTiterLabs.length > 0 ? { customTiterLabs } : {}),
    ...(customInfectiousLabs.length > 0 ? { customInfectiousLabs } : {}),
  }
}

export async function loadInspectionConfig(): Promise<InspectionConfig> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const { getActiveOrgId } = await import('@/lib/supabase/active-org')
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', APP_SETTINGS_KEY)
      .maybeSingle()
    if (data?.value) return normalize(data.value)
    return DEFAULT_INSPECTION_CONFIG
  } catch {
    return DEFAULT_INSPECTION_CONFIG
  }
}

export async function saveInspectionConfig(config: InspectionConfig): Promise<InspectionConfig> {
  const normalized = normalize(config)
  const { createClient } = await import('@/lib/supabase/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, key: APP_SETTINGS_KEY, value: normalized, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return normalized
}
