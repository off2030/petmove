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
 * ⚠️ 한 stepId 가 목적지마다 다른 필드를 가리키면 이 평면 맵으로는 표현할 수 없다.
 *    그런 충돌은 DATED_STEP_FIELD_CONFLICTS 에 모아 두고 `pnpm lint:validation-wiring`
 *    이 실패시킨다. 실제로 그런 카드가 필요해지면 맵을 목적지별로 쪼개야 한다.
 */
import { JOURNEY_STEP_CATALOG } from './catalog'
import { STEP_DESTINATION_OVERRIDES } from './destination-overrides'

const PREFIX = 'dated:'

function datedField(done: unknown): string | null {
  return typeof done === 'string' && done.startsWith(PREFIX) ? done.slice(PREFIX.length) : null
}

const map: Record<string, string> = {}
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
for (const steps of Object.values(STEP_DESTINATION_OVERRIDES)) {
  for (const [stepId, override] of Object.entries(steps ?? {})) {
    const field = datedField((override as { done?: unknown } | undefined)?.done)
    if (field) record(stepId, field)
  }
}
for (const [stepId, fields] of seen) {
  if (fields.size > 1) conflicts.push({ stepId, fields: [...fields] })
}

/** stepId → 저장 필드. server action 의 '임의 키 쓰기 차단' 신뢰 목록으로 쓴다. */
export const DATED_STEP_FIELDS: Readonly<Record<string, string>> = map

/** 한 stepId 가 목적지마다 다른 필드를 가리키는 경우 — 린트가 실패시킨다. 평시 빈 배열. */
export const DATED_STEP_FIELD_CONFLICTS: ReadonlyArray<{ stepId: string; fields: string[] }> =
  conflicts
