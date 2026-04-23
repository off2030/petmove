import { createClient } from '@/lib/supabase/server'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import { CasesProvider } from '@/components/cases/cases-context'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { VaccineDataProvider } from '@/components/providers/vaccine-data-provider'
import { CalculatorDataProvider } from '@/components/providers/calculator-data-provider'
import { loadImportReportCountries } from '@/lib/import-report-config'
import { loadInspectionConfig } from '@/lib/inspection-config'
import { loadCertConfig } from '@/lib/cert-config'
import { getOrgVaccineData } from '@/lib/vaccine-data'
import { getCalculatorItems } from '@/lib/calculator-data'

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

async function fetchUserContext(): Promise<{ isSuperAdmin: boolean; email: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isSuperAdmin: false, email: null }
  const { data } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  return { isSuperAdmin: !!data?.is_super_admin, email: user.email ?? null }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [initialCases, fieldDefs, importReportCountries, inspectionConfig, certConfig, userCtx, vaccineData, calculatorItems] = await Promise.all([
    fetchAllCases(),
    fetchFieldDefs(),
    loadImportReportCountries(),
    loadInspectionConfig(),
    loadCertConfig(),
    fetchUserContext(),
    getOrgVaccineData(),
    getCalculatorItems(),
  ])

  return (
    <CasesProvider
      initialCases={initialCases}
      fieldDefs={fieldDefs}
      initialImportReportCountries={importReportCountries}
      initialInspectionConfig={inspectionConfig}
      initialCertConfig={certConfig}
    >
      <VaccineDataProvider data={vaccineData}>
        <CalculatorDataProvider initialItems={calculatorItems}>
          <DashboardShell isSuperAdmin={userCtx.isSuperAdmin} userEmail={userCtx.email} />
        </CalculatorDataProvider>
      </VaccineDataProvider>
    </CasesProvider>
  )
}
