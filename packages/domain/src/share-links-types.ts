// 공개 매직 링크 관련 타입·상수·sync 헬퍼.
// (lib/actions/share-links.ts 는 'use server' 라 async 함수만 export 가능 → 분리.)

export interface ShareLinkRow {
  id: string
  case_id: string
  org_id: string
  token: string
  template: string | null
  field_keys: string[]
  field_ids: string[] | null
  /** 요청된 파일 첨부 슬롯 key (SHARE_FILE_REQUESTS.key). 라벨·필수여부는 정의로 되살림. */
  file_request_keys: string[] | null
  destination_scope: string | null
  title: string | null
  created_by: string | null
  created_at: string
  expires_at: string
  submitted_at: string | null
  submitter_name: string | null
  submitter_note: string | null
  revoked_at: string | null
}

export type ShareLinkStatus = 'active' | 'submitted' | 'expired' | 'revoked'

export function shareLinkStatus(row: ShareLinkRow): ShareLinkStatus {
  if (row.revoked_at) return 'revoked'
  if (row.submitted_at) return 'submitted'
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired'
  return 'active'
}

export interface ShareFieldSpec {
  id: string
  key: string
  label: string
  storage: 'column' | 'data' | 'synthetic'
  type: 'text' | 'longtext' | 'date' | 'number' | 'select' | 'multiselect' | 'date_array'
  options?: Array<{ value: string; label_ko: string; label_en?: string }>
  current_value: unknown
  /** date_array 인 경우: 한도 (e.g. comprehensive 는 2까지). undefined = 제한 없음. */
  max_entries?: number
  /**
   * date_array + has_other_hospital 그룹 전용: 자체(우리 병원) 기록 건수 — 회차 라벨을
   * "우리 병원 + 타병원 합산"으로 보이게 하는 오프셋. 예: 자체 2건 있으면 수신자가 채우는
   * 첫 항목은 "03회차"로 표시. current_value 는 타병원 항목만 담고 있어 그 배열의
   * index+1 만으로는 실제 차수를 못 구하므로 별도로 내려준다.
   */
  dose_offset?: number
  /** date_array 인 경우: 면역유효기간 입력 숨김 (구충·심장사상충). */
  hide_valid_until?: boolean
  /** 공유 폼 그룹핑 — '고객정보' | '동물정보' | '절차정보' | '추가정보'. 미지정 시 카테고리 헤더 없이 표시. */
  category?: string
  /** 공유 폼 서브그룹 — '출국 항공편' | '귀국 항공편' 등 (EXTRA_FIELD_DEFS.group). */
  subgroup?: string
  /** 수신자(고객) 폼 전용 설명 — 라벨 아래 한 줄. admin 다이얼로그엔 없음. */
  description?: string
}

/**
 * Share dialog 가 case detail 의 다중접종 UI 와 동일한 패턴(추가하여 입력)을 쓰기 위한
 * "합성 필드" 정의 — 개별 *_1/*_2 필드를 숨기고 그룹 단위로 노출 후 제출 시 실제 저장형식으로 변환.
 *
 * - rabies → rabies_dates (배열) + other_hospital:true
 * - comprehensive → 1·2차 단일 필드 두 개 (comprehensive, comprehensive_2)
 * - civ → civ_dates (배열) + other_hospital:true
 */
