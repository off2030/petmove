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

/**
 * done 시그널 `quarantine:<field>` 로 선언된 모든 완료 필드 — base catalog + destination
 * override(importQuarantineCard factory 포함) 합산.
 *
 * **서버 저장 액션(updateImportQuarantineDate)의 허용 명단 단일 출처.** 예전엔 서버가 손으로
 * 쓴 정규식(`*_import/export_quarantine_date`) + 아일랜드 예외 1개로 필드를 걸렀는데, 이후
 * 같은 confirm 모델로 만든 카드(하와이 입국 신청·필리핀 현지 병원 방문·노르웨이/키프로스/몰타
 * 사전 통지·이스라엘 사전 통보 — 6개)가 명단 누락으로 **저장이 전부 거부**되고 있었다
 * (2026-07-25 발견). 카탈로그에 카드를 선언하면 자동으로 허용돼 재발이 원천 차단된다.
 */
export const QUARANTINE_DONE_FIELD_KEYS: ReadonlySet<string> = (() => {
  const out = new Set<string>()
  const add = (done: unknown) => {
    if (typeof done === 'string' && done.startsWith('quarantine:')) {
      out.add(done.slice('quarantine:'.length))
    }
  }
  for (const step of JOURNEY_STEP_CATALOG) add(step.done)
  for (const overrides of Object.values(STEP_DESTINATION_OVERRIDES)) {
    for (const override of Object.values(overrides)) {
      add((override as { done?: unknown } | undefined)?.done)
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
