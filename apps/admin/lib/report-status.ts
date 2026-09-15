import {
  deriveReportSlotStatus,
  flattenCaseForDestination,
  getDepartureDate,
  getTripType,
  getVetVisitDate,
  parseDestinations,
  readByDestValue,
  resolveReportBinding,
  REPORT_LEGACY_STATUS_KEY,
  type CaseRow,
  type ReportSlot,
} from '@petmove/domain'

/**
 * 신고(수입·수출) 진행상태의 단일 출처 — 신고 탭과 상세페이지가 같이 쓴다.
 *
 * 탭은 목적지를 `import_report_active_dest` 로 풀고(resolveTabActiveDest), 상세페이지는
 * 지금 보고 있는 여행지 탭으로 푼다. **다른 건 목적지뿐**이라 여기 함수들은 전부 목적지를
 * 인자로 받는다 — 두 화면이 각자 파생 규칙을 복사하면 값이 갈라진다.
 *
 * ⛔ 나라별 if 분기를 만들지 말 것 — 어느 여정 카드와 이어지는지는 목적지 프로파일의
 *   `report` 선언이 정한다([[resolveReportBinding]]). 명단 방식은 명단 밖 나라에서
 *   "관리자에선 완료인데 앱 카드는 미완료" 를 낳았다(2026-08-21).
 */

export const REPORT_STATUS_OPTIONS = [
  { value: 'not_started', label: '대기' },
  { value: 'in_progress', label: '진행' },
  { value: 'done', label: '완료' },
]

/**
 * 한 목적지의 슬롯 상태 — 여정 카드에서 파생, 연결 없는 목적지만 운영자 수동값.
 *
 * 카드 시그널·수동값 모두 by_dest 스코핑이라 **그 목적지로 평탄화한 view** 를 넘긴다 —
 * 원본 row 를 넘기면 다중 여행지에서 신호를 못 봐 '대기'로 보인다.
 */
export function reportSlotStatusFor(
  caseRow: CaseRow,
  dest: string | null,
  slot: ReportSlot,
): string {
  const view = flattenCaseForDestination(caseRow, dest)
  const derived = deriveReportSlotStatus(view, dest, slot)
  if (derived) return derived
  const data = (view.data ?? {}) as Record<string, unknown>
  const stored = data[REPORT_LEGACY_STATUS_KEY[slot]]
  if (stored != null && String(stored) !== '') return String(stored)
  return 'not_started'
}

/** 목적지의 귀국일 (by_dest 우선) — 수출 슬롯 판정용. */
export function reportReturnDateFor(caseRow: CaseRow, dest: string | null): string {
  const data = (caseRow.data as Record<string, unknown> | null) ?? null
  const v = readByDestValue(data, dest, 'return_date')
  if (typeof v === 'string' && v) return v
  // 다중 여행지 + 특정 여행지 지정: top-level fallback 안 함 — 누수 차단(B).
  if (dest && parseDestinations(caseRow.destination).length > 1) return ''
  const top = data?.return_date
  return typeof top === 'string' && top ? top : ''
}

/**
 * 수출(수출검역) 슬롯을 표시·집계하는 조건 — **수출 카드를 선언한 목적지** + 왕복.
 * 그 외(선언 없음, 또는 편도)는 수출 슬롯을 숨기고 완료 판정에서도 제외한다.
 *
 * ⚠️ 왕복 판정은 **여정 종류(trip_type)** 로 한다 — 귀국일 존재만 보면 안 된다(2026-08-19).
 * 편도로 바꾼 케이스에도 by_dest 에 귀국일이 남아 있는 일이 흔하고, 그러면 편도인데 수출이
 * '대기'로 떠 영영 완료되지 않는 줄이 남는다. getTripType 은 미설정 시 'round' 라 옛 케이스는
 * 영향 없다.
 */
export function exportSlotApplies(caseRow: CaseRow, dest: string | null): boolean {
  if (!resolveReportBinding(dest, 'export')) return false
  if (getTripType((caseRow.data ?? {}) as Record<string, unknown>, dest) !== 'round') return false
  return !!reportReturnDateFor(caseRow, dest)
}

