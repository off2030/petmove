'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { useCases } from '@/components/cases/cases-context'
import { TodoTable, type TodoColumn } from './todo-table'
import { InspectionTable, type InspectionRow } from './inspection-table'
import { updateCaseField } from '@/lib/actions/cases'
import { generateInvoice, generateESD, generateInvoiceAndESD } from '@/lib/actions/generate-pdf'

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement('a')
  link.href = `data:application/pdf;base64,${base64}`
  link.download = filename
  link.click()
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
  { key: 'vet_available_date', label: '내원 가능일', storage: 'data', type: 'date', width: 110 },
  { key: 'pet_name', label: '동물', storage: 'column', type: 'text', width: 90, readonly: true },
  { key: 'customer_name', label: '고객', storage: 'column', type: 'text', width: 90, readonly: true },
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
  { key: 'destination', label: '목적지', storage: 'column', type: 'text', width: 80, readonly: true },
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
  { key: 'return_date', label: '귀국일', storage: 'data', type: 'date', width: 110, condition: isJapan },
  { key: 'import_import_status', label: '수입', storage: 'data', type: 'select', width: 80, options: STATUS_WITH_NA },
  { key: 'import_export_status', label: '수출', storage: 'data', type: 'select', width: 80, options: STATUS_WITH_NA, condition: isJapan },
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
      if (!isManualImportReport(row)) return <span className="text-muted-foreground/20 text-xs">—</span>
      return (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation()
            onUpdate(row.id, 'data', 'import_report_manual', null)
            await updateCaseField(row.id, 'data', 'import_report_manual', null)
          }}
          className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors"
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

export function TodosApp() {
  const { cases, updateLocalCaseField } = useCases()
  const [activeTab, setActiveTab] = useState<TabId>('inspection')

  const filteredCases = useMemo(() => {
    if (activeTab === 'import_report') {
      return cases
        .filter(c => isAutoImportReport(c) || isManualImportReport(c))
        .sort(compareByCountryOrder)
    }
    return cases
  }, [cases, activeTab])

  const inspectionRows = useMemo(
    () => buildInspectionRows(cases).sort((a, b) => {
      const la = LAB_SORT_ORDER[a.lab] ?? 99
      const lb = LAB_SORT_ORDER[b.lab] ?? 99
      return la - lb
    }),
    [cases],
  )

  return (
    <div className="h-full overflow-hidden pt-32 pb-24 px-20 2xl:pt-36 2xl:pb-28 2xl:px-24 3xl:pt-44 3xl:pb-36 3xl:px-32 4xl:pt-52 4xl:pb-44 4xl:px-40 6xl:pt-64 6xl:pb-52 6xl:px-56">
      <div className="h-full mx-auto max-w-3xl 4xl:max-w-4xl 6xl:max-w-5xl flex flex-col">
      {/* Tabs */}
      <div className="flex gap-xs mb-4 border-b border-border shrink-0">
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

      {activeTab === 'import_report' && (
        <div className="mb-2 shrink-0">
          <ImportReportAddPicker
            cases={cases}
            onAdd={async (caseId) => {
              updateLocalCaseField(caseId, 'data', 'import_report_manual', true)
              await updateCaseField(caseId, 'data', 'import_report_manual', true)
            }}
          />
        </div>
      )}

      {/* Table */}
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

      {/* Bottom shipment document buttons — only on inspection tab */}
      {activeTab === 'inspection' && <ShipmentDocsFooter />}
      </div>
    </div>
  )
}

/** 검사 탭 하단 — Invoice + ESD 생성 버튼. 튜브 갯수 + 수신 실험실 다이얼로그. */
function ShipmentDocsFooter() {
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
    <div className="shrink-0 mt-3 pt-3 border-t border-border/40 flex items-center gap-sm">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="text-xs px-sm py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        Invoice
      </button>
      {busy && <span className="text-xs text-muted-foreground">생성 중...</span>}
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
      <div className="bg-background border border-border rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <h2 className="text-sm font-semibold mb-4">인보이스</h2>

        {/* 검체수 */}
        <div className="mb-5">
          <label className="text-xs font-medium text-foreground mb-2 block">
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
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-background text-foreground border-border hover:bg-accent'
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
          <label className="text-xs font-medium text-foreground mb-2 block">
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
            className="text-xs px-sm py-1.5 rounded border border-border text-foreground hover:bg-accent transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="text-xs px-sm py-1.5 rounded bg-slate-700 text-white hover:bg-slate-800 transition-colors"
          >
            생성
          </button>
        </div>
      </div>
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
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        + 신고 추가
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
      <ul className="absolute left-0 top-full mt-1 z-20 w-[22rem] max-h-72 overflow-y-auto scrollbar-minimal rounded-md border border-border/50 bg-background shadow-md py-1">
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
