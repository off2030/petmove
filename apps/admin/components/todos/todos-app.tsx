'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Menu, MoreHorizontal, Plus, Search } from 'lucide-react'
import type { CaseRow } from '@/lib/supabase/types'
import { useCases } from '@/components/cases/cases-context'
import { Input } from '@/components/ui/input'
import { destCode } from '@/lib/country-code'
import { matchesDestinationKey } from '@petmove/domain'
import { cn } from '@/lib/utils'
import { TodoTable, type TodoColumn } from './todo-table'
import { InspectionTable, readInspectionStatus, type InspectionRow } from './inspection-table'
import { updateCaseField } from '@/lib/actions/cases'
import { downloadPdfRequest, type PdfDownloadRequest } from '@/lib/pdf-download'
import { PageShell, PageTabs } from '@/components/ui/page-shell'

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement('a')
  link.href = `data:application/pdf;base64,${base64}`
  link.download = filename
  link.click()
}

/** 목적지를 tan pill + MONO code + Serif 이름으로 렌더링 (상세페이지 DestinationField와 동일). 항상 한 줄. */
function renderDestinationBadges(value: string | null | undefined) {
  const dests = (value ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (dests.length === 0) return <span className="text-muted-foreground/50">—</span>
  return (
    <span className="inline-flex items-center gap-sm flex-nowrap whitespace-nowrap">
      {dests.map(d => {
        const code = destCode(d)
        return (
          <span
            key={d}
            className="inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-0.5 bg-[#E5D9C2] text-[#6B5A3A] whitespace-nowrap"
          >
            {code && (
              <span className="font-mono text-[11px] uppercase tracking-[1px] text-[#7B7B5F]">
                {code}
              </span>
            )}
            <span className="font-serif text-[13px] text-[#6B5A3A]">{d}</span>
          </span>
        )
      })}
    </span>
  )
}

export const TABS = [
  { id: 'inspection', label: '검사' },
  { id: 'import_report', label: '신고' },
  { id: 'export_doc', label: '서류' },
] as const

export type TabId = (typeof TABS)[number]['id']

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
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
  { value: 'ksvdl', label: 'KSVDL' },
  { value: 'vbddl', label: 'VBDDL' },
  { value: 'nz_combined', label: 'APQA HQ + VBDDL' },
]

/**
 * Auto-detect titer lab from destination using inspection config rules.
 * 여러 목적지 중 규칙이 매칭되는 첫 국가의 첫 lab 반환, 없으면 default.
 */
