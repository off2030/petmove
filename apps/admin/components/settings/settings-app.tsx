'use client'

import { useEffect, useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'
import { VaccineSection } from './vaccine-section'
import { CompanySection } from './company-section'
import { ImportReportSection } from './import-report-section'
import { InspectionSection } from './inspection-section'
import { DocumentsSection } from './documents-section'
import { VerificationSection } from './verification-section'
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
  { id: 'data', label: '데이터 관리' },
] as const

type TabId = (typeof TABS)[number]['id']

function DataSection() {
  const [showTrash, setShowTrash] = useState(false)

  return (
    <div className="max-w-2xl space-y-lg">
      {/* Trash */}
      <div>
        <h3 className="font-serif text-[17px] text-foreground pb-2 border-b border-border/60 mb-sm">휴지통</h3>
        <p className="text-sm text-muted-foreground mb-3">
          삭제된 케이스를 복원하거나 영구 삭제할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setShowTrash(true)}
          className="h-9 px-md text-sm bg-accent hover:bg-accent/90 rounded-md transition-colors"
        >
          휴지통 열기
        </button>
      </div>

      {/* Export */}
      <div>
        <h3 className="font-serif text-[17px] text-foreground pb-2 border-b border-border/60 mb-sm">데이터 내보내기</h3>
        <p className="text-sm text-muted-foreground mb-3">
          전체 케이스 데이터를 CSV 파일로 내보냅니다.
        </p>
        <button
          type="button"
          className="h-9 px-md text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors opacity-50 cursor-not-allowed"
          disabled
        >
          CSV 내보내기 (준비 중)
        </button>
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

export function SettingsApp() {
  // 서버/클라이언트 일치를 위해 초기값은 'company' 고정. hash 는 mount 후 읽음.
  const [activeTab, setActiveTab] = useState<TabId>('company')
  const [bootstrap, setBootstrap] = useState<SettingsBootstrap | null>(null)

  // 최초 마운트 시 한 번만 전체 섹션 데이터를 병렬 fetch.
  // 각 섹션은 initial prop 으로 받아 자체 useEffect fetch 를 스킵.
  useEffect(() => {
    let alive = true
    getSettingsBootstrap().then((b) => {
      if (alive) setBootstrap(b)
    })
    return () => { alive = false }
  }, [])

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
          {activeTab === 'data' && <DataSection />}
        </div>
      </div>
    </div>
  )
}
