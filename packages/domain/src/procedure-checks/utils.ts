import type { CaseRow } from '../types'
import { readEffectiveExtraValue } from '../destination-overrides-types'
import { getDepartureDate, getVetVisitDate, readByDestValue } from '../destination-scoped-fields'
import type { CheckResult } from './types'

/**
 * 활성 목적지 기준 출국일 — `data.by_dest[destination].departure_date` 우선,
 * 없으면 `cases.departure_date` 컬럼 fallback. destination 미지정 시 컬럼만.
 */
export function readDepartureDate(caseRow: CaseRow, destination?: string | null): string | null {
  return getDepartureDate(caseRow, destination ?? null)
}

/**
 * 활성 목적지 기준 내원일 (= 증명서 발급일).
 * `data.by_dest[destination].vet_visit_date` 우선, 없으면 `data.vet_visit_date`.
 */
export function readVetVisitDate(caseRow: CaseRow, destination?: string | null): string | null {
  return getVetVisitDate(caseRow, destination ?? null)
}

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
  /** 검사소가 검체를 수령한 날 (lab sample received). AU/HI/GU 의 N일 대기 카운트다운 기준. */
  received_date?: string | null
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

/**
 * case.data.rabies_dates 를 **입력(배열) 순서 그대로** 반환 — index 0=1차, 1=2차, 2+=추가.
 *
 * 날짜순으로 재정렬하지 않는다. 정렬하면 "1차 = 날짜가 가장 이른 접종"이 되어, 상세 입력
 * 폼(1차 칸 = 배열 index 0)과 1·2차 매핑이 어긋난다 — 2차를 1차보다 빠른 날짜로 입력하면
 * 타임라인·검증과 상세가 서로 다른 날짜를 1차로 보여주는 버그. 입력 칸이 곧 차수라는 단일
 * 정의를 따르고, 1차 ≤ 2차 시간순은 저장 시점 입력 차단(updateRabiesEntryFields)이 보장한다.
 *
 * originalIndex 는 raw 배열 위치 — offendingPaths 의 rabies_dates[i] 경로와 일치.
 */
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
}

