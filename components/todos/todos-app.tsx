'use client'

import { useMemo, useState } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { useCases } from '@/components/cases/cases-context'
import { TodoTable, type TodoColumn } from './todo-table'

const TABS = [
  { id: 'inspection', label: '검사' },
  { id: 'import_report', label: '신고' },
  { id: 'export_doc', label: '서류' },
] as const

type TabId = (typeof TABS)[number]['id']

const INSPECTION_STATUS_OPTIONS = [
  { value: 'waiting', label: '대기' },
  { value: 'testing', label: '검사중' },
  { value: 'done', label: '완료' },
]

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

const ROUND_TRIP_OPTIONS = [
  { value: 'yes', label: '왕복' },
  { value: 'no', label: '편도' },
]

const LAB_OPTIONS = [
  { value: 'komipharm', label: 'Komipharm' },
  { value: 'nvrqs_seoul', label: 'NVRQS Seoul' },
  { value: 'nvrqs_main', label: 'NVRQS HQ' },
  { value: 'ksu', label: 'KSU' },
  { value: 'ksvdl', label: 'KSVDL' },
  { value: 'vbddl', label: 'VBDDL' },
  { value: 'nvrqs_hq+vbddl', label: 'NVRQS HQ + VBDDL' },
]

const EU_COUNTRIES = new Set([
  '독일', '프랑스', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
  '스웨덴', '덴마크', '핀란드', '폴란드', '체코', '헝가리', '포르투갈',
  '그리스', '루마니아', '불가리아', '크로아티아', '슬로바키아', '슬로베니아',
  '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '몰타', '키프로스',
  '아일랜드', '영국',
])

/** Auto-detect lab from destination. Priority: 싱가포르 > EU > 일본/하와이 > 기타 */
function autoDetectLab(destination?: string | null): string {
  if (!destination) return 'komipharm'
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  // Priority order check across all destinations
  if (dests.some(d => d === '싱가포르' || d.toLowerCase() === 'singapore')) return 'ksu'
  if (dests.some(d => EU_COUNTRIES.has(d))) return 'nvrqs_main'
  if (dests.some(d => d === '일본' || d === '하와이' || d.toLowerCase() === 'japan' || d.toLowerCase() === 'hawaii')) return 'nvrqs_seoul'
  return 'komipharm'
}

/** Read the first titer record date from rabies_titer_records */
function resolveTiterDate(row: CaseRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>
  const records = data.rabies_titer_records
  if (Array.isArray(records) && records.length > 0) {
    const first = records[0] as { date?: string }
    return first.date ?? ''
  }
  // Legacy flat key fallback
  const legacy = data.rabies_titer_test_date
  return legacy ? String(legacy) : ''
}

/** Read lab from inspection_lab, fallback to auto-detect from destination */
function resolveInspectionLab(row: CaseRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>
  const saved = data.inspection_lab
  if (saved) return String(saved)
  return autoDetectLab(row.destination)
}

/** Check if case has titer date on or after 2025-04-03 */
function hasTiterDateAfterCutoff(row: CaseRow): boolean {
  const date = resolveTiterDate(row)
  if (!date) return false
  return date >= '2026-04-03'
}

/** Check if inspection is completed */
function isInspectionDone(row: CaseRow): boolean {
  const data = (row.data ?? {}) as Record<string, unknown>
  return data.inspection_status === 'done'
}

/** Sort order for labs */
const LAB_SORT_ORDER: Record<string, number> = {
  komipharm: 0,
  nvrqs_seoul: 1,
  nvrqs_main: 2,
  ksu: 3,
  ksvdl: 4,
  'nvrqs_hq+vbddl': 5,
}

function compareByLab(a: CaseRow, b: CaseRow): number {
  const labA = resolveInspectionLab(a)
  const labB = resolveInspectionLab(b)
  const orderA = LAB_SORT_ORDER[labA] ?? 99
  const orderB = LAB_SORT_ORDER[labB] ?? 99
  return orderA - orderB
}

const INSPECTION_COLUMNS: TodoColumn[] = [
  { key: 'inspection_lab', label: '검사기관', storage: 'data', type: 'select', width: 160, options: LAB_OPTIONS, resolveValue: resolveInspectionLab },
  { key: 'rabies_titer_date', label: '검사일', storage: 'data', type: 'date', width: 120, resolveValue: resolveTiterDate },
  { key: 'pet_name', label: '동물', storage: 'column', type: 'text', width: 100 },
  { key: 'customer_name', label: '고객', storage: 'column', type: 'text', width: 100 },
  { key: 'destination', label: '목적지', storage: 'column', type: 'text', width: 100 },
  { key: 'inspection_status', label: '진행상태', storage: 'data', type: 'select', width: 110, options: INSPECTION_STATUS_OPTIONS, defaultValue: 'waiting' },
  { key: 'inspection_memo', label: '메모', storage: 'data', type: 'text', width: 180 },
]

