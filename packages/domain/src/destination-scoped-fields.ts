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
import { parseDestinations } from './destination-config'

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
  // 검진 완료(legacy '저장=완료'·admin 토글) 플래그 — 검진일과 같은 step(전 목적지)이라
  // 같이 분리. 안 하면 한 목적지 검진 완료가 다른 목적지로 누수(검진일은 분리됐는데 완료만
  // 전역이면 어긋남). 현행 코드는 이 값을 true 로 쓰지 않아(legacy 데이터만 존재) 다중
  // 목적지 read 에서 flatten strict 가 전역 잔존을 떨궈주는 효과가 주효.
  'vet_visit_confirmed',
  // 항공권 구매 step 표시일(항공정보 최초 입력 시각) — 항공편 필드가 목적지별이라 같이 분리.
  // 현행 코드는 단일 목적지에서만 기록(다중은 미기록)하지만, scoped 로 두면 다중 read 에서
  // flatten 이 전역 잔존을 떨궈 단일→다중 전환 시 표시일 누수를 막는다.
  'flight_info_recorded_at',
  // 출국 항공편 — 한국 출발 (departure_*) + 도착국 도착 (entry_*)
  'departure_flight_date',
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
  // 수입 허가 신청 → 허가증 2단계 (import-permit step, 태국·호주 등 허가 필요국 공용) —
  // 목적지마다 허가를 따로 받으므로 신청일·완료(skip) 플래그도 by_dest 분리.
  'import_permit_application_date',
  'import_permit_issued_skipped',
  // 절차 시간 (EU 촌충국가별 praziquantel 투여시각)
  'deworming_time',
  // 도착국 거주지 주소 — destination 별로 다른 주소
  'address_overseas',
  // 검역 — 출입국마다(목적지마다) 별도. 한 동물이 여러 나라를 동시에 진행하므로
  // 검역 완료도 by_dest 로 분리돼야 한다(공용이면 한 나라 완료가 다른 나라로 누수).
  'kr_export_quarantine_date',
  'kr_export_quarantine_confirmed',
  'jp_import_quarantine_date',
  'jp_import_quarantine_confirmed',
  'jp_export_quarantine_visit_date',
  'jp_export_quarantine_visit_confirmed',
  'jp_export_quarantine_application_date',
  'jp_export_quarantine_date',
  'jp_export_quarantine_time',
  'kr_import_quarantine_date',
  'kr_import_quarantine_confirmed',
  // 나라별 도착 수입검역(일본 외) — '{국가}_import_quarantine_date/_confirmed'. 목적지마다 따로
  // 저장(by_dest)되도록 등록. 나라 추가 시 그 나라 키 2개를 여기에 추가.
  'th_import_quarantine_date',
  'th_import_quarantine_confirmed',
  'th_export_quarantine_date',
  'th_export_quarantine_confirmed',
  'ph_import_quarantine_date',
  'ph_import_quarantine_confirmed',
  'ph_export_quarantine_date',
  'ph_export_quarantine_confirmed',
  // EU 패밀리 공용 — 입국 검사·현지 검역증명서. 키는 공용이지만 by_dest 가 목적지별 분리.
  'eu_import_quarantine_date',
  'eu_import_quarantine_confirmed',
  'eu_export_quarantine_date',
  'eu_export_quarantine_confirmed',
  // 아일랜드 사전 통지 (Advance Notice Portal)
  'ie_advance_notice_date',
  'ie_advance_notice_confirmed',
  // 필수 서류 수기 상태(완료/해당없음) — docId→bool 맵(객체 값). 검역과 같은 이유로 목적지별
  // 분리: 한 목적지에서 표시한 서류 완료가 다른 목적지(또는 단일 시절 전역값)로 누수돼 자동
  // 완료로 오판되는 걸 막는다. 스칼라 폼 필드가 아니라 객체지만, flatten/by_dest 헬퍼는 값
  // 타입을 가리지 않아 그대로 동작한다. (폼 필드 key 만 보는 일반 경로 — fields/auto-fill/
  // share-link/admin updateCaseField — 는 이 키를 다루지 않아 영향 없음.)
  'required_doc_flags',
  'required_doc_na',
])

export function isDestinationScopedKey(key: string): boolean {
  return DESTINATION_SCOPED_FIELD_KEYS.has(key)
}

/**
 * 의도적으로 **케이스 공통(전역)** 으로 두는 case.data 키 — 목적지가 달라도 같은 값.
 *
 * 두 부류:
 *   1) 동물·보호자 신원·이력 — 동물 한 마리/보호자 한 명의 사실이라 목적지 무관.
 *      (이름, 체중, 마이크로칩, 광견병 접종·항체 이력 + 그 확인 플래그)
 *   2) 스코핑 기반 구조물 — 그 자체가 destination 별 분기를 담는 컨테이너거나 케이스 단위 메타.
 *      (by_dest, destination-keyed 맵 trip_type/arrival_confirmed, past_journeys)
 *
 * scoping lint(scripts/lint-destination-scoping.mjs)가 이 명단 + DESTINATION_SCOPED_FIELD_KEYS
 * 로 "분류됨"을 판정한다. 새 case.data 키는 둘 중 하나에 반드시 등록 — 안 하면 lint 실패.
 */
