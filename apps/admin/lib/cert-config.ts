/**
 * 증명서(서류) 설정 server-only load/save. client 는 @petmove/domain 사용.
 */
import {
  DEFAULT_CERT_CONFIG,
  type CertConfig,
  type CertRule,
} from '@petmove/domain'

export { DEFAULT_CERT_CONFIG }
export type { CertConfig, CertRule }

const APP_SETTINGS_KEY = 'cert_config'

function normalizeRule(o: unknown): CertRule | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  if (!Array.isArray(r.countries) || !Array.isArray(r.certs)) return null
  const countries = r.countries
    .filter((x): x is string => typeof x === 'string')
    .map(x => x.trim())
    .filter(Boolean)
  const certs = r.certs
    .filter((x): x is string => typeof x === 'string')
    .map(x => x.trim())
    .filter(Boolean)
  if (countries.length === 0 || certs.length === 0) return null
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : undefined
  const dedupCountries = Array.from(new Set(countries))
  const dedupCerts = Array.from(new Set(certs))
  return label
    ? { label, countries: dedupCountries, certs: dedupCerts }
    : { countries: dedupCountries, certs: dedupCerts }
}

function normalize(raw: unknown): CertConfig {
  const src = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
  const defaultCertsRaw = Array.isArray(src.defaultCerts) ? src.defaultCerts : []
  const defaultCerts = defaultCertsRaw
    .filter((x): x is string => typeof x === 'string')
    .map(x => x.trim())
    .filter(Boolean)
  const dedupDefaults = Array.from(new Set(defaultCerts))
  const rulesRaw = Array.isArray(src.rules) ? src.rules : []
  const rules = rulesRaw
    .map(normalizeRule)
    .filter((r): r is CertRule => r !== null)
  return {
    defaultCerts: dedupDefaults.length > 0 ? dedupDefaults : [...DEFAULT_CERT_CONFIG.defaultCerts],
    rules,
  }
}

export async function loadCertConfig(): Promise<CertConfig> {
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
    return DEFAULT_CERT_CONFIG
  } catch {
    return DEFAULT_CERT_CONFIG
  }
}

export async function saveCertConfig(config: CertConfig): Promise<CertConfig> {
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
