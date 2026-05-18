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
  japan: {
    // 'departure'(출국·도착)은 전 목적지 공용 — 일본은 도착 후 공항 검역이 핵심이라
    // 일본 케이스에서만 '일본 수입 동물검역'으로 표시. 다른 목적지는 base 그대로.
    departure: {
      title: '일본 수입 동물검역',
      shortLabel: '수입',
      description:
        '일본 도착 후 공항 동물검역소에서 검역을 받습니다.\n동물검역소는 공항마다 위치가 다르지만 일반적으로 입국 심사대를 지난 뒤 수화물 찾는 곳 근처에 있습니다. 검역을 받기 전에 세관 심사대를 통과하지 않도록 주의하세요.',
      links: [
        { url: 'https://www.petmove.co.kr/blog/japan-pet-import-inspection/', label: '일본 주요 공항 동물검역소 위치' },
      ],
    },
  },
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
