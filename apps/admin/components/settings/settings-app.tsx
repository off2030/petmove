'use client'

import { useEffect, useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'
import { SettingsShell, SettingsSection, SettingsRow } from './settings-layout'
import { VaccineSection } from './vaccine-section'
import { CompanySection } from './company-section'
import { ImportReportSection } from './import-report-section'
import { InspectionSection } from './inspection-section'
import { ExportDocSection } from './export-doc-section'
import { VerificationSection } from './verification-section'
import { AutomationSection } from './automation-section'
import { MembersSection } from './members-section'
import { ProfileSection } from './profile-section'
import { DetailViewSection } from './detail-view-section'
import { TransfersSection } from './transfers-section'
import { getSettingsBootstrap, type SettingsBootstrap } from '@/lib/actions/settings-bootstrap'

/**
 * 설정 탭 메타데이터.
 *
 * - category: 4개 그룹(`account` 계정·조직 / `case` 케이스 / `work` 업무 / `data` 데이터).
 *   현재 UI 에는 노출되지 않음 — 모델만 잡아두고 카테고리 헤더는 phase 1+ 에서 도입.
 * - visibility: `super_admin` 인 경우 슈퍼 어드민에게만 노출. 미지정 = 전체 노출.
 *   (조직 admin 만 보이는 탭은 현재 없으므로 옵션에 포함하지 않음.)
 */
type TabCategory = 'account' | 'case' | 'work' | 'data'

type TabDef = {
  id:
    | 'profile'
    | 'company'
    | 'members'
    | 'detail_view'
    | 'transfers'
    | 'vaccines'
    | 'inspection'
    | 'import_report'
    | 'export_doc'
    | 'automation'
    | 'verification'
    | 'data'
  label: string
  category: TabCategory
  visibility?: 'super_admin'
}

const TABS: readonly TabDef[] = [
  { id: 'profile', label: '내 프로필', category: 'account' },
  { id: 'company', label: '조직정보', category: 'account' },
  { id: 'members', label: '멤버', category: 'account' },
  { id: 'detail_view', label: '상세', category: 'case' },
  { id: 'transfers', label: '전달', category: 'case' },
  { id: 'vaccines', label: '약품관리', category: 'case' },
  { id: 'inspection', label: '검사', category: 'work' },
  { id: 'import_report', label: '신고', category: 'work' },
  { id: 'export_doc', label: '서류', category: 'work' },
  { id: 'automation', label: '자동화', category: 'work' },
  { id: 'verification', label: '검증', category: 'data' },
  { id: 'data', label: '데이터', category: 'data' },
] as const

type TabId = TabDef['id']

function DataSection({ isSuperAdmin = false }: { isSuperAdmin?: boolean } = {}) {
  const [showTrash, setShowTrash] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const { exportCasesXlsx } = await import('@/lib/actions/export-cases')
      const r = await exportCasesXlsx()
      if (!r.ok) {
        setExportError(r.error)
        return
      }
      const bin = atob(r.value.base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.value.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setExporting(false)
    }
  }

  return (
    <SettingsShell>
      <SettingsSection
        title="데이터 관리"
        description="삭제된 케이스 복원과 데이터 내보내기를 관리합니다."
      >
        <div className="space-y-md">
          <SettingsRow
            title="휴지통"
            description="삭제된 케이스를 복원하거나 영구 삭제할 수 있습니다. 30일 후 자동 영구 삭제됩니다."
          >
            <button
              type="button"
              onClick={() => setShowTrash(true)}
              className="shrink-0 h-9 px-4 rounded-full border border-border/80 bg-card text-[14px] hover:border-foreground/40 transition-colors"
            >
              휴지통 열기
            </button>
          </SettingsRow>

          {isSuperAdmin && (
            <SettingsRow
              title="데이터 내보내기"
              description={
                <>
                  활성 조직의 전체 케이스를 Excel(.xlsx)로 내려받습니다.
                  {exportError && (
                    <span className="block mt-1 font-serif text-[13px] text-destructive">{exportError}</span>
                  )}
                </>
              }
            >
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="shrink-0 h-9 px-4 rounded-full border border-border/80 bg-card text-[14px] hover:border-foreground/40 transition-colors disabled:opacity-50"
              >
                {exporting ? '내보내는 중…' : 'Excel 내보내기'}
              </button>
            </SettingsRow>
          )}
        </div>
      </SettingsSection>

      {showTrash && (
        <TrashModal
          onClose={() => setShowTrash(false)}
          onRestore={() => window.location.reload()}
        />
      )}
    </SettingsShell>
  )
}