const EXPORT_DOC_COLUMNS: TodoColumn[] = [
  { key: 'vet_visit_date', label: '내원일', storage: 'data', type: 'date', width: 110 },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: 110 },
  { key: 'vet_available_date', label: '내원 가능일', storage: 'data', type: 'date', width: 110 },
  { key: 'pet_name', label: '동물', storage: 'column', type: 'text', width: 90 },
  { key: 'customer_name', label: '고객', storage: 'column', type: 'text', width: 90 },
  { key: 'export_doc_status', label: '준비상태', storage: 'data', type: 'select', width: 100, options: STATUS_OPTIONS, defaultValue: 'not_started' },
  { key: 'export_doc_memo', label: '메모', storage: 'data', type: 'text', width: 180 },
]

const IMPORT_REPORT_COUNTRY_ORDER = ['일본', '하와이', '스위스', '태국', '필리핀', '미국']
const IMPORT_REPORT_COUNTRIES = new Set(IMPORT_REPORT_COUNTRY_ORDER)

function isImportReportCountry(row: CaseRow): boolean {
  if (!row.destination) return false
  const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
  return dests.some(d => IMPORT_REPORT_COUNTRIES.has(d))
}

function isRecentCase(row: CaseRow): boolean {
  // 출국일이 있으면 4월 이후만, 없으면 접수일 기준
  if (row.departure_date) return row.departure_date >= '2026-04-01'
  return row.created_at >= '2026-04-01'
}

function compareByCountryOrder(a: CaseRow, b: CaseRow): number {
  const getOrder = (row: CaseRow) => {
    if (!row.destination) return 99
    const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
    let best = 99
    for (const d of dests) {
      const idx = IMPORT_REPORT_COUNTRY_ORDER.indexOf(d)
      if (idx >= 0 && idx < best) best = idx
    }
    return best
  }
  return getOrder(a) - getOrder(b)
}

function isJapan(row: CaseRow): boolean {
  if (!row.destination) return false
  const dests = row.destination.split(',').map(s => s.trim())
  return dests.includes('일본')
}

const IMPORT_REPORT_COLUMNS: TodoColumn[] = [
  { key: 'destination', label: '목적지', storage: 'column', type: 'text', width: 80 },
  { key: 'pet_name', label: '동물', storage: 'column', type: 'text', width: 90 },
  { key: 'customer_name', label: '고객', storage: 'column', type: 'text', width: 90 },
  { key: 'import_deadline', label: '신고기한', storage: 'data', type: 'date', width: 110 },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: 110 },
  { key: 'return_date', label: '귀국일', storage: 'data', type: 'date', width: 110, condition: isJapan },
  { key: 'import_import_status', label: '수입', storage: 'data', type: 'select', width: 80, options: STATUS_WITH_NA },
  { key: 'import_export_status', label: '수출', storage: 'data', type: 'select', width: 80, options: STATUS_WITH_NA, condition: isJapan },
  { key: 'import_memo', label: '메모', storage: 'data', type: 'text', width: 180 },
]

const COLUMNS_MAP: Record<TabId, TodoColumn[]> = {
  inspection: INSPECTION_COLUMNS,
  export_doc: EXPORT_DOC_COLUMNS,
  import_report: IMPORT_REPORT_COLUMNS,
}

export function TodosApp() {
  const { cases, updateLocalCaseField } = useCases()
  const [activeTab, setActiveTab] = useState<TabId>('inspection')

  const filteredCases = useMemo(() => {
    if (activeTab === 'inspection') {
      return cases
        .filter(c => hasTiterDateAfterCutoff(c) && !isInspectionDone(c))
        .sort(compareByLab)
    }
    if (activeTab === 'import_report') {
      return cases
        .filter(c => isImportReportCountry(c) && isRecentCase(c))
        .sort(compareByCountryOrder)
    }
    return cases
  }, [cases, activeTab])

  return (
    <div className="h-full overflow-hidden pt-32 pb-24 px-20 2xl:pt-36 2xl:pb-28 2xl:px-24 3xl:pt-44 3xl:pb-36 3xl:px-32 4xl:pt-52 4xl:pb-44 4xl:px-40 6xl:pt-64 6xl:pb-52 6xl:px-56">
      <div className="h-full mx-auto max-w-3xl 4xl:max-w-4xl 6xl:max-w-5xl flex flex-col">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border shrink-0">
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
          cases={filteredCases}
          columns={COLUMNS_MAP[activeTab]}
          onUpdate={updateLocalCaseField}
        />
      </div>
      </div>
    </div>
  )
}
