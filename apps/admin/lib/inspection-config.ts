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

/**
 * EU/영국/스위스 titerRule 의 apqa_hq → apqa_eu 자동 교체.
 *
 * 2026-05-04 APQA EU 검사기관 신설로 EU/UK/CH 광견병항체검사 표시기관이 분리됨.
 * 기존 조직 설정이 apqa_hq 로 저장돼 있으면 DB 마이그레이션 없이도 즉시 새 라벨이
 * 노출되도록 read-path 에서 보강. 사용자가 명시적으로 apqa_hq 를 다시 지정하려면
 * Settings 에서 직접 입력해야 하지만(드문 케이스), 대다수 조직에서 자동 보정 효과.
 *
 * 적용 조건: 룰의 countries 가 EU 27개국 / 스위스 / 영국 의 부분집합.
 */
const EU_UK_CH = new Set([
  '독일', '프랑스', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
  '스웨덴', '덴마크', '핀란드', '폴란드', '체코', '헝가리', '포르투갈',
  '그리스', '루마니아', '불가리아', '크로아티아', '슬로바키아', '슬로베니아',
  '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '몰타', '키프로스',
  '아일랜드', '스위스', '영국',
])

function applyApqaEuShim(rules: InspectionLabRule[]): InspectionLabRule[] {
  return rules.map(rule => {
    if (rule.countries.length === 0) return rule
    const allEuUkCh = rule.countries.every(c => EU_UK_CH.has(c))
    if (!allEuUkCh) return rule
    if (!rule.labs.includes('apqa_hq')) return rule
    const labs = rule.labs.map(l => (l === 'apqa_hq' ? 'apqa_eu' : l))
    // 동일 lab 가 두 개 들어오는 일은 없지만 안전상 중복 제거.
    const dedup = Array.from(new Set(labs))
    return { ...rule, labs: dedup }
  })
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
    titerRules: applyApqaEuShim(normalizeRules(titerRaw)),
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
