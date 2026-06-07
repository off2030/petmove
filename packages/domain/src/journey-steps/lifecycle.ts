/**
 * 여정 생애주기(lifecycle) — 순수 헬퍼.
 *
 * 설계 단일 출처: docs/journey-lifecycle-design.md
 *
 * ⚠️ 아직 어떤 앱에도 연결(wire)되지 않은 초안이다. 여정 인스턴스 데이터 모델
 * (구현 1단계 — destination 문자열·by_dest 키를 목적지명 → 여정 ID 로 전환)이
 * 확정되면 `caseRow → JourneyInstance[]` 매핑을 붙이고 이 함수들을 사용한다.
 * 입력 타입 JourneyInstance 는 설계 가정이며 1단계에서 조정될 수 있다.
 *
 * 모든 함수는 순수(부수효과 없음). 날짜는 ISO 'YYYY-MM-DD' 문자열 사전식 비교만
 * 한다 — Date 객체/타임존에 의존하지 않아 결정적이다.
 */

export type JourneyStatus = 'active' | 'past'

export interface JourneyInstance {
  /** 여정 고유 ID (목적지 이름이 아님 — 같은 목적지 2개를 구분하기 위함). */
  id: string
  /** 목적지 토큰 (표시용). 예: '일본'. */
  destination: string
  tripType: 'round' | 'one_way'
  /** 출국(예정)일. 표식·정렬 기준. 미정이면 null. ISO 'YYYY-MM-DD'. */
  departureDate: string | null
  /** 귀국일(왕복). 지난 여정 상세의 기간 표시용. */
  returnDate?: string | null
  status: JourneyStatus
  /** 완료(도착)일 — status='past' 정렬 기준. 수동 전환이면 전환일. ISO. */
  completedDate?: string | null
}

// ── 날짜 비교 (ISO 문자열, 순수) ─────────────────────────────────────────

/** ISO 날짜 오름차순 비교. null(미정)은 뒤로 보낸다. */
function cmpDateAsc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

/** ISO 날짜 내림차순 비교(최근이 앞). null 은 뒤로 보낸다. */
function cmpDateDesc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a > b ? -1 : a < b ? 1 : 0
}

/** 출국일 빠른 순. 같은 목적지 2개의 앞/뒤(먼저/나중) 결정에도 사용. */
export function sortByDeparture(journeys: JourneyInstance[]): JourneyInstance[] {
  return [...journeys].sort((a, b) => cmpDateAsc(a.departureDate, b.departureDate))
}

// ── 첫 화면 선택 (design §5·§6) ───────────────────────────────────────────

export interface HomeSelection {
  /** 첫 화면에 보일 진행 중 여정(들). 출국일 빠른 순. */
  active: JourneyInstance[]
  /** active 가 비었을 때 첫 화면에 둘 가장 최근 완료 여정 (없으면 null). */
  fallback: JourneyInstance | null
  /** "지난 여정" 메뉴에 보일 여정들 (최근 완료 순). fallback 으로 쓰인 1건은 제외. */
  past: JourneyInstance[]
}

/**
 * 진행 중/지난 분리 + 첫 화면 규칙.
 * - 진행 중이 있으면 → active(출국일 순), fallback=null, past=완료 전체(최근 순).
 * - 진행 중이 없으면 → 가장 최근 완료 1건을 fallback, 나머지를 past.
 */
export function selectHomeJourneys(journeys: JourneyInstance[]): HomeSelection {
  const active = sortByDeparture(journeys.filter((j) => j.status === 'active'))
  const pastAll = journeys
    .filter((j) => j.status === 'past')
    .sort((a, b) => cmpDateDesc(a.completedDate, b.completedDate))

  if (active.length > 0) {
    return { active, fallback: null, past: pastAll }
  }
  const [fallback = null, ...rest] = pastAll
  return { active: [], fallback, past: rest }
}

// ── 같은 목적지 그룹 표식 (design §8) ──────────────────────────────────────

/**
 * 진행 중 여정 중 "같은 목적지 2개+" 그룹에서 뒤 일정(흐림) 여부를 id → boolean 으로 반환.
 * 한 목적지에 진행 중이 1개면 false. 2개+ 면 출국일 빠른 순으로 첫 번째만 false,
 * 나머지(나중 출국)는 true(흐림).
 */
export function markSecondaryByDestination(active: JourneyInstance[]): Map<string, boolean> {
  const byDest = new Map<string, JourneyInstance[]>()
  for (const j of active) {
    const arr = byDest.get(j.destination)
    if (arr) arr.push(j)
    else byDest.set(j.destination, [j])
  }
  const secondary = new Map<string, boolean>()
  for (const arr of byDest.values()) {
    if (arr.length < 2) {
      secondary.set(arr[0].id, false)
    } else {
      sortByDeparture(arr).forEach((j, i) => secondary.set(j.id, i > 0))
    }
  }
  return secondary
}

// ── 라우트 옆 표식 텍스트 (design §8) ─────────────────────────────────────

/** 'YYYY-MM-DD' → 'YYYY.MM.DD' (지난 여정 표식). */
export function formatDepartureYmd(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${m}.${d}`
}

/** 'YYYY-MM-DD' → 'N월' (같은 목적지 2개 진행 중 구분). */
export function formatDepartureMonth(iso: string): string {
  const m = iso.split('-')[1]
  return `${Number(m)}월`
}

/**
 * 여정 라우트 옆 표식 텍스트. 없으면 null.
 * - 지난 여정: 출국 년월일('2025.06.23'). 출국일 없으면 null.
 * - 진행 중 + showMonth(같은 목적지 2개): 출국월('6월'). 출국일 미정이면 '준비 중'.
 * - 그 외(진행 중 단일): null.
 */
export function journeyMark(j: JourneyInstance, opts: { showMonth: boolean }): string | null {
  if (j.status === 'past') {
    return j.departureDate ? formatDepartureYmd(j.departureDate) : null
  }
  if (opts.showMonth) {
    return j.departureDate ? formatDepartureMonth(j.departureDate) : '준비 중'
  }
  return null
}

// ── 관련성: 이 여정에 보일 항목 (design §3) ───────────────────────────────

/**
 * 한 여정에 표시할 항목 집합 = 규칙(기본) + 수동 추가 − 수동 제외.
 * 항목 키는 step id 또는 의료기록 식별자 등 문자열. 입력 순서 보존(규칙 먼저, 추가는 뒤).
 * 제외가 추가를 이긴다(같은 키가 added·excluded 양쪽이면 제외). 중복은 1번만.
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
