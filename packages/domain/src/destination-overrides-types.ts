/**
 * 사용자 정의(조직별) 목적지 오버라이드.
 * `organization_settings.destination_overrides` JSONB 에 저장.
 *
 * 기본 destination-config.ts (DESTINATION_OVERRIDES) 보다 우선 적용.
 * 키워드 매칭은 substring (대소문자 무시) — 기존 함수와 동일.
 */

export type SpeciesFilter = 'dog' | 'cat'

/** 한 목적지가 갖는 백신/검사 항목 1개 — 종 필터 옵션. */
export interface DestinationVaccineEntry {
  /** 'rabies' | 'rabies_titer' | 'general' | 'civ' | 'kennel' | 'covid' | 'infectious_disease' | 'external_parasite' | 'internal_parasite' | 'heartworm' */
  key: string
  /**
   * 미지정 → 모든 종(개·고양이)에 표시.
   * 'dog' → 개 케이스에서만 표시.
   * 'cat' → 고양이 케이스에서만 표시.
   */
  species?: SpeciesFilter
}

/** 한 목적지가 갖는 추가정보 필드 1개 — 종 필터 옵션. (예: address_overseas) */
export interface DestinationExtraFieldEntry {
  key: string
  species?: SpeciesFilter
}

/**
 * 추가정보 필드 메타.
 * 각 country-specific 컴포넌트(JapanExtraField 등)에 흩어져 있던 필드를 일반화해서 정리.
 * 케이스 데이터는 `data.{key}` (top-level) 에 저장됨 — 하드코딩 country_extra 와 별개 경로.
 */
export type ExtraFieldType = 'text' | 'date' | 'time' | 'email' | 'longtext' | 'select'

export interface ExtraFieldOption {
  value: string
  label: string
}

export interface ExtraFieldDef {
  key: string
  label: string
  type: ExtraFieldType
  placeholder?: string
  options?: ExtraFieldOption[]
  /** 같은 group 값을 가진 필드들은 상세페이지에서 한 박스로 묶여 표시. */
  group?: string
  /** group 내부에서 표시할 짧은 라벨 (예: "입국일" → "날짜"). 없으면 label 사용. */
  shortLabel?: string
}

const TRANSPORT_OPTIONS: ExtraFieldOption[] = [
  { value: 'Checked-baggage', label: 'Hand luggage (Checked-baggage)' },
  { value: 'Carry-on', label: 'Hand luggage (Carry-on)' },
  { value: 'Cargo', label: 'Cargo' },
  { value: 'Cargo(Sea)', label: 'Cargo (Sea)' },
]

/** Switzerland(BLV) 신청서가 허용하는 입국공항 — Zürich/Geneva/Basel. PDF mapping checkbox 값과 동일. */
export const SWISS_ENTRY_AIRPORT_OPTIONS: ExtraFieldOption[] = [
  { value: 'zurich', label: 'Zürich' },
  { value: 'geneva', label: 'Geneva' },
  { value: 'basel', label: 'Basel' },
]

/** 태국 검역소·도착공항 — Bangkok(BKK)/Phuket(HKT)/Chiang Mai(CNX). 값은 Form R.11 quarantine_location 과 동일. */
export const THAILAND_ENTRY_AIRPORT_OPTIONS: ExtraFieldOption[] = [
  { value: 'Bangkok', label: 'Bangkok (BKK)' },
  { value: 'Phuket', label: 'Phuket (HKT)' },
  { value: 'Chiang Mai', label: 'Chiang Mai (CNX)' },
]