export interface ShareVaccineGroup {
  /** 합성 키 (실제 DB 키 아님, '__' 접두어로 구분) */
  key: string
  label: string
  /** field_definitions.display_order 와 같은 좌표계 — 다른 절차 필드와 섞어 정렬 위함 */
  display_order: number
  /** 한 번에 입력 가능한 최대 차수 (undefined = 무제한) */
  max_entries?: number
  /** 케이스 상세에서 같은 정보를 표시하는 데 쓰는 실제 키들 (read 시 합치기 위함) */
  source_keys: string[]
  /** 저장 방식 — 배열 vs 분할 단일 */
  storage_mode: 'array' | 'split_singles'
  /** storage_mode = 'array' 일 때 저장 키 (e.g. 'rabies_dates') */
  array_key?: string
  /** storage_mode = 'split_singles' 일 때 차수별 저장 키 (e.g. ['comprehensive', 'comprehensive_2']) */
  split_keys?: string[]
  /**
   * 면역유효기간 (valid_until) 입력 숨김 — 구충·심장사상충 처럼 면역기간 개념이 없는 항목.
   * case detail 의 RepeatableDateField hideValidUntil prop 과 동일.
   */
  hide_valid_until?: boolean
  /**
   * 케이스 상세에 "타병원 접종" 체크박스가 있는 그룹인지 — repeatable-date-field 의
   * OTHER_HOSPITAL_LABELS 와 동일 집합. share 폼은 이 플래그가 true 일 때만:
   *   - prefill 시 기존 other_hospital=true 항목만 노출
   *   - 제출 시 본인 기록 보존하고 수신자 입력에 other_hospital=true 강제
   * 구충(외부/내부)처럼 체크박스가 없는 그룹은 수신자 입력을 단순 append 한다.
   */
  has_other_hospital?: boolean
}

// 합성 그룹의 display_order 는 field_definitions seed 좌표계 (vaccine 40~45, 검사 50, 구충 60+) 와 맞춤.
// 절차 카테고리 안에서 자연 정렬되도록.
export const SHARE_VACCINE_GROUPS: ShareVaccineGroup[] = [
  {
    key: '__rabies',
    label: '광견병',
    display_order: 40,
    source_keys: ['rabies_dates', 'rabies_1', 'rabies_2', 'rabies_3'],
    storage_mode: 'array',
    array_key: 'rabies_dates',
    has_other_hospital: true,
  },
  {
    key: '__comprehensive',
    label: '종합백신',
    display_order: 43,
    // 케이스 상세와 같은 array 패턴 (general_vaccine_dates). legacy 단일·중복 키 모두 흡수해 dialog 에서 숨김.
    source_keys: [
      'general_vaccine_dates', 'general_vaccine',
      'comprehensive', 'comprehensive_2',
    ],
    storage_mode: 'array',
    array_key: 'general_vaccine_dates',
    has_other_hospital: true,
  },
  {
    key: '__civ',
    label: '독감',
    display_order: 46,
    source_keys: ['civ_dates', 'civ', 'civ_2'],
    storage_mode: 'array',
    array_key: 'civ_dates',
    has_other_hospital: true,
  },
  {
    key: '__kennel_cough',
    label: '켄넬코프',
    display_order: 47,
    source_keys: ['kennel_cough_dates'],
    storage_mode: 'array',
    array_key: 'kennel_cough_dates',
    has_other_hospital: true,
  },
  {
    key: '__external_parasite',
    label: '외부구충',
    display_order: 60,
    source_keys: [
      'external_parasite_dates',
      'external_parasite_1', 'external_parasite_2', 'external_parasite_3',
    ],
    storage_mode: 'array',
    array_key: 'external_parasite_dates',
    hide_valid_until: true,
  },
  {
    key: '__internal_parasite',
    label: '내부구충',
    display_order: 63,
    source_keys: [
      'internal_parasite_dates',
      'internal_parasite_1', 'internal_parasite_2',
    ],
    storage_mode: 'array',
    array_key: 'internal_parasite_dates',
    hide_valid_until: true,
  },
]

/**
 * 합성 그룹의 한 회 입력 단위 — 케이스 상세의 VacRecord 와 1:1 매핑.
 *  - date: 접종일
 *  - valid_until: 면역유효기간 (구충·심장사상충 같은 기간 개념 없는 항목은 hide_valid_until 로 숨김)
 *  - product: 약품명
 *  - manufacturer: 제조사
 *  - lot: 로트번호
 *  - expiry: 약품 유효기간 (약병 표기)
 */
export interface ShareVaccineEntry {
  date: string
  valid_until?: string | null
  product?: string | null
  manufacturer?: string | null
  lot?: string | null
  expiry?: string | null
  other_hospital?: boolean | null
}

/** 합성 그룹이 흡수하는 키들 — 다이얼로그·폼에서 개별 노출 차단. */
export const SHARE_HIDDEN_BY_VACCINE_GROUPS: Set<string> = new Set(
  SHARE_VACCINE_GROUPS.flatMap((g) => g.source_keys),
)

