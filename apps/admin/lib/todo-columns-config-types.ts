/**
 * 검사/신고/서류 탭 컬럼 설정 — 타입/메타/디폴트.
 * Client + Server 양쪽에서 import 가능. server-only 코드 (load/save) 는
 * todo-columns-config.ts 분리.
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

export function normalizeTodoColumnsConfig(raw: unknown): TodoColumnsConfig {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const hidden =
    src.hiddenColumns && typeof src.hiddenColumns === 'object'
      ? (src.hiddenColumns as Record<string, unknown>)
      : {}
  const tabs: TodoTabId[] = ['inspection', 'import_report', 'export_doc']
  const out: Record<TodoTabId, string[]> = { inspection: [], import_report: [], export_doc: [] }
  for (const tab of tabs) {
    const validKeys = new Set(TODO_COLUMN_META[tab].map((c) => c.key))
    const arr = Array.isArray(hidden[tab]) ? (hidden[tab] as unknown[]) : []
    out[tab] = Array.from(
      new Set(
        arr
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean)
          .filter((k) => validKeys.has(k)),
      ),
    )
  }
  return { hiddenColumns: out }
}