/**
 * 상태 색 — 검사 진행상태와 같은 규칙. '진행' → primary(테라코타), '완료' → sage, 나머지 muted.
 */
export function reportStatusTone(value: string): string {
  if (value === 'in_progress') return 'text-primary'
  if (value === 'done') return 'text-pmw-positive'
  return 'text-pmw-text-tertiary'
}

export function reportStatusLabel(value: string): string {
  return REPORT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? '대기'
}

/**
 * 상세페이지 '신고' 행을 띄울 목적지인가 — 신고 탭 포함 조건과 같은 기준.
 *
 * 탭(isAutoImportReport)은 케이스의 여행지를 훑어 하나라도 걸리면 올리지만, 상세는 지금
 * 보고 있는 **그 여행지**만 본다. 탭에 없는 케이스에 '신고 대기' 행이 뜨면 안 되므로
 * 일정(출국일·내원일·항공 일정) 조건도 같이 건다 — 일정이 없으면 아직 신고할 게 없다.
 *
 * ⛔ 나라 목록을 여기 적지 말 것 — 어느 나라가 신고 대상인지는 설정(신고 국가)이,
 *   어느 카드와 이어지는지는 목적지 프로파일이 정한다.
 */
export function reportRowApplies(
  caseRow: CaseRow,
  dest: string | null,
  importReportCountries: string[],
): boolean {
  if (!dest) return false
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  // '신고 내리기'(= 신고 취소)는 진행 정보를 통째로 비우는 동작이라, 탭과 같이 행도 감춘다.
  if (data.import_report_dismissed === true) return false
  // 수동 포함은 운영자가 명시적으로 "이 케이스는 신고 대상" 이라고 정한 것 — 일정 불문.
  if (data.import_report_manual === true) return true
  if (!hasReportSchedule(caseRow, dest)) return false
  if (importReportCountries.includes(dest)) return true
  return !!resolveReportBinding(dest, 'import')
}

/**
 * 신고 대상의 '일정 있음' 판정 — 날짜 신호가 **하나라도** 있으면 참.
 *
 * 보는 자리(넓은 순):
 *   ① 출국일 — by_dest[여행지].departure_date → cases.departure_date 컬럼
 *   ② 내원일 — 내원일이 잡혔다는 건 출국이 임박했다는 뜻이라 신고 대상이다
 *   ③ 출국 항공편 **출발일**(departure_flight_date)
 *   ④ **도착일**(entry_date)
 *
 * ③④ 가 필요한 이유 — 추가정보로 항공 일정을 받는 나라는 그 값이 `data` 에 먼저 들어오고
 * `departure_date` 컬럼은 sync 룰이 돌아야 채워진다. 룰이 없거나(하와이 2026-08-18 이전)
 * 애초에 출발일을 **묻지 않는**(도착일만 받는 스위스·미국·대만·EU 통지국) 케이스는 컬럼이
 * 빈 채로 남아 신고 탭에서 통째로 빠졌다 — 실제로 태국 3건이 그렇게 사라졌다(2026-08-24
 * 어일용/남촉·남락·남숙). 그 나라들은 출발일을 프로파일 필드로 올려 근본을 고쳤지만,
 * **도착일만 받는 나라가 남아 있는 한 ④ 가 마지막 안전망**이다.
 * (도착일은 신고기한 계산엔 안 쓴다 — 기한은 여전히 출국일 기준.)
 */
export function hasReportSchedule(caseRow: CaseRow, dest: string | null): boolean {
  if (getDepartureDate(caseRow, dest)) return true
  if (getVetVisitDate(caseRow, dest)) return true
  const data = (caseRow.data as Record<string, unknown> | null) ?? null
  const flightKeys = ['departure_flight_date', 'entry_date'] as const
  for (const key of flightKeys) {
    const v = readByDestValue(data, dest, key)
    if (typeof v === 'string' && v) return true
  }
  // 다중 여행지 + 특정 여행지 지정이면 top-level 폴백 안 함 — 다른 여행지 잔존값 누수 차단(B).
  if (dest && parseDestinations(caseRow.destination).length > 1) return false
  return flightKeys.some((key) => {
    const top = data?.[key]
    return typeof top === 'string' && !!top
  })
}
