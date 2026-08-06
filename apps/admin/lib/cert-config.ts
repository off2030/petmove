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

/**
 * 저장된 조직 cert_config 는 defaults 를 **전면 대체**한다. 그래서 새 증명서 유형(예: 튀르키예 TK)을
 * DEFAULT_CERT_CONFIG 에 추가해도, 과거에 한 번이라도 설정을 저장한 조직은 그 스냅샷에 갇혀
 * 새 규칙을 못 받는다. → 저장된 config 가 **건드리지 않은 여행지**의 default 규칙을 덧붙여 병합한다.
 *
 * 병합 규칙: default 규칙의 countries 중 **하나라도** 저장 config 에 이미 등장하면(그 여행지를
 * 조직이 직접 설정한 것으로 보고) 그대로 존중해 건너뛴다. 전혀 등장하지 않는(uncovered) default
 * 규칙만 추가한다. → 조직의 커스터마이즈는 보존하고, 새로 생긴 여행지·증명서는 자동 노출.
 */
export function mergeCertDefaults(saved: CertConfig): CertConfig {
  const covered = new Set<string>()
  for (const r of saved.rules) for (const c of r.countries) covered.add(c)
  const rules = [...saved.rules]
  for (const dr of DEFAULT_CERT_CONFIG.rules) {
    if (!dr.countries.some((c) => covered.has(c))) rules.push(dr)
  }
  return { defaultCerts: saved.defaultCerts, rules }
}

export async function loadCertConfig(): Promise<CertConfig> {
  try {
    const { createClient } = await import('@petmove/auth/server')
    const { getActiveOrgId } = await import('@/lib/supabase/active-org')
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', APP_SETTINGS_KEY)
      .maybeSingle()
    if (data?.value) return mergeCertDefaults(normalize(data.value))
    return DEFAULT_CERT_CONFIG
  } catch {
    return DEFAULT_CERT_CONFIG
  }
}

export async function saveCertConfig(config: CertConfig): Promise<CertConfig> {
  const normalized = normalize(config)
  const { createClient } = await import('@petmove/auth/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, key: APP_SETTINGS_KEY, value: normalized, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return normalized
}
