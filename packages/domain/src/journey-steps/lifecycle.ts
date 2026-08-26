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

import { MAX_DESTINATIONS_PER_CASE, parseDestinations } from '../destination-config'
import { DESTINATION_SCOPED_FIELD_KEYS } from '../destination-scoped-fields'

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
  /**
   * 내리기 직전 원본 — '되돌리기'(복원)용. 2026-08-21 신설.
   *
   * 왜: 지난 여정으로 내리면 그 목적지의 `by_dest` 항목·top-level 스코프 필드·출국일 컬럼이
   * **전부 지워지는데**, 요약에는 여행지·출국일·귀국일·왕복여부·결과·완료일 6개만 남았다.
   * 그래서 칩의 작은 보관 버튼을 잘못 누르면 일정·항공편·검역일이 복구 불가로 사라졌다
   * (사용자 지적). 이제 원본을 함께 안고 내려가 [[planJourneyRestore]] 로 되돌릴 수 있다.
   *
   * 이 필드가 없는 옛 기록은 되돌릴 수 없다 — UI 가 버튼을 감춘다.
   */
  snapshot?: PastJourneySnapshot
}

/** 지난 여정으로 내리기 직전의 원본 — 복원에 필요한 최소 집합. */
export interface PastJourneySnapshot {
  /** `data.by_dest[여행지]` 통째. */
  byDestEntry: Record<string, unknown> | null
  /** `data.trip_type[여행지]`. */
  tripType: TripType | null
  /** `data.arrival_confirmed[여행지]`. */
  arrivalConfirmed?: unknown
  /** `data.completion_prompt_dismissed[여행지]`. */
  completionPromptDismissed?: unknown
  /**
   * 내리기 직전 top-level 목적지-스코프 필드. **단일 여행지 케이스의 진짜 데이터가 여기 산다**
   * (by_dest 를 안 쓰므로) — 이걸 안 담으면 단일 여행지 보관은 복원해도 빈 껍데기가 된다.
   */
  topLevelScoped?: Record<string, unknown>
  /** 내리기 직전 `departure_date` 컬럼. */
  prevDeparture?: string | null
  /** 내리기 직전 `destination` 컬럼 전체 — 토큰 **순서** 복원용. */
  prevDestination?: string | null
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

// ── 되돌리기(복원) — 스냅샷 채집·복원 계획 ──────────────────────────────

/**
 * 지난 여정으로 내리기 **직전**에 원본을 담는다. 세 곳(펫무브워크 보관 · 펫무브 여정
 * 마무리 · 새 여행지 추가 시 자동 내림)이 모두 이걸 써서 같은 모양으로 남긴다.
 *
 * ⚠️ 반드시 데이터를 지우기 **전에** 부를 것 — 지운 뒤에 부르면 빈 스냅샷이 담긴다.
 */
export function captureJourneySnapshot(args: {
  /** 내려가는 목적지 토큰. */
  destination: string
  /** 내리기 직전 `case.data`. */
  data: Record<string, unknown>
  /** 내리기 직전 `destination` 컬럼. */
  destinationColumn: string | null
  /** 내리기 직전 `departure_date` 컬럼. */
  departureColumn: string | null
}): PastJourneySnapshot {
  const { destination: dest, data } = args
  const byDest = data.by_dest as Record<string, Record<string, unknown>> | undefined
  const tripTypeMap = data.trip_type as Record<string, TripType> | undefined
  const arrival = data.arrival_confirmed as Record<string, unknown> | undefined
  const dismissed = data.completion_prompt_dismissed as Record<string, unknown> | undefined

  // top-level 스코프 필드 — 존재하는 키만. 단일 여행지 케이스의 실데이터가 여기 있다.
  const topLevelScoped: Record<string, unknown> = {}
  for (const k of DESTINATION_SCOPED_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, k)) topLevelScoped[k] = data[k]
  }

  return {
    byDestEntry: byDest?.[dest] ? { ...byDest[dest] } : null,
    tripType: tripTypeMap?.[dest] ?? null,
    arrivalConfirmed: arrival?.[dest],
    completionPromptDismissed: dismissed?.[dest],
    topLevelScoped: Object.keys(topLevelScoped).length > 0 ? topLevelScoped : undefined,
    prevDeparture: args.departureColumn,
    prevDestination: args.destinationColumn,
  }
}

/** [[planJourneyRestore]] 결과 — 그대로 `cases` 에 update 하면 된다. */
export interface JourneyRestorePlan {
  destination: string
  departure_date: string | null
  data: Record<string, unknown>
  /** 복원된 여행지 토큰 — 안내 문구용. */
  restored: string
}

