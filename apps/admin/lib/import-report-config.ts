/**
 * 신고 탭 국가 목록 — 서버 전용 load/save.
 *
 * 두 종류의 목록을 별도 키로 저장한다:
 *  - import_report_countries:        출국일 입력 시 자동으로 신고 탭에 들어오는 국가
 *  - import_report_button_countries: 상세페이지에 신고 버튼이 노출되는 국가
 *
 * 기본값은 @petmove/domain (client-safe). 설정 화면에서 편집 가능.
 *
 * 이 파일은 @/lib/supabase/server 를 참조하므로 client 컴포넌트에서 직접 import 금지.
 * client 는 DEFAULT_*_COUNTRIES 가 필요하면 @petmove/domain 에서 가져올 것.
 */
import {
  DEFAULT_IMPORT_REPORT_COUNTRIES,
  DEFAULT_IMPORT_REPORT_BUTTON_COUNTRIES,
} from '@petmove/domain'
export {
  DEFAULT_IMPORT_REPORT_COUNTRIES,
  DEFAULT_IMPORT_REPORT_BUTTON_COUNTRIES,
}

const AUTO_KEY = 'import_report_countries'
const BUTTON_KEY = 'import_report_button_countries'

async function loadCountries(key: string, fallback: string[]): Promise<string[]> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
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
  const { createClient } = await import('@/lib/supabase/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, key, value: normalized, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return normalized
}

/** 자동 포함 국가 목록 — 출국일 입력 시 신고 탭 자동 진입. */
export function loadImportReportCountries(): Promise<string[]> {
  return loadCountries(AUTO_KEY, DEFAULT_IMPORT_REPORT_COUNTRIES)
}

export function saveImportReportCountries(list: string[]): Promise<string[]> {
  return saveCountries(AUTO_KEY, list)
}

/** 신고 버튼 노출 국가 목록 — 상세페이지에 신고 버튼이 보일 국가. */
export function loadImportReportButtonCountries(): Promise<string[]> {
  return loadCountries(BUTTON_KEY, DEFAULT_IMPORT_REPORT_BUTTON_COUNTRIES)
}

export function saveImportReportButtonCountries(list: string[]): Promise<string[]> {
  return saveCountries(BUTTON_KEY, list)
}