function autoDetectLab(
  destination: string | null | undefined,
  rules: import('@petmove/domain').InspectionLabRule[],
  defaultLab: string,
): string {
  if (!destination) return defaultLab
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  for (const d of dests) {
    for (const r of rules) {
      if (r.countries.includes(d) && r.labs.length > 0) return r.labs[0]
    }
  }
  return defaultLab
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
function resolveInspectionLab(
  row: CaseRow,
  rules: import('@petmove/domain').InspectionLabRule[],
  defaultLab: string,
): string {
  const data = (row.data ?? {}) as Record<string, unknown>
  const saved = data.inspection_lab
  if (saved) return String(saved)
  return autoDetectLab(row.destination, rules, defaultLab)
}

interface InfectiousRecord { date?: string | null; lab?: string | null }

function readInfectiousRecords(row: CaseRow): InfectiousRecord[] {
  const data = (row.data ?? {}) as Record<string, unknown>
  const arr = data.infectious_disease_records
  return Array.isArray(arr) ? (arr as InfectiousRecord[]) : []
}

/** 뉴질랜드 전염병검사 자동 검사일 = 출국일 - 15일 (YYYY-MM-DD). */
function computeNZInspectionDate(departureDate: string): string {
  return addDays(departureDate, -15)
}

/** 일본 수입 신고기한 = 출국일 - 40일 (YYYY-MM-DD). */
function computeJapanImportDeadline(departureDate: string): string {
  return addDays(departureDate, -40)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 설정의 infectiousRules에서 특정 국가(예: '뉴질랜드') 규칙의 labs 배열을 찾는다.
 * 표시 순서는 사용자가 설정 → 전염병 규칙에서 멀티 선택한 순서를 그대로 따른다.
 * 매칭 규칙 없거나 labs 비어 있으면 fallback 반환.
 */
function findInfectiousLabs(
  rules: import('@petmove/domain').InspectionLabRule[],
  country: string,
  fallback: string[],
): string[] {
  const rule = rules.find(r => r.countries.includes(country))
  return rule && rule.labs.length > 0 ? [...rule.labs] : fallback
}

/**
 * 검사 탭에 뿌릴 행 목록을 케이스별로 펼친다.
 * 공통 규칙: 상세페이지에서 검사일을 지우면 탭에서도 사라진다.
 * - 광견병항체: titer 기록이 있으면 1행
 * - 전염병검사(호주): 검사일 또는 출국일이 있으면 1행
 * - 전염병검사(뉴질랜드): 출국일이 있으면 묶음 1행 (검사일 = 저장값 or 출국일-15일).
 *   묶음 내 검사기관 표시 순서는 설정의 뉴질랜드 규칙 labs 순서를 따름.
 */
function buildInspectionRows(
  cases: CaseRow[],
  titerRules: import('@petmove/domain').InspectionLabRule[],
  titerDefault: string,
  infectiousRules: import('@petmove/domain').InspectionLabRule[],
): InspectionRow[] {
  const rows: InspectionRow[] = []
  const nzLabs = findInfectiousLabs(infectiousRules, '뉴질랜드', ['apqa_hq', 'vbddl'])
  for (const c of cases) {
    // 1) 광견병항체
    const titerDate = resolveTiterDate(c)
    if (titerDate) {
      rows.push({
        id: `${c.id}:titer`,
        caseRow: c,
        kind: 'titer',
        lab: resolveInspectionLab(c, titerRules, titerDefault),
        date: titerDate,
        dateEditable: true,
        dateStorage: { kind: 'titer' },
      })
    }
    // 2) 전염병검사 — 호주/뉴질랜드
    const isAU = matchesDestinationKey(c.destination, 'australia')
    const isNZ = matchesDestinationKey(c.destination, 'new_zealand')
    if (isAU) {
      // 호주: 검사일(infectious ksvdl.date) 또는 출국일 중 하나라도 있으면 탭에 올림.
      // 날짜 컬럼은 검사일 있으면 그것, 없으면 빈 값(사용자가 탭에서 직접 입력).
      const recs = readInfectiousRecords(c)
      const existing = recs.find(r => r.lab === 'ksvdl')
      const referenceDate = existing?.date || c.departure_date
      if (referenceDate) {
        rows.push({
          id: `${c.id}:inf:ksvdl`,
          caseRow: c,
          kind: 'infectious',
          lab: 'ksvdl',
          date: existing?.date ?? '',
          dateEditable: true,
          dateStorage: { kind: 'infectious', lab: 'ksvdl' },
        })
      }
    }
    if (isNZ && c.departure_date) {
      // 뉴질랜드: 설정 labs 순서대로 묶음 한 행으로 표시.
      // 검사일 수정 시 묶음 내 모든 record에 동시 저장.
      // 표시 날짜는 저장값 우선(설정 순서대로 첫 hit), 없으면 출국일 - 15일 자동.
      const recs = readInfectiousRecords(c)
      const existing = nzLabs.map(lab => recs.find(r => r.lab === lab)).find(Boolean)
      const autoDate = computeNZInspectionDate(c.departure_date)
      const date = existing?.date || autoDate
      rows.push({
        id: `${c.id}:inf:nz`,
        caseRow: c,
        kind: 'infectious',
        lab: 'nz_combined',
        date,
        dateEditable: true,
        dateStorage: { kind: 'infectious_multi', labs: nzLabs },
      })
    }
  }
  return rows
}

/** Sort order for labs */
const LAB_SORT_ORDER: Record<string, number> = {
  krsl: 0,
  apqa_seoul: 1,
  apqa_hq: 2,
  vbddl: 2,
  nz_combined: 2,
  ksvdl_r: 3,
  ksvdl: 4,
}

// 모든 데이터 컬럼은 통일 너비.
const BASE_COL_W = 106

const INSPECTION_COLUMNS: TodoColumn[] = [
  // 검사 탭은 InspectionTable 로 렌더되므로 이 컬럼 집합은 실제로 그려지지 않음.
  // 단순히 inspection_lab 원본만 반환해 TodoColumn 타입 만족시킴.
  {
    key: 'inspection_lab',
    label: '검사기관',
    storage: 'data',
    type: 'select',
    width: BASE_COL_W,
    options: LAB_OPTIONS,
    resolveValue: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const v = data.inspection_lab
      return typeof v === 'string' ? v : ''
    },
  },
  { key: 'rabies_titer_date', label: '검사일', storage: 'data', type: 'date', width: BASE_COL_W, resolveValue: resolveTiterDate },
  { key: 'pet_name', label: '반려동물', storage: 'column', type: 'text', width: BASE_COL_W },
  { key: 'customer_name', label: '보호자', storage: 'column', type: 'text', width: BASE_COL_W },
  { key: 'destination', label: '목적지', storage: 'column', type: 'text', width: BASE_COL_W },
  { key: 'inspection_status', label: '진행상태', storage: 'data', type: 'select', width: BASE_COL_W, options: INSPECTION_STATUS_OPTIONS, defaultValue: 'waiting' },
  { key: 'inspection_memo', label: '메모', storage: 'data', type: 'text', width: BASE_COL_W },
]

const EXPORT_DOC_COL_W = BASE_COL_W + 18
const EXPORT_DOC_COLUMNS: TodoColumn[] = [
  {
    key: 'vet_visit_date',
    label: '내원일',
    storage: 'data',
    type: 'date',
    width: EXPORT_DOC_COL_W,
    // 내원일이 7일 이내(포함 경과분)이고 준비상태 ≠ done 이면 주황.
    cellClass: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const visit = data.vet_visit_date
      if (visit == null || String(visit) === '') return ''
      const d = new Date(String(visit))
      if (isNaN(d.getTime())) return ''
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      d.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((d.getTime() - today.getTime()) / 86400000)
      if (diffDays > 7) return ''
      const status = typeof data.export_doc_status === 'string' ? data.export_doc_status : 'not_started'
      if (status === 'done') return ''
      return 'text-orange-500'
    },
  },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: EXPORT_DOC_COL_W },
  {
    key: 'vet_available_date',
    label: '내원가능일',
    storage: 'data',
    type: 'date',
    width: EXPORT_DOC_COL_W,
    // 저장된 값이 없으면 출국일 - 9일로 자동 계산하여 표시.
    resolveValue: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.vet_available_date
      if (stored != null && String(stored) !== '') return String(stored)
      const departure = row.departure_date
      if (typeof departure === 'string' && departure) return addDays(departure, -9)
      return ''
    },
  },
  { key: 'pet_name', label: '반려동물', storage: 'column', type: 'text', width: EXPORT_DOC_COL_W, readonly: true },
  { key: 'customer_name', label: '보호자', storage: 'column', type: 'text', width: EXPORT_DOC_COL_W, readonly: true },
  {
    key: 'destination',
    label: '목적지',
    storage: 'column',
    type: 'custom',
    width: EXPORT_DOC_COL_W,
    readonly: true,
    render: (row) => renderDestinationBadges(row.destination),
  },
  { key: 'export_doc_status', label: '준비상태', storage: 'data', type: 'select', width: EXPORT_DOC_COL_W, options: STATUS_OPTIONS, defaultValue: 'not_started' },
  { key: 'export_doc_memo', label: '메모', storage: 'data', type: 'text', width: EXPORT_DOC_COL_W },
]

