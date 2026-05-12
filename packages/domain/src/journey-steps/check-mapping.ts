import { JOURNEY_STEP_CATALOG } from './catalog'

/**
 * stepId → procedure-checks 의 id 목록.
 *
 * 1차 출처는 catalog.ts 의 step.validationIds. 이 파일은 그걸 뒤집은 인덱스 +
 * 반대 방향(checkId → stepId) 매핑을 같이 제공한다.
 *
 * portal UI 는:
 *  1) runChecksForCase(country, ctx) 로 모든 룰 실행
 *  2) findStepForCheck(checkId) 로 어느 step 카드에 배지를 띄울지 결정
 *  3) getChecksForStep(stepId) 로 상세 페이지의 ⚠ 영역 채움
 */

/** stepId → checkId[] */
const STEP_TO_CHECKS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}
  for (const step of JOURNEY_STEP_CATALOG) {
    if (step.validationIds && step.validationIds.length > 0) {
      out[step.id] = [...step.validationIds]
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
