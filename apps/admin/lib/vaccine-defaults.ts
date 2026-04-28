/**
 * 약품관리 — 기본 약품 설정 (server-only).
 *
 * 케이스 상세에서 외부구충/내부구충/심장사상충 row 에 날짜만 입력했을 때
 * 자동 채워질 "디폴트 브랜드"를 (species, kind) 별로 지정. 디폴트 외 약품은
 * 기존대로 dropdown 에서 명시 선택.
 *
 * 저장 위치: organization_settings (key='vaccine_defaults', value=JSON map).
 * key naming: `<kind>_<species>` (kind ∈ external|internal|heartworm).
 */
import 'server-only'

export interface VaccineDefaults {
  external_dog?: string
  external_cat?: string
  internal_dog?: string
  internal_cat?: string
  heartworm_dog?: string
  heartworm_cat?: string
}

const APP_SETTINGS_KEY = 'vaccine_defaults'
const ALLOWED_KEYS: readonly (keyof VaccineDefaults)[] = [
  'external_dog', 'external_cat',
  'internal_dog', 'internal_cat',
  'heartworm_dog', 'heartworm_cat',
]

function normalize(raw: unknown): VaccineDefaults {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: VaccineDefaults = {}
  for (const k of ALLOWED_KEYS) {
    const v = src[k]
    if (typeof v === 'string' && v.trim()) {
      out[k] = v.trim()
    }
  }
  return out
}

export async function loadVaccineDefaults(): Promise<VaccineDefaults> {
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
    return normalize(data?.value)
  } catch {
    return {}
  }
}

export async function saveVaccineDefaults(patch: Partial<VaccineDefaults>): Promise<VaccineDefaults> {
  const { createClient } = await import('@/lib/supabase/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const current = await loadVaccineDefaults()
  const merged: VaccineDefaults = { ...current }
  for (const k of ALLOWED_KEYS) {
    if (k in patch) {
      const v = patch[k]
      if (v && v.trim()) merged[k] = v.trim()
      else delete merged[k]
    }
  }
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, key: APP_SETTINGS_KEY, value: merged, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return merged
}