/**
 * 신고 탭 자동 포함 규칙:
 *   - 목적지가 대상국(설정 > 신고) 중 하나여야 하고,
 *   - 출국일(departure_date) 이 기재되어 있어야 함.
 * 그 외 국가는 상세페이지에서 "신고 추가" 토글(`import_report_manual`)로 수동 포함.
 */
function isImportReportCountry(row: CaseRow, countries: string[]): boolean {
  if (!row.destination) return false
  const set = new Set(countries)
  const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
  return dests.some(d => set.has(d))
}

function isAutoImportReport(row: CaseRow, countries: string[]): boolean {
  return !!row.departure_date && isImportReportCountry(row, countries)
}

function isManualImportReport(row: CaseRow): boolean {
  const data = (row.data ?? {}) as Record<string, unknown>
  return data.import_report_manual === true
}

/**
 * 신고 탭 정렬: 일본 우선, 그 외 국가는 한글 철자(가나다) 순.
 * 복수 목적지인 경우 가장 앞순위 국가를 기준으로 비교.
 */
function compareByCountryOrder(a: CaseRow, b: CaseRow): number {
  const primaryDest = (row: CaseRow): string => {
    if (!row.destination) return ''
    if (matchesDestinationKey(row.destination, 'japan')) return '일본'
    const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
    return dests.slice().sort((x, y) => x.localeCompare(y, 'ko'))[0] ?? ''
  }
  const da = primaryDest(a)
  const db = primaryDest(b)
  // 일본 우선.
  const ja = da === '일본' ? 0 : 1
  const jb = db === '일본' ? 0 : 1
  if (ja !== jb) return ja - jb
  // 그 외는 가나다 순. 빈 destination은 맨 아래.
  if (!da && !db) return 0
  if (!da) return 1
  if (!db) return -1
  return da.localeCompare(db, 'ko')
}

function isJapan(row: CaseRow): boolean {
  return matchesDestinationKey(row.destination, 'japan')
}

/**
 * 신고 탭 상태 디폴트 — 저장된 값이 있으면 그대로, 없으면:
 *   - 수입: 출국일 있으면 'not_started', 없으면 'na'
 *   - 수출(일본만): 귀국일 있으면 'not_started', 없으면 'na'
 */
function effectiveImportStatus(row: CaseRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>
  const stored = data.import_import_status
  if (stored != null && String(stored) !== '') return String(stored)
  return row.departure_date ? 'not_started' : 'na'
}

function effectiveExportStatus(row: CaseRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>
  // 귀국일이 없으면 저장값 무관하게 N/A. (귀국일이 없는데 수출 절차가 있을 수 없음)
  if (!data.return_date) return 'na'
  const stored = data.import_export_status
  if (stored != null && String(stored) !== '') return String(stored)
  return 'not_started'
}

/** 수입·수출 둘 다 완료(done) 혹은 N/A이면 신고 처리 끝난 건. */
function isImportReportComplete(row: CaseRow): boolean {
  const done = (s: string) => s === 'done' || s === 'na'
  return done(effectiveImportStatus(row)) && done(effectiveExportStatus(row))
}

/** 출국일이 오늘보다 전 = 이미 출국한 케이스. */
function isPastDeparture(row: CaseRow): boolean {
  const dep = row.departure_date
  if (!dep) return false
  return dep < new Date().toISOString().slice(0, 10)
}


const IMPORT_REPORT_COLUMNS: TodoColumn[] = [
  {
    key: 'destination',
    label: '목적지',
    storage: 'column',
    type: 'custom',
    width: BASE_COL_W,
    readonly: true,
    render: (row) => renderDestinationBadges(row.destination),
  },
  { key: 'pet_name', label: '반려동물', storage: 'column', type: 'text', width: BASE_COL_W, readonly: true },
  { key: 'customer_name', label: '보호자', storage: 'column', type: 'text', width: BASE_COL_W, readonly: true },
  {
    key: 'import_deadline',
    label: '신고기한',
    storage: 'data',
    type: 'date',
    width: BASE_COL_W,
    // 일본: 저장된 값이 없으면 출국일 - 40일로 자동 계산하여 표시.
    resolveValue: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.import_deadline
      if (stored != null && String(stored) !== '') return String(stored)
      if (isJapan(row) && row.departure_date) return computeJapanImportDeadline(row.departure_date)
      return ''
    },
    // 기한이 7일 이내(포함 경과분)이고 수입·수출 상태가 모두 '진행중/완료'가 아닐 때 주황.
    cellClass: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.import_deadline
      const deadline = stored != null && String(stored) !== ''
        ? String(stored)
        : (isJapan(row) && row.departure_date ? computeJapanImportDeadline(row.departure_date) : '')
      if (!deadline) return ''
      const d = new Date(deadline)
      if (isNaN(d.getTime())) return ''
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      d.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((d.getTime() - today.getTime()) / 86400000)
      if (diffDays > 7) return ''
      const suppressed = (s: string) => s === 'in_progress' || s === 'done'
      if (suppressed(effectiveImportStatus(row)) || suppressed(effectiveExportStatus(row))) return ''
      return 'text-orange-500'
    },
  },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: BASE_COL_W },
  { key: 'return_date', label: '귀국일', storage: 'data', type: 'date', width: BASE_COL_W },
  {
    key: 'import_import_status',
    label: '수입',
    storage: 'data',
    type: 'select',
    width: BASE_COL_W,
    options: STATUS_WITH_NA,
    resolveValue: effectiveImportStatus,
  },
  {
    key: 'import_export_status',
    label: '수출',
    storage: 'data',
    type: 'select',
    width: BASE_COL_W,
    options: STATUS_WITH_NA,
    resolveValue: effectiveExportStatus,
  },
  { key: 'import_memo', label: '메모', storage: 'data', type: 'text', width: BASE_COL_W + 6 },
  {
    key: 'import_report_manual_remove',
    label: '',
    storage: 'data',
    type: 'custom',
    width: 32,
    // 수동 포함(import_report_manual=true)인 케이스에만 ✕ 버튼 노출.
    // 자동 포함 케이스에는 출국일이나 목적지를 지워야 탭에서 빠지므로 버튼 숨김.
    render: (row, onUpdate) => {
      if (!isManualImportReport(row)) return null
      return (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation()
            onUpdate(row.id, 'data', 'import_report_manual', null)
            await updateCaseField(row.id, 'data', 'import_report_manual', null)
          }}
          className="text-sm text-muted-foreground/40 hover:text-red-500 transition-colors"
          title="신고 탭에서 제거"
        >
          ✕
        </button>
      )
    },
  },
]

