/**
 * `done: 'dated:<field>'` 카드 → 저장 필드 맵 — **단일 출처**.
 *
 * 왜 여기 있나 — 이 맵은 원래 apps/portal 의 server action 안에 있었고, base 카탈로그만
 * 훑는 파생 + 손으로 적은 예외 몇 줄로 만들어졌다. 두 번 사고가 났다:
 *
 *   ① 파생 조건이 `buttonComplete && done.startsWith('dated:')` 로 좁혀져 있었다.
 *      계류시설 예약(au-quarantine-reservation)을 버튼 완료 → 날짜 입력 카드로 바꾸자
 *      조건에서 탈락해 저장이 "알 수 없는 절차 단계입니다." 로 죽었다(2026-07-28).
 *   ② base 카탈로그만 보므로, **목적지 override 가 done 을 dated: 로 바꾸는 카드**는
 *      파생이 못 본다(수입 허가 — 호주·홍콩·말레이시아·인도네시아·UAE 5곳). 그래서
 *      'import-permit' 한 줄을 손으로 적어 메우고 있었다.
 *
 * 그래서 **카탈로그 + 전 목적지 override 의 실효 done** 에서 파생한다. 새 dated 카드를
 * 만들거나 override 로 dated 로 바꾸면 저장이 자동으로 열린다. 손으로 적을 자리는 없다.
 *
 * ── 목적지마다 필드가 다른 카드 ────────────────────────────────────────────
 * 같은 stepId 가 목적지마다 다른 필드를 가리키는 경우가 실제로 있다 — 'departure'(도착 검역)
 * 카드가 호주·뉴질랜드·싱가포르에서 각각 `{국가}_import_quarantine_date` 를 쓴다
 * (2026-07-28 완료 버튼 전환). 평면 맵으로는 표현할 수 없으므로 **목적지별 맵**을 따로
 * 만들고 `resolveDatedStepField(stepId, destination)` 로 푼다. server action 은 이미
 * destination 을 받으므로 그대로 넘기면 된다.
 *
 * 평면 맵(DATED_STEP_FIELDS)은 목적지를 모를 때의 기본값이다. 목적지별로 갈리는 stepId 는
 * DATED_STEP_FIELD_CONFLICTS 에 남고, `pnpm lint:validation-wiring` 이 **목적지별로 풀었을
 * 때** 카드 선언과 일치하는지 전수 검사한다.
 */
import { findDestinationKey } from './applicability'
import { JOURNEY_STEP_CATALOG } from './catalog'
import { STEP_DESTINATION_OVERRIDES } from './destination-overrides'

// 저장 경로가 같은 두 신호 — dated(도래해야 완료) · booked(입력하면 완료).
// 완료 판정만 다르고 '이 stepId 는 이 필드를 쓴다'는 사실은 동일하다.
const PREFIXES = ['dated:', 'booked:'] as const

function datedField(done: unknown): string | null {
  if (typeof done !== 'string') return null
  for (const p of PREFIXES) if (done.startsWith(p)) return done.slice(p.length)
  return null
}

/**
 * 맵은 **지연 계산**한다(2026-07-29). 예전엔 import 시점에 카탈로그를 훑었는데, report-status
 * 가 이 모듈을 쓰기 시작하면서 순환(catalog → … → report-status → dated-steps → catalog)이
 * 생겨 "Cannot access 'JOURNEY_STEP_CATALOG' before initialization" 으로 죽었다.
 * 첫 호출 때 한 번만 만들고 캐시한다.
 */
interface DatedStepMaps {
  map: Record<string, string>
  byDest: Record<string, Record<string, string>>
  conflicts: Array<{ stepId: string; fields: string[] }>
}
let cache: DatedStepMaps | null = null

function maps(): DatedStepMaps {
  if (cache) return cache
  const map: Record<string, string> = {}
  const byDest: Record<string, Record<string, string>> = {}
  const conflicts: Array<{ stepId: string; fields: string[] }> = []
  const seen = new Map<string, Set<string>>()

  const record = (stepId: string, field: string) => {
    const set = seen.get(stepId) ?? new Set<string>()
    set.add(field)
    seen.set(stepId, set)
    if (!(stepId in map)) map[stepId] = field
  }

  for (const step of JOURNEY_STEP_CATALOG) {
    const field = datedField(step.done)
    if (field) record(step.id, field)
  }
  for (const [destKey, steps] of Object.entries(STEP_DESTINATION_OVERRIDES)) {
    for (const [stepId, override] of Object.entries(steps ?? {})) {
      const field = datedField((override as { done?: unknown } | undefined)?.done)
      if (!field) continue
      record(stepId, field)
      byDest[stepId] = { ...(byDest[stepId] ?? {}), [destKey]: field }
    }
  }
  for (const [stepId, fields] of seen) {
    if (fields.size > 1) conflicts.push({ stepId, fields: [...fields] })
  }
  cache = { map, byDest, conflicts }
  return cache
}

