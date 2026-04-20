/**
 * 신고 탭 자동 포함 국가 목록.
 * Supabase `app_settings` 의 key='import_report_countries' 행에 저장.
 * 기본값은 DEFAULT_IMPORT_REPORT_COUNTRIES. 설정 화면에서 편집 가능.
 */

export const DEFAULT_IMPORT_REPORT_COUNTRIES: string[] = [
  '일본',
  '하와이',
  '스위스',
  '태국',
  '필리핀',
]

const APP_SETTINGS_KEY = 'import_report_countries'

/** 서버에서 저장된 목록을 읽어온다. 실패·없음 시 기본값 반환. */
export async function loadImportReportCountries(): Promise<string[]> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
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
  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: APP_SETTINGS_KEY, value: normalized, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return normalized
}