/** 복원이 불가능한 이유 — 호출부가 사용자에게 그대로 보여준다. */
export type JourneyRestoreBlock =
  | { reason: 'no-snapshot' }
  | { reason: 'already-active' }
  | { reason: 'at-limit'; limit: number }
  | { reason: 'not-found' }

/**
 * 지난 여정 1건을 다시 진행 중으로 되돌리는 **순수 계획**. DB 접근 없음.
 *
 * 복원 원칙 — **덮어쓰지 않는다.** 내려간 뒤 그 자리에 새 데이터가 들어왔을 수 있으므로
 * top-level 스코프 필드·출국일 컬럼은 **지금 비어 있는 자리에만** 되돌린다. by_dest 항목은
 * 그 목적지가 지금 없으니(=이미 확인) 그대로 복원한다.
 *
 * 토큰 순서는 스냅샷의 `prevDestination` 순서를 따라 원래 자리에 끼워 넣는다.
 */
export function planJourneyRestore(
  current: {
    destination: string | null
    departure_date: string | null
    data: Record<string, unknown>
  },
  /** `data.past_journeys` 배열에서의 인덱스(정렬 전 원본 인덱스). */
  entryIndex: number,
): JourneyRestorePlan | JourneyRestoreBlock {
  const past = [...((current.data.past_journeys as PastJourneySummary[] | undefined) ?? [])]
  const entry = past[entryIndex]
  if (!entry) return { reason: 'not-found' }
  const snap = entry.snapshot
  if (!snap) return { reason: 'no-snapshot' }

  const dest = entry.destination
  const tokens = parseDestinations(current.destination)
  if (tokens.includes(dest)) return { reason: 'already-active' }
  if (tokens.length >= MAX_DESTINATIONS_PER_CASE) {
    return { reason: 'at-limit', limit: MAX_DESTINATIONS_PER_CASE }
  }

  // 끼워 넣을 자리 — **옛 동료들 사이의 원래 순서는 지키되, 그 뒤에 새로 시작한 여정보다
  //   앞으로 가지 않는다.** 첫 토큰이 그 케이스의 기본(활성) 여정이라, 되돌리기가 화면의
  //   기본 여정을 가로채면 안 된다.
  const prevOrder = parseDestinations(snap.prevDestination ?? null)
  const prevIdx = prevOrder.indexOf(dest)
  const beforeCount = tokens.filter((t) => {
    const i = prevOrder.indexOf(t)
    // 스냅샷 당시 없던 토큰(= 보관 뒤에 시작한 여정) 은 전부 앞으로 보낸다.
    if (i === -1) return true
    return prevIdx >= 0 && i < prevIdx
  }).length
  const nextTokens = [...tokens]
  nextTokens.splice(Math.min(beforeCount, nextTokens.length), 0, dest)

  const data: Record<string, unknown> = { ...current.data }

  data.by_dest = {
    ...((data.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}),
    [dest]: snap.byDestEntry ?? {},
  }
  data.trip_type = {
    ...((data.trip_type as Record<string, TripType> | undefined) ?? {}),
    [dest]: snap.tripType ?? 'round',
  }
  if (snap.arrivalConfirmed !== undefined) {
    data.arrival_confirmed = {
      ...((data.arrival_confirmed as Record<string, unknown> | undefined) ?? {}),
      [dest]: snap.arrivalConfirmed,
    }
  }
  if (snap.completionPromptDismissed !== undefined) {
    data.completion_prompt_dismissed = {
      ...((data.completion_prompt_dismissed as Record<string, unknown> | undefined) ?? {}),
      [dest]: snap.completionPromptDismissed,
    }
  }

  // top-level 스코프 잔존 — 비어 있는 자리에만(새 여정 데이터를 덮지 않는다).
  for (const [k, v] of Object.entries(snap.topLevelScoped ?? {})) {
    if (!DESTINATION_SCOPED_FIELD_KEYS.has(k)) continue
    const cur = data[k]
    if (cur === undefined || cur === null || cur === '') data[k] = v
  }

  past.splice(entryIndex, 1)
  data.past_journeys = past

  return {
    destination: nextTokens.join(', '),
    // 출국일 컬럼도 같은 원칙 — 지금 비어 있을 때만 되돌린다.
    departure_date: current.departure_date ?? snap.prevDeparture ?? null,
    data,
    restored: dest,
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
