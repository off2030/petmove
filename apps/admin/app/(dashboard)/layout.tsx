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
import { getOrgVaccineData, getOrgVaccineDefaults } from '@/lib/vaccine-data'
import { getCalculatorItems } from '@/lib/calculator-data'
import { getSettingsBootstrap } from '@/lib/actions/settings-bootstrap'
import { listActiveOrgCasesFirstPage } from '@/lib/actions/list-cases'
import { getActiveOrgId, getHomeOrg } from '@/lib/supabase/active-org'
import { listAllOrgs, listSuperAdminsAll, type OrgSummary, type SuperAdminEntry } from '@/lib/actions/super-admin'
import { listMyNotifications, type NotificationRow } from '@/lib/actions/notifications'
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
  // 임시 측정(TIMING-ORG-SWITCH, 2026-08-05) — 조직 전환이 무거운 원인 판별용.
  // fetch 별 소요시간을 모아 한 줄로 로그 → Vercel Functions 로그에서 확인.
  // 병목 판별이 끝나면 wrapper 와 로그 줄을 제거한다.
  const timings: Record<string, number> = {}
  const timed = <T,>(label: string, p: Promise<T>): Promise<T> => {
    const t0 = Date.now()
    return p.finally(() => {
      timings[label] = Date.now() - t0
    })
  }
  const tAll = Date.now()
  // 케이스 목록은 첫 배치(최신순 300)만 await — 첫 페인트가 org 전체 크기(대형 org
  // ~2MB 직렬화)에 비례하지 않게. 나머지는 CasesProvider 가 마운트 후 백그라운드 로드.
  //
  // 첫 바이트 전 대기는 이 Promise.all 한 층뿐이다(2026-08-05 조직 전환 속도 개선 B).
  //  - 알림: 평범한 notifications 테이블 단건 조회 (구 대화방+스냅샷 워터폴 폐기, 2026-08-05).
  //  - super_admin 조직·운영자 목록: 무조건 병렬 실행. 일반 직원은 액션 내부 권한
  //    체크에서 바로 실패(쿼리 1회 손해)하고, super_admin 은 별도 3단 대기가 사라진다.
  const [casesFirstPage, fieldDefs, importReportCountries, inspectionConfig, certConfig, userCtx, vaccineData, vaccineDefaults, calculatorItems, settingsBootstrap, orgId, homeOrg, notifsR, orgsR, adminsR] = await Promise.all([
    timed('cases', traceLayoutFetch('listActiveOrgCasesFirstPage', listActiveOrgCasesFirstPage())),
    timed('fieldDefs', traceLayoutFetch('fetchFieldDefs', fetchFieldDefs())),
    timed('importReport', traceLayoutFetch('loadImportReportCountries', loadImportReportCountries())),
    timed('inspection', traceLayoutFetch('loadInspectionConfig', loadInspectionConfig())),
    timed('cert', traceLayoutFetch('loadCertConfig', loadCertConfig())),
    timed('userCtx', traceLayoutFetch('fetchUserContext', fetchUserContext())),
    timed('vaccineData', traceLayoutFetch('getOrgVaccineData', getOrgVaccineData())),
    timed('vaccineDefaults', traceLayoutFetch('getOrgVaccineDefaults', getOrgVaccineDefaults())),
    timed('calculator', traceLayoutFetch('getCalculatorItems', getCalculatorItems())),
    timed('settingsBootstrap', getSettingsBootstrap().catch(() => null)),
    timed('activeOrgId', getActiveOrgId().catch(() => null)),
    timed('homeOrg', getHomeOrg().catch(() => null)),
    timed('notifications', listMyNotifications().catch(() => ({ ok: false as const, error: 'failed' }))),
    timed('superAdminOrgs', listAllOrgs().catch(() => ({ ok: false as const, error: 'failed' }))),
    timed('superAdminList', listSuperAdminsAll().catch(() => ({ ok: false as const, error: 'failed' }))),
  ])
  // TIMING-ORG-SWITCH — 느린 순 정렬 한 줄 로그.
  console.log(
    `[layout-timing] total=${Date.now() - tAll}ms ` +
      Object.entries(timings)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
  )
  const initialNotifications: NotificationRow[] = notifsR.ok ? notifsR.value : []
  const initialOrgs: OrgSummary[] = userCtx.isSuperAdmin && orgsR.ok ? orgsR.value : []
  const initialSuperAdmins: SuperAdminEntry[] = userCtx.isSuperAdmin && adminsR.ok ? adminsR.value : []

  return (
    // key={orgId} — 조직 전환(soft navigation) 시 대시보드 클라이언트 트리 전체를
    // 리마운트해 이전 조직의 클라이언트 상태(케이스 캐시·선택·채팅 등)를 통째로 버린다.
    // hard reload 없이도 "새로 켠 것과 동일한" 초기화를 보장하는 장치 (2026-08-05 D).
    <CasesProvider
      key={orgId ?? 'home'}
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
              initialNotifications={initialNotifications}
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
