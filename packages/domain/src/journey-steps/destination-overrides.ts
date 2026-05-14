import type { StepDefinition } from './types'

/**
 * step 의 일부 속성을 목적지별로 override 하기 위한 매핑.
 *
 * - 키: destination-config 의 destinationKey ('japan' | 'eu' | 'australia' | …).
 * - 값: stepId → Partial<StepDefinition>. 비어있는 객체이거나 키가 없으면 base catalog 그대로 사용.
 *
 * 안전 권장 (현재 코드는 enforce 하지 않음):
 *   - description / title / shortLabel 같은 표시용 텍스트 override 권장.
 *   - applicability / done / validationIds 같은 검증·완료 시그널은 base 만 쓰는 것을 권장.
 *     국가별 검증은 procedure-checks/<country>.ts 와 step.validationIds 로 분리 관리.
 *
 * 채워나가는 방식: 목적지별 차이가 확인되는 step 만 점진적으로 추가.
 */
export const STEP_DESTINATION_OVERRIDES: Record<
  string,
  Partial<Record<string, Partial<StepDefinition>>>
> = {
  // 예시 — 실제 텍스트는 사용자가 알려주는 대로 채움.
  // japan: {
  //   microchip: {
  //     description: '국제 표준 규격(ISO 11784/11785)…',
  //   },
  // },
}

/**
 * base step + destination override 를 머지해 최종 StepDefinition 반환.
 * destinationKey 가 null 이거나 매칭 override 가 없으면 base 그대로.
 */
export function resolveStepForDestination(
  step: StepDefinition,
  destinationKey: string | null | undefined,
): StepDefinition {
  if (!destinationKey) return step
  const override = STEP_DESTINATION_OVERRIDES[destinationKey]?.[step.id]
  if (!override) return step
  return { ...step, ...override }
}
