'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Menu, MoreHorizontal, Plus, Search } from 'lucide-react'
import type { CaseRow } from '@petmove/domain'
import { useCases } from '@/components/cases/cases-context'
import { Input } from '@/components/ui/input'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  deriveAdvanceNotificationStatus,
  deriveImportPermitStatus,
  deriveJpExportQuarantineStatus,
  flattenCaseForDestination,
  getDepartureDate,
  getVetVisitDate,
  matchesDestinationKey,
  parseDestinations,
  readByDestValue,
  resolveTabActiveDest,
} from '@petmove/domain'
import { cn } from '@/lib/utils'
import { dismissImportReport } from '@/lib/actions/cases'
import { TodoTable, type TodoColumn } from './todo-table'
import { InspectionTable, readInspectionStatus, type InspectionRow } from './inspection-table'
import { DestinationCell } from './destination-cell'
import { updateCaseField } from '@/lib/actions/cases'
import { downloadPdfRequest, type PdfDownloadRequest } from '@/lib/pdf-download'
import { PageShell, PageTabs } from '@petmove/ui'


/* DestinationCell 은 ./destination-cell 로 이동 — 검사·신고·서류·목록 공통 사용. */

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

// 검사 탭 정렬 모드 — 상단 라벨 클릭으로 전환, 선택은 localStorage 에 기억.
type InspectionSort = 'lab' | 'date' | 'status'
const INSPECTION_SORT_KEY = 'petmove:inspection-sort'
// 진행상태 정렬 순서(미완료 그룹 내) — 대기 → 검사중. 완료는 별도(항상 맨 아래).
const INSPECTION_STATUS_ORDER: Record<string, number> = { waiting: 0, testing: 1 }

// 서류 탭 준비상태 — 대기/완료 2지. (export_doc_status 전용. 기존 'in_progress' 값은
// 운영 DB 에 0건이라 옵션 제거. 다른 column 은 INSPECTION_STATUS_OPTIONS /
// STATUS_WITH_NA 를 별도로 씀.)
const STATUS_OPTIONS = [
  { value: 'not_started', label: '대기' },
  { value: 'done', label: '완료' },
]

const STATUS_WITH_NA = [
  { value: 'not_started', label: '대기중' },
  { value: 'na', label: 'N/A' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'done', label: '완료' },
]