/** stepId → 저장 필드(목적지 무관 기본값). 목적지를 알면 resolveDatedStepField 를 쓸 것. */
export function datedStepFields(): Readonly<Record<string, string>> {
  return maps().map
}

/** stepId → 목적지 키 → 저장 필드. override 가 done 을 dated: 로 바꾼 카드만 들어 있다. */
export function datedStepFieldsByDestination(): Readonly<
  Record<string, Readonly<Record<string, string>>>
> {
  return maps().byDest
}

/** 한 stepId 가 목적지마다 다른 필드를 가리키는 경우 — 목적지별 맵으로 풀린다(참고용). */
export function datedStepFieldConflicts(): ReadonlyArray<{ stepId: string; fields: string[] }> {
  return maps().conflicts
}

/**
 * stepId(+목적지) → 저장 필드. 목적지별 선언이 있으면 그걸, 없으면 평면 맵을 쓴다.
 * destination 은 한글 토큰('호주')이든 키('australia')든 받는다 — findDestinationKey 로 정규화.
 */
export function resolveDatedStepField(
  stepId: string,
  destination?: string | null,
): string | null {
  const perDest = datedStepFieldsByDestination()[stepId]
  if (perDest && destination) {
    const key = findDestinationKey(destination) ?? destination
    const field = perDest[key]
    if (field) return field
  }
  return datedStepFields()[stepId] ?? null
}

/**
 * stepId(+목적지) → 그 카드가 선언한 **모든 날짜 입력 키**(선언 순서, 주 필드 포함).
 *
 * `dated:` 카드는 대부분 날짜가 하나지만, 회차가 있는 카드는 둘이다 — 뉴질랜드 마이크로칩
 * 인증이 1차·2차를 받는다(IHS 1.11(4), 채혈이 출국 3~6개월 전인 경우). 저장 액션이
 * 주 필드 외의 날짜도 받아야 하는데, 임의 키 쓰기를 열 수는 없으므로 **카드 선언에서
 * 파생한 허용 목록**을 쓴다(resolveDatedStepField 와 같은 원칙).
 */
export function resolveStepDateFields(stepId: string, destination?: string | null): string[] {
  const pick = (inputs: unknown): string[] =>
    Array.isArray(inputs)
      ? inputs
          .filter(
            (i): i is { key: string; type?: string } =>
              !!i && typeof i === 'object' && typeof (i as { key?: unknown }).key === 'string',
          )
          .filter((i) => i.type === 'date')
          .map((i) => i.key)
      : []

  const key = destination ? (findDestinationKey(destination) ?? destination) : null
  if (key) {
    const override = (STEP_DESTINATION_OVERRIDES[key] ?? {})[stepId] as
      | { inputs?: unknown }
      | undefined
    // override 가 inputs 를 선언했으면 **그게 전부**다 — 날짜 칸이 하나도 없어도 base 로
    //   폴백하지 않는다. 폴백하면 '신청일 칸을 뺀 카드'(뉴질랜드 수입 허가)가 여전히 날짜를
    //   받는 것으로 판정돼 완료 버튼이 먹히지 않는다(2026-07-29 발견).
    if (Array.isArray(override?.inputs)) return pick(override.inputs)
  }
  return pick(JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)?.inputs)
}

/**
 * 예약·구매형(`booked:`) 카드인가 — 목적지별 선언까지 본다.
 * 저장 액션이 '예약을 마친 날'(recorded_at)을 함께 찍을지 판단하는 데 쓴다.
 */
export function isBookedStep(stepId: string, destination?: string | null): boolean {
  const fromBase = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)?.done
  if (typeof fromBase === 'string' && fromBase.startsWith('booked:')) return true
  for (const [destKey, steps] of Object.entries(STEP_DESTINATION_OVERRIDES)) {
    const done = (steps?.[stepId] as { done?: unknown } | undefined)?.done
    if (typeof done !== 'string' || !done.startsWith('booked:')) continue
    if (!destination) return true
    if ((findDestinationKey(destination) ?? destination) === destKey) return true
  }
  return false
}

/**
 * 예약형 카드의 '예약을 마친 날' 키 — `<필드에서 _date 뗀 것>_recorded_at`.
 *
 * 항공권 구매 카드의 flight_info_recorded_at 과 같은 모델이다. 카드에 입력하는 날짜는
 * **미래**(계류 시작일·검사 예약일)라 일정 목록의 완료일로 쓸 수 없다 — 다른 완료 카드가
 * 전부 '언제 했는지'를 보여주는데 혼자 미래 날짜가 떠서 '예정' 배지가 붙었다
 * (2026-07-28 사용자 지적). 예약을 마친 날을 따로 찍어 그걸 완료일로 쓴다.
 */
export function bookedRecordedAtKey(field: string): string {
  return `${field.replace(/_date$/, '')}_recorded_at`
}