export const EXTRA_FIELD_DEFS: Record<string, ExtraFieldDef> = {
  // ── 연락처 / 주소 ──
  address_overseas: { key: 'address_overseas', label: '해외주소', type: 'text' },
  postal_code: { key: 'postal_code', label: '우편번호', type: 'text' },
  email: { key: 'email', label: '이메일', type: 'email' },
  overseas_phone: { key: 'overseas_phone', label: '해외 전화번호', type: 'text', placeholder: '+1-...' },
  // ── ID / 여권 ──
  passport_number: { key: 'passport_number', label: '여권번호', type: 'text', placeholder: 'M12345678' },
  passport_expiry_date: { key: 'passport_expiry_date', label: '여권 만료일', type: 'date' },
  passport_issuer: { key: 'passport_issuer', label: '발급기관', type: 'text', placeholder: 'Ministry of Foreign Affairs' },
  passport_issuing_country: { key: 'passport_issuing_country', label: '발급국가', type: 'text', placeholder: 'Republic of Korea' },
  holder_birth_date: { key: 'holder_birth_date', label: '소지자 생년월일', type: 'date' },
  // ── 증명서 / 허가 ──
  certificate_no: { key: 'certificate_no', label: 'EQC No.', type: 'text' },
  permit_no: { key: 'permit_no', label: '수입허가번호', type: 'text' },
  id_date: { key: 'id_date', label: 'ID 날짜', type: 'date' },
  sample_received_date: { key: 'sample_received_date', label: '검사소 샘플 수령일', type: 'date' },
  // ── 절차 ──
  // EU 촌충국가(영국·아일랜드·몰타·노르웨이·핀란드)의 praziquantel 투여 시각.
  // 구충일은 절차정보의 internal_parasite_dates 에 저장되고, 시각은 별도로 추가정보 영역에 표시.
  deworming_time: { key: 'deworming_time', label: '구충시간', type: 'time', placeholder: '00:00' },
  // ── 출국 항공편 (그룹) — 한국 출발 → 도착국 도착. 보호자 시점으로 라벨 통일.
  //    표시 순서: 날짜 → 항공편명 → 출발/도착공항 → 운송방법 → 시간. ──
  entry_date: { key: 'entry_date', label: '도착일', type: 'date', group: '출국 항공편', shortLabel: '날짜' },
  entry_flight_number: { key: 'entry_flight_number', label: '항공편명', type: 'text', placeholder: 'KE659', group: '출국 항공편', shortLabel: '항공편명' },
  entry_departure_airport: { key: 'entry_departure_airport', label: '출발공항', type: 'text', placeholder: 'ICN', group: '출국 항공편', shortLabel: '출발공항' },
  entry_airport: { key: 'entry_airport', label: '도착공항', type: 'text', placeholder: 'NRT', group: '출국 항공편', shortLabel: '도착공항' },
  entry_transport: { key: 'entry_transport', label: '운송방법', type: 'select', options: TRANSPORT_OPTIONS, group: '출국 항공편', shortLabel: '운송방법' },
  entry_time: { key: 'entry_time', label: '도착시간', type: 'time', placeholder: 'HH:mm', group: '출국 항공편', shortLabel: '시간' },
  entry_purpose: {
    key: 'entry_purpose',
    label: '입국목적',
    type: 'select',
    options: [
      { value: 'temporary', label: '임시 (Temporary)' },
      { value: 'relocation', label: '이주 (Relocation)' },
      { value: 'reentry', label: '재입국 (Reentry)' },
    ],
  },
  quarantine_location: { key: 'quarantine_location', label: '검역소·도착지', type: 'text' },
  cropped: {
    key: 'cropped',
    label: '단미·단이',
    type: 'select',
    options: [
      { value: 'no', label: '없음' },
      { value: 'tail', label: '단미 (꼬리)' },
      { value: 'ears', label: '단이 (귀)' },
      { value: 'both', label: '둘 다' },
    ],
  },
  // ── 귀국 항공편 (그룹, 일본 reentry 등) — 도착국 출발 → 한국 귀국.
  //    표시 순서: 날짜 → 항공편명 → 출발/도착공항 → 운송방법. ──
  return_date: { key: 'return_date', label: '귀국일', type: 'date', group: '귀국 항공편', shortLabel: '날짜' },
  return_flight_number: { key: 'return_flight_number', label: '귀국 항공편', type: 'text', placeholder: 'KE713', group: '귀국 항공편', shortLabel: '항공편명' },
  return_departure_airport: { key: 'return_departure_airport', label: '귀국 출발공항', type: 'text', placeholder: 'NRT', group: '귀국 항공편', shortLabel: '출발공항' },
  return_arrival_airport: { key: 'return_arrival_airport', label: '귀국 도착공항', type: 'text', placeholder: 'ICN', group: '귀국 항공편', shortLabel: '도착공항' },
  return_transport: { key: 'return_transport', label: '귀국 운송방법', type: 'select', options: TRANSPORT_OPTIONS, group: '귀국 항공편', shortLabel: '운송방법' },
  // ── 일본 수출검역 예약 (그룹) — 왕복 시 일본 출국검역 신청·예약. ──
  jp_export_quarantine_date: { key: 'jp_export_quarantine_date', label: '수출검역 예약일', type: 'date', group: '수출검역 예약', shortLabel: '날짜' },
  jp_export_quarantine_time: { key: 'jp_export_quarantine_time', label: '수출검역 예약시간', type: 'time', placeholder: 'HH:mm', group: '수출검역 예약', shortLabel: '시간' },
}

