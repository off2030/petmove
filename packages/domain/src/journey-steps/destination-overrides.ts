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
        '일본 도착 후 공항 동물검역소에서 검역을 받으세요.\n위치는 공항마다 다릅니다. 일반적으로 입국 심사대를 지나 수화물 찾는 곳 근처에 있습니다. 세관 심사대를 지나기 전에 검역을 먼저 받아야 합니다.',
      doneSummary: '일본 수입 동물검역을 받았습니다.',
      // 일본 수입검역은 도착 후 공항 검역소 방문이 핵심 — 출국일 경과(base 의
      // departure-past)가 아니라 검역일 입력 시 완료 처리. 검역일 필드도 노출.
      done: 'has-jp-import-quarantine',
      inputs: [
        { key: 'jp_import_quarantine_date', label: '검역일', type: 'date' },
      ],
      allowAttachments: true,
      attachmentHint: '검역증 사본을 사진, PDF로 저장하세요.',
      links: [
        { url: '/guide/japan-airport-quarantine', label: '일본 주요 공항 동물검역소 위치' },
      ],
    },
  },
  // 'departure'(출국·도착) 공용 카드를 나라별 '[국가] 수입 동물검역' 도착 카드로 교체.
  // 일본 뼈대(검역일 입력 + '완료' 확인)를 공용 필드(import_quarantine_date)로 재사용 —
  // done: 'has-import-quarantine'. 나라별 차이는 title/description/doneSummary 만.
  thailand: {
    departure: {
      title: '태국 수입 동물검역',
      shortLabel: '수입',
      description:
        '태국 도착 후 공항 동물검역소(AQS)에서 수입 검역을 받으세요.\n검역 수수료는 동물 1마리당 500바트(현금)입니다.\n서류가 완비되고 건강에 이상이 없으면 격리 없이 바로 인도됩니다. 서류 미비나 건강 이상이 있으면 최대 30일 격리될 수 있습니다.',
      doneSummary: '태국 수입 동물검역을 받았습니다.',
      done: 'has-import-quarantine',
      inputs: [{ key: 'import_quarantine_date', label: '검역일', type: 'date' }],
      allowAttachments: true,
      attachmentHint: '검역증(수입승인서·수입허가증) 사본을 사진, PDF로 저장하세요.',
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
