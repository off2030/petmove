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
  /**
   * destinations 가 'all'/배열이어도 여기에 있는 목적지는 제외(미적용).
   * 예: 광견병 2차는 'all' 이지만 1회면 충분한 나라(태국 등)는 제외.
   */
  excludeDestinations?: string[]
  /**
   * destinations(엔트리 요건)와 별개로, 이 목적지는 **왕복에만** 적용한다.
   * 엔트리엔 불필요하지만 귀국(한국 재입국) 요건으로 필요한 단계용.
   * 예: 태국은 입국엔 항체검사 불필요하나 한국 귀국 시 필수 → 왕복에만 노출.
   */
  roundOnlyDestinations?: string[]
  species: StepSpeciesFilter
  /**
   * 목적지별 종 필터 덮어쓰기 — 같은 카드가 나라마다 종 요건이 다를 때.
   * 예: 호주 종합백신·전염병 검사는 **강아지 요건**이고 고양이 가이드엔 아예 없다
   * (렙토 Canicola·리슈만편모충·브루셀라·CIV 전부 개 전용, 고양이 백신은 '권장').
   *
   * ⚠️ 카드 전체의 `species` 를 바꾸면 같은 카드를 쓰는 다른 나라(뉴질랜드·남아공)까지
   *   끌려간다. 그래서 나라 단위로만 좁힌다. destination override(문구 교체)로는 안 된다 —
   *   노출 필터는 override 병합보다 **먼저** 돌기 때문이다(getStepsForCase 순서).
   */
  speciesByDestination?: Record<string, StepSpeciesFilter>
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
  | 'has-rabies-valid'             // 1회 접종국 단일카드 — 최근 접종 유효기간이 입국일 커버 (만료 시 미완료)
  | 'has-rabies-booster'           // 2차 이상
  | 'has-extra-rabies'             // 3차 이상 (추가 접종)
  | 'has-titer-entry'
  | 'has-extra-titer'              // 2회 이상 (항체 검사 추가)
  | 'has-general-vaccine'
  | 'has-kennel-cough'            // 켄넬코프(Bordetella) — 종합백신과 같은 모델, 필드만 다름
  | 'has-civ-vaccine'
  | 'has-infectious-disease-test'
  // 구충 — 규정이 횟수를 명시한 곳(호주·뉴질랜드)은 그 회차를 다 채워야 완료(PARASITE_REQUIRED_DOSES).
  | 'has-internal-parasite'
  | 'has-external-parasite'
  | 'has-heartworm'                // 심장사상충 — 구충과 같은 date_array 모델(카드 분리 2026-07-27)
  | 'has-lungworm'                 // 폐충 — 심장사상충과 같은 모델(카드 분리 2026-07-29, 뉴질랜드 2.4)
  | 'has-deworming-time'           // EU 6국 촌충약 (출국 24-120h 전)
  | 'has-vet-visit'                // 출국 전 임상검사 — 검진일 입력(≤오늘) + 도래 확인 (다른 백신·검사와 동일 dated-confirm)
  | 'all-required-docs'            // 서류 체크리스트 — 큐레이션 필수 서류가 모두 ✓ (서류 페이지에서 완료)
  | 'has-flight-date'              // 항공권 구매 — entry_date(항공편 날짜) 입력 시 완료
  | 'has-advance-notification'     // 사전 신고 — advance_notification_date 입력 시 완료
  | 'has-import-permit'            // 수입 허가 — deriveImportPermitStatus 'done' (허가번호·첨부·완료 액션)
  | 'has-sg-quarantine-reservation' // 싱가포르 계류장(AQC) 예약 — 신청 → 발급 모델 (deriveApplicationStatus)
  | 'has-sg-dog-licence'           // 싱가포르 강아지 라이선스 — 신청 → 발급 모델 (deriveApplicationStatus)
  | 'has-jp-export-quarantine'     // 일본 수출검역 — jp_export_quarantine_date 입력 시 완료
  | 'has-kr-export-quarantine'     // 한국 수출검역 — kr_export_quarantine_date 입력 시 완료
  | 'has-jp-import-quarantine'     // 일본 수입검역 — jp_import_quarantine_date 입력 시 완료
  | 'has-jp-export-quarantine-visit' // 일본 수출검역(검역소 방문) — jp_export_quarantine_visit_date 입력 시 완료
  | 'has-kr-import-quarantine'     // 한국 수입검역 — kr_import_quarantine_date 입력 시 완료
  | 'has-arrived'                  // 도착 완료 마일스톤 — 마지막 검역(편도=일본 수입 / 왕복=한국 수입) 완료 시
  | 'departure-past'
  // 나라별 도착(수입)·출국(수출) 검역(일본 외) — signal 에 그 나라 검역일 필드 key 를 실어 한
  // resolver 가 모든 나라를 처리(예: 'quarantine:th_import_quarantine_date',
  // 'quarantine:th_export_quarantine_date'). confirmed 키는 _date→_confirmed.
  | `quarantine:${string}`
  // booked:<field> — **예약·구매형** 카드. 날짜가 입력되면 그 자리에서 완료로 본다
  //   (미래 날짜여도). 예약을 '했다'는 사실이 완료이고, 그 날짜가 오는지는 별개다.
  //   ⚠️ `dated:` 와 헷갈리지 말 것 — dated 는 '날짜가 도래해야 완료'(발급일·인증일처럼
  //   이미 일어난 일을 적는 칸). 계류시설 예약에 dated 를 쓰던 시절엔 예약을 해도 계류
  //   시작일까지 카드가 미완료로 남았다(2026-07-28 사용자 지적으로 분리).
  | `booked:${string}`
  // dated:<field> — 발급일·예약일 자체가 완료 증거인 절차(싱가포르 GST 허가·국경검사 예약).
  // 확인 게이트 없이 날짜(≤오늘) 입력만으로 완료. confirm 이 필요한 검역·검사엔 쓰지 말 것.
  | `dated:${string}`
  | `manual-flag:${string}`