export function readTiterEntries(caseRow: CaseRow): TiterEntry[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data.rabies_titer_records
  if (!Array.isArray(raw)) return []
  return raw
    .map((r, originalIndex) => {
      const rec = r as { date?: string | null; value?: string | null; received_date?: string | null }
      return {
        date: rec?.date ?? '',
        value: rec?.value ?? null,
        received_date: rec?.received_date ?? null,
        originalIndex,
      }
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

/**
 * 면역 유효기간 끝. 입력 valid_until 우선:
 *  - "N년" (한글 ValidUntilSelector 저장값) → date + N년 마지막 유효일로 변환
 *  - ISO 'YYYY-MM-DD' → 그대로
 *  - 빈 값 → date + 1년 (디폴트)
 *
 * "N년" 을 ISO 로 변환하지 않으면 후속 `validUntil < dep` / `validUntil >= other.date`
 * 비교가 문자열 사전순으로 끊겨 ("1년" < "2026-..." 처럼) 만료 판정이 전부 깨진다.
 */
export function resolveValidUntil(date: string, validUntil?: string | null): string {
  if (!validUntil) return addOneYear(date)
  const m = validUntil.match(/^(\d+)\s*년$/)
  if (m) return addYears(date, parseInt(m[1], 10))
  return validUntil
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
 * 'YYYY-MM-DD' + N일 후의 날짜 반환. 경계 보정 없음 — 단순 +N일.
 * 예: 2026-05-04 + 91일 → 2026-08-03.
 */
export function addDays(dateStr: string, n: number): string {
  if (dateStr.length < 10) return ''
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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

/** 오늘 날짜 'YYYY-MM-DD' (KST). 도메인 단일 출처는 ../dates.ts.
 *  procedure-checks 모듈에서 쓰기 위해 같이 re-export. */
export { todayKst } from '../dates'

export function daysBetween(aISO: string, bISO: string): number | null {
  const a = new Date(aISO).getTime()
  const b = new Date(bISO).getTime()
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식이 아니면 원문 반환. 검증 메시지 표시용. */
export function formatKoreanDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

// ── 통합 추가정보 필드 reader (top-level + legacy country_extra fallback) ──

/**
 * 통합 키로 추가정보 필드를 읽음.
 *
 * destination 인자가 주어지고 destination-scoped 키이면 `data.by_dest[destination][key]`
 * 우선 (명시적 null sentinel 인식), 없으면 top-level `data.{key}` → legacy
 * country-specific 경로(예: `data.australia_extra.id_date`) fallback.
 */
export function readExtraField(caseRow: CaseRow, key: string, destination?: string | null): string | null {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const v = readEffectiveExtraValue(data, key, destination ?? null)
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * 수입 허가 신청일(by_dest 스코핑 필드)을 활성 목적지 기준으로 읽는다.
 * - by_dest 에 문자열 → 그 값 (목적지별 실제 신청일)
 * - by_dest 에 명시적 null(비움) → '' (top-level fallback 금지, 다른 목적지 값 누수 차단)
 * - by_dest 항목 없음(undefined, 단일 목적지 등) → top-level fallback
 *
 * 입국일·출국일은 buildDateRuleContext / readDepartureDate 가 이미 목적지 스코핑하는데
 * 신청일만 raw top-level(`data.import_permit_application_date`)로 읽으면, 다중 목적지에서
 * '다른 목적지/잔여 top-level 신청일' vs '이 목적지 입국일' 이 섞여 마감 검증(태국 9일·
 * 스위스 21일·필리핀 14일)이 잘못 뜨는 버그가 난다. 두 날짜의 출처를 맞춘다.
 *
 * th(9일)·eu 스위스(21일)·ph(14일) 가 공유.
 */
export function readScopedImportPermitFiled(
  data: Record<string, unknown>,
  destination?: string | null,
): string {
  const scoped = readByDestValue(data, destination ?? null, 'import_permit_application_date')
  if (typeof scoped === 'string') return scoped.slice(0, 10)
  if (scoped === null) return '' // 명시적 비움 — fallback 금지
  return typeof data.import_permit_application_date === 'string'
    ? data.import_permit_application_date.slice(0, 10)
    : ''
}

// ── 보호자 (cross-case 매칭 — 동일 보호자 다중 등록 검증) ──

/**
 * 동일 보호자 매칭 키 정규화. customer_name + customer_name_en + data.phone + data.address_kr 4종을 합산.
 * - 공백·하이픈 제거 후 소문자.
 * - phone 은 숫자만 추출 (한국 010-1234-5678 ↔ 01012345678 호환).
 */
function guardianKey(caseRow: CaseRow): string | null {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const name = (caseRow.customer_name ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const nameEn = (caseRow.customer_name_en ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const phoneRaw = typeof data.phone === 'string' ? data.phone : ''
  const phone = phoneRaw.replace(/\D/g, '')
  const addressRaw = typeof data.address_kr === 'string' ? data.address_kr : ''
  const address = addressRaw.trim().toLowerCase().replace(/\s+/g, '')
  // 식별 가능한 최소 정보가 없으면 매칭 불가
  if (!name || (!phone && !address && !nameEn)) return null
  return `${name}|${nameEn}|${phone}|${address}`
}

/**
 * 동일 보호자가 보유한 다른 케이스 검색.
 * - customer_name + customer_name_en + data.phone + data.address_kr 4종 모두 일치해야 함.
 * - 자기 자신(`caseRow.id` 동일)은 제외.
 * - opts.sameDestination = true 시 caseRow.destination 동일 케이스만.
 *
 * 반환: 매칭된 케이스 배열 (자신 제외).
 */
export function findSameGuardianCases(
  caseRow: CaseRow,
  related: readonly CaseRow[] | undefined,
  opts: { sameDestination?: boolean } = {},
): CaseRow[] {
  if (!related || related.length === 0) return []
  const myKey = guardianKey(caseRow)
  if (!myKey) return []
  const myDest = (caseRow.destination ?? '').trim()
  return related.filter((r) => {
    if (r.id === caseRow.id) return false
    if (guardianKey(r) !== myKey) return false
    if (opts.sameDestination && (r.destination ?? '').trim() !== myDest) return false
    return true
  })
}

// ── 견종 (수입 금지·제한 검증) ──

/** caseRow.data.breed (한글) + breed_en (영문) 읽기. */
export function readBreed(caseRow: CaseRow): { ko: string; en: string } {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const ko = typeof data.breed === 'string' ? data.breed : ''
  const en = typeof data.breed_en === 'string' ? data.breed_en : ''
  return { ko, en }
}

/**
 * 견종이 금지·제한 키워드 목록과 매치되는지 검사.
 * - ko / en 양쪽에서 공백 제거·소문자 정규화 후 substring 매치.
 * - 매치된 키워드 반환 (없으면 null).
 *
 * 키워드는 충분히 변별력 있는 표현 사용 권장:
 *  ✅ 'pit bull', 'tosa', 'dogo argentino', 'fila brasileiro'
 *  ⚠️ 'bull' 같은 짧은 단어는 오탐 위험 — 'bull mastiff', 'bull terrier' 등 전체 명 사용
 */
export function matchBannedBreed(
  breed: { ko: string; en: string },
  keywords: string[],
): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  const koLower = norm(breed.ko)
  const enLower = norm(breed.en)
  for (const kw of keywords) {
    const kwLower = norm(kw)
    if (kwLower && (koLower.includes(kwLower) || enLower.includes(kwLower))) return kw
  }
  return null
}

// ── 공통 결과 ──

/** 필수 입력이 누락된 경우 사용할 결과 — 통과로 간주해 어떤 표시도 안 함. */
export const SKIP: CheckResult = { ok: true, message: '입력 대기 — 검증 대상 아님' }

/**
 * 광견병 1차 접종 가능 연령 — 보수적 안전 기준.
 *
 * 두 임계값 **모두 충족** 해야 통과:
 *  - 일수 기준: 생후 91일 이상
 *  - 캘린더 기준: 생년월일 + 3개월(`addMonths(birth, 3)`) 이후
 *
 * 출생일에 따라 어느 쪽이 더 엄격한지 달라지므로 AND 결합 시 어떤 케이스든
 * 가장 늦은 시점이 임계값. 규정 명시 국가 (JP=91일·EU=12주·TH=12주·NZ=3개월·
 * PH=12주) 외 모든 국가에 사용.
 *
 * @param birth 'YYYY-MM-DD' 생년월일
 * @param vaccineDate 'YYYY-MM-DD' 광견병 1차 접종일
 */
export function evaluateRabiesAgeConservative(
  birth: string,
  vaccineDate: string,
): { ok: boolean; ageInDays: number | null; calendar3mThreshold: string; failedRule?: '91days' | 'calendar3m' | 'both' } {
  const ageInDays = daysBetween(birth, vaccineDate)
  const calendar3m = addMonths(birth, 3)
  if (ageInDays === null) {
    return { ok: false, ageInDays: null, calendar3mThreshold: calendar3m }
  }
  const meets91 = ageInDays >= 91
  const meets3m = !!calendar3m && vaccineDate >= calendar3m
  if (meets91 && meets3m) {
    return { ok: true, ageInDays, calendar3mThreshold: calendar3m }
  }
  const failedRule: '91days' | 'calendar3m' | 'both' =
    !meets91 && !meets3m ? 'both' : !meets91 ? '91days' : 'calendar3m'
  return { ok: false, ageInDays, calendar3mThreshold: calendar3m, failedRule }
}
