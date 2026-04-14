// Minimal hand-written types for the cases table.
// Replace with `supabase gen types typescript` output later.

export type CaseStatus = '신규' | '진행중' | '보류' | '완료' | '취소'

export interface CaseRow {
  id: string
  org_id: string
  microchip: string | null
  microchip_extra: string[]
  customer_name: string
  customer_name_en: string | null
  pet_name: string | null
  pet_name_en: string | null
  destination: string | null
  departure_date: string | null
  status: CaseStatus
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FieldDefinition {
  id: string
  org_id: string | null
  key: string
  label: string
  type: 'text' | 'longtext' | 'date' | 'number' | 'select' | 'multiselect'
  group_name: string | null
  display_order: number
  options: Array<{ value: string; label_ko: string; label_en?: string }> | null
  countries: string[] | null
  is_step: boolean
  is_active: boolean
}
