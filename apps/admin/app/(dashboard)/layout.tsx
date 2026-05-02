import { createClient } from '@/lib/supabase/server'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import { CasesProvider } from '@/components/cases/cases-context'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { VaccineDataProvider } from '@/components/providers/vaccine-data-provider'
import { CalculatorDataProvider } from '@/components/providers/calculator-data-provider'
import { DetailViewSettingsProvider } from '@/components/providers/detail-view-settings-provider'
import { DestinationOverridesProvider } from '@/components/providers/destination-overrides-provider'
import { loadImportReportCountries, loadImportReportButtonCountries } from '@/lib/import-report-config'
import { loadInspectionConfig } from '@/lib/inspection-config'
import { loadCertConfig } from '@/lib/cert-config'
import { loadExternalLinks } from '@/lib/external-links'
import { getOrgVaccineData, getOrgVaccineDefaults } from '@/lib/vaccine-data'
import { getCalculatorItems } from '@/lib/calculator-data'
import { getSettingsBootstrap } from '@/lib/actions/settings-bootstrap'
import { getActiveOrgId, getImpersonationInfo } from '@/lib/supabase/active-org'
import { listAllOrgs, listSuperAdminsAll, type OrgSummary, type SuperAdminEntry } from '@/lib/actions/super-admin'
import { listMyConversations, type ConversationListItem } from '@/lib/actions/chat'
import { InstallPrompt } from '@/components/pwa/install-prompt'

export const dynamic = 'force-dynamic'

async function fetchAllCases(): Promise<CaseRow[]> {
  const supabase = await createClient()
  // active org 필터 — super_admin 도 impersonation 컨텍스트의 org 만 보도록.
  // getActiveOrgId 는 cache() 라 같은 요청 안에서 중복 호출 안 됨.
  let orgId: string | null = null
  try {
    orgId = await getActiveOrgId()
  } catch {
    return []
  }
  const all: CaseRow[] = []
  const batchSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select(
        'id, org_id, microchip, microchip_extra, customer_name, customer_name_en, pet_name, pet_name_en, destination, departure_date, data, created_at, updated_at, deleted_at',
      )
      .eq('org_id', orgId)
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

async function fetchUserContext(): Promise<{
  isSuperAdmin: boolean
  email: string | null
  userId: string | null
  name: string | null
  avatarUrl: string | null
}> {
  const supabase = await createClient()
  // proxy.ts 가 이미 인증 게이트 통과시킨 상태지만, getUser() 가 stale refresh token
  // 으로 throw 할 수 있다 (Supabase SDK 내부 로깅 노이즈). 빈 ctx 로 폴백.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    user = null
  }
  if (!user) return { isSuperAdmin: false, email: null, userId: null, name: null, avatarUrl: null }
  const { data } = await supabase
    .from('profiles')
    .select('is_super_admin, name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  return {
    isSuperAdmin: !!data?.is_super_admin,
    email: user.email ?? null,
    userId: user.id,
    name: (data?.name as string | null) ?? null,
    avatarUrl: (data?.avatar_url as string | null) ?? null,
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [initialCases, fieldDefs, importReportCountries, importReportButtonCountries, inspectionConfig, certConfig, userCtx, vaccineData, vaccineDefaults, calculatorItems, settingsBootstrap, orgId, impersonation, externalLinks, convsR] = await Promise.all([
    fetchAllCases(),
    fetchFieldDefs(),
    loadImportReportCountries(),
    loadImportReportButtonCountries(),
    loadInspectionConfig(),
    loadCertConfig(),
    fetchUserContext(),
    getOrgVaccineData(),
    getOrgVaccineDefaults(),
    getCalculatorItems(),
    getSettingsBootstrap().catch(() => null),
    getActiveOrgId().catch(() => null),
    getImpersonationInfo().catch(() => null),
    loadExternalLinks(),
    listMyConversations().catch(() => ({ ok: false as const, error: 'failed' })),
  ])
  const initialConversations: ConversationListItem[] = convsR.ok ? convsR.value : []

  // Super admin 이면 org 목록 + 운영자 목록 prefetch — 탭 전환 시 즉시 표시 (불러오기 깜빡임 제거).
  let initialOrgs: OrgSummary[] = []
  let initialSuperAdmins: SuperAdminEntry[] = []
  if (userCtx.isSuperAdmin) {
    const [orgsR, adminsR] = await Promise.all([
      listAllOrgs().catch(() => ({ ok: false as const, error: 'failed' })),
      listSuperAdminsAll().catch(() => ({ ok: false as const, error: 'failed' })),
    ])
    if (orgsR.ok) initialOrgs = orgsR.value
    if (adminsR.ok) initialSuperAdmins = adminsR.value
  }

  return (
    <CasesProvider
      initialCases={initialCases}
      fieldDefs={fieldDefs}
      initialImportReportCountries={importReportCountries}
      initialImportReportButtonCountries={importReportButtonCountries}
      initialInspectionConfig={inspectionConfig}
      initialCertConfig={certConfig}
      orgId={orgId}
    >
      <DetailViewSettingsProvider initialSettings={settingsBootstrap?.detailViewSettings}>
        <DestinationOverridesProvider initialConfig={settingsBootstrap?.destinationOverrides}>
        <VaccineDataProvider data={vaccineData} defaults={vaccineDefaults}>
          <CalculatorDataProvider initialItems={calculatorItems}>
            <DashboardShell
              isSuperAdmin={userCtx.isSuperAdmin}
              userEmail={userCtx.email}
              userName={userCtx.name}
              userAvatarUrl={userCtx.avatarUrl}
              currentUserId={userCtx.userId}
              initialSettingsBootstrap={settingsBootstrap}
              initialOrgs={initialOrgs}
              initialSuperAdmins={initialSuperAdmins}
              impersonation={impersonation}
              initialExternalLinks={externalLinks}
              initialConversations={initialConversations}
            />
            <InstallPrompt />
          </CalculatorDataProvider>
        </VaccineDataProvider>
        </DestinationOverridesProvider>
      </DetailViewSettingsProvider>
    </CasesProvider>
  )
}
