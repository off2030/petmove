'use client'

import { useEffect, useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'
import { SectionHeader } from '@/components/ui/section-header'
import { VaccineSection } from './vaccine-section'
import { CompanySection } from './company-section'
import { ImportReportSection } from './import-report-section'
import { InspectionSection } from './inspection-section'
import { DocumentsSection } from './documents-section'
import { VerificationSection } from './verification-section'
import { AutomationSection } from './automation-section'
import { MembersSection } from './members-section'
import { ProfileSection } from './profile-section'
import { getSettingsBootstrap, type SettingsBootstrap } from '@/lib/actions/settings-bootstrap'

const TABS = [
  { id: 'profile', label: '내 프로필' },
  { id: 'company', label: '조직 정보' },
  { id: 'members', label: '멤버' },
  { id: 'vaccines', label: '약품 관리' },
  { id: 'inspection', label: '검사' },
  { id: 'import_report', label: '신고' },
  { id: 'documents', label: '서류' },
  { id: 'verification', label: '검증' },
  { id: 'automation', label: '자동화' },
  { id: 'data', label: '데이터 관리' },
] as const

type TabId = (typeof TABS)[number]['id']

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
    <div className="max-w-3xl pb-2xl">
      {/* Editorial header */}
      <header className="pb-xl">
        <SectionHeader>데이터 관리</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          삭제된 케이스 복원과 데이터 내보내기를 관리합니다.
        </p>
      </header>

      <div className="space-y-md">
        {/* Trash card */}
        <div className="flex items-center justify-between gap-md rounded-sm border border-border/60 px-lg py-md">
          <div className="min-w-0">
            <h3 className="font-serif text-[16px] text-foreground">휴지통</h3>
            <p className="pmw-st__sec-lead mt-1">
              삭제된 케이스를 복원하거나 영구 삭제할 수 있습니다. 30일 후 자동 영구 삭제됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTrash(true)}
            className="shrink-0 h-9 px-4 rounded-full border border-border/70 bg-card text-[14px] hover:border-foreground/40 transition-colors"
          >
            휴지통 열기
          </button>
        </div>

        {/* Export card — super_admin 전용 */}
        {isSuperAdmin && (
          <div className="flex items-center justify-between gap-md rounded-sm border border-border/60 px-lg py-md">
            <div className="min-w-0">
              <h3 className="font-serif text-[16px] text-foreground">데이터 내보내기</h3>
              <p className="pmw-st__sec-lead mt-1">
                활성 조직의 전체 케이스를 Excel(.xlsx)로 내려받습니다.
              </p>
              {exportError && (
                <p className="mt-1 font-serif text-[13px] text-destructive">{exportError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="shrink-0 h-9 px-4 rounded-full border border-border/70 bg-card text-[14px] hover:border-foreground/40 transition-colors disabled:opacity-50"
            >
              {exporting ? '내보내는 중…' : 'Excel 내보내기'}
            </button>
          </div>
        )}
      </div>

      {showTrash && (
        <TrashModal
          onClose={() => setShowTrash(false)}
          onRestore={() => window.location.reload()}
        />
      )}
    </div>
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
  // 서버/클라이언트 일치를 위해 초기값은 'company' 고정. hash 는 mount 후 읽음.
  const [activeTab, setActiveTab] = useState<TabId>('company')
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
    <div className="h-full overflow-hidden px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
      <div className="h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl flex flex-col gap-lg">
        {/* Page header — editorial title */}
        <div className="shrink-0 px-lg">
          <h1 className="font-serif text-[26px] leading-tight tracking-tight text-foreground">
            설정
          </h1>
        </div>

        <div className="flex gap-md border-b border-border/60 shrink-0 px-lg">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`px-1 py-2 font-serif text-[17px] transition-colors border-b -mb-px ${
                activeTab === tab.id
                  ? 'border-foreground text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground/70 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto scrollbar-minimal px-lg">
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
              isAdmin={bootstrap?.myRole?.isAdmin ?? false}
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
          {activeTab === 'documents' && <DocumentsSection />}
          {activeTab === 'verification' && <VerificationSection />}
          {activeTab === 'automation' && (
            <AutomationSection
              isAdmin={bootstrap?.myRole?.isAdmin ?? false}
              initialRules={bootstrap?.autoFillRules ?? null}
            />
          )}
          {activeTab === 'data' && <DataSection isSuperAdmin={bootstrap?.myRole?.isSuperAdmin ?? false} />}
        </div>
      </div>
    </div>
  )
}
