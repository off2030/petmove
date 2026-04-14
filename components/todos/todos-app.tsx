'use client'

import { useState } from 'react'
import { useCases } from '@/components/cases/cases-context'
import { TodoTable, type TodoColumn } from './todo-table'

const TABS = [
  { id: 'inspection', label: '검사' },
  { id: 'export_doc', label: '출국서류' },
  { id: 'import_report', label: '수입신고' },
] as const

type TabId = (typeof TABS)[number]['id']

const STATUS_OPTIONS = [
  { value: 'not_started', label: '시작 전' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'done', label: '완료' },
]

const STATUS_WITH_NA = [
  { value: 'not_started', label: '시작 전' },
  { value: 'na', label: 'N/A' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'done', label: '완료' },
]

const URGENT_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const ROUND_TRIP_OPTIONS = [
  { value: 'yes', label: '왕복' },
  { value: 'no', label: '편도' },
]

const INSPECTION_COLUMNS: TodoColumn[] = [
  { key: 'customer_name', label: '이름', storage: 'column', type: 'text', width: 100 },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: 120 },
  { key: 'rabies_titer_date', label: '채혈일', storage: 'data', type: 'date', width: 120 },
  { key: 'inspection_lab', label: '검사기관', storage: 'data', type: 'text', width: 140 },
  { key: 'inspection_status', label: '진행 상태', storage: 'data', type: 'select', width: 110, options: STATUS_OPTIONS },
  { key: 'inspection_urgent', label: '긴급', storage: 'data', type: 'select', width: 70, options: URGENT_OPTIONS },
  { key: 'inspection_memo', label: '비고', storage: 'data', type: 'text', width: 200 },
]

const EXPORT_DOC_COLUMNS: TodoColumn[] = [
  { key: 'customer_name', label: '이름', storage: 'column', type: 'text', width: 100 },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: 120 },
  { key: 'vet_visit_date', label: '내원일', storage: 'data', type: 'date', width: 120 },
  { key: 'round_trip', label: '왕복/편도', storage: 'data', type: 'select', width: 90, options: ROUND_TRIP_OPTIONS },
  { key: 'export_doc_status', label: '준비 상태', storage: 'data', type: 'select', width: 110, options: STATUS_OPTIONS },
  { key: 'export_doc_memo', label: '비고', storage: 'data', type: 'text', width: 200 },
]

const IMPORT_REPORT_COLUMNS: TodoColumn[] = [
  { key: 'customer_name', label: '이름', storage: 'column', type: 'text', width: 100 },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: 120 },
  { key: 'return_date', label: '귀국일', storage: 'data', type: 'date', width: 120 },
  { key: 'destination', label: '국가', storage: 'column', type: 'text', width: 100 },
  { key: 'import_export_status', label: '수출', storage: 'data', type: 'select', width: 100, options: STATUS_WITH_NA },
  { key: 'import_import_status', label: '수입', storage: 'data', type: 'select', width: 100, options: STATUS_WITH_NA },
  { key: 'import_memo', label: '비고', storage: 'data', type: 'text', width: 200 },
]

const COLUMNS_MAP: Record<TabId, TodoColumn[]> = {
  inspection: INSPECTION_COLUMNS,
  export_doc: EXPORT_DOC_COLUMNS,
  import_report: IMPORT_REPORT_COLUMNS,
}

export function TodosApp() {
  const { cases, updateLocalCaseField } = useCases()
  const [activeTab, setActiveTab] = useState<TabId>('inspection')

  return (
    <div className="h-full flex flex-col px-8 py-6 4xl:px-12 4xl:py-8 6xl:px-16 6xl:py-10">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-minimal">
        <TodoTable
          cases={cases}
          columns={COLUMNS_MAP[activeTab]}
          onUpdate={updateLocalCaseField}
        />
      </div>
    </div>
  )
}
