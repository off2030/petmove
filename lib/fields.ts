import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'

/**
 * A unified "field" description shared across regular columns and JSONB data.
 * Used by the detail page to render + edit every field uniformly.
 */
export interface FieldSpec {
  key: string
  storage: 'column' | 'data'      // which storage backs this field
  label: string
  type: 'text' | 'longtext' | 'date' | 'number' | 'select'
  group: string
  groupOrder: number              // lower = earlier in the detail page
  order: number                   // order within a group
  options?: Array<{ value: string; label_ko: string; label_en?: string }>
  isStep?: boolean
  /**
   * When set, this field is rendered side-by-side with another field
   * (typically the English counterpart) on the same row. The companion
   * field should NOT be rendered on its own row — filter by HIDDEN_EN_KEYS.
   */
  pairEnKey?: string
}

export interface FieldSpecValue {
  spec: FieldSpec
  raw: unknown                    // raw stored value
  display: string                 // rendered for display + copy
}

// Regular column specs that are part of the core `cases` row.
// Detail page uses three groups: 고객정보 / 동물정보 / 절차정보
// Note: `destination` is NOT listed here — it is rendered separately at the
// very top of the detail page (see DESTINATION_SPEC below).
export const REGULAR_COLUMN_SPECS: FieldSpec[] = [
  // ─── 고객정보 ───
  {
    key: 'customer_name',
    storage: 'column',
    label: '보호자',
    type: 'text',
    group: '고객정보',
    groupOrder: 0,
    order: 1,
    // No longer paired — English name is split into last/first via field_definitions
  },
  {
    key: 'customer_name_en',
    storage: 'column',
    label: '보호자 (영문 전체)',
    type: 'text',
    group: '고객정보',
    groupOrder: 0,
    order: 2,
    // Hidden — replaced by customer_last_name_en + customer_first_name_en
  },

  // ─── 동물정보 ───
  {
    key: 'pet_name',
    storage: 'column',
    label: '이름',
    type: 'text',
    group: '동물정보',
    groupOrder: 1,
    order: 1,
    pairEnKey: 'pet_name_en',
  },
  {
    key: 'pet_name_en',
    storage: 'column',
    label: '이름 (영문)',
    type: 'text',
    group: '동물정보',
    groupOrder: 1,
    order: 2,
  },
  {
    key: 'microchip',
    storage: 'column',
    label: '마이크로칩',
    type: 'text',
    group: '동물정보',
    groupOrder: 1,
    order: 3,
  },
  {
    key: 'status',
    storage: 'column',
    label: '케이스 상태',
    type: 'select',
    group: '동물정보',
    groupOrder: 1,
    order: 99, // always last in 동물정보
    options: [
      { value: '신규', label_ko: '신규' },
      { value: '진행중', label_ko: '진행중' },
      { value: '보류', label_ko: '보류' },
      { value: '완료', label_ko: '완료' },
      { value: '취소', label_ko: '취소' },
    ],
  },
]

/**
 * Destination spec — placed at the very start of 절차정보.
 */
export const DESTINATION_SPEC: FieldSpec = {
  key: 'destination',
  storage: 'column',
  label: '도착 국가',
  type: 'text',
  group: '절차정보',
  groupOrder: 2,
  order: -1, // before all other 절차정보 items (which start at 30+)
}

/**
 * Data (jsonb) keys that have an English counterpart. The primary spec
 * gets a pairEnKey, and the counterpart is filtered out via HIDDEN_EN_KEYS.
 */
const PAIRED_DATA_KEYS: Record<string, string> = {
  breed: 'breed_en',
  color: 'color_en',
}

/**
 * Field keys that are hidden from the detail page because they are rendered
 * alongside their Korean counterpart (via pairEnKey) or are redundant with
 * a bilingual select option.
 */
export const HIDDEN_EN_KEYS = new Set<string>([
  'customer_name_en',
  'customer_last_name_en',   // shown via CustomerNameRow combined display
  'customer_first_name_en',  // shown via CustomerNameRow combined display
  'pet_name_en',
  'breed_en',
  'color_en',
  'sex_en', // redundant with sex select's bilingual label
])