const COLUMNS_MAP: Record<TabId, TodoColumn[]> = {
  inspection: INSPECTION_COLUMNS,
  export_doc: EXPORT_DOC_COLUMNS,
  import_report: IMPORT_REPORT_COLUMNS,
}

/** 동물/고객/목적지 매칭. 빈 query면 항상 true. */
function matchesQuery(row: CaseRow, q: string): boolean {
  if (!q) return true
  const hay = [row.pet_name, row.pet_name_en, row.customer_name, row.destination]
    .filter(Boolean).join(' ').toLowerCase()
  return hay.includes(q)
}

export function TodosApp({
  embedded = false,
  tab: forcedTab,
  query: forcedQuery,
}: {
  embedded?: boolean
  tab?: TabId
  query?: string
} = {}) {
  const { cases, updateLocalCaseField, importReportCountries, inspectionConfig } = useCases()
  const [internalTab, setInternalTab] = useState<TabId>('inspection')
  const [internalQuery, setInternalQuery] = useState('')
  const activeTab = forcedTab ?? internalTab
  const setActiveTab = setInternalTab
  const query = forcedQuery ?? internalQuery
  const setQuery = setInternalQuery

  const q = query.trim().toLowerCase()

  const filteredCases = useMemo(() => {
    if (activeTab === 'import_report') {
      return cases
        .filter(c => isAutoImportReport(c, importReportCountries) || isManualImportReport(c))
        .filter(c => matchesQuery(c, q))
        .sort((a, b) => {
          // 1차: 완료(수입·수출 모두 done/na)는 무조건 미완료(시작전·진행중)보다 뒤.
          const ca = isImportReportComplete(a) ? 1 : 0
          const cb = isImportReportComplete(b) ? 1 : 0
          if (ca !== cb) return ca - cb
          // 2차: 같은 그룹 내에서는 출국일 빠른 순(asc).
          const da = a.departure_date ?? ''
          const db = b.departure_date ?? ''
          if (da !== db) {
            if (!da) return 1
            if (!db) return -1
            return da.localeCompare(db)
          }
          // 3차: 동일 출국일이면 일본 우선 + 가나다.
          return compareByCountryOrder(a, b)
        })
    }
    if (activeTab === 'export_doc') {
      const todayStr = new Date().toISOString().slice(0, 10)
      const visitDate = (c: CaseRow) => {
        const d = (c.data ?? {}) as Record<string, unknown>
        const v = d.vet_visit_date
        return typeof v === 'string' && v ? v : ''
      }
      // 0=상단(내원일 미래), 1=중단(내원일 지남/없음, 출국일 미래), 2=하단(출국일 지남).
      const groupOf = (c: CaseRow): 0 | 1 | 2 => {
        const dep = c.departure_date ?? ''
        if (dep && dep < todayStr) return 2
        const v = visitDate(c)
        if (!v || v < todayStr) return 1
        return 0
      }
      return cases
        .filter((c) => !!c.departure_date || !!visitDate(c))
        .filter(c => matchesQuery(c, q))
        .sort((a, b) => {
          const ga = groupOf(a)
          const gb = groupOf(b)
          if (ga !== gb) return ga - gb
          const da = a.departure_date ?? ''
          const db = b.departure_date ?? ''
          if (ga === 0) {
            // 상단: 내원일 asc, 동일하면 출국일 asc.
            const cmp = visitDate(a).localeCompare(visitDate(b))
            return cmp !== 0 ? cmp : da.localeCompare(db)
          }
          // 중단·하단: 출국일 asc.
          return da.localeCompare(db)
        })
    }
    return cases
  }, [cases, activeTab, q])

  const inspectionRows = useMemo(
    () => buildInspectionRows(cases, inspectionConfig.titerRules, inspectionConfig.titerDefault, inspectionConfig.infectiousRules)
      .filter(r => matchesQuery(r.caseRow, q))
      .sort((a, b) => {
        // 0순위: 완료(done)는 무조건 가장 뒤
        const aDone = readInspectionStatus(a) === 'done'
        const bDone = readInspectionStatus(b) === 'done'
        if (aDone !== bDone) return aDone ? 1 : -1
        const da = a.date || ''
        const db = b.date || ''
        // 완료 그룹: 검사일 최신순(DESC)만 적용
        if (aDone && bDone) {
          if (!da) return 1
          if (!db) return -1
          return db.localeCompare(da)
        }
        // 비완료 그룹: 1) 검사기관 → 2) 검사일 최신순(DESC) → 3) 출국일
        const labCmp = (LAB_SORT_ORDER[a.lab] ?? 99) - (LAB_SORT_ORDER[b.lab] ?? 99)
        if (labCmp !== 0) return labCmp
        if (da !== db) {
          if (!da) return 1
          if (!db) return -1
          return db.localeCompare(da)
        }
        const ea = a.caseRow.departure_date ?? ''
        const eb = b.caseRow.departure_date ?? ''
        if (!ea) return 1
        if (!eb) return -1
        return ea.localeCompare(eb)
      }),
    [cases, q, inspectionConfig],
  )

  const right = (
    <>
      {activeTab === 'import_report' && (
        <ImportReportAddPicker
          cases={cases}
          onAdd={async (caseId) => {
            updateLocalCaseField(caseId, 'data', 'import_report_manual', true)
            await updateCaseField(caseId, 'data', 'import_report_manual', true)
          }}
        />
      )}
      <div className="relative flex-1 md:w-64">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색"
          className="h-10 pl-10 text-[15px] bg-popover text-foreground shadow-none border-border/80 rounded-full focus-visible:ring-0 focus-visible:border-foreground/40"
        />
      </div>
    </>
  )

  const footer = (
    <div className="shrink-0 h-7 px-lg flex items-center justify-between text-[13px] text-muted-foreground">
      <span>
        <span className="font-serif italic">총</span>{' '}
        <span className="font-mono tabular-nums">
          {(activeTab === 'inspection' ? inspectionRows.length : filteredCases.length).toLocaleString()}
        </span>
        <span className="font-serif italic">건</span>
      </span>
      {activeTab === 'inspection' && (
        <>
          <div className="hidden md:flex items-center gap-sm">
            <ShipmentDocsButton />
            <BulkApplyPicker
              label="KSVDL"
                    rows={inspectionRows.filter(r => r.lab === 'ksvdl')}
              request={(caseId) => ({ kind: 'single', formKey: 'KSVDL', caseId })}
            />
            <BulkApplyPicker
              label="VBDDL + APQA HQ"
                    rows={inspectionRows.filter(r => r.lab === 'nz_combined')}
              request={(caseId) => ({ kind: 'bundle', variant: 'nz-infection-pack', caseId })}
            />
          </div>
          <div className="md:hidden">
            <InspectionFooterMobileMenu>
              <ShipmentDocsButton />
              <BulkApplyPicker
                label="KSVDL"
                rows={inspectionRows.filter(r => r.lab === 'ksvdl')}
                request={(caseId) => ({ kind: 'single', formKey: 'KSVDL', caseId })}
              />
              <BulkApplyPicker
                label="VBDDL + APQA HQ"
                rows={inspectionRows.filter(r => r.lab === 'nz_combined')}
                request={(caseId) => ({ kind: 'bundle', variant: 'nz-infection-pack', caseId })}
              />
            </InspectionFooterMobileMenu>
          </div>
        </>
      )}
    </div>
  )

  const body = (
    <div className="px-md">
      {activeTab === 'inspection' ? (
        <InspectionTable
          rows={inspectionRows}
          labOptions={LAB_OPTIONS}
          statusOptions={INSPECTION_STATUS_OPTIONS}
          onUpdate={updateLocalCaseField}
        />
      ) : (
        <TodoTable
          cases={filteredCases}
          columns={COLUMNS_MAP[activeTab]}
          onUpdate={updateLocalCaseField}
          rowClass={
            activeTab === 'import_report'
              ? (row) => (isImportReportComplete(row) ? 'opacity-50 hover:opacity-100' : '')
              : activeTab === 'export_doc'
              ? (row) => (isPastDeparture(row) ? 'opacity-50 hover:opacity-100' : '')
              : undefined
          }
        />
      )}
    </div>
  )

  if (embedded) {
    return body
  }

  return (
    <PageShell
      title="할 일"
      tabs={<PageTabs tabs={TABS} value={activeTab} onChange={setActiveTab} right={right} />}
      footer={footer}
    >
      {body}
    </PageShell>
  )
}

