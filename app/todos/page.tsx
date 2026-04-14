import { createClient } from '@/lib/supabase/server'
import type { CaseRow } from '@/lib/supabase/types'
import { TodosApp } from '@/components/todos/todos-app'

export const dynamic = 'force-dynamic'

async function fetchAllCases(): Promise<CaseRow[]> {
  const supabase = await createClient()
  const all: CaseRow[] = []
  const batchSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select(
        'id, org_id, microchip, microchip_extra, customer_name, customer_name_en, pet_name, pet_name_en, destination, departure_date, status, data, created_at, updated_at, deleted_at',
      )
      .is('deleted_at', null)
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

export default async function TodosPage() {
  const initialCases = await fetchAllCases()
  return <TodosApp initialCases={initialCases} />
}
