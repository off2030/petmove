import * as Sentry from '@sentry/nextjs'
import { createClient } from '@petmove/auth/server'
import type { FieldDefinition } from '@petmove/domain'
import { CasesProvider } from '@/components/cases/cases-context'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { VaccineDataProvider } from '@/components/providers/vaccine-data-provider'
import { CalculatorDataProvider } from '@/components/providers/calculator-data-provider'
import { DetailViewSettingsProvider } from '@/components/providers/detail-view-settings-provider'
import { DestinationOverridesProvider } from '@/components/providers/destination-overrides-provider'
import { loadImportReportCountries } from '@/lib/import-report-config'
import { loadInspectionConfig } from '@/lib/inspection-config'
import { loadCertConfig } from '@/lib/cert-config'
import { loadExternalLinks } from '@/lib/external-links'
import { getOrgVaccineData, getOrgVaccineDefaults } from '@/lib/vaccine-data'
import { getCalculatorItems } from '@/lib/calculator-data'
import { getSettingsBootstrap } from '@/lib/actions/settings-bootstrap'
import { listActiveOrgCasesFirstPage } from '@/lib/actions/list-cases'
import { getActiveOrgId, getHomeOrg } from '@/lib/supabase/active-org'
import { listAllOrgs, listSuperAdminsAll, type OrgSummary, type SuperAdminEntry } from '@/lib/actions/super-admin'
import { listMyConversationsWithSnapshots, type ConversationListItem, type ConversationMessagesResult } from '@/lib/actions/chat'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { Toaster } from '@/components/ui/toaster'

export const dynamic = 'force-dynamic'

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

// 임시 진단(DIAG-REMOUNT) — 어느 fetch 가 throw 했는지 라벨로 Sentry 에 남김.
// "상세→목록 튕김" 추적: Promise.all 안의 한 promise 만 reject 해도 레이아웃이 throw →
// global-error → 리마운트. stack 만으론 라벨이 모호해 명시 tag 부착.
// 재발이 안정적으로 진단되면 wrapper 제거하고 원래 호출로 복원.
async function traceLayoutFetch<T>(label: string, p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (err) {
    Sentry.captureException(err, {
      tags: { layout_fetch: label, diag: 'remount' },
    })
    throw err
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 케이스 목록은 첫 배치(최신순 300)만 await — 첫 페인트가 org 전체 크기(대형 org
  // ~2MB 직렬화)에 비례하지 않게. 나머지는 CasesProvider 가 마운트 후 백그라운드 로드.
  //
  // 첫 바이트 전 대기는 이 Promise.all 한 층뿐이다(2026-08-05 조직 전환 속도 개선 B).
  //  - 대화 목록+메시지 스냅샷: listMyConversationsWithSnapshots 가 액션 내부에서 처리
  //    (예전엔 목록 await 후 별도 스냅샷 await — 2단 워터폴이었다).
  //  - super_admin 조직·운영자 목록: 무조건 병렬 실행. 일반 직원은 액션 내부 권한
  //    체크에서 바로 실패(쿼리 1회 손해)하고, super_admin 은 별도 3단 대기가 사라진다.
  const [casesFirstPage, fieldDefs, importReportCountries, inspectionConfig, certConfig, userCtx, vaccineData, vaccineDefaults, calculatorItems, settingsBootstrap, orgId, homeOrg, externalLinks, convsR, orgsR, adminsR] = await Promise.all([
    traceLayoutFetch('listActiveOrgCasesFirstPage', listActiveOrgCasesFirstPage()),
    traceLayoutFetch('fetchFieldDefs', fetchFieldDefs()),
    traceLayoutFetch('loadImportReportCountries', loadImportReportCountries()),
    traceLayoutFetch('loadInspectionConfig', loadInspectionConfig()),
    traceLayoutFetch('loadCertConfig', loadCertConfig()),
    traceLayoutFetch('fetchUserContext', fetchUserContext()),
    traceLayoutFetch('getOrgVaccineData', getOrgVaccineData()),
    traceLayoutFetch('getOrgVaccineDefaults', getOrgVaccineDefaults()),
    traceLayoutFetch('getCalculatorItems', getCalculatorItems()),
    getSettingsBootstrap().catch(() => null),
    getActiveOrgId().catch(() => null),
    getHomeOrg().catch(() => null),
    traceLayoutFetch('loadExternalLinks', loadExternalLinks()),
    listMyConversationsWithSnapshots().catch(() => ({ ok: false as const, error: 'failed' })),
    listAllOrgs().catch(() => ({ ok: false as const, error: 'failed' })),
    listSuperAdminsAll().catch(() => ({ ok: false as const, error: 'failed' })),
  ])
  const initialConversations: ConversationListItem[] = convsR.ok ? convsR.value.conversations : []
  const initialConvSnapshots: Record<string, ConversationMessagesResult> = convsR.ok
    ? convsR.value.snapshots
    : {}
  const initialOrgs: OrgSummary[] = userCtx.isSuperAdmin && orgsR.ok ? orgsR.value : []
  const initialSuperAdmins: SuperAdminEntry[] = userCtx.isSuperAdmin && adminsR.ok ? adminsR.value : []

  return (
    <CasesProvider
      initialCases={casesFirstPage.rows}
      initialTotalCount={casesFirstPage.totalCount}
      fieldDefs={fieldDefs}
      initialImportReportCountries={importReportCountries}
      initialInspectionConfig={inspectionConfig}
      initialCertConfig={certConfig}
      initialTodoColumnsConfig={settingsBootstrap?.todoColumnsConfig}
      orgId={orgId}
      caseAssigneeEnabled={settingsBootstrap?.caseAssigneeEnabled ?? false}
      orgMembers={(settingsBootstrap?.members ?? []).map((m) => ({
        user_id: m.user_id,
        name: m.name,
        email: m.email,
      }))}
      sharePresets={settingsBootstrap?.sharePresets ?? []}
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
              activeOrgId={orgId}
              homeOrg={homeOrg}
              initialExternalLinks={externalLinks}
              initialConversations={initialConversations}
              initialConvSnapshots={initialConvSnapshots}
            />
            <InstallPrompt />
            <Toaster />
          </CalculatorDataProvider>
        </VaccineDataProvider>
        </DestinationOverridesProvider>
      </DetailViewSettingsProvider>
    </CasesProvider>
  )
}