/**
 * 신고 모드 "+ 신고 추가" 픽커. 홈화면 신고 모드 검색창 옆에서 사용.
 * 자동 포함 안 된 케이스를 수동으로 신고 탭에 올린다.
 */
export function TodosImportReportAdd() {
  const { cases, updateLocalCaseField } = useCases()
  return (
    <ImportReportAddPicker
      cases={cases}
      onAdd={async (caseId) => {
        updateLocalCaseField(caseId, 'data', 'import_report_manual', true)
        await updateCaseField(caseId, 'data', 'import_report_manual', true)
      }}
    />
  )
}

/**
 * 검사 모드 검색창 우측 — "신청서" 단일 메뉴 버튼.
 * 클릭 시 드롭다운에 Invoice / KSVDL / VBDDL + APQA HQ 항목 표시,
 * 각 항목 클릭 시 해당 다이얼로그를 연다. 검사 완료(done) 케이스는 후보에서 제외.
 */
export function TodosInspectionActions({ query }: { query: string }) {
  const { cases, inspectionConfig } = useCases()
  const q = query.trim().toLowerCase()
  const inspectionRows = useMemo(
    () =>
      buildInspectionRows(cases, inspectionConfig.titerRules, inspectionConfig.titerDefault, inspectionConfig.infectiousRules)
        .filter((r) => matchesQuery(r.caseRow, q)),
    [cases, q, inspectionConfig],
  )
  const pendingRows = inspectionRows.filter(
    (r) => readInspectionStatus(r) === 'waiting',
  )
  const ksvdlRows = pendingRows.filter((r) => r.lab === 'ksvdl')
  const nzRows = pendingRows.filter((r) => r.lab === 'nz_combined')
  // Invoice 활성화: KSVDL-R(titer) · KSVDL(호주 infectious) · VBDDL(뉴질랜드 묶음) 중 한 건이라도 진행 중이면 활성.
  const invoiceRows = pendingRows.filter(
    (r) =>
      (r.kind === 'titer' && r.lab === 'ksvdl_r') ||
      r.lab === 'ksvdl' ||
      r.lab === 'nz_combined',
  )

  const [menuOpen, setMenuOpen] = useState(false)
  const [activeDialog, setActiveDialog] = useState<'invoice' | 'ksvdl' | 'vbddl_apqa' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const itemClass = (disabled: boolean) =>
    cn(
      'w-full text-left px-sm py-2 text-sm rounded-sm transition-colors',
      disabled
        ? 'text-muted-foreground/40 cursor-not-allowed'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((p) => !p)}
        title="검사 신청서"
        aria-label="검사 신청서 메뉴"
        className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-popover text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Menu className="h-4 w-4" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md">
          <button
            type="button"
            onClick={() => { if (invoiceRows.length > 0) { setActiveDialog('invoice'); setMenuOpen(false) } }}
            disabled={invoiceRows.length === 0}
            className={itemClass(invoiceRows.length === 0)}
            title={invoiceRows.length === 0 ? '대상 케이스가 없습니다' : undefined}
          >
            Invoice
          </button>
          <button
            type="button"
            onClick={() => { if (ksvdlRows.length > 0) { setActiveDialog('ksvdl'); setMenuOpen(false) } }}
            disabled={ksvdlRows.length === 0}
            className={itemClass(ksvdlRows.length === 0)}
            title={ksvdlRows.length === 0 ? '대상 케이스가 없습니다' : undefined}
          >
            KSVDL
          </button>
          <button
            type="button"
            onClick={() => { if (nzRows.length > 0) { setActiveDialog('vbddl_apqa'); setMenuOpen(false) } }}
            disabled={nzRows.length === 0}
            className={itemClass(nzRows.length === 0)}
            title={nzRows.length === 0 ? '대상 케이스가 없습니다' : undefined}
          >
            VBDDL + APQA HQ
          </button>
        </div>
      )}
      {activeDialog === 'invoice' && (
        <InvoiceDialog onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'ksvdl' && (
        <BulkApplyDialog
          label="KSVDL"
          rows={ksvdlRows}
          request={(caseId) => ({ kind: 'single', formKey: 'KSVDL', caseId })}
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'vbddl_apqa' && (
        <BulkApplyDialog
          label="VBDDL + APQA HQ"
          rows={nzRows}
          request={(caseId) => ({ kind: 'bundle', variant: 'nz-infection-pack', caseId })}
          onClose={() => setActiveDialog(null)}
        />
      )}
    </div>
  )
}

