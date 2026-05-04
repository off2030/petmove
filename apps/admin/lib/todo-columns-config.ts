/**
 * 검사/신고/서류 탭 테이블 컬럼 표시 설정.
 *
 * organization_settings.value (key='todo_columns_config') 에 저장.
 * - hiddenColumns[tab] = [숨길 컬럼 key 배열]
 * - 빈 배열 = 모든 컬럼 표시 (디폴트).
 *
 * 컬럼 메타데이터 (TODO_COLUMN_META) 는 코드에 하드코딩 — 실제 테이블이
 * 가진 컬럼 목록과 정확히 일치해야 함. 새 컬럼이 추가되면 여기도 같이 추가.
 */

export type TodoTabId = 'inspection' | 'import_report' | 'export_doc'

export interface TodoColumnsConfig {
  hiddenColumns: Record<TodoTabId, string[]>
}

export interface TodoColumnMeta {
  key: string
  label: string
}

export const TODO_COLUMN_META: Record<TodoTabId, TodoColumnMeta[]> = {
  inspection: [
    { key: 'lab', label: '검사기관' },
    { key: 'date', label: '검사일' },
    { key: 'pet_name', label: '반려동물' },
    { key: 'customer_name', label: '보호자' },
    { key: 'destination', label: '목적지' },
    { key: 'status', label: '진행상태' },
    { key: 'departure_date', label: '출국일' },
    { key: 'memo', label: '메모' },
  ],
  import_report: [
    { key: 'destination', label: '목적지' },
    { key: 'pet_name', label: '반려동물' },
    { key: 'customer_name', label: '보호자' },
    { key: 'import_deadline', label: '신고기한' },
    { key: 'departure_date', label: '출국일' },
    { key: 'return_date', label: '귀국일' },
    { key: 'import_import_status', label: '수입' },
    { key: 'import_export_status', label: '수출' },
    { key: 'import_memo', label: '메모' },
  ],
  export_doc: [
    { key: 'vet_visit_date', label: '내원일' },
    { key: 'departure_date', label: '출국일' },
    { key: 'vet_available_date', label: '내원가능일' },
    { key: 'pet_name', label: '반려동물' },
    { key: 'customer_name', label: '보호자' },
    { key: 'destination', label: '목적지' },
    { key: 'export_doc_status', label: '준비상태' },
    { key: 'export_doc_memo', label: '메모' },
  ],
}

export const DEFAULT_TODO_COLUMNS_CONFIG: TodoColumnsConfig = {
  hiddenColumns: {
    inspection: [],
    import_report: [],
    export_doc: [],
  },
}

const APP_SETTINGS_KEY = 'todo_columns_config'

function normalizeOne(raw: unknown, validKeys: Set<string>): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === 'string')
    .map(x => x.trim())
    .filter(Boolean)
    .filter(k => validKeys.has(k)) // 메타에 없는 키는 무시 (구버전 잔여)
}

function normalize(raw: unknown): TodoColumnsConfig {
  const src = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
  const hidden = (src.hiddenColumns && typeof src.hiddenColumns === 'object')
    ? (src.hiddenColumns as Record<string, unknown>)
    : {}
  return {
    hiddenColumns: {
      inspection: Array.from(new Set(normalizeOne(
        hidden.inspection,
        new Set(TODO_COLUMN_META.inspection.map(c => c.key)),
      ))),
      import_report: Array.from(new Set(normalizeOne(
        hidden.import_report,
        new Set(TODO_COLUMN_META.import_report.map(c => c.key)),
      ))),
      export_doc: Array.from(new Set(normalizeOne(
        hidden.export_doc,
        new Set(TODO_COLUMN_META.export_doc.map(c => c.key)),
      ))),
    },
  }
}

export async function loadTodoColumnsConfig(): Promise<TodoColumnsConfig> {
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
    return DEFAULT_TODO_COLUMNS_CONFIG
  } catch {
    return DEFAULT_TODO_COLUMNS_CONFIG
  }
}

export async function saveTodoColumnsConfig(config: TodoColumnsConfig): Promise<TodoColumnsConfig> {
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
