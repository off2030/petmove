'use client'

import { useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'
import { VaccineSection } from './vaccine-section'
import { CompanySection } from './company-section'
import { ImportReportSection } from './import-report-section'
import { InspectionSection } from './inspection-section'

const TABS = [
  { id: 'company', label: '병원 정보' },
  { id: 'vaccines', label: '약품 관리' },
  { id: 'inspection', label: '검사' },
  { id: 'import_report', label: '신고' },
  { id: 'data', label: '데이터 관리' },
] as const

type TabId = (typeof TABS)[number]['id']

function DataSection() {
  const [showTrash, setShowTrash] = useState(false)

  return (
    <div className="rounded-xl border border-border/60 bg-card p-md shadow-sm max-w-2xl">
      <div className="space-y-4">
        {/* Trash */}
        <div className="border-b border-border/60 py-2.5 px-md transition-colors hover:bg-muted/60">
          <h3 className="font-medium text-base mb-1">휴지통</h3>
          <p className="text-base text-muted-foreground mb-3">
            삭제된 케이스를 복원하거나 영구 삭제할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => setShowTrash(true)}
            className="px-md py-2.5 text-base bg-accent hover:bg-accent/90 rounded-md transition-colors"
          >
            휴지통 열기
          </button>
        </div>

        {/* Export */}
        <div className="border-b border-border/60 py-2.5 px-md transition-colors hover:bg-muted/60 last:border-b-0">
          <h3 className="font-medium text-base mb-1">데이터 내보내기</h3>
          <p className="text-base text-muted-foreground mb-3">
            전체 케이스 데이터를 CSV 파일로 내보냅니다.
          </p>
          <button
            type="button"
            className="px-md py-2.5 text-base bg-muted hover:bg-muted/80 rounded-md transition-colors opacity-50 cursor-not-allowed"
            disabled
          >
            CSV 내보내기 (준비 중)
          </button>
        </div>
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

export function SettingsApp() {
  const [activeTab, setActiveTab] = useState<TabId>('company')

  return (
    <div className="h-full overflow-auto scrollbar-minimal px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
      <div className="mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl">
      <h1 className="text-base font-semibold mb-6">설정</h1>

      <div className="flex gap-xs mb-6 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-md py-2 text-base font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'company' && <CompanySection />}
      {activeTab === 'vaccines' && <VaccineSection />}
      {activeTab === 'inspection' && <InspectionSection />}
      {activeTab === 'import_report' && <ImportReportSection />}
      {activeTab === 'data' && <DataSection />}
      </div>
    </div>
  )
}
