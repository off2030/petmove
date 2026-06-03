import type { CaseRow } from '../types'
import { getVetVisitWindowDays } from '../destination-config'
import type { StepDefinition } from './types'

/**
 * 검역·검사 날짜의 순방향 검증 — 단일 출처.
 *
 * WHY: 각 날짜는 자기 기준(항공편·앞 단계)에 대해 "유효한가"라는 규칙을 갖는다. 이 규칙을
 * 저장 액션 안에만 박아두면 (1) 저장 시 정방향 차단으로만 쓰이고, (2) 나중에 앞 단계를
 * 수정해 이 날짜가 어긋나는 경로는 못 잡는다. 그래서 규칙을 순수 함수로 한 곳에 모아:
 *   - 저장 시 → 후보값 검증(정방향 차단, 기존과 동일)
 *   - 앞 단계 수정 후 → 이미 입력된 이후 날짜를 같은 함수로 재검증(정합성 '주의')
 * 양쪽이 같은 정의를 쓴다 — 쌍마다 규칙을 적는(N² 폭증) 대신 날짜마다 검증 하나만 둔다.
 *
 * 각 validate 는 위반 시 사람이 읽는 메시지, 정상이면 null 을 반환. anchor(비교 대상)가
 * 입력돼 있지 않으면 비교 불가라 해당 검증만 SKIP(null).
 */

export interface DateRuleContext {
  /** case.data — 검역·항공편 날짜의 출처. */
  data: Record<string, unknown>
  /** 케이스 목적지 — 내원·수출검역 윈도우 일수 산정용. */
  destination: string | null
  /** departure_date 컬럼 — 내원일 윈도우의 기준 출국일(entry_date 와 동기화되나 컬럼이 진실). */
  departureDate: string | null
}

function fmt(iso: string): string {
  const parts = iso.slice(0, 10).split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** data[key] 를 'YYYY-MM-DD' 로 읽음 — 없거나 형식이 아니면 ''. */
function readDate(data: Record<string, unknown>, key: string): string {
  const v = data[key]
  if (typeof v !== 'string' || v.length < 10) return ''
  const s = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

function addDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000,
  )
}

/** 출국일 앵커 — data.entry_date 우선, 없으면 departure_flight_date. */
function departFromData(data: Record<string, unknown>): string {
  return readDate(data, 'entry_date') || readDate(data, 'departure_flight_date')
}

// ── 날짜별 순방향 검증 — 위반 시 메시지, 정상이면 null ──────────────────

/** 일본 수출검역 예약일: 일본 입국일 ≤ 예약일 ≤ 귀국일. */
export function validateJpExportReservationDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return '예약일은 귀국일보다 늦을 수 없습니다.'
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return `예약일은 일본 입국일(${fmt(entry)})보다 빠를 수 없습니다.`
  return null
}

/** 일본 수출검역 검역일(방문): 일본 입국일 ≤ 검역일 ≤ 귀국일. */
export function validateJpExportVisitDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return `검역일은 일본 입국일(${fmt(entry)})보다 빠를 수 없습니다.`
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return `검역일은 귀국일(${fmt(ret)})보다 늦을 수 없습니다.`
  return null
}

/** 한국 수출검역일: 임상검사일 ≤ 검역일 ≤ 출국일, 출국일 기준 윈도우 이내. */
export function validateKrExportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const vet = readDate(ctx.data, 'vet_visit_date')
  if (vet && v < vet) return `검역일은 출국 전 임상검사일(${fmt(vet)})보다 빠를 수 없습니다.`
  const depart = departFromData(ctx.data)
  if (depart) {
    if (v > depart) return `검역일은 출국일(${fmt(depart)})보다 늦을 수 없습니다.`
    const windowDays = getVetVisitWindowDays(ctx.destination)
    if (daysBetween(v, depart) >= windowDays) {
      return `검역일은 출국일 기준 ${windowDays}일 이내여야 합니다.`
    }
  }
  return null
}

/** 일본 수입검역일: 일본 입국일 당일 또는 다음 날만. */
export function validateJpImportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = departFromData(ctx.data)
  if (entry && v !== entry && v !== addDay(entry)) {
    return `검역일은 일본 입국일(${fmt(entry)}) 당일 또는 다음 날만 가능합니다.`
  }
  return null
}

