'use client'

import { useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'
import { VaccineSection } from './vaccine-section'

const TABS = [
  { id: 'company', label: '회사 정보' },
  { id: 'vaccines', label: '약품 관리' },
  { id: 'data', label: '데이터 관리' },
] as const

type TabId = (typeof TABS)[number]['id']

function CompanySection() {
  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-muted-foreground">
        회사 정보는 PDF 서류 출력 시 사용됩니다.
      </p>
      {[
        { label: '업체명', placeholder: 'PetMove' },
        { label: '대표자', placeholder: '홍길동' },
        { label: '연락처', placeholder: '010-0000-0000' },
        { label: '이메일', placeholder: 'info@petmove.kr' },
        { label: '주소', placeholder: '서울특별시 강남구...' },
      ].map(({ label, placeholder }) => (
        <div key={label}>
          <label className="block text-sm font-medium mb-1">{label}</label>
          <input
            type="text"
            placeholder={placeholder}
            className="w-full px-sm py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            disabled
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        * 회사 정보 저장 기능은 추후 추가 예정입니다.
      </p>
    </div>
  )
}

function DataSection() {
  const [showTrash, setShowTrash] = useState(false)

  return (
    <div className="space-y-6 max-w-lg">
      {/* Trash */}
      <div className="border border-border rounded-lg p-4">
        <h3 className="font-medium mb-1">휴지통</h3>
        <p className="text-sm text-muted-foreground mb-3">
          삭제된 케이스를 복원하거나 영구 삭제할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setShowTrash(true)}
          className="px-md py-2 text-sm bg-muted hover:bg-accent rounded-lg transition-colors"
        >
          휴지통 열기
        </button>
      </div>

      {/* Export */}
      <div className="border border-border rounded-lg p-4">
        <h3 className="font-medium mb-1">데이터 내보내기</h3>
        <p className="text-sm text-muted-foreground mb-3">
          전체 케이스 데이터를 CSV 파일로 내보냅니다.
        </p>
        <button
          type="button"
          className="px-md py-2 text-sm bg-muted hover:bg-accent rounded-lg transition-colors opacity-50 cursor-not-allowed"
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

export function SettingsApp() {
  const [activeTab, setActiveTab] = useState<TabId>('company')

  return (
    <div className="h-full px-xl py-lg 4xl:px-12 4xl:py-2xl 6xl:px-16 6xl:py-10">
      <h1 className="text-xl font-semibold mb-6">설정</h1>

      <div className="flex gap-xs mb-6 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-md py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
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
      {activeTab === 'data' && <DataSection />}
    </div>
  )
}
