/**
 * 신고 탭 국가 목록 — 서버 전용 load/save.
 *
 * import_report_countries: 체크(자동 포함) 국가. 출국일 입력 시 신고 탭에 자동 진입.
 *
 * 기본값은 @petmove/domain (client-safe). 설정 화면에서 편집 가능.
 *
 * 이 파일은 @/lib/supabase/server 를 참조하므로 client 컴포넌트에서 직접 import 금지.
 * client 는 DEFAULT_IMPORT_REPORT_COUNTRIES / IMPORT_REPORT_CANDIDATE_COUNTRIES 가
 * 필요하면 @petmove/domain 에서 가져올 것.
 */
import {
  DEFAULT_IMPORT_REPORT_COUNTRIES,
  IMPORT_REPORT_CANDIDATE_COUNTRIES,
} from '@petmove/domain'
export {
  DEFAULT_IMPORT_REPORT_COUNTRIES,
  IMPORT_REPORT_CANDIDATE_COUNTRIES,
}

const AUTO_KEY = 'import_report_countries'

async function loadCountries(key: string, fallback: string[]): Promise<string[]> {
  try {
    const { createClient } = await import('@petmove/auth/server')
    const { getActiveOrgId } = await import('@/lib/supabase/active-org')
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', key)
      .maybeSingle()
    const stored = data?.value
    if (Array.isArray(stored) && stored.every((v) => typeof v === 'string')) {
      return stored as string[]
    }
    return fallback
  } catch {
    return fallback
  }
}

async function saveCountries(key: string, list: string[]): Promise<string[]> {
  const normalized = Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)))
  const { createClient } = await import('@petmove/auth/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, key, value: normalized, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return normalized
}

/** 신고 탭 자동 포함(체크) 국가 목록 — 출국일 입력 시 신고 탭 자동 진입. */
export function loadImportReportCountries(): Promise<string[]> {
  return loadCountries(AUTO_KEY, DEFAULT_IMPORT_REPORT_COUNTRIES)
}

export function saveImportReportCountries(list: string[]): Promise<string[]> {
  return saveCountries(AUTO_KEY, list)
}
