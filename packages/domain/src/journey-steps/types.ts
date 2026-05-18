/**
 * 펫무브 portal 여정(/journey) 의 step 카탈로그 타입.
 *
 * 설계 단일 출처: docs/portal-journey-design.md
 *
 * 한 step 은 "보호자가 케이스를 진행하는 동안 거치는 한 단위 절차".
 * 적용 조건(목적지·종·왕복/편도) + 입력 스키마 + 완료 시그널 + 검증 룰 ID 를 묶는다.
 */

import type { CheckSeverity } from '../procedure-checks/types'

// ── 적용 조건 ────────────────────────────────────────────────────────────

export type StepSpeciesFilter = 'all' | 'dog' | 'cat'
export type StepTripTypeFilter = 'all' | 'round' | 'one_way'

/**
 * 적용 대상 목적지.
 * - 'all': 모든 목적지
 * - string[]: destination-config DESTINATION_OVERRIDES 의 키 (예: ['japan','eu','uk','australia'])
 */
export type DestinationFilter = 'all' | string[]

export interface StepApplicability {
  destinations: DestinationFilter
  species: StepSpeciesFilter
  tripType: StepTripTypeFilter
}

// ── 입력 스키마 ──────────────────────────────────────────────────────────

/**
 * step 상세 페이지에서 보여줄 입력 필드 1개.
 *
 * key 는 case.data jsonb 안의 경로. 단일 값(date/text/number/select)이면 그대로 키.
 * date_array 같은 반복 필드는 배열 자체를 가리키는 키 (예: 'rabies_dates') — 렌더러가
 * `[{date, valid_until}]` 모양으로 다룬다.
 */
export interface StepInputField {
  key: string
  label: string
  type: 'date' | 'text' | 'number' | 'select' | 'textarea' | 'date_array'
  required?: boolean
  helpText?: string
  /** type='select' 일 때만. */
  options?: Array<{ value: string; label: string }>
  /** type='date_array' 일 때 반복 항목이 valid_until 까지 가질지 여부. 기본 false. */
  hasValidUntil?: boolean
}

// ── 완료 판정 시그널 ─────────────────────────────────────────────────────

/**
 * step 완료 여부를 결정하는 시그널 식별자.
 *
 * 실제 caseRow → boolean 변환은 done-resolver.ts 에서. step 정의는 시그널 이름만 들고
 * 도메인 로직과 결합도를 낮춘다.
 *
 * `manual-flag:<key>` 형식은 보호자가 "완료했어요" 토글로 직접 기록한 값
 * (case.data.journey_flags.<key>) 을 본다.
 */
export type StepDoneSignal =
  | 'always-done'                  // intake 처럼 자동 완료
  | 'microchip-set'
  | 'has-rabies-entry'
  | 'has-rabies-booster'           // 2차 이상
  | 'has-titer-entry'
  | 'has-general-vaccine'
  | 'has-civ-vaccine'
  | 'has-infectious-disease-test'
  | 'has-internal-parasite'
  | 'has-external-parasite'
  | 'has-deworming-time'           // EU 6국 촌충약 (출국 24-120h 전)
  | 'has-vet-visit'
  | 'has-flight-date'              // 항공권 구매 — entry_date(항공편 날짜) 입력 시 완료
  | 'has-advance-notification'     // 사전 신고 — advance_notification_date 입력 시 완료
  | 'has-jp-export-quarantine'     // 일본 수출검역 — jp_export_quarantine_date 입력 시 완료
  | 'has-kr-export-quarantine'     // 한국 수출검역 — kr_export_quarantine_date 입력 시 완료
  | 'departure-past'
  | `manual-flag:${string}`

// ── 메인 타입 ────────────────────────────────────────────────────────────

/** UI 분류·아이콘 결정용. */
export type StepCategory =
  | 'preparation'
  | 'vaccination'
  | 'lab'
  | 'permit'
  | 'document'
  | 'logistics'
  | 'travel'

export interface StepDeadline {
  /** D-day 계산 기준점. 'departure' = 출국일, 'entry' = 일본 입국일(data.entry_date), 'created' = 케이스 생성일. */
  anchor: 'departure' | 'entry' | 'created'
  /** anchor 기준 며칠 전. 양수 = anchor 보다 N일 일찍, 음수 = 이후. */
  daysBefore: number
  /** true 면 마감이 [anchor−daysBefore, anchor] 구간 — 카드에 'A ~ B' 로 표시. 기본은 '~까지' 단일 마감. */
  window?: boolean
}

/**
 * 가능 시작일 — "이 날짜 이후에 할 수 있다". deadline 과 반대 방향.
 * - anchor 'birth': 동물 생년월일(case.data.birth_date) 기준.
 * - anchor 'step:<id>': 해당 step 의 완료일 기준. 그 step 이 미완료면 계산 불가(null).
 */
export interface StepEarliest {
  anchor: 'birth' | `step:${string}`
  /** anchor 기준 며칠 이후. */
  daysAfter: number
}

export interface StepDefinition {
  /** 전역 유일 식별자. kebab-case. 예: 'rabies-titer'. */
  id: string
  category: StepCategory
  /** 짧은 카드 라벨. 예: '광견병 항체검사'. */
  title: string
  /** 더 짧은 1~3자. 예: '항체'. */
  shortLabel: string
  /** 상세 페이지 본문 — 마크다운 가능. 절차 규칙을 안내. */
  description: string
  /**
   * 다음 할 일 카드 본문 — 날짜(earliest/deadline)가 있을 때 "{날짜} 이후/까지 …"
   * 의 … 자리에 쓰임. 생략 시 description 첫 문장으로 폴백.
   */
  cardLine?: string
  applicability: StepApplicability
  /** 정렬용. 작을수록 일찍 등장. 같은 값은 카탈로그 등록 순. */
  order: number
  /** 권장 시점. UI 의 deadline 배지. 생략 시 표시 안 함. */
  deadline?: StepDeadline
  /** 가능 시작일. 다음 할 일 카드에서 "{날짜} 이후 …" 문구로 노출. */
  earliest?: StepEarliest
  /** 완료 시그널. */
  done: StepDoneSignal
  /** 입력 폼. 없으면 안내+첨부+완료 토글만 표시. */
  inputs?: StepInputField[]
  /** Phase 2 — 첨부 허용 여부. MVP 에서는 false 기본. */
  allowAttachments?: boolean
  attachmentHint?: string
  /** 상세 페이지 설명 아래 표시할 외부 링크 목록 (예: 신청·예약 사이트). */
  links?: Array<{ url: string; label: string }>
  /** 이 step 에 매핑되는 procedure-checks 의 id 목록. check-mapping.ts 의 데이터 1차 출처. */
  validationIds?: string[]
  /** 표시 전용. 카탈로그 카드의 부가 톤. */
  severityHint?: CheckSeverity
  /**
   * true 면 이 step 이 후속 step 을 막지 않는다 — journey 타임라인에서 이 step 이
   * 'current' 가 되면 바로 다음 step 도 함께 'current' 로 노출된다 (병렬 진행 가능 단계).
   */
  nonBlocking?: boolean
}

// ── 런타임 컨텍스트 ──────────────────────────────────────────────────────

/** applicability 필터링에 필요한 케이스 컨텍스트. */
export interface CaseJourneyContext {
  /** destination-config 의 키 (예: 'japan', 'eu', 'australia'). 매칭 실패 시 null. */
  destinationKey: string | null
  /** UI 표시용 raw destination 토큰 (예: '일본', '프랑스'). */
  destinationToken: string | null
  species: 'dog' | 'cat' | null
  tripType: 'round' | 'one_way'
}
