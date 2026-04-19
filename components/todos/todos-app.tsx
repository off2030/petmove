'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Search } from 'lucide-react'
import type { CaseRow } from '@/lib/supabase/types'
import { useCases } from '@/components/cases/cases-context'
import { Input } from '@/components/ui/input'
import { destColor } from '@/lib/destination-color'
import { cn } from '@/lib/utils'
import { TodoTable, type TodoColumn } from './todo-table'
import { InspectionTable, type InspectionRow } from './inspection-table'
import { updateCaseField } from '@/lib/actions/cases'
import {
  generateInvoice,
  generateESD,
  generateInvoiceAndESD,
  generateKsvdl,
  generateNzInfectionPack,
} from '@/lib/actions/generate-pdf'

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement('a')
  link.href = `data:application/pdf;base64,${base64}`
  link.download = filename
  link.click()
}

/** 목적지를 국가별 색상 배지로 렌더링 (홈/상세와 동일 패턴). */
function renderDestinationBadges(value: string | null | undefined) {
  const dests = (value ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (dests.length === 0) return <span className="text-muted-foreground/50">—</span>
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {dests.map(d => {
        const tone = destColor(d)
        return (
          <span key={d} className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', tone.bg, tone.text)}>
            {d}
          </span>
        )
      })}
    </span>
  )
}

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
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
  { value: 'ksvdl', label: 'KSVDL' },
  { value: 'vbddl', label: 'VBDDL' },
  { value: 'nz_combined', label: 'APQA HQ + VBDDL' },
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
  if (!destination) return 'krsl'
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  // Priority order check across all destinations
  if (dests.some(d => d === '싱가포르' || d.toLowerCase() === 'singapore')) return 'ksvdl_r'
  if (dests.some(d => EU_COUNTRIES.has(d))) return 'apqa_hq'
  if (dests.some(d => d === '일본' || d === '하와이' || d.toLowerCase() === 'japan' || d.toLowerCase() === 'hawaii')) return 'apqa_seoul'
  return 'krsl'
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

/** 검사 탭 공통 컷오프: 이 날짜 이후의 검사/출국만 탭에 올라감. */
const INSPECTION_CUTOFF_DATE = '2026-04-03'

/** Check if case has titer date on or after cutoff */
function hasTiterDateAfterCutoff(row: CaseRow): boolean {
  const date = resolveTiterDate(row)
  if (!date) return false
  return date >= INSPECTION_CUTOFF_DATE
}

/** Check if inspection is completed */
function isInspectionDone(row: CaseRow): boolean {
  const data = (row.data ?? {}) as Record<string, unknown>
  return data.inspection_status === 'done'
}

const AU_KEYWORDS = ['호주', 'australia']
const NZ_KEYWORDS = ['뉴질랜드', 'new zealand', 'nz']