/**
 * 데이터 조건부 노출 시그널. 정의되면 그 조건이 true 일 때만 step 이 카탈로그에서
 * 떠오른다(applicability + appliesWhen 둘 다 통과해야 적용).
 *
 * 새 시그널 추가 시: 이 union + applicability.ts 의 appliesWhenMatches 양쪽에 추가.
 */
export type StepAppliesWhenSignal =
  | 'has-extra-rabies'             // 광견병 3차 이상 있을 때만
  | 'has-extra-titer'              // 항체 검사 2회 이상 있을 때만
  | 'rabies-extra-applicable'      // 3차+ 입력됨 OR 최근 접종 유효기간이 입국일 전 만료 (= 추가 접종 필요)
  | 'titer-extra-applicable'       // 2회+ 입력됨 OR 최근 항체 검사가 입국일 기준 2년 만료 (= 추가 검사 필요)

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
  /**
   * **1차 마감을 놓쳤을 때 넘어갈 2차 마감**(anchor 기준 며칠 전). 1차가 지나면 배지가
   * 사라지는 대신 이 값으로 다시 계산된다.
   *
   * 대만 수입허가: 도착 120일 전 = **격리 면제** 조건, 도착 20일 전 = **진짜 마지막 기한**
   * (신청은 되지만 도착 후 7일 격리). 120일만 두면 119일째부터 '마감 지남'으로 보여서,
   * 아직 신청할 수 있는 사람에게 이미 늦었다고 잘못 알린다(2026-07-19 사용자 지적).
   *
   * 알림도 같은 2단계로 동작한다(reminders.ts tw-permit-27·20).
   */
  fallbackDaysBefore?: number
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
  /**
   * **달력 개월** 기준 최소 경과(예: 3 = 생후 3개월). 지정하면 일수(daysAfter)가 아니라
   * 이 값이 판정 기준이 된다 — daysAfter 는 표시·정렬용 근사치로만 남는다.
   *
   * 왜 필요한가: 규정이 "at least 3 months of age"처럼 **달력 개월**로 쓰인 목적지(베트남)에서
   * 일수로 환산하면 오차단이 난다. 달력 3개월은 생월에 따라 89~92일이라, 91일 고정 기준이면
   * 11·12·1·2월생이 규정대로 3개월에 접종해도 저장이 거부됐다(2026-07-19 발견·수정).
   * 규정이 일수로 명시된 목적지(대만 90일·일본 91일)는 daysAfter 를 그대로 쓴다.
   */
  monthsAfter?: number
}

