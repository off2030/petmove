/**
 * 펫무브 portal 여정(/journey) 의 step 카탈로그 타입.
 *
 * 설계 단일 출처: docs/portal-journey-design.md
 *
 * 한 step 은 "보호자가 케이스를 진행하는 동안 거치는 한 단위 절차".
 * 적용 조건(목적지·종·왕복/편도) + 입력 스키마 + 완료 시그널 + 검증 룰 ID 를 묶는다.
 */

import type { CaseRow } from '../types'
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
  | 'has-extra-rabies'             // 3차 이상 (추가 접종)
  | 'has-titer-entry'
  | 'has-extra-titer'              // 2회 이상 (항체검사 추가)
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
  | 'has-jp-import-quarantine'     // 일본 수입검역 — jp_import_quarantine_date 입력 시 완료
  | 'has-jp-export-quarantine-visit' // 일본 수출검역(검역소 방문) — jp_export_quarantine_visit_date 입력 시 완료
  | 'has-kr-import-quarantine'     // 한국 수입검역 — kr_import_quarantine_date 입력 시 완료
  | 'has-arrived'                  // 도착 완료 마일스톤 — 마지막 검역(편도=일본 수입 / 왕복=한국 수입) 완료 시
  | 'departure-past'
  | `manual-flag:${string}`

/**
 * 데이터 조건부 노출 시그널. 정의되면 그 조건이 true 일 때만 step 이 카탈로그에서
 * 떠오른다(applicability + appliesWhen 둘 다 통과해야 적용).
 *
 * 새 시그널 추가 시: 이 union + applicability.ts 의 appliesWhenMatches 양쪽에 추가.
 */
export type StepAppliesWhenSignal =
  | 'has-extra-rabies'             // 광견병 3차 이상 있을 때만
  | 'has-extra-titer'              // 항체검사 2회 이상 있을 때만
  | 'rabies-extra-applicable'      // 3차+ 입력됨 OR 최근 접종 유효기간이 입국일 전 만료 (= 추가 접종 필요)
  | 'titer-extra-applicable'       // 2회+ 입력됨 OR 최근 항체검사가 입국일 기준 2년 만료 (= 추가 검사 필요)

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
   * 전체 일정 리스트에서 step 이 완료됐을 때 제목 아래 보조 줄로 노출되는 문구.
   * 과거형 narration ('1차 광견병 백신을 접종했습니다.') 권장.
   * 생략 시 description 첫 문장을 폴백 — 첫 문장이 현재형 안내문이면 어색할 수 있으니
   * 가능하면 step 별로 명시.
   */
  doneSummary?: string
  /**
   * 데이터 상태에 따라 desc(전체 일정 row 보조줄) / cardDesc(다음 할 일 카드 본문) 를
   * 동적으로 갈아끼우는 훅. 예: 마이크로칩 번호만 입력되고 시술일이 비면
   * '마이크로칩 삽입 날짜를 입력해주세요.' 로 안내.
   *
   * desc 우선순위: 완료 시 doneSummary > situational.desc > description 첫 문장,
   * 미완료 시 situational.desc > description 첫 문장. (완료된 step 은 과거형 narration
   * 이 미래형 situational 리마인더보다 우선 — 완료 표시와 모순 방지.)
   * 두 필드 모두 선택 — undefined 면 해당 자리만 기본 로직으로 폴백.
   */
  situational?: (caseRow: CaseRow) => { desc?: string; cardDesc?: string } | undefined
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
  /**
   * 데이터 조건부 노출. 정의되면 applicability + 이 조건이 둘 다 참일 때만 카탈로그에서
   * 떠오른다. 빈 값이면 항상 적용.
   */
  appliesWhen?: StepAppliesWhenSignal
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
  /**
   * true 면 이 step 은 '다음 할 일' 자리를 차지하지 않는다 — 추가 백신·추가 검사 처럼
   * 미래 유효기간 만료 대비용 조건부 reminder 가 본 흐름의 다음 단계(예: 사전 신고)를
   * 가려버리는 사고를 막는다.
   *
   * 효과: 'current' 승격 루프가 이 step 을 건너뛰고 다음 candidate 를 찾는다. 다만
   * 다른 미완료 step 이 하나도 없으면 폴백으로 advisoryOnly step 도 승격된다 — 보호자
   * 가 행동할 게 정말 그것뿐일 때까지 가려두지는 않는다. 일정 row 에는 정상적으로
   * 'upcoming' 으로 표시.
   */
  advisoryOnly?: boolean
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
