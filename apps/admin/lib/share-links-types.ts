// 공개 매직 링크 관련 타입·상수·sync 헬퍼.
// (lib/actions/share-links.ts 는 'use server' 라 async 함수만 export 가능 → 분리.)

export interface ShareLinkRow {
  id: string
  case_id: string
  org_id: string
  token: string
  template: string | null
  field_keys: string[]
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
  key: string
  label: string
  storage: 'column' | 'data' | 'synthetic'
  type: 'text' | 'longtext' | 'date' | 'number' | 'select' | 'multiselect' | 'date_array'
  options?: Array<{ value: string; label_ko: string; label_en?: string }>
  current_value: unknown
  /** date_array 인 경우: 한도 (e.g. comprehensive 는 2까지). undefined = 제한 없음. */
  max_entries?: number
  /** date_array 인 경우: 면역유효기간 입력 숨김 (구충·심장사상충). */
  hide_valid_until?: boolean
  /** 공유 폼 그룹핑 — '고객정보' | '동물정보' | '절차정보' | '추가정보'. 미지정 시 카테고리 헤더 없이 표시. */
  category?: string
  /** 공유 폼 서브그룹 — '입국 항공편' | '출국 항공편' 등 (EXTRA_FIELD_DEFS.group). */
  subgroup?: string
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
  },
  {
    key: '__civ',
    label: '독감',
    display_order: 46,
    source_keys: ['civ_dates', 'civ', 'civ_2'],
    storage_mode: 'array',
    array_key: 'civ_dates',
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
}

/** 합성 그룹이 흡수하는 키들 — 다이얼로그·폼에서 개별 노출 차단. */
export const SHARE_HIDDEN_BY_VACCINE_GROUPS: Set<string> = new Set(
  SHARE_VACCINE_GROUPS.flatMap((g) => g.source_keys),
)

export interface ShareLinkPublicView {
  token: string
  case_label: string
  org_name: string
  title: string | null
  fields: ShareFieldSpec[]
  status: ShareLinkStatus
  expires_at: string
  submitted_at: string | null
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