export const ALL_EXTRA_FIELD_KEYS = Object.keys(EXTRA_FIELD_DEFS) as readonly string[]

export const EXTRA_FIELD_KEY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(EXTRA_FIELD_DEFS).map(([k, d]) => [k, d.label]),
)

/**
 * 통합 키 → 기존 country-specific 데이터 경로 매핑.
 * 마이그레이션되지 않은 케이스가 새 통합 시스템에서 데이터를 읽을 수 있도록 read-fallback 용.
 * 새 저장은 모두 top-level (`data.{key}`) 로만 이루어짐.
 */
const LEGACY_EXTRA_PATHS: Record<string, string[][]> = {
  email: [
    ['japan_extra', 'email'],
    ['philippines_extra', 'email'],
    ['switzerland_extra', 'email'],
    ['hawaii_extra', 'email_address'],
  ],
  address_overseas: [
    ['japan_extra', 'address_overseas'],
    ['thailand_extra', 'address_overseas'],
    ['philippines_extra', 'address_overseas'],
    ['hawaii_extra', 'address_overseas'],
    // uk는 처음부터 top-level 저장이라 legacy 경로 없음.
  ],
  postal_code: [
    ['philippines_extra', 'postal_code'],
    ['hawaii_extra', 'postal_code'],
  ],
  // 'us_phone' 은 'overseas_phone' 으로 일반화됨 — 기존 데이터 모두 fallback.
  overseas_phone: [
    ['us_phone'],            // top-level data.us_phone
    ['usa_extra', 'us_phone'], // nested data.usa_extra.us_phone
  ],
  passport_number: [
    ['thailand_extra', 'passport_number'],
    ['philippines_extra', 'passport_number'],
    ['usa_extra', 'passport_number'],
    ['hawaii_extra', 'passport_number'],
  ],
  passport_expiry_date: [
    ['thailand_extra', 'passport_expiry_date'],
    ['philippines_extra', 'passport_expiry_date'],
    ['hawaii_extra', 'passport_expiry_date'],
  ],
  passport_issuer: [
    ['thailand_extra', 'passport_issuer'],
    ['hawaii_extra', 'passport_issuing_country'],
  ],
  holder_birth_date: [
    ['usa_extra', 'birth_date'],
    ['hawaii_extra', 'date_of_birth'],
  ],
  // 입국 (목적지 도착)
  entry_date: [
    ['thailand_extra', 'arrival_date'],
    ['usa_extra', 'arrival_date'],
    ['switzerland_extra', 'entry_date'],
    ['japan_extra', 'inbound', 'date'],
  ],
  entry_time: [['thailand_extra', 'arrival_time']],
  entry_departure_airport: [['japan_extra', 'inbound', 'departure_airport']],
  entry_airport: [
    ['philippines_extra', 'arrival_airport'],
    ['switzerland_extra', 'entry_airport'],
    ['japan_extra', 'inbound', 'arrival_airport'],
  ],
  entry_flight_number: [
    ['thailand_extra', 'arrival_flight_number'],
    ['japan_extra', 'inbound', 'flight_number'],
  ],
  entry_transport: [['japan_extra', 'inbound', 'transport']],
  entry_purpose: [['switzerland_extra', 'entry_purpose']],
  quarantine_location: [['thailand_extra', 'quarantine_location']],
  cropped: [['switzerland_extra', 'cropped']],
  // 귀국
  return_date: [['japan_extra', 'outbound', 'date']],
  return_departure_airport: [['japan_extra', 'outbound', 'departure_airport']],
  return_arrival_airport: [['japan_extra', 'outbound', 'arrival_airport']],
  return_flight_number: [['japan_extra', 'outbound', 'flight_number']],
  return_transport: [['japan_extra', 'outbound', 'transport']],
  // 증명서
  permit_no: [
    ['australia_extra', 'permit_no'],
    ['new_zealand_extra', 'permit_no'],
  ],
  id_date: [['australia_extra', 'id_date']],
  sample_received_date: [['australia_extra', 'sample_received_date']],
  certificate_no: [['japan_extra', 'certificate_no']],
}