// Remap field_definitions.group_name (from DB seed) into the simpler
// 3-group layout the detail page uses.
const GROUP_REMAP: Record<string, string> = {
  기본정보: '고객정보',
  동물정보: '동물정보',
  '절차/식별': '절차정보',
  '절차/예방접종': '절차정보',
  '절차/검사': '절차정보',
  '절차/구충': '절차정보',
  메모: '절차정보',
}

// Deterministic group ordering for the detail page.
const KNOWN_GROUP_ORDER = ['고객정보', '동물정보', '절차정보']

function groupOrderOf(groupName: string): number {
  const i = KNOWN_GROUP_ORDER.indexOf(groupName)
  return i >= 0 ? i : 1000 + groupName.charCodeAt(0)
}

/**
 * Turn a field_definitions row into a FieldSpec.
 * The DB group_name is remapped into the simpler 3-group detail layout.
 * If the key has a paired English counterpart, pairEnKey is set so the
 * detail page renders them together on one row.
 */
export function fieldDefToSpec(def: FieldDefinition): FieldSpec {
  const rawGroup = def.group_name ?? '기타'
  const mappedGroup = GROUP_REMAP[rawGroup] ?? rawGroup
  return {
    key: def.key,
    storage: 'data',
    label: def.label,
    type:
      def.type === 'multiselect'
        ? 'text' // multiselect not yet supported in UI — treat as text for now
        : def.type,
    group: mappedGroup,
    groupOrder: groupOrderOf(mappedGroup),
    order: def.display_order,
    options: def.options ?? undefined,
    isStep: def.is_step,
    pairEnKey: PAIRED_DATA_KEYS[def.key],
  }
}

/**
 * Combine regular columns and field_definitions into a single sorted list.
 * Filters out inactive field definitions.
 */
export function buildFieldSpecs(defs: FieldDefinition[]): FieldSpec[] {
  const dataSpecs = defs
    .filter((d) => d.is_active)
    .map(fieldDefToSpec)
  const all = [...REGULAR_COLUMN_SPECS, DESTINATION_SPEC, ...dataSpecs]
  return all.sort((a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
    return a.order - b.order
  })
}

/**
 * Group specs by their `group` name, preserving the sorted order.
 */
export function groupFieldSpecs(specs: FieldSpec[]): Array<{ group: string; items: FieldSpec[] }> {
  const groups: Array<{ group: string; items: FieldSpec[] }> = []
  for (const spec of specs) {
    const last = groups[groups.length - 1]
    if (last && last.group === spec.group) {
      last.items.push(spec)
    } else {
      groups.push({ group: spec.group, items: [spec] })
    }
  }
  return groups
}

/**
 * Read a value out of a case row given its spec.
 */
export function readCaseField(row: CaseRow, spec: FieldSpec): unknown {
  if (spec.storage === 'column') {
    return (row as unknown as Record<string, unknown>)[spec.key] ?? null
  }
  const data = row.data ?? {}
  return (data as Record<string, unknown>)[spec.key] ?? null
}

/**
 * Render a value into a display string (used for reading AND clipboard copy).
 * - select: show "label_ko / label_en" if options have a label_en, else just label_ko
 * - dates: normalize to YYYY-MM-DD
 * - nulls / empty strings: "—"
 */
export function renderFieldValue(spec: FieldSpec, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  if (spec.type === 'select' && spec.options) {
    const opt = spec.options.find((o) => o.value === raw)
    if (!opt) return String(raw)
    if (opt.label_en) return `${opt.label_ko} / ${opt.label_en}`
    return opt.label_ko
  }
  if (spec.type === 'date') {
    try {
      const d = new Date(String(raw))
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }
    } catch {}
    return String(raw)
  }
  return String(raw)
}

/**
 * Convert a user-entered string into a storage-ready value for the given spec.
 * - empty string -> null
 * - number type -> Number
 * - date type -> YYYY-MM-DD string (stored as jsonb/text as-is)
 */
export function coerceInputValue(spec: FieldSpec, input: string): unknown {
  const trimmed = input.trim()
  if (trimmed === '') return null
  if (spec.type === 'number') {
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return trimmed
}
