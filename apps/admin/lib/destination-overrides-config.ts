/**
 * 조직별 커스텀 목적지 설정 server-only load/save.
 * organization_settings 테이블에 key='destination_overrides' 로 저장.
 */
import {
  EMPTY_DESTINATION_OVERRIDES,
  ALL_VACCINE_KEYS,
  ALL_EXTRA_FIELD_KEYS,
  type CustomDestination,
  type DestinationOverridesConfig,
  type DestinationVaccineEntry,
  type DestinationExtraFieldEntry,
  type SpeciesFilter,
} from '@petmove/domain'

const APP_SETTINGS_KEY = 'destination_overrides'

const VACCINE_KEY_SET = new Set<string>(ALL_VACCINE_KEYS)
const EXTRA_FIELD_KEY_SET = new Set<string>(ALL_EXTRA_FIELD_KEYS)

function normalizeVaccineEntry(o: unknown): DestinationVaccineEntry | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const key = typeof r.key === 'string' ? r.key.trim() : ''
  if (!key || !VACCINE_KEY_SET.has(key)) return null
  const speciesRaw = typeof r.species === 'string' ? r.species : undefined
  const species: SpeciesFilter | undefined =
    speciesRaw === 'dog' || speciesRaw === 'cat' ? speciesRaw : undefined
  return species ? { key, species } : { key }
}

function normalizeExtraFieldEntry(o: unknown): DestinationExtraFieldEntry | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const key = typeof r.key === 'string' ? r.key.trim() : ''
  if (!key || !EXTRA_FIELD_KEY_SET.has(key)) return null
  const speciesRaw = typeof r.species === 'string' ? r.species : undefined
  const species: SpeciesFilter | undefined =
    speciesRaw === 'dog' || speciesRaw === 'cat' ? speciesRaw : undefined
  return species ? { key, species } : { key }
}

function normalizeCustomDestination(o: unknown): CustomDestination | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id.trim() : ''
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!id || !name) return null
  const keywordsRaw = Array.isArray(r.keywords) ? r.keywords : []
  const keywords = keywordsRaw
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.trim())
    .filter(Boolean)
  if (keywords.length === 0) return null
  const vaccinesRaw = Array.isArray(r.vaccines) ? r.vaccines : []
  const vaccines: DestinationVaccineEntry[] = []
  const seenVacc = new Set<string>()
  for (const v of vaccinesRaw) {
    const entry = normalizeVaccineEntry(v)
    if (entry && !seenVacc.has(entry.key)) {
      seenVacc.add(entry.key)
      vaccines.push(entry)
    }
  }
  const extraFieldsRaw = Array.isArray(r.extraFields) ? r.extraFields : []
  const extraFields: DestinationExtraFieldEntry[] = []
  const seenExtra = new Set<string>()
  for (const v of extraFieldsRaw) {
    const entry = normalizeExtraFieldEntry(v)
    if (entry && !seenExtra.has(entry.key)) {
      seenExtra.add(entry.key)
      extraFields.push(entry)
    }
  }
  const extraSection = typeof r.extraSection === 'string' && r.extraSection.trim()
    ? r.extraSection.trim()
    : undefined
  const out: CustomDestination = { id, name, keywords: Array.from(new Set(keywords)), vaccines }
  if (extraFields.length > 0) out.extraFields = extraFields
  if (extraSection) out.extraSection = extraSection
  return out
}

function normalize(raw: unknown): DestinationOverridesConfig {
  if (!raw || typeof raw !== 'object') return EMPTY_DESTINATION_OVERRIDES
  const src = raw as Record<string, unknown>
  const customRaw = Array.isArray(src.custom) ? src.custom : []
  const seenIds = new Set<string>()
  const custom: CustomDestination[] = []
  for (const item of customRaw) {
    const entry = normalizeCustomDestination(item)
    if (entry && !seenIds.has(entry.id)) {
      seenIds.add(entry.id)
      custom.push(entry)
    }
  }
  return { custom }
}

export async function loadDestinationOverrides(): Promise<DestinationOverridesConfig> {
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
    return EMPTY_DESTINATION_OVERRIDES
  } catch {
    return EMPTY_DESTINATION_OVERRIDES
  }
}

export async function saveDestinationOverrides(
  config: DestinationOverridesConfig,
): Promise<DestinationOverridesConfig> {
  const normalized = normalize(config)
  const { createClient } = await import('@/lib/supabase/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const { error } = await supabase
    .from('organization_settings')
    .upsert({
      org_id: orgId,
      key: APP_SETTINGS_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
  if (error) throw new Error(error.message)
  return normalized
}