export interface ShareLinkPublicView {
  token: string
  case_label: string
  org_name: string
  org_name_en: string
  title: string | null
  fields: ShareFieldSpec[]
  /** 고객이 올려야 할 파일 슬롯 — 라벨·필수여부 포함(도메인 정의로 되살림). */
  file_requests: ShareFileRequestView[]
  status: ShareLinkStatus
  expires_at: string
  submitted_at: string | null
}

export interface ShareFileRequestView {
  key: string
  label: string
  required: boolean
}

/** cases 테이블 컬럼 중 외부에서 채울 수 있는 것 — 식별·내부 컬럼 제외. */
export const SHARE_COLUMN_FIELDS = new Set([
  'customer_name',
  'customer_name_en',
  'pet_name',
  'pet_name_en',
  'microchip',
  'destination',
  'departure_date',
])

/**
 * 영문 성함 — 공유 폼의 합본 문자열 ↔ 분리 저장(data.customer_last_name_en /
 * customer_first_name_en) 변환.
 *
 * 진짜 출처(source of truth)는 분리 저장 쪽이다. 케이스 상세·PDF(readSource)가 분리 필드를
 * 먼저 읽고 컬럼 customer_name_en 은 폴백으로만 쓴다. 공유 폼은 UI 가 성/이름 두 칸이라
 * 합본 컬럼 키(customer_name_en)로 오가므로, 여기서 양방향 변환을 한 곳에 모은다.
 * (분리 없이 컬럼만 갱신하던 시절엔 보호자가 링크로 고친 영문 이름이 화면·PDF 어디에도
 * 반영되지 않았다 — 2026-08-14 김미예/호두.)
 *
 * 합본 순서는 폼 입력 순서와 같은 "성 이름"(Last First). "KIM, MI YE" 처럼 쉼표로 구분된
 * 여권 표기도 받아들인다.
 */
export function splitCustomerNameEn(
  combined: string | null | undefined,
): { last: string; first: string } {
  const s = (combined ?? '').trim()
  if (!s) return { last: '', first: '' }
  const comma = s.indexOf(',')
  if (comma >= 0) {
    return { last: s.slice(0, comma).trim(), first: s.slice(comma + 1).trim() }
  }
  const parts = s.split(/\s+/).filter(Boolean)
  return { last: parts[0] ?? '', first: parts.slice(1).join(' ') }
}

/** 분리 저장 → 공유 폼 합본 문자열 ("성 이름"). */
export function composeCustomerNameEn(
  last: string | null | undefined,
  first: string | null | undefined,
): string {
  return [(last ?? '').trim(), (first ?? '').trim()].filter(Boolean).join(' ')
}

export interface ShareColumnFieldMeta {
  key: string
  label: string
  type: 'text' | 'date'
}

export const SHARE_COLUMN_META: Record<string, ShareColumnFieldMeta> = {
  customer_name:    { key: 'customer_name',    label: '보호자 이름 (한글)', type: 'text' },
  customer_name_en: { key: 'customer_name_en', label: '보호자 이름 (영문)', type: 'text' },
  pet_name:         { key: 'pet_name',         label: '반려동물 이름 (한글)', type: 'text' },
  pet_name_en:      { key: 'pet_name_en',      label: '반려동물 이름 (영문)', type: 'text' },
  microchip:        { key: 'microchip',        label: '마이크로칩 번호', type: 'text' },
  destination:      { key: 'destination',      label: '도착 국가', type: 'text' },
  departure_date:   { key: 'departure_date',   label: '출국일', type: 'date' },
}

/**
 * 외부 수신자에게 보여줄 라벨 — 등록신청서(/apply)와 일치시켜 같은 보호자가 일관되게 보도록.
 * 다이얼로그(필드 픽), 프리셋 편집기, 수신자 폼 3곳에서 동일하게 사용 (단일 진실 공급원).
 *
 * 내부 라벨이 이미 등록신청서와 동일한 항목(phone/email/address_kr/address_en/birth_date/
 * species/breed/sex/color/microchip) 은 override 불필요 — meta.label / field_definitions.label
 * 그대로 표시됨.
 */