function matchesDestination(row: CaseRow, keywords: string[]): boolean {
  if (!row.destination) return false
  const dests = row.destination.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return dests.some(d => keywords.some(k => d === k))
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
 * 검사 탭에 뿌릴 행 목록을 케이스별로 펼친다.
 * 공통 규칙: 상세페이지에서 검사일을 지우면 탭에서도 사라진다.
 * - 광견병항체: titer 기록 컷오프 이후 & 진행상태 ≠ done → 1행
 * - 전염병검사(호주): infectious_disease_records에 lab=ksvdl & date 존재 → 1행
 * - 전염병검사(뉴질랜드): 출국일이 있으면 APQA HQ+VBDDL 묶음 1행 (검사일 = 저장값 or 출국일-15일)
 */
function buildInspectionRows(cases: CaseRow[]): InspectionRow[] {
  const rows: InspectionRow[] = []
  for (const c of cases) {
    // 1) 광견병항체
    if (hasTiterDateAfterCutoff(c) && !isInspectionDone(c)) {
      rows.push({
        id: `${c.id}:titer`,
        caseRow: c,
        kind: 'titer',
        lab: resolveInspectionLab(c),
        date: resolveTiterDate(c),
        dateEditable: true,
        dateStorage: { kind: 'titer' },
      })
    }
    // 2) 전염병검사 — 호주/뉴질랜드
    const isAU = matchesDestination(c, AU_KEYWORDS)
    const isNZ = matchesDestination(c, NZ_KEYWORDS)
    if (isAU && !isInspectionDone(c)) {
      // 호주: 검사일(infectious ksvdl.date) 또는 출국일 중 하나라도 있으면 탭에 올림.
      // 날짜 컬럼은 검사일 있으면 그것, 없으면 빈 값(사용자가 탭에서 직접 입력).
      // 컷오프: 기준일(검사일 우선, 없으면 출국일) >= 2026-04-03.
      const recs = readInfectiousRecords(c)
      const existing = recs.find(r => r.lab === 'ksvdl')
      const referenceDate = existing?.date || c.departure_date
      if (referenceDate && referenceDate >= INSPECTION_CUTOFF_DATE) {
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
    if (isNZ && c.departure_date && !isInspectionDone(c)) {
      // 뉴질랜드: APQA HQ + VBDDL 두 검사기관을 한 행으로 묶어서 표시.
      // 검사일 수정 시 두 record(apqa_hq, vbddl)에 동시 저장.
      // 표시 날짜는 저장값 우선(apqa_hq → vbddl 순), 없으면 출국일 - 15일 자동.
      const recs = readInfectiousRecords(c)
      const existing = recs.find(r => r.lab === 'apqa_hq') ?? recs.find(r => r.lab === 'vbddl')
      const autoDate = computeNZInspectionDate(c.departure_date)
      const date = existing?.date || autoDate
      rows.push({
        id: `${c.id}:inf:nz`,
        caseRow: c,
        kind: 'infectious',
        lab: 'nz_combined',
        date,
        dateEditable: true,
        dateStorage: { kind: 'infectious_multi', labs: ['apqa_hq', 'vbddl'] },
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
  ksvdl_r: 3,
  ksvdl: 4,
  vbddl: 5,
  nz_combined: 6,
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
  {
    key: 'vet_available_date',
    label: '내원 가능일',
    storage: 'data',
    type: 'date',
    width: 110,
    // 저장된 값이 없으면 내원일 - 9일로 자동 계산하여 표시.
    resolveValue: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.vet_available_date
      if (stored != null && String(stored) !== '') return String(stored)
      const visit = data.vet_visit_date
      if (typeof visit === 'string' && visit) return addDays(visit, -9)
      return ''
    },
  },
  { key: 'pet_name', label: '동물', storage: 'column', type: 'text', width: 90, readonly: true },
  { key: 'customer_name', label: '고객', storage: 'column', type: 'text', width: 90, readonly: true },
  {
    key: 'destination',
    label: '목적지',
    storage: 'column',
    type: 'custom',
    width: 120,
    readonly: true,
    render: (row) => renderDestinationBadges(row.destination),
  },
  { key: 'export_doc_status', label: '준비상태', storage: 'data', type: 'select', width: 100, options: STATUS_OPTIONS, defaultValue: 'not_started' },
  { key: 'export_doc_memo', label: '메모', storage: 'data', type: 'text', width: 180 },
]

/**
 * 신고 탭 자동 포함 규칙:
 *   - 목적지가 이 5개국 중 하나여야 하고,
 *   - 출국일(departure_date) 이 기재되어 있어야 함.
 * 그 외 국가는 상세페이지에서 "신고 추가" 토글(`import_report_manual`)로 수동 포함.
 */
const IMPORT_REPORT_COUNTRY_ORDER = ['일본', '하와이', '스위스', '태국', '필리핀']
const IMPORT_REPORT_COUNTRIES = new Set(IMPORT_REPORT_COUNTRY_ORDER)

function isImportReportCountry(row: CaseRow): boolean {
  if (!row.destination) return false
  const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
  return dests.some(d => IMPORT_REPORT_COUNTRIES.has(d))
}

function isAutoImportReport(row: CaseRow): boolean {
  return !!row.departure_date && isImportReportCountry(row)
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
    const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
    if (dests.includes('일본')) return '일본'
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
  if (!row.destination) return false
  const dests = row.destination.split(',').map(s => s.trim())
  return dests.includes('일본')
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


const IMPORT_REPORT_COLUMNS: TodoColumn[] = [
  {
    key: 'destination',
    label: '목적지',
    storage: 'column',
    type: 'custom',
    width: 100,
    readonly: true,
    render: (row) => renderDestinationBadges(row.destination),
  },
  { key: 'pet_name', label: '동물', storage: 'column', type: 'text', width: 90, readonly: true },
  { key: 'customer_name', label: '고객', storage: 'column', type: 'text', width: 90, readonly: true },
  {
    key: 'import_deadline',
    label: '신고기한',
    storage: 'data',
    type: 'date',
    width: 110,
    // 일본: 저장된 값이 없으면 출국일 - 40일로 자동 계산하여 표시.
    resolveValue: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.import_deadline
      if (stored != null && String(stored) !== '') return String(stored)
      if (isJapan(row) && row.departure_date) return computeJapanImportDeadline(row.departure_date)
      return ''
    },
  },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: 110 },
  { key: 'return_date', label: '귀국일', storage: 'data', type: 'date', width: 110 },
  {
    key: 'import_import_status',
    label: '수입',
    storage: 'data',
    type: 'select',
    width: 80,
    options: STATUS_WITH_NA,
    resolveValue: effectiveImportStatus,
  },
  {
    key: 'import_export_status',
    label: '수출',
    storage: 'data',
    type: 'select',
    width: 80,
    options: STATUS_WITH_NA,
    resolveValue: effectiveExportStatus,
  },
  { key: 'import_memo', label: '메모', storage: 'data', type: 'text', width: 180 },
  {
    key: 'import_report_manual_remove',
    label: '',
    storage: 'data',
    type: 'custom',
    width: 32,
    // 수동 포함(import_report_manual=true)인 케이스에만 ✕ 버튼 노출.
    // 자동 포함 케이스에는 출국일이나 목적지를 지워야 탭에서 빠지므로 버튼 숨김.
    render: (row, onUpdate) => {
      if (!isManualImportReport(row)) return <span className="text-muted-foreground/20 text-sm">—</span>
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

export function TodosApp() {
  const { cases, updateLocalCaseField } = useCases()
  const [activeTab, setActiveTab] = useState<TabId>('inspection')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()

  const filteredCases = useMemo(() => {
    if (activeTab === 'import_report') {
      return cases
        .filter(c => isAutoImportReport(c) || isManualImportReport(c))
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
      const visitDate = (c: CaseRow) => {
        const d = (c.data ?? {}) as Record<string, unknown>
        const v = d.vet_visit_date
        return typeof v === 'string' && v ? v : ''
      }
      return cases
        .filter((c) => !!c.departure_date)
        .filter(c => matchesQuery(c, q))
        .sort((a, b) => {
          const va = visitDate(a)
          const vb = visitDate(b)
          const da = a.departure_date ?? ''
          const db = b.departure_date ?? ''
          // 1차: 내원일 있는 그룹 위, 없는 그룹 아래.
          if (!!va !== !!vb) return va ? -1 : 1
          // 2차: 내원일 있는 그룹은 내원일 빠른 순(asc), 동일하면 출국일 빠른 순.
          if (va && vb) {
            const cmp = va.localeCompare(vb)
            return cmp !== 0 ? cmp : da.localeCompare(db)
          }
          // 2차: 내원일 없는 그룹은 출국일 빠른 순.
          return da.localeCompare(db)
        })
    }
    return cases
  }, [cases, activeTab, q])

  const inspectionRows = useMemo(
    () => buildInspectionRows(cases)
      .filter(r => matchesQuery(r.caseRow, q))
      .sort((a, b) => {
        const la = LAB_SORT_ORDER[a.lab] ?? 99
        const lb = LAB_SORT_ORDER[b.lab] ?? 99
        return la - lb
      }),
    [cases, q],
  )

  return (
    <div className="h-full overflow-hidden px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
      <div className="h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl flex flex-col gap-md">
      {/* Tabs + search */}
      <div className="flex items-end justify-between gap-md border-b border-border/60 shrink-0">
        <div className="flex gap-xs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-md py-2 text-base font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-56 mb-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색"
            className="h-8 pl-9 text-sm bg-card"
          />
        </div>
      </div>

      {/* Card — 홈/상세와 동일한 컨테이너 스타일 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border/60 bg-card p-md shadow-sm">
        <div className="flex-1 min-h-0 overflow-auto scrollbar-minimal">
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
            />
          )}
        </div>
      </div>

      {/* Footer — 홈과 동일한 "총 N건" 패턴. h-7 로 고정해 탭별 footer 높이 편차 제거. */}
      <div className="shrink-0 h-7 flex items-center justify-between text-[13px] text-muted-foreground">
        <span>
          총 {(activeTab === 'inspection' ? inspectionRows.length : filteredCases.length).toLocaleString()}건
        </span>
        {activeTab === 'inspection' && (
          <div className="flex items-center gap-sm">
            <ShipmentDocsButton />
            <BulkApplyPicker
              label="KSVDL"
              rows={inspectionRows.filter(r => r.lab === 'ksvdl')}
              action={generateKsvdl}
            />
            <BulkApplyPicker
              label="APQA HQ + VBDDL"
              rows={inspectionRows.filter(r => r.lab === 'nz_combined')}
              action={generateNzInfectionPack}
            />
          </div>
        )}
        {activeTab === 'import_report' && (
          <ImportReportAddPicker
            cases={cases}
            onAdd={async (caseId) => {
              updateLocalCaseField(caseId, 'data', 'import_report_manual', true)
              await updateCaseField(caseId, 'data', 'import_report_manual', true)
            }}
          />
        )}
      </div>
      </div>
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
      const r = await generateInvoiceAndESD(opts)
      if (r.ok) downloadBase64Pdf(r.pdf, r.filename)
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
        className="text-[13px] rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-background border border-border/60 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
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
                      ? 'bg-[#5f5f5f] text-white border-[#5f5f5f]'
                      : 'bg-background text-foreground border-border/60 hover:bg-accent'
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
              <label key={lab.value} className="flex items-center gap-sm cursor-pointer">
                <input
                  type="radio"
                  name="consignee_lab"
                  value={lab.value}
                  checked={selectedLab === lab.value}
                  onChange={(e) => setSelectedLab(e.target.value)}
                  className="w-4 h-4"
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
            className="text-sm px-sm py-1.5 rounded-md border border-border/60 text-foreground hover:bg-accent transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="text-sm px-sm py-1.5 rounded-md bg-[#5f5f5f] text-white hover:bg-[#4a4a4a] transition-colors"
          >
            생성
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 검사 탭 하단 — 특정 lab(KSVDL / nz_combined) 행 목록에서 케이스 한 건을
 * 골라 신청서 PDF 생성. 행이 0건이면 비활성화.
 */
function BulkApplyPicker({
  label,
  rows,
  action,
}: {
  label: string
  rows: InspectionRow[]
  action: (caseId: string) => Promise<{ ok: true; pdf: string; filename: string } | { ok: false; error: string }>
}) {
  const [open, setOpen] = useState(false)
  const [busy, startBusy] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const disabled = rows.length === 0

  function pick(caseId: string) {
    setOpen(false)
    startBusy(async () => {
      const r = await action(caseId)
      if (r.ok) downloadBase64Pdf(r.pdf, r.filename)
      else alert(`생성 실패: ${r.error}`)
    })
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {busy && <span className="text-[13px] text-muted-foreground mr-sm">생성 중...</span>}
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled || busy}
        className="text-[13px] rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={disabled ? '대상 케이스가 없습니다' : `${label} 신청서 생성`}
      >
        {label}
      </button>
      {open && (
        <ul className="absolute right-0 bottom-full mb-1 z-20 w-72 max-h-72 overflow-y-auto scrollbar-minimal rounded-md border border-border/50 bg-background shadow-md py-1">
          {rows.map(r => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pick(r.caseRow.id)}
                className="w-full text-left px-sm py-1.5 text-sm hover:bg-accent/60 transition-colors"
              >
                <span>{r.caseRow.pet_name ?? '—'}</span>
                <span className="ml-2 text-muted-foreground">{r.caseRow.customer_name ?? ''}</span>
                <span className="ml-2 text-xs text-muted-foreground/70">{r.caseRow.destination ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
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
    // 이미 자동/수동으로 포함돼 있으면 후보에서 뺀다.
    const pool = cases.filter(c => !isAutoImportReport(c) && !isManualImportReport(c))
    const q = query.trim().toLowerCase()
    const filtered = !q ? pool : pool.filter(c => {
      const hay = [c.pet_name, c.pet_name_en, c.customer_name, c.destination]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
    // 최신 접수순.
    return filtered.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 30)
  }, [cases, query])

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
        className="text-[13px] text-muted-foreground rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
      >
        + 추가
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative inline-block w-72">
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
        placeholder="동물/고객/목적지 검색"
        className="w-full h-8 rounded border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
      />
      {/* 푸터 우측 배치 — 드롭다운은 위로, 우측 정렬. */}
      <ul className="absolute right-0 bottom-full mb-1 z-20 w-[22rem] max-h-72 overflow-y-auto scrollbar-minimal rounded-md border border-border/50 bg-background shadow-md py-1">
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
    </div>
  )
}