export const GLOBAL_CASE_DATA_KEYS: ReadonlySet<string> = new Set([
  // 1) 동물·보호자 신원·이력 (동물/보호자 단위 — 목적지 무관)
  'customer_first_name_en',
  'customer_last_name_en',
  'weight',
  'microchip_implant_date',
  'rabies_dates',
  'general_vaccine_dates', //   종합백신 접종 이력 — 동물 단위 사실 (rabies_dates 동일)
  'rabies_titer_records',
  'rabies_extra_confirmed',
  'rabies_titer_result_confirmed',
  'titer_extra_confirmed',
  // 백신·검사·구충 카드의 '예정→도래→완료확인' 플래그 — 대응 *_dates 가 동물 단위(전역)라
  // 확인 플래그도 전역. server 저장 액션이 '가장 늦은 입력일 ≤ 오늘'로 자동 set/clear.
  'rabies_1_confirmed',
  'rabies_2_confirmed',
  'rabies_single_confirmed',
  'general_vaccine_confirmed',
  'civ_confirmed',
  'infectious_disease_confirmed',
  'external_parasite_confirmed',
  'internal_parasite_confirmed',
  // 2) 스코핑 기반 구조물·케이스 단위 메타
  'by_dest', //              destination 별 분기를 담는 컨테이너 그 자체
  'trip_type', //            destination 키 맵(내부적으로 목적지별 — 컨테이너는 전역)
  'arrival_confirmed', //    destination 키 맵(도착확인 — 컨테이너는 전역)
  'past_journeys', //        완료된 여정 비석 목록(케이스 단위)
  // 3) 첨부 파일 — **의도적으로 케이스 공유**. 보호자가 올린 파일은 동물/케이스의 자산이라
  //    목적지와 무관하게 서류함에서 늘 보여야 한다(목적지 분리해도 기존 첨부 사라지지 않게).
  //    필수서류 체크리스트는 목적지별 spec 으로 노출되므로(예: 별지25 는 일본만) 같은 첨부가
  //    다른 목적지 체크리스트에 잘못 카운트되지 않는다 — 전역 저장이라도 교차 누수 없음.
  'documents', //            stepId 태그 첨부 배열(케이스 공유)
  'notes', //                첨부 메모 맵(documents 와 한 묶음)
  // 4) 케이스 단위 메타·설정 / destination 키 맵 / 일본 단일 단계 (전수 조사 2026-06-11)
  'co_progress', //          '함께 준비' — 동물 1마리당 1개(DB 트리거가 보호자 형제 동기화). 의도적 케이스 단위
  'completion_prompt_dismissed', // destination 키 맵({[dest]: anchorDate}) — 내부적으로 이미 목적지별
  'feedback', //             여정 만족도 의견 — { [목적지]: {rating,text,submittedAt} } 키 맵(내부 목적지별,
  //                          컨테이너는 전역). arrival_confirmed 와 같은 패턴이라 demote(by_dest 삭제) 후에도
  //                          의견 데이터는 살아남는다. 완료 게이트 아님. legacy 단일 객체는 read/write 시점 호환.
  'vet_available_date', //   출국일 파생 내원가능일(admin) — 단일 목적지에서만 기록(다중 부수효과 스킵)이라 누수 없음
  // 일본 전용 단계 신호 — 케이스당 일본 1개뿐이라 동시 다중목적지 누수 없음. portal·admin 양쪽이
  // top-level 로 read/write 해 정합(스코핑하면 양쪽 다 고쳐야 하고 실익 없음).
  'advance_notification_date',
  'advance_notification_approval_skipped',
  'jp_export_quarantine_reservation_skipped',
])