export interface StepDefinition {
  /** 전역 유일 식별자. kebab-case. 예: 'rabies-titer'. */
  id: string
  category: StepCategory
  /** 짧은 카드 라벨. 예: '광견병 항체 검사'. */
  title: string
  /** 더 짧은 1~3자. 예: '항체'. */
  shortLabel: string
  /** 상세 페이지 본문 — 마크다운 가능. 절차 규칙을 안내. */
  description: string
  /**
   * 종(개/고양이)별 본문 — 종에 따라 절차가 다른 카드(예: 종합백신 — 개 DHPPL / 고양이
   * FVRCP)용. 케이스의 종이 확정돼 있고 해당 종 텍스트가 있으면 getStepsForCase 가
   * description 을 이 값으로 교체한다. 종 미상(species null)이면 description(통합문) 폴백 —
   * 그래서 descriptionBySpecies 를 쓰는 카드도 description 은 항상 채운다.
   */
  descriptionBySpecies?: Partial<Record<'dog' | 'cat', string>>
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
   * '마이크로칩 삽입 날짜를 입력하세요.' 로 안내.
   *
   * desc 우선순위: 완료 시 doneSummary > situational.desc > description 첫 문장,
   * 미완료 시 situational.desc > description 첫 문장. (완료된 step 은 과거형 narration
   * 이 미래형 situational 리마인더보다 우선 — 완료 표시와 모순 방지.)
   * 두 필드 모두 선택 — undefined 면 해당 자리만 기본 로직으로 폴백.
   */
  situational?: (
    caseRow: CaseRow,
  ) => { desc?: string; cardDesc?: string; advisory?: boolean } | undefined
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
   * 버튼 완료 카드 — 날짜에 규정·검증상 의미가 없는 절차(신고·귀국 서류 준비·수출 검역 완료
   * 자기 보고 등). 앱은 날짜 입력칸 대신 '완료' 버튼을 보여주고, 누르면 오늘 날짜를 done 의
   * dated:<field> 필드에 자동 기록한다('완료 취소'=비움). 2026-07-26 CDC 신고가 원형,
   * 같은 날 귀국 절차 카드 전체로 확장(사용자 결정). done 은 'dated:<field>' 여야 한다.
   */
  buttonComplete?: boolean
  /**
   * done 과 별개로, 보호자가 입력한 데이터가 있는지. '이후 일정이 입력돼 있어요' 확인창의
   * 단일 출처. done 이 in_progress 상태를 표현 못하는 step (derive*Status 패턴 — 신청일만
   * 입력하고 명시적 '완료' 미클릭) 에서 정의한다. 미정의 시 done 으로 폴백.
   */
  hasInputData?: (caseRow: CaseRow) => boolean
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
  /**
   * 업로드된 파일의 표시 이름 라벨. 주어지면 원본 파일명을 무시하고 이 이름으로 저장
   * (예: '광견병 항체 검사 결과지'). 같은 step 에 여러 개면 '_2', '_3' 접미사.
   * 미설정이면 원본 파일명 그대로.
   */
  attachmentLabel?: string
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
  /**
   * true 면 직전 main step 과 순서 의존이 없어 '다음 할 일'에 함께 노출된다(병렬 접종).
   * 예: 광견병 백신과 종합백신은 마이크로칩 이후 순서가 없어 둘 다 동시에 다음 할 일.
   * 'current' 승격이 mainIdx 직후의 concurrent step 들을 같이 올린다(사이에 비-concurrent
   * 미완료 step 이 있으면 멈춤 — 그 step 이 선행이라는 뜻).
   */
  concurrent?: boolean
  /**
   * true 면 이 카드가 **'진행 중'일 때 다음 카드의 승격을 막지 않는다**(2026-07-30 사용자 지정).
   *
   * 왜 필요한가: 결과·회차를 기다리는 구간에 실제로 병행해서 할 일이 있는데, 승격 로직이
   * '첫 미완료'에 멈춰 그 일들이 화면에서 사라졌다. 뉴질랜드가 그렇다 —
   *   외부구충 1차 → (14일) → 전염병 검사 → 내부구충 → 폐충·심장사상충
   * 각 단계가 앞 단계의 **진행 중** 상태에서 시작할 수 있어 순차로 하나씩 띄우면
   * 준비가 그만큼 늦어진다.
   *
   * ⚠️ `concurrent` 와 다르다 — concurrent 는 '순서 의존이 아예 없어 **동시에** 시작'이고,
   *   이건 '앞 단계를 **시작한 뒤** 다음도 시작'이다. 그래서 미입력 상태에서는 다음이 안 뜬다.
   * ⚠️ 목적지 override 로만 켠다. 항체 검사처럼 결과를 받아야 다음이 성립하는 절차는
   *   기다리는 게 맞다(2026-07-30 사용자 확인 "그 순서로 진행되니 문제 없어").
   */
  yieldsWhenInProgress?: boolean
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
