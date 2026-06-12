import { JOURNEY_STEP_CATALOG } from './catalog'
import { STEP_DESTINATION_OVERRIDES } from './destination-overrides'

/**
 * stepId → procedure-checks 의 id 목록.
 *
 * 1차 출처는 catalog.ts 의 step.validationIds **+ destination override 의 validationIds**.
 * 이 파일은 그걸 뒤집은 인덱스 + 반대 방향(checkId → stepId) 매핑을 같이 제공한다.
 * (override 누락 시 그 나라 체크가 step 배지 대신 caseAlert(상단)로 새는 버그 — 일본 외
 * 나라는 validationIds 를 override 에 두므로 양쪽을 모두 인덱스에 넣는다. 체크 id 는 나라
 * prefix 로 전역 유일이라 한 평면 인덱스로 충돌 없음. 실행 자체는 country 필터가 거른다.)
 *
 * portal UI 는:
 *  1) runChecksForCase(country, ctx) 로 모든 룰 실행
 *  2) findStepForCheck(checkId) 로 어느 step 카드에 배지를 띄울지 결정
 *  3) getChecksForStep(stepId) 로 상세 페이지의 ⚠ 영역 채움
 */

/** stepId → checkId[] */
const STEP_TO_CHECKS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}
  const add = (stepId: string, ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return
    const cur = out[stepId] ?? (out[stepId] = [])
    for (const id of ids) {
      if (!cur.includes(id)) cur.push(id)
    }
  }
  for (const step of JOURNEY_STEP_CATALOG) {
    add(step.id, step.validationIds)
  }
  for (const overrides of Object.values(STEP_DESTINATION_OVERRIDES)) {
    for (const [stepId, override] of Object.entries(overrides)) {
      add(stepId, override?.validationIds)
    }
  }
  return out
})()

/** checkId → stepId (없으면 null) */
const CHECK_TO_STEP: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [stepId, checks] of Object.entries(STEP_TO_CHECKS)) {
    for (const c of checks) {
      out[c] = stepId
    }
  }
  return out
})()

export function getChecksForStep(stepId: string): readonly string[] {
  return STEP_TO_CHECKS[stepId] ?? []
}

export function findStepForCheck(checkId: string): string | null {
  return CHECK_TO_STEP[checkId] ?? null
}

/** 카탈로그가 가진 모든 check id (중복 제거). 테스트에서 procedure-checks 와 교차검증 시 사용. */
export function getAllMappedCheckIds(): string[] {
  return Array.from(new Set(Object.values(CHECK_TO_STEP)))
}
