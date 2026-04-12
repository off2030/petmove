import { createClient } from '@/lib/supabase/server'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import { CasesApp } from '@/components/cases/cases-app'

export const dynamic = 'force-dynamic'

/**
 * Fetch every case row once. Supabase caps a single query at 1000 rows, so
 * we page through until we've got everything. 1,816 rows = 2 requests.
 */
async function fetchAllCases(): Promise<CaseRow[]> {
  const supabase = await createClient()
  const all: CaseRow[] = []
  const batchSize = 1000
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select(
        'id, org_id, microchip, microchip_extra, customer_name, customer_name_en, pet_name, pet_name_en, destination, status, data, created_at, updated_at',
      )
      .order('created_at', { ascending: false })
      .range(from, from + batchSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...(data as CaseRow[]))
    if (data.length < batchSize) break
    from += batchSize
  }
  return all
}

async function fetchFieldDefs(): Promise<FieldDefinition[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('field_definitions')
    .select('*')
    .is('org_id', null)
    .eq('is_active', true)
    .order('display_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as FieldDefinition[]
}

export default async function CasesPage() {
  const [initialCases, fieldDefs] = await Promise.all([
    fetchAllCases(),
    fetchFieldDefs(),
  ])
  return <CasesApp initialCases={initialCases} fieldDefs={fieldDefs} />
}
