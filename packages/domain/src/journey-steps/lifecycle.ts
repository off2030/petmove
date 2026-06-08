/**
 * 여정 생애주기(lifecycle) — 순수 헬퍼.
 *
 * 설계 단일 출처: docs/journey-lifecycle-design.md
 *
 * ⚠️ 아직 어떤 앱에도 연결(wire)되지 않은 초안. 완료 시 past_journeys 요약 생성,
 * 첫 화면 선택, 관련성 판정을 담당한다. 실제 caseRow 매핑은 구현 시 붙인다.
 *
 * 같은 목적지 "동시" 2개는 금지(설계 §2.2)이므로, 진행 중 여정은 목적지 이름으로
 * 유일하게 구분된다 — 별도 여정 ID 가 필요 없다.
 * 날짜는 ISO 'YYYY-MM-DD' 사전식 비교만 한다(타임존/Date 의존 X).
 */

export type TripType = 'round' | 'one_way'

/** 진행 중 여정. 완료되면 PastJourneySummary 로 요약되어 past_journeys 로 이동한다. */
export interface JourneyInstance {
  /** 목적지 토큰 — 진행 중 여정의 식별자(동시 같은 목적지 없음). 예: '일본'. */
  destination: string
  tripType: TripType
  /** 출국(예정)일. 정렬·표식 기준. 미정이면 null. ISO 'YYYY-MM-DD'. */
  departureDate: string | null
  returnDate?: string | null
}

/** 완료/취소된 여정의 한 줄 요약 — `case.data.past_journeys[]`. (풀 절차는 안 남김) */
export interface PastJourneySummary {
  destination: string
  departureDate: string | null
  returnDate?: string | null
  tripType: TripType
  /** 'done' = 잘 다녀옴(도장) / 'cancelled' = 취소. */
  outcome: 'done' | 'cancelled'
  /** 완료/취소 처리된 날 — 지난 여정 정렬 기준. ISO. */
  completedDate: string | null
}

// ── 날짜 비교 (ISO 문자열, 순수) ─────────────────────────────────────────

function cmpDateAsc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

function cmpDateDesc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a > b ? -1 : a < b ? 1 : 0
}

/** 출국일 빠른 순. 진행 중 여정이 여럿(서로 다른 목적지)일 때 정렬용. */
export function sortByDeparture(journeys: JourneyInstance[]): JourneyInstance[] {
  return [...journeys].sort((a, b) => cmpDateAsc(a.departureDate, b.departureDate))
}

// ── 완료 → 요약 (design §4·§5) ──────────────────────────────────────────

/** 진행 중 여정을 완료/취소 처리해 past_journeys 요약으로 변환. */
export function summarizeJourney(
  j: JourneyInstance,
  outcome: 'done' | 'cancelled',
  completedDate: string | null,
): PastJourneySummary {
  return {
    destination: j.destination,
    departureDate: j.departureDate,
    returnDate: j.returnDate ?? null,
    tripType: j.tripType,
    outcome,
    completedDate,
  }
}

// ── 첫 화면 선택 (design §6) ─────────────────────────────────────────────

export interface HomeSelection {
  /** 첫 화면에 보일 진행 중 여정(들). 출국일 빠른 순. */
  active: JourneyInstance[]
  /** active 가 비었을 때 첫 화면에 둘 가장 최근 완료 여정 (없으면 null). */
  fallback: PastJourneySummary | null
  /** "지난 여정" 카드 목록 (최근 완료 순). fallback 으로 쓰인 1건은 제외. */
  past: PastJourneySummary[]
}

/**
 * 진행 중 / 지난 분리 + 첫 화면 규칙.
 * - 진행 중이 있으면 → active(출국일 순), fallback=null, past=지난 전체(최근 순).
 * - 진행 중이 없으면 → 가장 최근 완료 1건을 fallback, 나머지를 past.
 */
export function selectHomeJourneys(
  active: JourneyInstance[],
  pastJourneys: PastJourneySummary[],
): HomeSelection {
  const sortedActive = sortByDeparture(active)
  const sortedPast = [...pastJourneys].sort((a, b) => cmpDateDesc(a.completedDate, b.completedDate))
  if (sortedActive.length > 0) {
    return { active: sortedActive, fallback: null, past: sortedPast }
  }
  const [fallback = null, ...rest] = sortedPast
  return { active: [], fallback, past: rest }
}

// ── 지난 여정 카드 표식 (design §8) ──────────────────────────────────────

/** 'YYYY-MM-DD' → 'YYYY.MM.DD' (지난 여정 카드의 출국일 표식). */
export function formatDepartureYmd(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${m}.${d}`
}

// ── 관련성: 이 여정에 보일 항목 (design §3) ───────────────────────────────

/**
 * 한 여정에 표시할 항목 집합 = 규칙(기본) + 수동 추가 − 수동 제외.
 * 항목 키는 step id 또는 의료기록 식별자. 입력 순서 보존, 제외가 추가를 이김, 중복 1회.
 */
export function resolveRelevance(input: {
  ruleIncluded: readonly string[]
  manualAdded?: readonly string[]
  manualExcluded?: readonly string[]
}): string[] {
  const excluded = new Set(input.manualExcluded ?? [])
  const seen = new Set<string>()
  const result: string[] = []
  const push = (k: string) => {
    if (!seen.has(k) && !excluded.has(k)) {
      seen.add(k)
      result.push(k)
    }
  }
  for (const k of input.ruleIncluded) push(k)
  for (const k of input.manualAdded ?? []) push(k)
  return result
}

// ── 완료 확인 prompt 발동 (design §4.2) ──────────────────────────────────────

/**
 * A형(완료 확인) 발동 여부 — 출국/귀국일이 지났는데 아직 도착(완료) 처리 안 됨.
 * - anchorDate: 왕복=귀국일, 편도=출국일 (ISO 'YYYY-MM-DD'). 없으면 발동 안 함.
 * - today: 'YYYY-MM-DD'.
 * - dismissedFor: 이 목적지에서 마지막으로 "진행 중"으로 닫을 때의 anchorDate.
 *   같으면 재발동 안 함 — 출국/귀국일이 바뀌면 anchorDate 가 변해 다시 뜬다.
 *
 * B형(유효기간 만료·방치)은 유효기간 판정이 필요해 별도 — 추후.
 */
export function shouldPromptArrival(input: {
  journeyComplete: boolean
  anchorDate: string | null
  today: string
  dismissedFor?: string | null
}): boolean {
  if (input.journeyComplete) return false
  if (!input.anchorDate) return false
  if (input.anchorDate >= input.today) return false
  return input.dismissedFor !== input.anchorDate
}