/** 모바일 전용: 검사 탭 하단 액션을 ⋯ 메뉴 뒤로 접어 2줄 overflow 방지. */
function InspectionFooterMobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="더보기"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-2 z-50 flex flex-col items-stretch gap-1 rounded-md border border-border bg-popover shadow-lg p-1 min-w-[160px]">
          {children}
        </div>
      )}
    </div>
  )
}

/** 검사 탭 하단 — Invoice + ESD 생성 버튼. 튜브 갯수 + 수신 실험실 다이얼로그. */
function ShipmentDocsButton() {
  const [open, setOpen] = useState(false)
  const [busy, startBusy] = useTransition()

  async function handle(opts: { tube_count: number; consignee_lab: string }) {
    setOpen(false)
    startBusy(async () => {
      const r = { ok: true, error: '' }
      await downloadPdfRequest({ kind: 'shipment', variant: 'invoice-esd', ...opts }).catch((error) => {
        r.ok = false
        r.error = error instanceof Error ? error.message : 'PDF 다운로드 중 오류가 발생했습니다.'
      })
      if (r.ok) return
      else alert(`생성 실패: ${r.error}`)
    })
  }

  return (
    <div className="flex items-center gap-sm">
      {busy && <span className="text-[13px] text-muted-foreground">생성 중...</span>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        title="Invoice + ESD 생성"
        aria-label="Invoice 생성"
        className="shrink-0 inline-flex h-11 px-4 items-center justify-center rounded-full border border-border/80 bg-popover text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 text-[14px] font-serif"
      >
        Invoice
      </button>
      {open && <ShipmentDocsDialog onClose={() => setOpen(false)} onSubmit={handle} />}
    </div>
  )
}

/** 검사 탭 하단 배송서류 다이얼로그 — 튜브 갯수 + 수신 실험실 선택. */
interface ShipmentDocsDialogProps {
  onClose: () => void
  onSubmit: (opts: { tube_count: number; consignee_lab: string }) => void
}

function ShipmentDocsDialog({ onClose, onSubmit }: ShipmentDocsDialogProps) {
  const [tubeCount, setTubeCount] = useState('1')
  const [selectedLab, setSelectedLab] = useState('ksvdl_r')

  const labs = [
    { value: 'ksvdl_r', label: 'KSVDL-R' },
    { value: 'ksvdl', label: 'KSVDL' },
    { value: 'vbddl', label: 'VBDDL' },
  ]

  function handleSubmit() {
    const n = Math.trunc(Number(tubeCount))
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      alert('1~5 사이 숫자를 선택하세요')
      return
    }
    onSubmit({ tube_count: n, consignee_lab: selectedLab })
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-background border border-border/80 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <h2 className="text-base font-semibold text-primary mb-4">인보이스</h2>

        {/* 검체수 */}
        <div className="mb-5">
          <label className="text-sm font-medium text-primary mb-2 block">
            검체수
          </label>
          <div className="flex gap-sm">
            {[1, 2, 3, 4, 5].map(n => {
              const v = String(n)
              const selected = tubeCount === v
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTubeCount(v)}
                  className={`flex-1 h-8 rounded border text-sm transition-colors ${
                    selected
                      ? 'bg-primary/10 text-primary border-primary/40 font-medium'
                      : 'bg-background text-foreground border-border/80 hover:bg-accent'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        {/* 검사기관 */}
        <div className="mb-5">
          <label className="text-sm font-medium text-primary mb-2 block">
            검사기관
          </label>
          <div className="space-y-2">
            {labs.map(lab => (
              <label key={lab.value} className="flex items-center gap-sm cursor-pointer group">
                <input
                  type="radio"
                  name="consignee_lab"
                  value={lab.value}
                  checked={selectedLab === lab.value}
                  onChange={(e) => setSelectedLab(e.target.value)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'w-4 h-4 shrink-0 rounded-[3px] border border-border/80 bg-background transition-colors relative',
                    'peer-checked:bg-primary peer-checked:border-primary',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
                    "before:content-['✓'] before:absolute before:inset-0 before:flex before:items-center before:justify-center before:text-primary-foreground before:text-[11px] before:font-bold before:leading-none before:opacity-0 peer-checked:before:opacity-100",
                  )}
                  aria-hidden="true"
                />
                <span className="text-sm text-foreground">{lab.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-sm justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-sm py-1.5 rounded-md border border-border/80 text-foreground hover:bg-accent transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="text-sm px-sm py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            생성
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * 검사 신청서 케이스 선택 다이얼로그 (트리거 없음). open 상태는 외부에서 관리.
 * 메뉴 → 다이얼로그 패턴에서 사용.
 */
function BulkApplyDialog({
  label,
  rows,
  request,
  onClose,
}: {
  label: string
  rows: InspectionRow[]
  request: (caseId: string) => PdfDownloadRequest
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggle(caseId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.caseRow.id)))
  }

  async function handleGenerate() {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    onClose()
    const errors: string[] = []
    for (const caseId of ids) {
      try {
        await downloadPdfRequest(request(caseId))
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'PDF 다운로드 중 오류가 발생했습니다.')
      }
    }
    if (errors.length > 0) {
      alert(`일부 실패 (${errors.length}/${ids.length}):\n${errors.join('\n')}`)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border/80 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-primary">{label}</h2>
          <button
            type="button"
            onClick={toggleAll}
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        <ul className="max-h-80 overflow-y-auto scrollbar-minimal -mx-2 mb-4">
          {rows.map((r) => {
            const isChecked = selected.has(r.caseRow.id)
            return (
              <li key={r.id}>
                <label className="w-full px-sm py-2 rounded-md hover:bg-accent/60 transition-colors flex items-center gap-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(r.caseRow.id)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'w-4 h-4 shrink-0 rounded-[3px] border border-border/80 bg-background transition-colors relative',
                      'peer-checked:bg-primary peer-checked:border-primary',
                      'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
                      "before:content-['✓'] before:absolute before:inset-0 before:flex before:items-center before:justify-center before:text-primary-foreground before:text-[11px] before:font-bold before:leading-none before:opacity-0 peer-checked:before:opacity-100",
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-serif font-semibold text-[15px] text-foreground">
                    {r.caseRow.pet_name ?? '—'}
                  </span>
                  <span className="font-sans text-[13px] text-muted-foreground">
                    {r.caseRow.customer_name ?? ''}
                  </span>
                  <span className="ml-auto font-mono text-[11px] tracking-[0.3px] text-muted-foreground/70">
                    {r.caseRow.destination ?? ''}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end gap-sm">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-sm py-1.5 rounded-md border border-border/80 text-foreground hover:bg-accent transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={selected.size === 0}
            className="text-sm px-sm py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            생성{selected.size > 0 && ` (${selected.size})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Invoice + ESD 생성 다이얼로그 래퍼. ShipmentDocsDialog 에 submit 핸들러를 붙여
 * 외부에서 open 제어 가능하게 만듦.
 */
function InvoiceDialog({ onClose }: { onClose: () => void }) {
  async function handle(opts: { tube_count: number; consignee_lab: string }) {
    onClose()
    try {
      await downloadPdfRequest({ kind: 'shipment', variant: 'invoice-esd', ...opts })
    } catch (error) {
      alert(error instanceof Error ? error.message : 'PDF 다운로드 중 오류가 발생했습니다.')
    }
  }
  return <ShipmentDocsDialog onClose={onClose} onSubmit={handle} />
}

/**
 * 검사 탭 하단 — 특정 lab(KSVDL / nz_combined) 행 목록에서 케이스 한 건을
 * 골라 신청서 PDF 생성. 행이 0건이면 비활성화.
 */
function BulkApplyPicker({
  label,
  rows,
  request,
}: {
  label: string
  rows: InspectionRow[]
  request: (caseId: string) => PdfDownloadRequest
}) {
  const [open, setOpen] = useState(false)
  const [busy, startBusy] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 다이얼로그 닫을 때 선택 초기화.
  useEffect(() => {
    if (!open) setSelected(new Set())
  }, [open])

  const disabled = rows.length === 0
  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggle(caseId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map(r => r.caseRow.id)))
  }

  function handleGenerate() {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    setOpen(false)
    startBusy(async () => {
      const errors: string[] = []
      for (const caseId of ids) {
        try {
          await downloadPdfRequest(request(caseId))
        } catch (error) {
          errors.push(error instanceof Error ? error.message : 'PDF 다운로드 중 오류가 발생했습니다.')
        }
      }
      if (errors.length > 0) {
        alert(`일부 실패 (${errors.length}/${ids.length}):\n${errors.join('\n')}`)
      }
    })
  }

  return (
    <div className="inline-block">
      {busy && <span className="text-[13px] text-muted-foreground mr-sm">생성 중...</span>}
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled || busy}
        title={disabled ? '대상 케이스가 없습니다' : `${label} 신청서 생성`}
        aria-label={`${label} 신청서 생성`}
        className="shrink-0 inline-flex h-11 px-4 items-center justify-center rounded-full border border-border/80 bg-popover text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[14px] font-serif whitespace-nowrap"
      >
        {label}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-background border border-border/80 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-base font-semibold text-primary">{label}</h2>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto scrollbar-minimal -mx-2 mb-4">
              {rows.map(r => {
                const isChecked = selected.has(r.caseRow.id)
                return (
                  <li key={r.id}>
                    <label className="w-full px-sm py-2 rounded-md hover:bg-accent/60 transition-colors flex items-center gap-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(r.caseRow.id)}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          'w-4 h-4 shrink-0 rounded-[3px] border border-border/80 bg-background transition-colors relative',
                          'peer-checked:bg-primary peer-checked:border-primary',
                          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
                          "before:content-['✓'] before:absolute before:inset-0 before:flex before:items-center before:justify-center before:text-primary-foreground before:text-[11px] before:font-bold before:leading-none before:opacity-0 peer-checked:before:opacity-100",
                        )}
                        aria-hidden="true"
                      />
                      <span className="font-serif font-semibold text-[15px] text-foreground">
                        {r.caseRow.pet_name ?? '—'}
                      </span>
                      <span className="font-sans text-[13px] text-muted-foreground">
                        {r.caseRow.customer_name ?? ''}
                      </span>
                      <span className="ml-auto font-mono text-[11px] tracking-[0.3px] text-muted-foreground/70">
                        {r.caseRow.destination ?? ''}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="flex justify-end gap-sm">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm px-sm py-1.5 rounded-md border border-border/80 text-foreground hover:bg-accent transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={selected.size === 0}
                className="text-sm px-sm py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                생성{selected.size > 0 && ` (${selected.size})`}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * 신고 탭 상단 "신고 추가" 피커.
 * 동물명·고객명·목적지로 검색하고, 이미 탭에 포함된 케이스(자동/수동)는
 * 목록에서 제외한다. 선택 시 `data.import_report_manual = true` 로 저장.
 */
function ImportReportAddPicker({
  cases,
  onAdd,
}: {
  cases: CaseRow[]
  onAdd: (caseId: string) => void | Promise<void>
}) {
  const { importReportCountries } = useCases()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    // 검색어가 없으면 목록 표시 안 함 — "검색" 전용 UX.
    if (!q) return []
    // 이미 자동/수동으로 포함돼 있으면 후보에서 뺀다.
    const pool = cases.filter(c => !isAutoImportReport(c, importReportCountries) && !isManualImportReport(c))
    const filtered = pool.filter(c => {
      const hay = [c.pet_name, c.pet_name_en, c.customer_name, c.destination]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
    // 최신 접수순.
    return filtered.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 30)
  }, [cases, query, importReportCountries])

  useEffect(() => { setHighlight(0) }, [query])

  async function pick(c: CaseRow) {
    await onAdd(c.id)
    setOpen(false)
    setQuery('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="신고 케이스 추가"
        className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-popover text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Plus className="h-4 w-4" />
      </button>
    )
  }

  const hasQuery = query.trim() !== ''

  return (
    <div ref={containerRef} className="relative inline-block w-72">
      <Plus className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => Math.min(i + 1, candidates.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => Math.max(i - 1, 0)) }
          if (e.key === 'Enter' && candidates[highlight]) { e.preventDefault(); pick(candidates[highlight]) }
        }}
        placeholder="신고 추가"
        className="w-full h-10 rounded-full border border-border/80 bg-card pl-10 pr-3 text-[15px] focus-visible:outline-none focus-visible:border-foreground/40"
      />
      {/* 검색어가 있을 때만 결과 드롭다운 표시. 상단 우측 → 아래로 펼침. */}
      {hasQuery && (
        <ul className="absolute left-0 top-full mt-1 z-20 w-[22rem] max-h-72 overflow-y-auto scrollbar-minimal rounded-md border border-border/80 bg-background shadow-md py-1">
          {candidates.length === 0 ? (
            <li className="px-sm py-2 text-sm text-muted-foreground">결과 없음</li>
          ) : (
            candidates.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className={`w-full text-left px-sm py-1.5 text-sm transition-colors ${i === highlight ? 'bg-accent' : 'hover:bg-accent/60'}`}
                >
                  <span>{c.pet_name ?? '—'}</span>
                  <span className="ml-2 text-muted-foreground">{c.customer_name ?? ''}</span>
                  <span className="ml-2 text-xs text-muted-foreground/70">{c.destination ?? ''}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
