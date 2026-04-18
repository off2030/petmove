'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { useCases } from '@/components/cases/cases-context'
import { TodoTable, type TodoColumn } from './todo-table'
import { InspectionTable, type InspectionRow } from './inspection-table'
import { updateCaseField } from '@/lib/actions/cases'
import { generateInvoice, generateESD } from '@/lib/actions/generate-pdf'

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement('a')
  link.href = `data:application/pdf;base64,${base64}`
  link.download = filename
  link.click()
}

/** 튜브 갯수 (1-5) + 실험실(선택) 프롬프트. 단순 prompt() 사용. null 반환 시 취소. */
function promptShipment(): { tube_count: number; consignee_lab: string } | null {
  const raw = typeof window === 'undefined' ? null : window.prompt('튜브 갯수 (1~5):', '1')
  if (!raw) return null
  const n = Math.max(1, Math.min(5, Math.trunc(Number(raw))))
  if (!Number.isFinite(n) || n < 1) { alert('1~5 사이 숫자를 입력하세요'); return null }
  const lab = typeof window === 'undefined' ? '' : (window.prompt('수신 실험실 코드 (ksvdl / ksvdl_r / vbddl, 비워두면 공란):', 'ksvdl') ?? '')
  return { tube_count: n, consignee_lab: lab.trim().toLowerCase() }
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

/** Subtract N days from YYYY-MM-DD; returns '' when input malformed. */
function subtractDays(dateStr: string | null | undefined, days: number): string {
  if (!dateStr) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mm}-${dd}`
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

/**
 * 검사 탭에 뿌릴 행 목록을 케이스별로 펼친다.
 * - 광견병항체: titer 기록 컷오프 이후 & 진행상태 ≠ done → 1행
 * - 전염병검사(호주): 출국일 있음 → 1행 (KSVDL, 날짜는 infectious_disease_records 첫 항목)
 * - 전염병검사(뉴질랜드): 출국일 있음 → 2행 (APQA HQ + VBDDL, 날짜=출국일-15일 고정)
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
    // 2) 전염병검사 — 호주/뉴질랜드 + 출국일 필수
    if (c.departure_date) {
      const isAU = matchesDestination(c, AU_KEYWORDS)
      const isNZ = matchesDestination(c, NZ_KEYWORDS)
      if (isAU) {
        const recs = readInfectiousRecords(c)
        const existing = recs.find(r => r.lab === 'ksvdl')
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
      if (isNZ) {
        const derived = subtractDays(c.departure_date, 15)
        for (const lab of ['apqa_hq', 'vbddl']) {
          rows.push({
            id: `${c.id}:inf:${lab}`,
            caseRow: c,
            kind: 'infectious',
            lab,
            date: derived,
            dateEditable: false,
            dateStorage: { kind: 'infectious', lab },
          })
        }
      }
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
  { key: 'destination', label: '목적지', storage: 'column', type: 'text', width: 80 },
  { key: 'pet_name', label: '동물', storage: 'column', type: 'text', width: 90 },
  { key: 'customer_name', label: '고객', storage: 'column', type: 'text', width: 90 },
  { key: 'import_deadline', label: '신고기한', storage: 'data', type: 'date', width: 110 },
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

/** 검사 탭 하단 — Invoice / ESD 생성 버튼. 튜브 갯수 + 수신 실험실 프롬프트. */
function ShipmentDocsFooter() {
  const [busy, startBusy] = useTransition()
  async function handle(kind: 'invoice' | 'esd') {
    const opts = promptShipment()
    if (!opts) return
    startBusy(async () => {
      const r = kind === 'invoice' ? await generateInvoice(opts) : await generateESD(opts)
      if (r.ok) downloadBase64Pdf(r.pdf, r.filename)
      else alert(`생성 실패: ${r.error}`)
    })
  }
  return (
    <div className="shrink-0 mt-3 pt-3 border-t border-border/40 flex items-center gap-2">
      <span className="text-xs text-muted-foreground mr-2">배송서류</span>
      <button
        type="button"
        onClick={() => handle('invoice')}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        Invoice
      </button>
      <button
        type="button"
        onClick={() => handle('esd')}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        ESD
      </button>
      {busy && <span className="text-xs text-muted-foreground">생성 중...</span>}
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
          <li className="px-3 py-2 text-sm text-muted-foreground">결과 없음</li>
        ) : (
          candidates.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => pick(c)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === highlight ? 'bg-accent' : 'hover:bg-accent/60'}`}
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