// nz_combined 은 실제 lab 이 아닌 NZ 묶음 행 식별용 내부 마커 (정렬·필터용).
// 칩은 multi-lab 분기에서 apqa_hq/vbddl 각각 렌더되므로 옵션·색상 매핑 모두 불필요.
const LAB_OPTIONS = [
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'apqa_eu', label: 'APQA EU' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
  { value: 'ksvdl', label: 'KSVDL' },
  { value: 'vbddl', label: 'VBDDL' },
  { value: 'arc_ovi', label: 'ARC-OVI' },
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

interface TiterEntry { date: string; lab: string | null; recordIdx: number }

/**
 * 케이스의 모든 광견병항체 record 를 검사 탭 행 생성용으로 정규화.
 * record 가 없으면 legacy flat key 를 1건으로 폴백 (record idx 0).
 */
function readAllTiterEntries(row: CaseRow): TiterEntry[] {
  const data = (row.data ?? {}) as Record<string, unknown>
  const records = data.rabies_titer_records
  if (Array.isArray(records) && records.length > 0) {
    const out: TiterEntry[] = []
    records.forEach((r, idx) => {
      if (!r || typeof r !== 'object') return
      const rec = r as { date?: string | null; lab?: string | null }
      if (typeof rec.date === 'string' && rec.date) {
        out.push({ date: rec.date, lab: typeof rec.lab === 'string' ? rec.lab : null, recordIdx: idx })
      }
    })
    return out
  }
  // Legacy flat key fallback (record idx 0).
  const legacy = data.rabies_titer_test_date
  if (legacy) {
    return [{ date: String(legacy), lab: null, recordIdx: 0 }]
  }
  return []
}

/** 첫 record 의 date — 컬럼 resolveValue 호환용 (`rabies_titer_date` 컬럼). */
function resolveTiterDate(row: CaseRow): string {
  const entries = readAllTiterEntries(row)
  return entries.length > 0 ? entries[0].date : ''
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

/** 케이스 종(dog/cat). 도메인 procedure-check 와 동일 컨벤션(data.species). */
function caseSpecies(row: CaseRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>
  return typeof data.species === 'string' ? data.species : ''
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

// ── 다중 목적지 by_dest 인지 헬퍼 ──────────────────────────────────────────
// 출국일·내원일은 목적지별(data.by_dest[목적지])로 저장될 수 있다. 탭은 활성
// 목적지(override ?? 출국일 있는 목적지 ?? 첫 목적지) 기준으로 읽고, 포함 판정은
// 모든 목적지를 스캔한다. 단일 목적지면 컬럼/top-level 폴백이라 기존 동작 유지.
const IMPORT_REPORT_DEST_KEY = 'import_report_active_dest'
const EXPORT_DOC_DEST_KEY = 'export_doc_active_dest'

/** 서류 탭 활성 목적지 출국일. */
function exportDocDeparture(row: CaseRow): string {
  return getDepartureDate(row, resolveTabActiveDest(row, EXPORT_DOC_DEST_KEY)) ?? ''
}
/** 서류 탭 활성 목적지 내원일. */
function exportDocVetVisit(row: CaseRow): string {
  return getVetVisitDate(row, resolveTabActiveDest(row, EXPORT_DOC_DEST_KEY)) ?? ''
}
/** 서류 탭 활성 목적지 기준으로 평탄화한 뷰. */
function exportDocView(row: CaseRow): CaseRow {
  return flattenCaseForDestination(row, resolveTabActiveDest(row, EXPORT_DOC_DEST_KEY))
}
/** 서류 탭 준비상태 — 활성 목적지 by_dest 우선. */
function exportDocStatus(row: CaseRow): string {
  const data = (exportDocView(row).data ?? {}) as Record<string, unknown>
  const status = data.export_doc_status
  return typeof status === 'string' && status ? status : 'not_started'
}
/** 서류 탭 메모 — 활성 목적지 by_dest 우선. */
function exportDocMemo(row: CaseRow): string {
  const data = (exportDocView(row).data ?? {}) as Record<string, unknown>
  const memo = data.export_doc_memo
  return typeof memo === 'string' ? memo : ''
}
/** 신고 탭 활성 목적지 출국일. */
function importReportDeparture(row: CaseRow): string {
  return getDepartureDate(row, resolveTabActiveDest(row, IMPORT_REPORT_DEST_KEY)) ?? ''
}
/** 신고 탭 활성 목적지 귀국일 (by_dest 우선) — 수출 검역 상태 판정용. */
function importReportReturnDate(row: CaseRow): string {
  const activeDest = resolveTabActiveDest(row, IMPORT_REPORT_DEST_KEY)
  const data = (row.data as Record<string, unknown> | null) ?? null
  const v = readByDestValue(data, activeDest, 'return_date')
  if (typeof v === 'string' && v) return v
  // 다중 목적지 + 특정 목적지 지정: top-level fallback 안 함 — 누수 차단(B).
  if (activeDest && parseDestinations(row.destination).length > 1) return ''
  const top = data?.return_date
  return typeof top === 'string' && top ? top : ''
}
/** 케이스의 어떤 목적지든 출국일이 있는지 (by_dest 우선 + 컬럼 폴백). */
function anyDestHasDeparture(row: CaseRow): boolean {
  const dests = parseDestinations(row.destination)
  if (dests.length === 0) return !!row.departure_date
  return dests.some((d) => !!getDepartureDate(row, d))
}
/** 특정 검사국(예: 'australia')에 해당하는 목적지의 출국일 (by_dest 우선). */
function destDeparture(row: CaseRow, destKey: string): string {
  const dests = parseDestinations(row.destination)
  const match = dests.find((d) => matchesDestinationKey(d, destKey))
  if (!match) return ''
  return getDepartureDate(row, match) ?? ''
}
/** 케이스의 어떤 목적지든 내원일이 있는지. */
function anyDestHasVetVisit(row: CaseRow): boolean {
  const dests = parseDestinations(row.destination)
  if (dests.length === 0) {
    const v = (row.data as Record<string, unknown> | null)?.vet_visit_date
    return typeof v === 'string' && !!v
  }
  return dests.some((d) => !!getVetVisitDate(row, d))
}
/**
 * 신고 마감일 자동 계산 — 활성 목적지가 일본이고 그 목적지 출국일이 있으면 -40일.
 * 그 외 국가는 마감 규칙 미정 → 빈값(운영자 수기). 향후 국가별 규칙 추가 지점.
 */
function autoImportDeadline(row: CaseRow): string {
  const activeDest = resolveTabActiveDest(row, IMPORT_REPORT_DEST_KEY)
  const dep = getDepartureDate(row, activeDest)
  if (matchesDestinationKey(activeDest, 'japan') && dep) return computeJapanImportDeadline(dep)
  return ''
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
    // 1) 광견병항체 — record 마다 별도 행. 재검사 등으로 record 가 여러 개면 각각 추적.
    const titerEntries = readAllTiterEntries(c)
    for (const entry of titerEntries) {
      rows.push({
        id: `${c.id}:titer:${entry.recordIdx}`,
        caseRow: c,
        kind: 'titer',
        // record 별 lab 우선, 없으면 case-level inspection_lab (구 데이터), 그것도 없으면 자동 감지.
        lab: entry.lab || resolveInspectionLab(c, titerRules, titerDefault),
        date: entry.date,
        dateEditable: true,
        dateStorage: { kind: 'titer', recordIdx: entry.recordIdx },
      })
    }
    // 2) 전염병검사 — 호주/뉴질랜드
    const isAU = matchesDestinationKey(c.destination, 'australia')
    const isNZ = matchesDestinationKey(c.destination, 'new_zealand')
    if (isAU && caseSpecies(c) === 'dog') {
      // 호주 전염병검사(KSVDL)는 강아지 전용 — 고양이 제외 (au.ts 도메인 룰과 일치).
      // 검사일(infectious ksvdl.date) 또는 호주 출국일(by_dest 우선) 중 하나라도
      // 있으면 탭에 올림. 날짜 컬럼은 검사일 있으면 그것, 없으면 빈 값(직접 입력).
      const recs = readInfectiousRecords(c)
      const existing = recs.find(r => r.lab === 'ksvdl')
      const referenceDate = existing?.date || destDeparture(c, 'australia')
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
    const nzDeparture = destDeparture(c, 'new_zealand')
    if (isNZ && nzDeparture && caseSpecies(c) === 'dog') {
      // 뉴질랜드 전염병검사도 강아지 전용 — 고양이 제외 (nz.ts 도메인 룰과 일치).
      // 설정 labs 순서대로 묶음 한 행으로 표시.
      // 검사일 수정 시 묶음 내 모든 record에 동시 저장.
      // 표시 날짜는 저장값 우선(설정 순서대로 첫 hit), 없으면 뉴질랜드 출국일 - 15일 자동.
      const recs = readInfectiousRecords(c)
      const existing = nzLabs.map(lab => recs.find(r => r.lab === lab)).find(Boolean)
      const autoDate = computeNZInspectionDate(nzDeparture)
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
    // 3) 전염병검사 — 그 외 국가 (설정 infectiousRules 매칭). AU/NZ 는 위에서 전용 처리.
    //    케이스의 목적지 토큰마다 매칭 규칙의 lab 별로 1행. 검사일(해당 lab record) 또는
    //    그 목적지 출국일 중 하나라도 있으면 탭에 올린다(호주 동작과 동일).
    const infRecs = readInfectiousRecords(c)
    for (const dest of parseDestinations(c.destination)) {
      if (matchesDestinationKey(dest, 'australia') || matchesDestinationKey(dest, 'new_zealand')) continue
      const rule = infectiousRules.find(r => r.countries.includes(dest))
      if (!rule || rule.labs.length === 0) continue
      const depDate = getDepartureDate(c, dest) ?? ''
      for (const lab of rule.labs) {
        const existing = infRecs.find(r => r.lab === lab)
        const referenceDate = existing?.date || depDate
        if (!referenceDate) continue
        rows.push({
          id: `${c.id}:inf:${dest}:${lab}`,
          caseRow: c,
          kind: 'infectious',
          lab,
          date: existing?.date ?? '',
          dateEditable: true,
          dateStorage: { kind: 'infectious', lab },
        })
      }
    }
  }
  return rows
}

/** Sort order for labs */
// 검사기관 정렬 순서 — KRSL → APQA SEOUL → APQA EU → KSVDL-R → KSVDL → VBDDL → APQA HQ → ARC-OVI.
// nz_combined(VBDDL+APQA HQ 묶음)은 VBDDL 자리에 둔다.
const LAB_SORT_ORDER: Record<string, number> = {
  krsl: 0,
  apqa_seoul: 1,
  apqa_eu: 2,
  ksvdl_r: 3,
  ksvdl: 4,
  vbddl: 5,
  nz_combined: 5,
  apqa_hq: 6,
  arc_ovi: 7,
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
    // 활성 목적지 내원일 (by_dest 우선) 표시. 편집은 TodoTable 이 active dest 로 라우팅.
    resolveValue: (row) => exportDocVetVisit(row),
    // 내원일이 7일 이내(포함 경과분)이고 준비상태 ≠ done 이면 주황.
    cellClass: (row) => {
      const visit = exportDocVetVisit(row)
      if (!visit) return ''
      const d = new Date(visit)
      if (isNaN(d.getTime())) return ''
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      d.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((d.getTime() - today.getTime()) / 86400000)
      if (diffDays > 7) return ''
      if (exportDocStatus(row) === 'done') return ''
      return 'text-pmw-warning'
    },
  },
  {
    key: 'departure_date',
    label: '출국일',
    storage: 'column',
    type: 'date',
    width: EXPORT_DOC_COL_W,
    // 활성 목적지 출국일 (by_dest 우선) 표시.
    resolveValue: (row) => exportDocDeparture(row),
  },
  {
    key: 'vet_available_date',
    label: '내원가능일',
    storage: 'data',
    type: 'date',
    width: EXPORT_DOC_COL_W,
    // 저장된 값이 없으면 활성 목적지 출국일 - 9일로 자동 계산하여 표시.
    resolveValue: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.vet_available_date
      if (stored != null && String(stored) !== '') return String(stored)
      const departure = exportDocDeparture(row)
      if (departure) return addDays(departure, -9)
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
    render: (row, onUpdate) => (
      <DestinationCell row={row} overrideKey="export_doc_active_dest" onUpdate={onUpdate} />
    ),
  },
  {
    key: 'export_doc_status',
    label: '준비상태',
    storage: 'data',
    type: 'select',
    width: EXPORT_DOC_COL_W,
    options: STATUS_OPTIONS,
    defaultValue: 'not_started',
    resolveValue: exportDocStatus,
  },
  { key: 'export_doc_memo', label: '메모', storage: 'data', type: 'text', width: EXPORT_DOC_COL_W, resolveValue: exportDocMemo },
]


/**
 * 자동 포함 판정 — 신고국이면서 출국일(by_dest 우선)이 있는 목적지가 있어야 함.
 *
 * 활성 목적지(import_report_active_dest)가 명시 저장돼 있으면 그 목적지 기준으로만
 * 판정 (비-신고국으로 옮겨 두면 자동 포함 안 됨). 저장값 없으면 케이스의 모든
 * 목적지를 스캔 — 다중 목적지에서 한 목적지에만 출국일이 있어도 포함된다.
 */
function isAutoImportReport(row: CaseRow, countries: string[]): boolean {
  const data = (row.data ?? {}) as Record<string, unknown>
  const active = data.import_report_active_dest
  if (typeof active === 'string' && active) {
    return countries.includes(active) && !!getDepartureDate(row, active)
  }
  const dests = parseDestinations(row.destination)
  return dests.some((d) => countries.includes(d) && !!getDepartureDate(row, d))
}

function isManualImportReport(row: CaseRow): boolean {
  const data = (row.data ?? {}) as Record<string, unknown>
  return data.import_report_manual === true
}

/** 사용자가 "신고 내리기" 로 명시적으로 비활성화한 케이스. 신고 탭에서 숨김. */
function isDismissedImportReport(row: CaseRow): boolean {
  const data = (row.data ?? {}) as Record<string, unknown>
  return data.import_report_dismissed === true
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
 * 수입 허가(import-permit) step 으로 신고 상태를 도출하는 목적지 — 태국·필리핀.
 * 이들은 일본식 사전신고가 아니라 수입 허가증 신청·발급 2단계라, 신고 탭 '수입' 칸을
 * portal 의 허가 step 시그널과 같은 derive 로 잇는다. (명시 분류 — country='all' 누수 금지)
 */
function usesImportPermitReport(row: CaseRow): boolean {
  return (
    matchesDestinationKey(row.destination, 'thailand') ||
    matchesDestinationKey(row.destination, 'philippines')
  )
}

/**
 * 신고 탭 상태 — 일본 케이스는 공용 derive 헬퍼([[deriveAdvanceNotificationStatus]])로,
 * 그 외 destination 은 stored 값만 본다. derive 헬퍼는 portal 의 사전 신고 step 도 같이
 * 사용 — 한곳에 모아 양쪽이 비대칭으로 보이지 않게 한다.
 *
 * 수출은 추가로 귀국일 없으면 'na' (admin 만의 표기).
 */
function effectiveImportStatus(row: CaseRow): string {
  // 일본 derive 는 신청일·skip 등 by_dest 스코핑 필드를 top-level 에서 읽으므로(단일 출처 계약),
  // 활성 목적지로 평탄화한 view 를 넘긴다 — 안 그러면 by_dest 에 저장된 신청일을 못 봐 상태가
  // portal(평탄화함)과 어긋난다. (admin 수출/수입 칸이 펫무브앱과 달리 '대기중'으로 보이던 버그.)
  if (isJapan(row)) {
    const view = flattenCaseForDestination(row, resolveTabActiveDest(row, IMPORT_REPORT_DEST_KEY))
    return deriveAdvanceNotificationStatus(view)
  }
  // 태국·필리핀 — 수입 허가 step 시그널(신청일·완료·첨부·허가번호)로 derive. 신청일·완료 플래그가
  // by_dest 스코핑이라 활성 목적지로 평탄화한 view 를 넘긴다(일본 derive 와 동일 컨벤션).
  if (usesImportPermitReport(row)) {
    const view = flattenCaseForDestination(row, resolveTabActiveDest(row, IMPORT_REPORT_DEST_KEY))
    return deriveImportPermitStatus(view)
  }
  const data = (row.data ?? {}) as Record<string, unknown>
  const stored = data.import_import_status
  if (stored != null && String(stored) !== '') return String(stored)
  return 'not_started'
}

function effectiveExportStatus(row: CaseRow): string {
  if (!importReportReturnDate(row)) return 'na'
  // 일본 derive 는 신청일(by_dest) 을 top-level 에서 읽으므로 활성 목적지로 평탄화 후 넘긴다.
  // (평탄화 안 하면 신청일을 못 봐 'done'→'in_progress'로 오판 → 펫무브앱과 불일치.)
  if (isJapan(row)) {
    const view = flattenCaseForDestination(row, resolveTabActiveDest(row, IMPORT_REPORT_DEST_KEY))
    return deriveJpExportQuarantineStatus(view)
  }
  const data = (row.data ?? {}) as Record<string, unknown>
  const stored = data.import_export_status
  if (stored != null && String(stored) !== '') return String(stored)
  return 'not_started'
}

/** 수입·수출 둘 다 완료(done) 혹은 N/A이면 신고 처리 끝난 건. */
function isImportReportComplete(row: CaseRow): boolean {
  const done = (s: string) => s === 'done' || s === 'na'
  return done(effectiveImportStatus(row)) && done(effectiveExportStatus(row))
}

/** 활성 목적지 출국일이 오늘보다 전 = 이미 출국한 케이스. */
function isPastDeparture(row: CaseRow): boolean {
  const dep = exportDocDeparture(row)
  if (!dep) return false
  return dep < new Date().toISOString().slice(0, 10)
}

/**
 * 출국일 미정 + 준비상태 완료 + 내원일 경과 = 사실상 마무리된 케이스.
 * 서류 탭에서 dim 처리하고 정렬상 하단으로 보낸다. (활성 목적지 기준)
 */
function isExportDocFinishedNoDeparture(row: CaseRow): boolean {
  if (exportDocDeparture(row)) return false
  if (exportDocStatus(row) !== 'done') return false
  const v = exportDocVetVisit(row)
  if (!v) return false
  return v < new Date().toISOString().slice(0, 10)
}


const IMPORT_REPORT_COLUMNS: TodoColumn[] = [
  {
    key: 'destination',
    label: '목적지',
    storage: 'column',
    type: 'custom',
    width: BASE_COL_W,
    readonly: true,
    render: (row, onUpdate) => (
      <DestinationCell
        row={row}
        overrideKey="import_report_active_dest"
        onUpdate={onUpdate}
        dismissAction={{
          label: '신고 내리기',
          dismissKey: 'import_report_dismissed',
          action: dismissImportReport,
          confirm: {
            message: '신고를 취소할까요?',
            description:
              '수입·수출 신고 진행 정보(신청일·완료 표시)가 모두 지워지고 신고 탭에서 숨겨집니다. 보호자가 첨부한 허가서는 유지됩니다.',
            okLabel: '신고 취소',
          },
        }}
      />
    ),
  },
  { key: 'pet_name', label: '반려동물', storage: 'column', type: 'text', width: BASE_COL_W, readonly: true },
  { key: 'customer_name', label: '보호자', storage: 'column', type: 'text', width: BASE_COL_W, readonly: true },
  {
    key: 'import_deadline',
    label: '신고기한',
    storage: 'data',
    type: 'date',
    width: BASE_COL_W,
    // 일본: 저장된 값이 없으면 활성 목적지 출국일 - 40일로 자동 계산하여 표시.
    resolveValue: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.import_deadline
      if (stored != null && String(stored) !== '') return String(stored)
      return autoImportDeadline(row)
    },
    // 기한이 7일 이내(포함 경과분)이고 수입·수출 상태가 모두 '진행중/완료'가 아닐 때 주황.
    cellClass: (row) => {
      const data = (row.data ?? {}) as Record<string, unknown>
      const stored = data.import_deadline
      const deadline = stored != null && String(stored) !== ''
        ? String(stored)
        : autoImportDeadline(row)
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
      return 'text-pmw-warning'
    },
  },
  { key: 'departure_date', label: '출국일', storage: 'column', type: 'date', width: BASE_COL_W, resolveValue: (row) => importReportDeparture(row) },
  { key: 'return_date', label: '귀국일', storage: 'data', type: 'date', width: BASE_COL_W, resolveValue: (row) => importReportReturnDate(row) },
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
          className="text-sm text-muted-foreground/40 hover:text-destructive transition-colors"
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
  const { cases, updateLocalCaseField, importReportCountries, inspectionConfig, todoColumnsConfig, setNavCaseIds } = useCases()
  const [internalTab, setInternalTab] = useState<TabId>('inspection')
  const [internalQuery, setInternalQuery] = useState('')
  const activeTab = forcedTab ?? internalTab
  const setActiveTab = setInternalTab
  const query = forcedQuery ?? internalQuery
  const setQuery = setInternalQuery

  // 검사 탭 정렬 모드 — 마운트 시 localStorage 에서 복원, 변경 시 저장.
  const [inspectionSort, setInspectionSort] = useState<InspectionSort>('lab')
  useEffect(() => {
    try {
      const s = localStorage.getItem(INSPECTION_SORT_KEY)
      if (s === 'lab' || s === 'date' || s === 'status') setInspectionSort(s)
    } catch {}
  }, [])
  function changeInspectionSort(s: InspectionSort) {
    setInspectionSort(s)
    try { localStorage.setItem(INSPECTION_SORT_KEY, s) } catch {}
  }

  const q = query.trim().toLowerCase()

  const filteredCases = useMemo(() => {
    if (activeTab === 'import_report') {
      return cases
        .filter(c => (isAutoImportReport(c, importReportCountries) || isManualImportReport(c)) && !isDismissedImportReport(c))
        .filter(c => matchesQuery(c, q))
        .sort((a, b) => {
          // 1차: 완료(수입·수출 모두 done/na)는 무조건 미완료(시작전·진행중)보다 뒤.
          const ca = isImportReportComplete(a) ? 1 : 0
          const cb = isImportReportComplete(b) ? 1 : 0
          if (ca !== cb) return ca - cb
          // 2차: 같은 그룹 내에서는 활성 목적지 출국일 빠른 순(asc).
          const da = importReportDeparture(a)
          const db = importReportDeparture(b)
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
      // 활성 목적지 기준 내원일·출국일 (by_dest 우선).
      const visitDate = (c: CaseRow) => exportDocVetVisit(c)
      // 0=내원일 미래, 1=내원일 미정, 2=내원일 경과(출국일 미경과), 3=하단(출국일 지남
      //   또는 출국일 미정 + 준비상태 완료 + 내원일 경과 — 후자도 마무리된 케이스로 간주).
      const groupOf = (c: CaseRow): 0 | 1 | 2 | 3 => {
        const dep = exportDocDeparture(c)
        if (dep && dep < todayStr) return 3
        if (isExportDocFinishedNoDeparture(c)) return 3
        const v = visitDate(c)
        if (!v) return 1
        if (v < todayStr) return 2
        return 0
      }
      return cases
        // 포함: 어떤 목적지든 출국일 또는 내원일이 있으면 (by_dest 스캔).
        .filter((c) => anyDestHasDeparture(c) || anyDestHasVetVisit(c))
        .filter(c => matchesQuery(c, q))
        .sort((a, b) => {
          const ga = groupOf(a)
          const gb = groupOf(b)
          if (ga !== gb) return ga - gb
          const da = exportDocDeparture(a)
          const db = exportDocDeparture(b)
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

  // 탭별 활성 목적지 맵 — TodoTable 의 scoped key 편집을 by_dest 로 라우팅하는 데 사용.
  const activeDestById = useMemo(() => {
    const key =
      activeTab === 'import_report'
        ? IMPORT_REPORT_DEST_KEY
        : activeTab === 'export_doc'
        ? EXPORT_DOC_DEST_KEY
        : null
    if (!key) return undefined
    const m = new Map<string, string | null>()
    for (const c of filteredCases) m.set(c.id, resolveTabActiveDest(c, key))
    return m
  }, [filteredCases, activeTab])

  const inspectionRows = useMemo(() => {
    const built = buildInspectionRows(cases, inspectionConfig.titerRules, inspectionConfig.titerDefault, inspectionConfig.infectiousRules)
      .filter(r => matchesQuery(r.caseRow, q))

    // 날짜 DESC(최신순) — 빈 날짜는 맨 뒤.
    const dateDesc = (da: string, db: string): number => {
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    }
    const labOrder = (a: InspectionRow, b: InspectionRow): number =>
      (LAB_SORT_ORDER[a.lab] ?? 99) - (LAB_SORT_ORDER[b.lab] ?? 99)
    // 미완료 그룹(대기·검사중) 정렬 — 선택된 라벨 기준 + 2차 정렬.
    function comparePending(a: InspectionRow, b: InspectionRow): number {
      const da = a.date || ''
      const db = b.date || ''
      if (inspectionSort === 'date') {
        // 검사일 최신순 → 같은 날짜면 검사기관 순.
        const d = dateDesc(da, db)
        return d !== 0 ? d : labOrder(a, b)
      }
      if (inspectionSort === 'status') {
        // 대기 → 검사중 → 같은 상태면 검사기관 순.
        const sa = INSPECTION_STATUS_ORDER[readInspectionStatus(a)] ?? 0
        const sb = INSPECTION_STATUS_ORDER[readInspectionStatus(b)] ?? 0
        if (sa !== sb) return sa - sb
        return labOrder(a, b)
      }
      // 'lab' (기본): 검사기관 순 → 같은 기관이면 검사일 최신순.
      const lc = labOrder(a, b)
      return lc !== 0 ? lc : dateDesc(da, db)
    }
    // 완료는 정렬 기준과 무관하게 항상 맨 아래 + 완료 그룹 내부는 항상 날짜 최신순.
    return built.sort((a, b) => {
      const aDone = readInspectionStatus(a) === 'done'
      const bDone = readInspectionStatus(b) === 'done'
      if (aDone !== bDone) return aDone ? 1 : -1
      if (aDone && bDone) return dateDesc(a.date || '', b.date || '')
      return comparePending(a, b)
    })
  }, [cases, q, inspectionConfig, inspectionSort])

  // 상세 좌우 화살표가 순회할 순서를 현재 탭의 정렬·필터 결과로 publish.
  // 검사 탭은 한 케이스가 항체 record 수만큼 여러 행이 될 수 있어 id 중복 제거.
  const navCaseIds = useMemo(() => {
    if (activeTab === 'inspection') {
      const seen = new Set<string>()
      const out: string[] = []
      for (const r of inspectionRows) {
        if (seen.has(r.caseRow.id)) continue
        seen.add(r.caseRow.id)
        out.push(r.caseRow.id)
      }
      return out
    }
    return filteredCases.map((c) => c.id)
  }, [activeTab, inspectionRows, filteredCases])

  useEffect(() => {
    if (!embedded) return
    setNavCaseIds(navCaseIds)
  }, [embedded, navCaseIds, setNavCaseIds])

  const right = (
    <>
      {activeTab === 'import_report' && (
        <ImportReportAddPicker
          cases={cases}
          onAdd={async (caseId) => {
            // 다시 추가 시 dismissed 플래그도 함께 클리어
            updateLocalCaseField(caseId, 'data', 'import_report_manual', true)
            updateLocalCaseField(caseId, 'data', 'import_report_dismissed', null)
            await updateCaseField(caseId, 'data', 'import_report_manual', true)
            await updateCaseField(caseId, 'data', 'import_report_dismissed', null)
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
          hiddenColumns={todoColumnsConfig.hiddenColumns.inspection}
          sortMode={inspectionSort}
          onSortChange={changeInspectionSort}
        />
      ) : (
        <TodoTable
          cases={filteredCases}
          columns={COLUMNS_MAP[activeTab].filter(
            (col) => !todoColumnsConfig.hiddenColumns[activeTab].includes(col.key),
          )}
          onUpdate={updateLocalCaseField}
          activeDestById={activeDestById}
          rowClass={
            activeTab === 'import_report'
              ? (row) => (isImportReportComplete(row) ? 'opacity-50 hover:opacity-100' : '')
              : activeTab === 'export_doc'
              ? (row) => (isPastDeparture(row) || isExportDocFinishedNoDeparture(row) ? 'opacity-50 hover:opacity-100' : '')
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
        // 다시 추가 시 dismissed 플래그도 함께 클리어
        updateLocalCaseField(caseId, 'data', 'import_report_manual', true)
        updateLocalCaseField(caseId, 'data', 'import_report_dismissed', null)
        await updateCaseField(caseId, 'data', 'import_report_manual', true)
        await updateCaseField(caseId, 'data', 'import_report_dismissed', null)
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
  // KSVDL-R(광견병항체) — 인보이스만. 나머지는 인보이스 + 케이스별 서류 병합.
  const ksvdlrRows = pendingRows.filter((r) => r.kind === 'titer' && r.lab === 'ksvdl_r')
  const ksvdlRows = pendingRows.filter((r) => r.lab === 'ksvdl')
  const arcRows = pendingRows.filter((r) => r.lab === 'arc_ovi')
  const nzRows = pendingRows.filter((r) => r.lab === 'nz_combined')
  // APQA EU titer 행 = EU/영국/스위스/터키 광견병중화항체검사 신청 대상.
  // inspection-config 의 titerRules 가 EU·UK·CH·TR → apqa_eu 로 매핑.
  const euApqaRows = pendingRows.filter((r) => r.kind === 'titer' && r.lab === 'apqa_eu')

  const [menuOpen, setMenuOpen] = useState(false)
  const [activeDialog, setActiveDialog] = useState<'ksvdl_r' | 'ksvdl' | 'vbddl_apqa' | 'arc_ovi' | 'apqa_eu' | null>(null)
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
            onClick={() => { if (ksvdlrRows.length > 0) { setActiveDialog('ksvdl_r'); setMenuOpen(false) } }}
            disabled={ksvdlrRows.length === 0}
            className={itemClass(ksvdlrRows.length === 0)}
            title={ksvdlrRows.length === 0 ? '대상 케이스가 없습니다' : '인보이스만'}
          >
            KSVDL-R
          </button>
          <button
            type="button"
            onClick={() => { if (ksvdlRows.length > 0) { setActiveDialog('ksvdl'); setMenuOpen(false) } }}
            disabled={ksvdlRows.length === 0}
            className={itemClass(ksvdlRows.length === 0)}
            title={ksvdlRows.length === 0 ? '대상 케이스가 없습니다' : '인보이스 + KSVDL 시료제출서'}
          >
            KSVDL
          </button>
          <button
            type="button"
            onClick={() => { if (nzRows.length > 0) { setActiveDialog('vbddl_apqa'); setMenuOpen(false) } }}
            disabled={nzRows.length === 0}
            className={itemClass(nzRows.length === 0)}
            title={nzRows.length === 0 ? '대상 케이스가 없습니다' : '인보이스 + VBDDL·APQA HQ(국/영)'}
          >
            VBDDL + APQA HQ
          </button>
          <button
            type="button"
            onClick={() => { if (arcRows.length > 0) { setActiveDialog('arc_ovi'); setMenuOpen(false) } }}
            disabled={arcRows.length === 0}
            className={itemClass(arcRows.length === 0)}
            title={arcRows.length === 0 ? '대상 케이스가 없습니다' : '인보이스 + 시료제출서·VHC·면허증'}
          >
            ARC-OVI
          </button>
          <button
            type="button"
            onClick={() => { if (euApqaRows.length > 0) { setActiveDialog('apqa_eu'); setMenuOpen(false) } }}
            disabled={euApqaRows.length === 0}
            className={itemClass(euApqaRows.length === 0)}
            title={euApqaRows.length === 0 ? '대상 케이스가 없습니다' : undefined}
          >
            APQA EU
          </button>
        </div>
      )}
      {activeDialog === 'ksvdl_r' && (
        <ShipmentPackDialog
          label="KSVDL-R"
          rows={ksvdlrRows}
          variant="invoice-only"
          consigneeLab="ksvdl_r"
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'ksvdl' && (
        <ShipmentPackDialog
          label="KSVDL"
          rows={ksvdlRows}
          variant="ksvdl"
          consigneeLab="ksvdl"
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'vbddl_apqa' && (
        <ShipmentPackDialog
          label="VBDDL + APQA HQ"
          rows={nzRows}
          variant="nz"
          consigneeLab="vbddl"
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'arc_ovi' && (
        <ShipmentPackDialog
          label="ARC-OVI"
          rows={arcRows}
          variant="arc"
          consigneeLab="arc_ovr"
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'apqa_eu' && (
        <BulkApplyDialog
          label="APQA EU"
          rows={euApqaRows}
          request={(caseId) => ({ kind: 'single', formKey: 'APQA_HQ_EU', caseId })}
          onClose={() => setActiveDialog(null)}
        />
      )}
    </div>
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
                      'w-[22px] h-[22px] shrink-0 rounded-[3px] border border-foreground/40 bg-transparent transition-colors relative',
                      'peer-checked:bg-pmw-accent peer-checked:border-pmw-accent',
                      'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
                      "before:content-['✓'] before:absolute before:inset-0 before:flex before:items-center before:justify-center before:text-pmw-accent-foreground before:text-[14px] before:font-bold before:leading-none before:opacity-0 peer-checked:before:opacity-100",
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
        <DialogFooter
          onCancel={onClose}
          onPrimary={handleGenerate}
          primaryLabel={selected.size > 0 ? `생성 (${selected.size})` : '생성'}
          primaryDisabled={selected.size === 0}
        />
      </div>
    </div>,
    document.body,
  )
}

/**
 * 발송 팩 다이얼로그 — 케이스 체크 + 검체수 + 발송일 입력 → 인보이스(맨 앞) + 선택 케이스별
 * 검사 서류를 하나의 PDF 로 병합 생성. 검체수 기본값 = 선택 마리 수(수정 가능). ARC 는 16점 고정.
 * 인보이스 수신처(consigneeLab)는 항목별 고정.
 */
function ShipmentPackDialog({ label, rows, variant, consigneeLab, onClose }: {
  label: string
  rows: InspectionRow[]
  variant: 'invoice-only' | 'ksvdl' | 'nz' | 'arc'
  consigneeLab: string
  onClose: () => void
}) {
  // 후보가 1마리뿐이면 자동 선택 — 굳이 체크할 필요 없음.
  const isSingle = rows.length === 1
  const [selected, setSelected] = useState<Set<string>>(
    () => (isSingle ? new Set([rows[0].caseRow.id]) : new Set()),
  )
  const [tube, setTube] = useState('')
  const [shipDate, setShipDate] = useState('')
  const allSelected = rows.length > 0 && selected.size === rows.length
  const isArc = variant === 'arc'
  const selCount = selected.size
  // 검체수: 빈 칸이면 선택 마리 수, 입력하면 그 값(1~99). ARC 는 16 고정.
  const effectiveTube = isArc
    ? 16
    : tube.trim()
    ? Math.max(1, Math.min(99, Math.trunc(Number(tube)) || selCount))
    : selCount

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
    try {
      await downloadPdfRequest({
        kind: 'shipment-pack',
        variant,
        caseIds: ids,
        tube_count: effectiveTube,
        consignee_lab: consigneeLab,
        ship_date: shipDate || undefined,
      })
    } catch (error) {
      alert(error instanceof Error ? error.message : '서류 생성 중 오류가 발생했습니다.')
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-background border border-border/80 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-primary">{label}</h2>
          {!isSingle && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          )}
        </div>
        <ul className="max-h-64 overflow-y-auto scrollbar-minimal -mx-2 mb-4">
          {rows.map((r) => {
            const isChecked = selected.has(r.caseRow.id)
            const inner = (
              <>
                {!isSingle && (
                  <span
                    className={cn(
                      'w-[22px] h-[22px] shrink-0 rounded-[3px] border border-foreground/40 bg-transparent transition-colors relative',
                      'peer-checked:bg-pmw-accent peer-checked:border-pmw-accent',
                      'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
                      "before:content-['✓'] before:absolute before:inset-0 before:flex before:items-center before:justify-center before:text-pmw-accent-foreground before:text-[14px] before:font-bold before:leading-none before:opacity-0 peer-checked:before:opacity-100",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="font-serif font-semibold text-[15px] text-foreground">{r.caseRow.pet_name ?? '—'}</span>
                <span className="font-sans text-[13px] text-muted-foreground">{r.caseRow.customer_name ?? ''}</span>
                <span className="ml-auto font-mono text-[11px] tracking-[0.3px] text-muted-foreground/70">{r.caseRow.destination ?? ''}</span>
              </>
            )
            return (
              <li key={r.id}>
                {isSingle ? (
                  <div className="w-full px-sm py-2 rounded-md flex items-center gap-sm">{inner}</div>
                ) : (
                  <label className="w-full px-sm py-2 rounded-md hover:bg-accent/60 transition-colors flex items-center gap-sm cursor-pointer">
                    <input type="checkbox" checked={isChecked} onChange={() => toggle(r.caseRow.id)} className="peer sr-only" />
                    {inner}
                  </label>
                )}
              </li>
            )
          })}
        </ul>

        {/* 인보이스 정보 — 검체수(기본=선택 수) + 발송일. ARC 는 16점 고정. */}
        <div className="flex items-center gap-md mb-4">
          <div className="flex-1">
            <label className="text-[12px] text-muted-foreground mb-1 block">검체수</label>
            {isArc ? (
              <div className="h-9 flex items-center text-sm text-foreground">ARC 표준 <span className="font-medium ml-1">16점</span></div>
            ) : (
              <input
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={tube}
                onChange={(e) => setTube(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={String(selCount || 1)}
                aria-label="검체수"
                className="w-full h-9 px-2 rounded-md border border-border/80 bg-background text-sm text-foreground"
              />
            )}
          </div>
          <div className="flex-1">
            <label className="text-[12px] text-muted-foreground mb-1 block">발송일 <span className="text-muted-foreground/50">(비우면 오늘)</span></label>
            <input
              type="text"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              inputMode="numeric"
              className="w-full h-9 px-2 rounded-md border border-border/80 bg-background text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <DialogFooter
          onCancel={onClose}
          onPrimary={handleGenerate}
          primaryLabel={selected.size > 0 ? `생성 (${selected.size})` : '생성'}
          primaryDisabled={selected.size === 0}
        />
      </div>
    </div>,
    document.body,
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
    // 신고 탭에 이미 보이는 케이스는 후보에서 뺀다 (탭 필터와 동일 조건).
    // dismissed 케이스는 탭에 안 보이므로 picker 후보에 다시 포함되어 재추가 가능.
    const pool = cases.filter(c => {
      const visible = (isAutoImportReport(c, importReportCountries) || isManualImportReport(c)) && !isDismissedImportReport(c)
      return !visible
    })
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
