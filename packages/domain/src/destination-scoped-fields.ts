/**
 * 다중 목적지 케이스에서 destination별로 분리 저장되는 필드 정책.
 *
 * 저장 구조: `cases.data.by_dest[destination][key] = value`
 *   destination 토큰은 `resolveActiveDestination` 결과(사용자 입력 그대로의 한글/영문 토큰)와 동일.
 *   `trip_type` Map 컨벤션과 일치.
 *
 * Fallback 순서 (read):
 *   1. data.by_dest[destination][key]
 *   2. top-level data[key]  (또는 column for departure_date)
 *   3. legacy country_extra 경로 (readEffectiveExtraValue 내부)
 *
 * 단일 목적지 케이스: by_dest 미사용, 기존 경로 그대로.
 */

import type { CaseRow } from './types'

/**
 * 분리 대상 키. 이 키들에 대한 입력은 다중 목적지 시 by_dest 에 저장돼야 함.
 *
 * 🟢 케이스 공통 유지 (포함 X): email, postal_code, overseas_phone, passport_*,
 *   holder_birth_date — 보호자·동물 신원은 destination 무관.
 */
export const DESTINATION_SCOPED_FIELD_KEYS: ReadonlySet<string> = new Set([
  // 일정
  'departure_date',
  'vet_visit_date',
  // 입국 항공편 (한국 → 도착국)
  'entry_date',
  'entry_airport',
  'entry_flight_number',
  'entry_departure_airport',
  'entry_time',
  'entry_transport',
  'entry_purpose',
  // 귀국 항공편 (도착국 → 한국)
  'return_date',
  'return_flight_number',
  'return_departure_airport',
  'return_arrival_airport',
  'return_transport',
  // 증명서·허가 (국가별)
  'permit_no',
  'certificate_no',
  'id_date',
  // 절차 시간 (EU 촌충국가별 praziquantel 투여시각)
  'deworming_time',
  // 도착국 거주지 주소 — destination 별로 다른 주소
  'address_overseas',
])

export function isDestinationScopedKey(key: string): boolean {
  return DESTINATION_SCOPED_FIELD_KEYS.has(key)
}

/**
 * `data.by_dest[destination][key]` 읽기.
 *
 * - 키 미존재: `undefined` (caller 는 top-level/column fallback 으로 진행)
 * - 키 존재 + null: `null` (명시적 "비움" sentinel — caller 는 fallback 하지 말고 null 반환)
 * - 키 존재 + 값: 그 값
 *
 * 다중 목적지 케이스에서 한 destination 의 값을 비웠을 때 top-level 잔여 데이터가
 * fallback 으로 부활하는 걸 막기 위해 null sentinel 을 명시적으로 보존한다.
 */
export function readByDestValue(
  data: Record<string, unknown> | null | undefined,
  destination: string | null | undefined,
  key: string,
): unknown {
  if (!data || !destination) return undefined
  const byDest = data['by_dest'] as Record<string, Record<string, unknown>> | undefined
  const destObj = byDest?.[destination]
  if (!destObj || !(key in destObj)) return undefined
  const v = destObj[key]
  return v === undefined ? null : v
}

/**
 * `data.by_dest[destination][key] = value` 를 갱신한 새 data 객체 반환 (immutable).
 *
 * value 가 null/undefined/빈문자열 이면 **명시적 null sentinel** 로 저장 (delete X).
 * 다중 목적지에서 한 destination 에서 비우기 액션을 하면 top-level fallback 으로
 * 부활하는 걸 막기 위함. by_dest 객체에 항목이 쌓이지만 의미상 "명시적 비움".
 */
export function writeByDestValue(
  data: Record<string, unknown> | null | undefined,
  destination: string,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(data ?? {}) }
  const byDest: Record<string, Record<string, unknown>> = {
    ...((next['by_dest'] as Record<string, Record<string, unknown>> | undefined) ?? {}),
  }
  const destObj: Record<string, unknown> = { ...(byDest[destination] ?? {}) }
  if (value === null || value === undefined || value === '') {
    destObj[key] = null // 명시적 비움 sentinel
  } else {
    destObj[key] = value
  }
  byDest[destination] = destObj
  next['by_dest'] = byDest
  return next
}

/**
 * 활성 목적지 기준 출국일.
 * by_dest 우선, 없으면 `cases.departure_date` 컬럼 fallback.
 */
export function getDepartureDate(
  caseRow: Pick<CaseRow, 'data' | 'departure_date'>,
  destination: string | null | undefined,
): string | null {
  const v = readByDestValue(caseRow.data as Record<string, unknown> | null, destination, 'departure_date')
  if (typeof v === 'string' && v) return v
  return caseRow.departure_date ?? null
}

/**
 * 활성 목적지 기준 내원일 (= 증명서 발급일).
 * by_dest 우선, 없으면 `data.vet_visit_date` fallback.
 */
export function getVetVisitDate(
  caseRow: Pick<CaseRow, 'data'>,
  destination: string | null | undefined,
): string | null {
  const data = (caseRow.data as Record<string, unknown> | null) ?? null
  const v = readByDestValue(data, destination, 'vet_visit_date')
  if (typeof v === 'string' && v) return v
  const top = data?.['vet_visit_date']
  return typeof top === 'string' && top ? top : null
}

/**
 * 활성 목적지 기준으로 케이스를 "평탄화" — `data.by_dest[destination]` 의 destination-scoped
 * 값을 top-level 로 덮어쓴 새 CaseRow 반환 (immutable). PDF·자동채움 등 단일값을 가정하는
 * legacy 경로가 다중 목적지 케이스에서도 활성 목적지 기준으로 동작하도록 입력 전처리에 사용.
 *
 * - departure_date 컬럼: by_dest[dest].departure_date 가 있으면 그 값으로 교체 (null sentinel
 *   이면 컬럼도 null).
 * - data 의 각 scoped key: by_dest[dest][key] 가 있으면 (null 포함) 그 값으로 교체.
 * - by_dest 키 자체는 결과 data 에서 제거 (legacy 경로는 모르기 때문).
 * - destination 미지정 또는 by_dest 없음: caseRow 그대로 반환.
 */
export function flattenCaseForDestination<T extends CaseRow>(
  caseRow: T,
  destination: string | null | undefined,
): T {
  if (!destination) return caseRow
  const data = (caseRow.data as Record<string, unknown> | null) ?? {}
  const byDest = data['by_dest'] as Record<string, Record<string, unknown>> | undefined
  const destObj = byDest?.[destination]
  if (!destObj) return caseRow
  const nextData: Record<string, unknown> = { ...data }
  delete nextData['by_dest']
  let nextDeparture = caseRow.departure_date
  for (const k of Object.keys(destObj)) {
    if (!DESTINATION_SCOPED_FIELD_KEYS.has(k)) continue
    const v = destObj[k]
    // null sentinel → 명시적 비움 (legacy 경로는 빈값으로 인식).
    if (k === 'departure_date') {
      nextDeparture = (typeof v === 'string' && v) ? v : null
    } else {
      if (v === null || v === undefined) {
        delete nextData[k]
      } else {
        nextData[k] = v
      }
    }
  }
  return { ...caseRow, departure_date: nextDeparture, data: nextData }
}