/**
 * 통합 키의 효과적 값 — destination 인자가 주어지고 해당 키가 destination-scoped 이면
 * `data.by_dest[destination][key]` 우선 조회. 없으면 top-level → legacy country_extra 순.
 *
 * destination 미지정(단일 목적지 컨텍스트) 시 기존 동작 그대로.
 */
export function readEffectiveExtraValue(
  data: Record<string, unknown> | null | undefined,
  key: string,
  destination?: string | null,
): unknown {
  if (!data) return null
  if (destination) {
    const byDest = data['by_dest'] as Record<string, Record<string, unknown>> | undefined
    const destObj = byDest?.[destination]
    // 키가 명시적으로 존재하면 (null sentinel 포함) 그 값 그대로 반환 — top-level fallback 차단.
    if (destObj && key in destObj) return destObj[key] ?? null
  }
  if (data[key] != null) return data[key]
  const paths = LEGACY_EXTRA_PATHS[key]
  if (!paths) return null
  for (const path of paths) {
    let v: unknown = data
    for (const seg of path) {
      if (v && typeof v === 'object') v = (v as Record<string, unknown>)[seg]
      else { v = undefined; break }
    }
    if (v != null) return v
  }
  return null
}

/** 사용자 정의 목적지 1개. */
export interface CustomDestination {
  /** 안정적인 슬러그(소문자 영문 + 숫자 + '_'). 새 추가 시 클라이언트가 생성. */
  id: string
  /** 표시명 (예: '에티오피아'). */
  name: string
  /** 매칭 키워드 (한글/영문/별칭). 케이스의 destination 컬럼과 substring 매칭. */
  keywords: string[]
  /**
   * 절차정보 — 백신/검사 목록. 각 항목별로 species 필터를 가질 수 있음.
   * 같은 목적지 안에서 백신마다 종별 표시를 다르게 하기 위함 (예: 호주 — civ/켄넬은 개만, 광견병은 모두).
   */
  vaccines: DestinationVaccineEntry[]
  /**
   * 추가정보 — 토글 가능한 추가 필드 (예: 해외주소). 각 항목별로 species 필터 가능.
   * extraSection 컴포넌트 (japan/usa/...) 는 코드 레벨 정의라 여기 포함 안 됨 — 디폴트 이름만 표시용으로 남김.
   */
  extraFields?: DestinationExtraFieldEntry[]
  /** 하드코딩 디폴트의 extraSection 키 (japan/usa 등). 사용자 편집 불가, 표시 전용. */
  extraSection?: string
}

/** 전체 오버라이드 상태 (조직 단위). */
export interface DestinationOverridesConfig {
  custom: CustomDestination[]
}

export const EMPTY_DESTINATION_OVERRIDES: DestinationOverridesConfig = {
  custom: [],
}

/** 하드코딩된 백신별 기본 종 필터 — 별도 명시 없으면 적용. */
export const HARDCODED_VACCINE_SPECIES_DEFAULTS: Record<string, SpeciesFilter | undefined> = {
  civ: 'dog',
  kennel: 'dog',
  infectious_disease: 'dog',
}

/** 슬러그 검증 — 영소문자/숫자/언더스코어, 1자 이상. */
export function isValidDestinationId(id: string): boolean {
  return /^[a-z0-9_]+$/.test(id) && id.length > 0
}

/** 표시명에서 슬러그 자동 생성 (간단한 규칙). 충돌은 호출자가 처리. */
export function suggestDestinationId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return base || `dest_${Date.now()}`
}
