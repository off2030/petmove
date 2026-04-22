/**
 * 신고 탭 자동 포함 국가 목록 — 서버 전용 load/save.
 * Supabase `app_settings` 의 key='import_report_countries' 행에 저장.
 * 기본값은 @/lib/import-report-defaults (client-safe). 설정 화면에서 편집 가능.
 *
 * 이 파일은 @/lib/supabase/server 를 참조하므로 client 컴포넌트에서 직접 import 금지.
 * client 는 DEFAULT_IMPORT_REPORT_COUNTRIES 가 필요하면
 * @/lib/import-report-defaults 에서 가져올 것.
 */
import { DEFAULT_IMPORT_REPORT_COUNTRIES } from '@/lib/import-report-defaults'
export { DEFAULT_IMPORT_REPORT_COUNTRIES }

const APP_SETTINGS_KEY = 'import_report_countries'

/** 서버에서 저장된 목록을 읽어온다. 실패·없음 시 기본값 반환. */
export async function loadImportReportCountries(): Promise<string[]> {
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
    const stored = data?.value
    if (Array.isArray(stored) && stored.every((v) => typeof v === 'string')) {
      return stored as string[]
    }
    return DEFAULT_IMPORT_REPORT_COUNTRIES
  } catch {
    return DEFAULT_IMPORT_REPORT_COUNTRIES
  }
}

/** 설정 화면에서 호출 — 신규 목록 upsert. 성공 시 저장된 목록 반환. */
export async function saveImportReportCountries(list: string[]): Promise<string[]> {
  const normalized = Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)))
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