/** 한국 수입검역일: 귀국일 당일 또는 다음 날만. */
export function validateKrImportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v !== ret && v !== addDay(ret)) {
    return '검역은 귀국 당일에 받아야 합니다. 검역일 혹은 귀국 항공편 날짜를 수정하세요.'
  }
  return null
}

/** 출국 전 임상검사일: 출국일 이전·윈도우 이내, 한국 수출검역일 이전. */
export function validateVetVisitDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const dep = ctx.departureDate ? ctx.departureDate.slice(0, 10) : ''
  if (dep && /^\d{4}-\d{2}-\d{2}$/.test(dep)) {
    if (v > dep) return '입력한 날짜가 출국일 이후입니다. 출국 전 임상검사는 출국 전에 받아야 합니다.'
    const windowDays = getVetVisitWindowDays(ctx.destination)
    if (daysBetween(v, dep) >= windowDays) {
      return `출국 전 임상검사는 출국일 기준 ${windowDays}일 이내에 받아야 합니다.`
    }
  }
  const krExport = readDate(ctx.data, 'kr_export_quarantine_date')
  if (krExport && v > krExport) {
    return `출국 전 임상검사일은 한국 수출 동물검역일(${fmt(krExport)})보다 늦을 수 없습니다.`
  }
  return null
}

/** caseRow → DateRuleContext (저장 액션·재검증 공통). */
export function buildDateRuleContext(caseRow: CaseRow): DateRuleContext {
  return {
    data: (caseRow.data ?? {}) as Record<string, unknown>,
    destination: caseRow.destination ?? null,
    departureDate: caseRow.departure_date ?? null,
  }
}

// ── 정합성 재검증 — 날짜 필드 → {검증, 표면화 step} ──────────────────────
interface DateRuleEntry {
  /** case.data 의 날짜 필드. */
  field: string
  /** 위반을 '주의'로 표면화할 step id. */
  stepId: string
  validate: (v: string, ctx: DateRuleContext) => string | null
}

const DATE_RULES: DateRuleEntry[] = [
  { field: 'vet_visit_date', stepId: 'vet-visit', validate: validateVetVisitDate },
  { field: 'kr_export_quarantine_date', stepId: 'certificate-issue', validate: validateKrExportDate },
  { field: 'jp_export_quarantine_date', stepId: 'jp-export-quarantine', validate: validateJpExportReservationDate },
  {
    field: 'jp_export_quarantine_visit_date',
    stepId: 'jp-export-quarantine-visit',
    validate: validateJpExportVisitDate,
  },
  { field: 'jp_import_quarantine_date', stepId: 'departure', validate: validateJpImportDate },
  { field: 'kr_import_quarantine_date', stepId: 'kr-import-quarantine', validate: validateKrImportDate },
]

export interface DateConsistencyIssue {
  stepId: string
  message: string
}

/**
 * 이미 입력된 검역·검사 날짜를 각자의 순방향 검증으로 다시 돌려, 현재 항공편·앞 단계와
 * 어긋난 것만 '주의'로 반환한다. 앞 단계(항공편 등)를 수정한 뒤 이후 일정 정합성을
 * 재검증하는 단일 경로 — 저장 시점 검증과 같은 함수를 재사용한다.
 *
 * 값이 없는(=아직 안 잡은) 날짜는 SKIP — 입력된 일정만 본다. 적용 step 이 아닌 항목도 SKIP.
 */
export function evaluateDateConsistency(steps: StepDefinition[], caseRow: CaseRow): DateConsistencyIssue[] {
  const present = new Set(steps.map((s) => s.id))
  const ctx = buildDateRuleContext(caseRow)
  const issues: DateConsistencyIssue[] = []
  for (const rule of DATE_RULES) {
    if (!present.has(rule.stepId)) continue
    const v = readDate(ctx.data, rule.field)
    if (!v) continue
    const msg = rule.validate(v, ctx)
    if (msg) issues.push({ stepId: rule.stepId, message: msg })
  }
  return issues
}
