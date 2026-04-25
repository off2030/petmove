import {
  DEFAULT_EXTERNAL_LINKS,
  type ExternalLink,
  type ExternalLinkCategory,
  type ExternalLinksConfig,
} from '@petmove/domain'

export { DEFAULT_EXTERNAL_LINKS }
export type { ExternalLink, ExternalLinkCategory, ExternalLinksConfig }

const APP_SETTINGS_KEY = 'external_links'

function normalizeLink(o: unknown): ExternalLink | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id.trim() : ''
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  const url = typeof r.url === 'string' ? r.url.trim() : ''
  const description = typeof r.description === 'string' ? r.description.trim() : ''
  const flag = typeof r.flag === 'string' ? r.flag.trim() : undefined
  if (!id || !name || !url) return null
  return flag ? { id, name, url, description, flag } : { id, name, url, description }
}

function normalizeCategory(o: unknown): ExternalLinkCategory | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id.trim() : ''
  const label = typeof r.label === 'string' ? r.label.trim() : ''
  const linksRaw = Array.isArray(r.links) ? r.links : []
  const links = linksRaw.map(normalizeLink).filter((l): l is ExternalLink => l !== null)
  if (!id || !label) return null
  return { id, label, links }
}

function normalize(raw: unknown): ExternalLinksConfig {
  const src = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
  const categoriesRaw = Array.isArray(src.categories) ? src.categories : []
  const categories = categoriesRaw
    .map(normalizeCategory)
    .filter((c): c is ExternalLinkCategory => c !== null)
  return { categories }
}

export async function loadExternalLinks(): Promise<ExternalLinksConfig> {
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
    return DEFAULT_EXTERNAL_LINKS
  } catch {
    return DEFAULT_EXTERNAL_LINKS
  }
}

export async function saveExternalLinks(config: ExternalLinksConfig): Promise<ExternalLinksConfig> {
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