export const SHARE_RECIPIENT_LABEL_OVERRIDE: Record<string, string> = {
  // 고객정보 — '보호자 이름' 을 '성함' 으로, 영문판은 외국인 수신자 위해 (English) 보강.
  customer_name:    '성함',
  customer_name_en: '영문성함 (English)',
  // 동물정보 — '반려동물 이름' 을 '이름' 으로 (등록신청서 동일). 몸무게는 share 폼에 힌트 영역이 없어 단위 inline.
  pet_name:         '이름',
  pet_name_en:      '영문이름 (English)',
  weight:           '몸무게 (kg)',
  // 추가정보 — admin 도메인 약어(EQC No.) 를 보호자 친화 풀 라벨로 풀어쓰기.
  certificate_no:   '일본 수출 동물검역증 번호',
}

/**
 * 수신자(고객) 폼 전용 필드 설명 — 라벨 아래 한 줄로 노출(왜/언제 입력하는지).
 * admin 다이얼로그 칩에는 나오지 않는다(라벨만 사용). key = 필드 key.
 */
export const SHARE_RECIPIENT_FIELD_DESCRIPTION: Record<string, string> = {
  certificate_no: '일본 방문 이력이 있는 경우 입력하세요.',
}

/**
 * 외부 수신자 폼에서 서브그룹 헤더에 노출할 라벨·설명 override.
 * EXTRA_FIELD_DEFS.group 값을 그대로 키로 쓴다 (내부 그룹명 → 보호자 친화 라벨).
 * - label: 헤더 텍스트 (미지정 시 원본 group 값 사용)
 * - description: 헤더 아래 1~2줄 설명 (왜 묻는지·어떤 정보인지)
 * admin 의 추가정보 그룹 헤더에는 영향 없음 — share form 전용.
 */
export interface ShareRecipientSubgroupMeta {
  label?: string
  description?: string
}
export const SHARE_RECIPIENT_SUBGROUP_META: Record<string, ShareRecipientSubgroupMeta> = {
  // 보호자 다수가 '수출검역 예약' 만 보면 뭘 묻는지 모름 → 풀라벨 + 한 줄 설명.
  '수출검역 예약': {
    label: '일본 수출 동물검역 예약',
    description:
      '한국으로 귀국하기 전, 일본 동물검역소에서 수출동물검역을 받아야 해요. 희망 날짜와 시간을 알려주시면 일본 동물검역소에 문의해드려요. 동물검역소 상황에 따라 예약이 거절될 수 있어요.',
  },
}

/**
 * 외부 수신자가 직접 입력하기 부적절한 필드 — share 다이얼로그·프리셋·수신자 폼에서 모두 제외.
 * - age: 생년월일에서 자동 계산 (별도 입력 불필요)
 * - rabies_3: 3차 접종 미사용 정책
 * - destination: 발신 조직이 결정 (외부 수신자 입력 대상 아님)
 * - memo / notes: 폼 하단의 별도 메모 필드로 분리
 * - customer_first_name_en / customer_last_name_en: 컬럼 customer_name_en 으로 합쳐 노출
 * - breed_en / color_en / sex_en: 한글 칩만 노출 (영문은 자동 보정/표시)
 * - payment_*, payments: 외부 입력 대상 아님
 * - microchip_secondary / microchip_tertiary, japan_extra: 내부/legacy 컨테이너
 * - address_overseas: 추가정보 전용 (4번 블록에서 처리)
 * - vet_visit_date: 발신 조직 내부의 발급일 — 외부 수신자가 채울 항목 아님.
 */
export const SHARE_EXCLUDED_KEYS = new Set([
  'age', 'rabies_3', 'destination', 'memo', 'notes',
  'customer_first_name_en', 'customer_last_name_en',
  'breed_en', 'color_en', 'sex_en',
  'payment_amount', 'payment_method', 'payments',
  'microchip_secondary', 'microchip_tertiary', 'japan_extra',
  'address_overseas',
  'vet_visit_date',
])