function hashToTab(): TabId | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash.replace(/^#/, '')
  if (!h) return null
  const match = TABS.find((t) => t.id === h)
  return match ? (match.id as TabId) : null
}

export function SettingsApp({
  initialBootstrap = null,
}: {
  initialBootstrap?: SettingsBootstrap | null
} = {}) {
  // 서버/클라이언트 일치를 위해 초기값은 'profile' 고정. hash 는 mount 후 읽음.
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const [bootstrap, setBootstrap] = useState<SettingsBootstrap | null>(initialBootstrap)

  // 레이아웃에서 prop 으로 받았으면 fetch 스킵 — 첫 진입 lag 제거.
  // prop 이 없을 때만(비정상 경로) 클라이언트에서 자체 fetch.
  useEffect(() => {
    if (initialBootstrap) return
    let alive = true
    getSettingsBootstrap().then((b) => {
      if (alive) setBootstrap(b)
    })
    return () => { alive = false }
  }, [initialBootstrap])

  // Hash-based deep linking: mount 직후 + hashchange 모두 대응.
  useEffect(() => {
    const initial = hashToTab()
    if (initial) setActiveTab(initial)
    function onHash() {
      const t = hashToTab()
      if (t) setActiveTab(t)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function handleTabClick(id: TabId) {
    setActiveTab(id)
    // 탭 전환 시 hash 도 맞춰 업데이트 (공유·새로고침 시 같은 탭 유지).
    if (typeof window !== 'undefined') {
      const next = `#${id}`
      if (window.location.hash !== next) {
        window.history.replaceState(null, '', window.location.pathname + next)
      }
    }
  }

  return (
    <div className="h-full overflow-hidden px-md md:px-lg py-md md:py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
      <div className="h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl flex flex-col gap-lg">
        {/* Page header — editorial title */}
        <div className="shrink-0 px-md md:px-lg">
          <h1 className="font-serif text-[26px] leading-tight tracking-tight text-foreground">
            설정
          </h1>
        </div>

        {/* 탭 — 모바일은 가로 스크롤(좌우 swipe). 글자 줄바꿈 방지 (whitespace-nowrap + shrink-0). */}
        <div className="flex gap-md border-b border-border/80 shrink-0 px-md md:px-lg overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`shrink-0 whitespace-nowrap px-1 py-2 font-serif text-[15px] md:text-[17px] transition-colors border-b -mb-px ${
                activeTab === tab.id
                  ? 'border-foreground text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground/70 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto scrollbar-minimal px-md md:px-lg">
          {activeTab === 'profile' && (
            <ProfileSection initialProfile={bootstrap?.myProfile ?? null} />
          )}
          {activeTab === 'company' && (
            <CompanySection
              initialInfo={bootstrap?.companyInfo ?? null}
              initialOrgType={bootstrap?.orgType ?? null}
              isAdmin={bootstrap?.myRole?.isAdmin ?? false}
            />
          )}
          {activeTab === 'members' && (
            <MembersSection
              initialMembers={bootstrap?.members ?? null}
              initialInvites={bootstrap?.invites ?? null}
              initialSuperAdmins={bootstrap?.superAdmins ?? null}
              isAdmin={bootstrap?.myRole?.isAdmin ?? false}
              currentUserId={bootstrap?.myRole?.userId ?? null}
            />
          )}
          {activeTab === 'vaccines' && (
            <VaccineSection
              initialProducts={bootstrap?.vaccineProducts ?? null}
              isAdmin={bootstrap?.myRole?.isAdmin ?? false}
            />
          )}
          {activeTab === 'inspection' && <InspectionSection />}
          {activeTab === 'import_report' && <ImportReportSection />}
          {activeTab === 'export_doc' && <ExportDocSection />}
          {activeTab === 'verification' && <VerificationSection isSuperAdmin={bootstrap?.myRole?.isSuperAdmin ?? false} />}
          {activeTab === 'automation' && (
            <AutomationSection
              isAdmin={bootstrap?.myRole?.isAdmin ?? false}
              initialRules={bootstrap?.autoFillRules ?? null}
            />
          )}
          {activeTab === 'transfers' && <TransfersSection />}
          {activeTab === 'detail_view' && (
            <DetailViewSection initialSettings={bootstrap?.detailViewSettings} />
          )}
          {activeTab === 'data' && <DataSection isSuperAdmin={bootstrap?.myRole?.isSuperAdmin ?? false} />}
        </div>
      </div>
    </div>
  )
}
