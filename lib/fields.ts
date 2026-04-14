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
    label: '성함',
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
    label: '마이크로칩번호',
    type: 'text',
    group: '동물정보',
    groupOrder: 1,
    order: 3,
  },
  {
    key: 'departure_date',
    storage: 'column',
    label: '출국일',
    type: 'date',
    group: '절차정보',
    groupOrder: 2,
    order: 9999, // bottom of 절차정보
  },
  {
    key: 'status',
    storage: 'column',
    label: 'Status',
    type: 'select',
    group: '절차정보',
    groupOrder: 2,
    order: -2, // before destination (-1)
    options: [
      { value: 'applied', label_ko: 'Applied' },
      { value: '진행중', label_ko: 'In Progress' },
      { value: '완료', label_ko: 'Completed' },
      { value: '보류', label_ko: 'On Hold' },
      { value: '취소', label_ko: 'Cancelled' },
    ],
  },
]

/**
 * Destination spec — placed at the very start of 절차정보.
 */
export const DESTINATION_SPEC: FieldSpec = {
  key: 'destination',
  storage: 'column',
  label: '목적지',
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
  'breed',     // shown via BreedField
  'breed_en',  // shown via BreedField
  'color',     // shown via ColorField
  'color_en',  // shown via ColorField
  'payment_amount',  // legacy, shown via PaymentField
  'payment_method',  // legacy, shown via PaymentField
  'payments',        // shown via PaymentField (array)
  // Rabies titer: legacy flat + new array
  'rabies_titer_test_date', 'rabies_titer', 'rabies_titer_lab',
  'rabies_titer_records',
  // Repeatable schedule fields: legacy 1st/2nd/3rd + new arrays
  'rabies_1', 'rabies_2', 'rabies_3', 'rabies_dates',
  'civ', 'civ_dates',
  'external_parasite_1', 'external_parasite_2', 'external_parasite_3', 'external_parasite_dates',
  'internal_parasite_1', 'internal_parasite_2', 'internal_parasite_dates',
  'microchip_check_date', // shown inline with microchip_implant_date
  'microchip_secondary', // shown via MicrochipField
  'sex_en', // redundant with sex select's bilingual label
  'address_kr',  // shown via AddressField with search
  'address_en',  // shown via AddressField with search
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
  메모: '기타정보',
  // 할일 페이지 전용 필드 — 상세페이지에서는 숨김
  '할일/검사': '__hidden__',
  '할일/출국서류': '__hidden__',
  '할일/수입신고': '__hidden__',
}

// Deterministic group ordering for the detail page.
const KNOWN_GROUP_ORDER = ['고객정보', '동물정보', '절차정보', '기타정보']

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
    .filter((s) => s.group !== '__hidden__')
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
 * Special case: 'age' is auto-calculated from 'birth_date'.
 */
export function readCaseField(row: CaseRow, spec: FieldSpec): unknown {
  if (spec.key === 'age') {
    const data = (row.data ?? {}) as Record<string, unknown>
    const birthStr = data.birth_date as string | undefined
    if (birthStr) return calculateAge(birthStr)
    return null
  }
  if (spec.storage === 'column') {
    return (row as unknown as Record<string, unknown>)[spec.key] ?? null
  }
  const data = row.data ?? {}
  return (data as Record<string, unknown>)[spec.key] ?? null
}

function calculateAge(birthDateStr: string): string {
  const birth = new Date(birthDateStr)
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (now.getDate() < birth.getDate()) {
    months--
  }
  if (months < 0) {
    years--
    months += 12
  }
  return `${years}Y ${months}M`
}

/**
 * Render a value into a display string (used for reading AND clipboard copy).
 * - select: show "label_ko / label_en" if options have a label_en, else just label_ko
 * - dates: normalize to YYYY-MM-DD
 * - nulls / empty strings: "—"
 */
export function renderFieldValue(spec: FieldSpec, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  // Payment amount formatting: 50000 → ₩50,000 (legacy flat key)
  if (spec.key === 'payment_amount') {
    const n = Number(raw)
    if (Number.isFinite(n)) return `₩${n.toLocaleString()}`
    return String(raw)
  }

  // Payments array: show total
  if (spec.key === 'payments' && Array.isArray(raw)) {
    const total = (raw as Array<{ amount: number }>).reduce((s, p) => s + (p.amount || 0), 0)
    if (total > 0) return `₩${total.toLocaleString()}`
    return '—'
  }

  // Microchip formatting: 410100012271380 → 410 100 012 271 380
  if (spec.key === 'microchip') {
    const digits = String(raw).replace(/\D/g, '')
    if (digits.length === 15) return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,9)} ${digits.slice(9,12)} ${digits.slice(12)}`
    return String(raw)
  }

  // Phone number formatting: 01012345678 → 010-1234-5678
  if (spec.key === 'phone') {
    const digits = String(raw).replace(/\D/g, '')
    if (digits.length === 11) return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`
    if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`
    return String(raw)
  }

  if (spec.type === 'select' && spec.options) {
    const opt = spec.options.find((o) => o.value === raw)
    if (!opt) return String(raw)
    return opt.label_en ?? opt.label_ko
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

  // Microchip: must be exactly 15 digits, formatted as "NNN NNN NNN NNN NNN"
  if (spec.key === 'microchip') {
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length !== 15) {
      return null // validation will catch this
    }
    return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,9)} ${digits.slice(9,12)} ${digits.slice(12)}`
  }

  if (spec.type === 'number') {
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return trimmed
}