export function isGlobalCaseDataKey(key: string): boolean {
  return GLOBAL_CASE_DATA_KEYS.has(key)
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
 * 탭(신고·서류·검사)에서 케이스 한 줄이 대표할 "활성 목적지" 해석.
 *
 * 우선순위:
 *   1. data[overrideKey] (사용자가 칩으로 고른 값) — 유효한 목적지일 때만.
 *   2. 출국일(by_dest 우선)이 입력된 첫 목적지 — 다중 목적지에서 자연스러운 기본.
 *   3. 첫 목적지.
 *
 * DestinationCell(칩 표시)과 todos 탭의 날짜 읽기(flatten)가 동일 목적지를 쓰도록
 * 공용 — 칩과 표시 데이터가 어긋나지 않게 한다. 단일 목적지면 그 목적지.
 */
export function resolveTabActiveDest(
  caseRow: Pick<CaseRow, 'destination' | 'data' | 'departure_date'>,
  overrideKey: string,
): string | null {
  const dests = parseDestinations(caseRow.destination)
  if (dests.length === 0) return null
  const data = (caseRow.data as Record<string, unknown> | null) ?? {}
  const override = data[overrideKey]
  if (typeof override === 'string' && dests.includes(override)) return override
  const withDeparture = dests.find((d) => !!getDepartureDate(caseRow, d))
  return withDeparture ?? dests[0]
}

/**
 * 활성 목적지 기준 출국일.
 * by_dest 우선. 단일/legacy 는 `cases.departure_date` 컬럼 fallback.
 * 다중 목적지 + 그 목적지가 by_dest 로 관리되면 컬럼 fallback 안 함 — 컬럼은 단일값이라 어느
 * 목적지 것인지 모호하고, 새 목적지가 다른 목적지 출국일을 컬럼으로 물려받는 누수를 막는다(B).
 */
export function getDepartureDate(
  caseRow: Pick<CaseRow, 'data' | 'departure_date' | 'destination'>,
  destination: string | null | undefined,
): string | null {
  const data = caseRow.data as Record<string, unknown> | null
  const v = readByDestValue(data, destination, 'departure_date')
  if (typeof v === 'string' && v) return v
  // 다중 목적지 + 특정 목적지 지정 → by_dest 만 신뢰. 컬럼 fallback 안 함(엔트리 유무 무관) — 누수 차단(B).
  if (destination && parseDestinations(caseRow.destination).length > 1) return null
  return caseRow.departure_date ?? null
}

/**
 * 활성 목적지 기준 내원일 (= 증명서 발급일).
 * by_dest 우선. 단일/legacy 는 `data.vet_visit_date`(top-level) fallback.
 * 다중 목적지 + 그 목적지가 by_dest 로 관리되면 top-level fallback 안 함 — 다른 목적지의
 * top-level 잔존 내원일을 새 목적지가 물려받는 누수를 막는다(B).
 */
export function getVetVisitDate(
  caseRow: Pick<CaseRow, 'data' | 'destination'>,
  destination: string | null | undefined,
): string | null {
  const data = (caseRow.data as Record<string, unknown> | null) ?? null
  const v = readByDestValue(data, destination, 'vet_visit_date')
  if (typeof v === 'string' && v) return v
  // 다중 목적지 + 특정 목적지 지정 → by_dest 만 신뢰. top-level fallback 안 함 — 누수 차단(B).
  if (destination && parseDestinations(caseRow.destination).length > 1) return null
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
  const isMulti = parseDestinations(caseRow.destination).length > 1
  // 단일/legacy + by_dest 엔트리 없음: top-level/컬럼 그대로(누수 상대 없음). 다중은 엔트리가
  // 없어도 strict 처리(아래) — 컬럼/top-level 잔존을 물려받지 않게.
  if (!isMulti && !destObj) return caseRow
  const nextData: Record<string, unknown> = { ...data }
  delete nextData['by_dest']
  let nextDeparture = caseRow.departure_date
  if (isMulti) {
    // 다중 목적지: scoped 키는 by_dest[dest] 만 신뢰. top-level/컬럼 잔존은 다른 목적지(또는 단일
    // 시절) 것일 수 있으므로 무시 — 누수 차단(B). 엔트리 자체가 없으면 전부 미입력으로 비운다.
    const obj = destObj ?? {}
    for (const k of DESTINATION_SCOPED_FIELD_KEYS) {
      if (k === 'departure_date') continue
      const has = Object.prototype.hasOwnProperty.call(obj, k)
      const v = has ? obj[k] : undefined
      if (!has || v === null || v === undefined) delete nextData[k]
      else nextData[k] = v
    }
    nextDeparture =
      typeof obj['departure_date'] === 'string' && obj['departure_date']
        ? (obj['departure_date'] as string)
        : null
  } else {
    // 단일/legacy: destObj 에 있는 키만 덮어쓰고 나머지는 top-level/컬럼 유지 (누수 상대가 없고,
    // 마이그 전·부분 by_dest 상태에서도 호환). null sentinel → 명시적 비움.
    for (const k of Object.keys(destObj as Record<string, unknown>)) {
      if (!DESTINATION_SCOPED_FIELD_KEYS.has(k)) continue
      const v = (destObj as Record<string, unknown>)[k]
      if (k === 'departure_date') {
        nextDeparture = typeof v === 'string' && v ? v : null
      } else {
        if (v === null || v === undefined) delete nextData[k]
        else nextData[k] = v
      }
    }
  }
  return { ...caseRow, departure_date: nextDeparture, data: nextData }
}
