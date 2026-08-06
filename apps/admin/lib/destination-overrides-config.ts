/**
 * 조직별 커스텀 여행지 설정 — admin (active_org) 컨텍스트 wrapper.
 *
 * 도메인 normalize / loadDestinationOverridesByOrg 는 packages/domain 으로 이전됨
 * (anon 토큰 흐름 portal 도 동일 로직 사용). 이 파일은 admin-only 의 active_org 의존
 * load/save 만 담당.
 */
import {
  EMPTY_DESTINATION_OVERRIDES,
  normalizeDestinationOverrides,
  type DestinationOverridesConfig,
} from '@petmove/domain'

const APP_SETTINGS_KEY = 'destination_overrides'

// 도메인 모듈에서 재수출 — 기존 import 경로 (`@/lib/destination-overrides-config`) 호환.
export { loadDestinationOverridesByOrg } from '@petmove/domain'

export async function loadDestinationOverrides(): Promise<DestinationOverridesConfig> {
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
    if (data?.value) return normalizeDestinationOverrides(data.value)
    return EMPTY_DESTINATION_OVERRIDES
  } catch {
    return EMPTY_DESTINATION_OVERRIDES
  }
}

export async function saveDestinationOverrides(
  config: DestinationOverridesConfig,
): Promise<DestinationOverridesConfig> {
  const normalized = normalizeDestinationOverrides(config)
  const { createClient } = await import('@petmove/auth/server')
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
