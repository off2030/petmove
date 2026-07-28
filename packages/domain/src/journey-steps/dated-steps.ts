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

const PREFIX = 'dated:'

function datedField(done: unknown): string | null {
  return typeof done === 'string' && done.startsWith(PREFIX) ? done.slice(PREFIX.length) : null
}

const map: Record<string, string> = {}
const byDest: Record<string, Record<string, string>> = {}
const conflicts: Array<{ stepId: string; fields: string[] }> = []
const seen = new Map<string, Set<string>>()

function record(stepId: string, field: string) {
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

/** stepId → 저장 필드(목적지 무관 기본값). 목적지를 알면 resolveDatedStepField 를 쓸 것. */
export const DATED_STEP_FIELDS: Readonly<Record<string, string>> = map

/** stepId → 목적지 키 → 저장 필드. override 가 done 을 dated: 로 바꾼 카드만 들어 있다. */
export const DATED_STEP_FIELDS_BY_DESTINATION: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = byDest

/** 한 stepId 가 목적지마다 다른 필드를 가리키는 경우 — 목적지별 맵으로 풀린다(참고용). */
export const DATED_STEP_FIELD_CONFLICTS: ReadonlyArray<{ stepId: string; fields: string[] }> =
  conflicts

/**
 * stepId(+목적지) → 저장 필드. 목적지별 선언이 있으면 그걸, 없으면 평면 맵을 쓴다.
 * destination 은 한글 토큰('호주')이든 키('australia')든 받는다 — findDestinationKey 로 정규화.
 */
export function resolveDatedStepField(
  stepId: string,
  destination?: string | null,
): string | null {
  const perDest = DATED_STEP_FIELDS_BY_DESTINATION[stepId]
  if (perDest && destination) {
    const key = findDestinationKey(destination) ?? destination
    const field = perDest[key]
    if (field) return field
  }
  return DATED_STEP_FIELDS[stepId] ?? null
}
