/**
 * 조직별 커스텀 목적지 설정 — 입력 정규화 + service-role 클라이언트로 직접 조회.
 *
 * organization_settings 테이블의 key='destination_overrides' 값을 표준화된 형태로
 * 변환. 여기서는 도메인 로직만 담당 — 인증된 admin 컨텍스트 (active_org 의존 등) 의
 * load/save 는 admin 측 wrapper 가 책임 (apps/admin/lib/destination-overrides-config.ts).
 */

import {
  EMPTY_DESTINATION_OVERRIDES,
  ALL_EXTRA_FIELD_KEYS,
  type CustomDestination,
  type DestinationOverridesConfig,
  type DestinationVaccineEntry,
  type DestinationExtraFieldEntry,
  type SpeciesFilter,
} from './destination-overrides-types'
import { ALL_VACCINE_KEYS } from './destination-config'

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

export function normalizeDestinationOverrides(raw: unknown): DestinationOverridesConfig {
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

/**
 * 익명(토큰 기반) 흐름·서버 액션에서 admin(service-role) 클라이언트로 직접 조회.
 * 호출자가 admin 클라이언트를 주입하므로 active_org 의존 없는 anon 경로에서도 사용 가능.
 */
export async function loadDestinationOverridesByOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orgId: string,
): Promise<DestinationOverridesConfig> {
  try {
    const { data } = await admin
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', APP_SETTINGS_KEY)
      .maybeSingle()
    if (data?.value) return normalizeDestinationOverrides(data.value)
    return EMPTY_DESTINATION_OVERRIDES
  } catch {
    return EMPTY_DESTINATION_OVERRIDES
  }
}
