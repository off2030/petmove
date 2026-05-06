import type { CaseRow } from '../types'
import type { CheckResult } from './types'

/**
 * 절차 검증에서 공통으로 쓰는 유틸 (날짜 산수 + caseRow.data 리더).
 * 국가별 .ts 파일은 모두 여기서 import 해서 일관된 동작을 보장.
 */

// ── 타입 ──

export interface RabiesEntry {
  date: string
  valid_until?: string | null
  originalIndex: number
}

export interface TiterEntry {
  date: string
  value?: string | null
  originalIndex: number
}

/** 종합백신 — rabies 와 동일한 shape (date + valid_until). */
export interface VaccineEntry {
  date: string
  valid_until?: string | null
  originalIndex: number
}

/** 외/내부구충 — date 만 가짐 (product_id 등 메타는 검증에 불필요). */
export interface ParasiteEntry {
  date: string
  originalIndex: number
}

// ── caseRow.data 리더 ──

export function readRabiesEntries(caseRow: CaseRow): RabiesEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data.rabies_dates
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = typeof r === 'string' ? { date: r } : (r as { date?: string; valid_until?: string | null })
      return { date: rec.date ?? '', valid_until: rec.valid_until ?? null, originalIndex }
    })
    .filter((r) => typeof r.date === 'string' && r.date.length >= 10)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function readTiterEntries(caseRow: CaseRow): TiterEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data.rabies_titer_records
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = r as { date?: string | null; value?: string | null }
      return { date: rec?.date ?? '', value: rec?.value ?? null, originalIndex }
    })
    .filter((r) => typeof r.date === 'string' && r.date.length >= 10)
}

export function readGeneralVaccineEntries(caseRow: CaseRow): VaccineEntry[] {
  return readVaccineDateArray(caseRow, 'general_vaccine_dates')
}

/** CIV (Canine Influenza Virus) — `general_vaccine_dates` 와 동일 shape. */
export function readCivEntries(caseRow: CaseRow): VaccineEntry[] {
  return readVaccineDateArray(caseRow, 'civ_dates')
}

/** 켄넬코프 (Bordetella) — `general_vaccine_dates` 와 동일 shape. */
export function readKennelCoughEntries(caseRow: CaseRow): VaccineEntry[] {
  return readVaccineDateArray(caseRow, 'kennel_cough_dates')
}

/** date + valid_until 형태의 백신 array 공통 reader. */
function readVaccineDateArray(caseRow: CaseRow, key: string): VaccineEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data[key]
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = typeof r === 'string' ? { date: r } : (r as { date?: string; valid_until?: string | null })
      return { date: rec.date ?? '', valid_until: rec.valid_until ?? null, originalIndex }
    })
    .filter((r) => typeof r.date === 'string' && r.date.length >= 10)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 전염병검사 (Brucella·Leishmania·Lepto MAT 등) — `[{date, lab}]` 형식. */
export interface InfectiousDiseaseEntry {
  date: string
  lab?: string | null
  originalIndex: number
}

export function readInfectiousDiseaseEntries(caseRow: CaseRow): InfectiousDiseaseEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data.infectious_disease_records
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = r as { date?: string | null; lab?: string | null }
      return { date: rec?.date ?? '', lab: rec?.lab ?? null, originalIndex }
    })
    .filter((r) => typeof r.date === 'string' && r.date.length >= 10)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 호주 전용 추가정보 (id_date, sample_received_date, permit_no). 기본값 null. */
export function readAustraliaExtra(caseRow: CaseRow): {
  permit_no: string | null
  id_date: string | null
  sample_received_date: string | null
} {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra = (data.australia_extra ?? {}) as Record<string, unknown>
  return {
    permit_no: typeof extra.permit_no === 'string' ? extra.permit_no : null,
    id_date: typeof extra.id_date === 'string' ? extra.id_date : null,
    sample_received_date: typeof extra.sample_received_date === 'string' ? extra.sample_received_date : null,
  }
}

export function readExternalParasiteEntries(caseRow: CaseRow): ParasiteEntry[] {
  return readSimpleDatedArray(caseRow, 'external_parasite_dates')
}

export function readInternalParasiteEntries(caseRow: CaseRow): ParasiteEntry[] {
  return readSimpleDatedArray(caseRow, 'internal_parasite_dates')
}

/** 심장사상충 — `[{date}]` 형식. NZ heartworm 검사·예방 투약 통합 기록. */
export function readHeartwormEntries(caseRow: CaseRow): ParasiteEntry[] {
  return readSimpleDatedArray(caseRow, 'heartworm_dates')
}

function readSimpleDatedArray(caseRow: CaseRow, key: string): ParasiteEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data[key]
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = typeof r === 'string' ? { date: r } : (r as { date?: string })
      return { date: rec.date ?? '', originalIndex }
    })
    .filter((r) => typeof r.date === 'string' && r.date.length >= 10)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── 날짜 산수 ──

/** 면역 유효기간 끝. valid_until 있으면 그대로, 없으면 date + 1년 (마지막 유효일). */
export function resolveValidUntil(date: string, validUntil?: string | null): string {
  return validUntil || addOneYear(date)
}

/**
 * 'YYYY-MM-DD' + N년 유효기간의 **마지막 유효일** 반환.
 * 달력 +N년 후 동일 MM-DD 에서 하루 뺌 (윤년 처리됨).
 * 예: 2026-01-01 +1년 → 2026-12-31, +2년 → 2027-12-31.
 */
export function addYears(dateStr: string, n: number): string {
  const parts = dateStr.split('-')
  if (parts.length < 3) return ''
  const d = new Date(`${parseInt(parts[0], 10) + n}-${parts[1]}-${parts[2]}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addOneYear(dateStr: string): string {
  return addYears(dateStr, 1)
}

/**
 * 'YYYY-MM-DD' + N개월 후의 동일 일자 반환 (달 끝 보정).
 * EU "three months" 같은 캘린더 기반 비교에 사용.
 *
 * - addYears 와 달리 -1일 처리 없음 (경계 inclusive).
 *   "at least 3 months" → `addMonths(d, 3) <= dep` 로 검사.
 * - 월 끝 보정: 1월 31일 + 1개월 = 2월 28일 (또는 윤년 29일).
 *
 * 예: 2026-02-01 + 3개월 = 2026-05-01
 *     2026-08-01 + 3개월 = 2026-11-01
 *     2026-01-31 + 1개월 = 2026-02-28
 */
export function addMonths(dateStr: string, n: number): string {
  const parts = dateStr.split('-')
  if (parts.length < 3) return ''
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  if (isNaN(y) || isNaN(m) || isNaN(day)) return ''
  // 1) 대상 월의 1일로 시작 (overflow 안전)
  const d = new Date(Date.UTC(y, m - 1, 1))
  d.setUTCMonth(d.getUTCMonth() + n)
  // 2) 대상 월의 마지막 일자 계산
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  // 3) 원본 day 와 lastDay 중 작은 값 사용
  d.setUTCDate(Math.min(day, lastDay))
  if (isNaN(d.getTime())) return ''
  const yyyy = String(d.getUTCFullYear()).padStart(4, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function daysBetween(aISO: string, bISO: string): number | null {
  const a = new Date(aISO).getTime()
  const b = new Date(bISO).getTime()
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

// ── 공통 결과 ──

/** 필수 입력이 누락된 경우 사용할 결과 — 통과로 간주해 어떤 표시도 안 함. */
export const SKIP: CheckResult = { ok: true, message: '입력 대기 — 검증 대상 아님' }
