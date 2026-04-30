/**
 * 목적지별 상세페이지 필드 설정.
 *
 * - DEFAULT_CONFIG: 모든 국가 공통
 * - DESTINATION_OVERRIDES: 국가별 차이점만 기술
 *
 * 국가 추가 시 DESTINATION_OVERRIDES에 항목 추가만 하면 됨.
 * 조직별 커스텀 목적지는 destination-overrides-types.ts 의 `CustomDestination` 으로
 * organization_settings.destination_overrides 에 저장. 런타임에 hardcoded 보다 우선 적용.
 *
 * 증명서 버튼은 `lib/cert-config-defaults.ts` / 설정 > 서류에서 관리.
 */
import type {
  CustomDestination,
  DestinationVaccineEntry,
  DestinationExtraFieldEntry,
  DestinationOverridesConfig,
  SpeciesFilter,
} from './destination-overrides-types'
import { HARDCODED_VACCINE_SPECIES_DEFAULTS } from './destination-overrides-types'

// ── 디폴트 (모든 국가 공통) ──

export const DEFAULT_CONFIG = {
  고객정보: ['customer_name', 'phone'],
  // phone 렌더 시 AddressField(한국주소+영문주소) 자동 포함
  동물정보: ['pet_name', 'microchip', 'birth_date', 'species', 'sex', 'weight'],
  // species 렌더 시 BreedField+ColorField 자동 포함
  절차정보: ['destination', 'microchip_implant_date', 'departure_date', 'vet_visit_date'],
  vaccines: ['rabies', 'rabies_titer'] as string[],
  기타정보: ['memo'],
  // payment는 항상 기타정보 하단에 표시
}

// ── 국가별 오버라이드 ──

interface DestinationOverride {
  /** 목적지 매칭 키워드 (대소문자 무시) */
  keywords: string[]
  /** 백신/검사 오버라이드 (생략 시 디폴트) */
  vaccines?: string[]
  /** 추가정보 섹션 컴포넌트 키 (생략 시 추가정보 없음) */
  extraSection?: string
  /**
   * 이 목적지가 활용하는 추가정보 필드 키 목록 (EXTRA_FIELD_DEFS 의 키).
   * extraSection 컴포넌트가 있어도 이 목록을 채우면 설정 UI 에 노출됨.
   */
  extraFields?: string[]
}

export const DESTINATION_OVERRIDES: Record<string, DestinationOverride> = {
  japan: {
    keywords: ['일본', 'japan'],
    extraSection: 'japan',
    extraFields: [
      // 입국 항공편 (한국 → 일본)
      'entry_date', 'entry_departure_airport', 'entry_airport', 'entry_transport', 'entry_flight_number',
      // 출국 항공편 (일본 → 한국)
      'return_date', 'return_departure_airport', 'return_arrival_airport', 'return_transport', 'return_flight_number',
      // 평면 (그룹 없음)
      'email', 'address_overseas', 'certificate_no',
    ],
  },
  // Tapeworm 6개국: 영국·아일랜드·몰타·북아일랜드·노르웨이·핀란드.
  // EU/EEA 입국 시 출국 24-120시간 전 praziquantel 류 촌충약 필수 (EU Reg 2018/772).
  // → 상세페이지에 내부구충 기본 표시. eu 보다 먼저 매칭되어야 하므로 위에 둠.
  ireland: {
    keywords: ['아일랜드', 'ireland'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraFields: ['address_overseas'],
  },
  malta: {
    keywords: ['몰타', 'malta'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraFields: ['address_overseas'],
  },
  norway: {
    keywords: ['노르웨이', 'norway'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraFields: ['address_overseas'],
  },
  finland: {
    keywords: ['핀란드', 'finland'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraFields: ['address_overseas'],
  },
  eu: {
    keywords: [
      '유럽연합', '프랑스', '독일', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
      '스웨덴', '덴마크', '폴란드', '체코', '포르투갈', '그리스',
      '헝가리', '루마니아', '불가리아', '크로아티아', '슬로바키아',
      '슬로베니아', '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '키프로스',
      'france', 'germany', 'italy', 'spain', 'netherlands', 'belgium', 'austria',
      'sweden', 'denmark', 'poland', 'czech', 'portugal', 'greece',
      'hungary', 'romania', 'bulgaria', 'croatia', 'slovakia',
      'slovenia', 'lithuania', 'latvia', 'estonia', 'luxembourg', 'cyprus',
      'eu',
    ],
    extraFields: ['address_overseas'],
  },
  switzerland: {
    // 스위스는 EU 솅겐 가입국이지만 통관은 별도. AnnexIII + 스위스 전용 BLV 신청서(CH) 동시 제출.
    keywords: ['스위스', 'switzerland'],
    extraSection: 'switzerland',
    extraFields: ['email', 'entry_date', 'entry_airport', 'entry_purpose', 'cropped'],
  },
  uk: {
    keywords: ['영국', '북아일랜드', 'uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraSection: 'uk',
    extraFields: ['address_overseas'],
  },
  australia: {
    keywords: ['호주', 'australia'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'infectious_disease', 'internal_parasite', 'external_parasite'],
    extraSection: 'australia',
    extraFields: ['permit_no', 'id_date', 'sample_received_date'],
  },
  new_zealand: {
    keywords: ['뉴질랜드', 'new zealand', 'nz'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'kennel', 'infectious_disease', 'external_parasite', 'internal_parasite', 'heartworm'],
    extraSection: 'new_zealand',
    extraFields: ['permit_no'],
  },
  thailand: {
    keywords: ['태국', 'thailand'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
    extraSection: 'thailand',
    // 태국은 검역소·도착지 = 입국공항 (Bangkok=BKK, Phuket=HKT, Chiang Mai=CNX) 이라 entry_airport 로 통합.
    extraFields: ['address_overseas', 'passport_number', 'passport_expiry_date', 'passport_issuer', 'entry_date', 'entry_time', 'entry_airport', 'entry_flight_number'],
  },
  philippines: {
    keywords: ['필리핀', 'philippines'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'internal_parasite'],
    extraSection: 'philippines',
    extraFields: ['address_overseas', 'postal_code', 'email', 'passport_number', 'passport_expiry_date', 'entry_airport'],
  },
  indonesia: {
    // 인도네시아는 별도 양식 없이 병원 발급 일반 영문 건강증명서(VHC) 제출.
    keywords: ['인도네시아', 'indonesia'],
    vaccines: ['rabies', 'rabies_titer'],
  },
  india: {
    // 'india' / '인도' 는 'indonesia' / '인도네시아' 의 부분문자열이므로
    // getDestinationOverride 의 substring 매칭에서 indonesia 가 먼저 잡히도록 반드시 그 뒤에 위치.
    keywords: ['인도', 'india'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'kennel', 'covid'],
  },
  turkey: {
    keywords: ['터키', 'turkey', 'türkiye', 'turkiye'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
  },
  usa: {
    keywords: ['미국', 'usa', 'united states', 'america'],
    extraSection: 'usa',
    extraFields: ['overseas_phone', 'passport_number', 'holder_birth_date', 'entry_date'],
  },
  mexico: {
    keywords: ['멕시코', 'mexico'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
  },
  russia: {
    keywords: ['러시아', 'russia'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
  },
  uae: {
    keywords: ['아랍에미레이트', '아랍에미리트', 'uae', 'united arab emirates'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'external_parasite', 'internal_parasite'],
  },
  singapore: {
    keywords: ['싱가포르', 'singapore'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'external_parasite', 'internal_parasite'],
  },
  hongkong: {
    keywords: ['홍콩', 'hong kong', 'hongkong'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
  },
  hawaii: {
    keywords: ['하와이', 'hawaii'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    extraSection: 'hawaii',
    // 하와이는 기본적으로 미국 — USA 의 추가정보 필드 모두 포함 (overseas_phone, entry_date 추가).
    extraFields: ['address_overseas', 'postal_code', 'email', 'overseas_phone', 'passport_number', 'passport_expiry_date', 'passport_issuing_country', 'holder_birth_date', 'entry_date'],
  },
  guam: {
    keywords: ['괌', 'guam'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'kennel', 'external_parasite', 'internal_parasite', 'heartworm'],
  },
  brazil: {
    keywords: ['브라질', 'brazil'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
  },
}

// ── 헬퍼 함수 ──

/**
 * 콤마 구분 다중 목적지를 개별 국가 토큰 배열로 분리.
 * "일본, 베트남" → ["일본", "베트남"]
 */
export function parseDestinations(destination: string | null | undefined): string[] {
  if (!destination) return []
  return destination.split(',').map(s => s.trim()).filter(Boolean)
}

/** 단일 목적지 토큰에 매칭되는 오버라이드 반환. 없으면 null. */
export function getDestinationOverride(destination: string | null | undefined): DestinationOverride | null {
  if (!destination) return null
  const lower = destination.toLowerCase()
  for (const override of Object.values(DESTINATION_OVERRIDES)) {
    if (override.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return override
    }
  }
  return null
}

/**
 * 콤마 구분 목적지 중 하나라도 지정 오버라이드 키에 매칭되는지.
 * 토큰 단위 exact-match (예: "호주, 일본" 에서 'japan' 키 → true).
 */
export function matchesDestinationKey(
  destination: string | null | undefined,
  key: keyof typeof DESTINATION_OVERRIDES,
): boolean {
  if (!destination) return false
  const override = DESTINATION_OVERRIDES[key]
  if (!override) return false
  const tokens = parseDestinations(destination).map(t => t.toLowerCase())
  const keywords = override.keywords.map(k => k.toLowerCase())
  return tokens.some(t => keywords.includes(t))
}

/** 목적지별 허용 필드 키 Set. extraFields는 케이스별 토글된 추가 필드. */
export function getAllowedFields(destination: string | null | undefined, extraFields?: string[]): Set<string> {
  const fields = new Set<string>([
    ...DEFAULT_CONFIG.고객정보,
    ...DEFAULT_CONFIG.동물정보,
    ...DEFAULT_CONFIG.절차정보,
    'general_vaccine',
    ...DEFAULT_CONFIG.기타정보,
  ])
  if (extraFields) {
    for (const f of extraFields) fields.add(f)
  }
  return fields
}

/**
 * 토글 가능한 추가 필드 목록.
 * 디폴트에 포함되지 않지만 토글로 추가 표시할 수 있는 필드들.
 * key: 내부 키, label: UI 표시, group: 어느 섹션에 표시할지.
 */
export const TOGGLEABLE_FIELDS: { key: string; label: string; group: string }[] = [
  // 절차정보 — 백신/검사
  { key: 'vaccine:general', label: '종합백신', group: '절차정보' },
  { key: 'vaccine:civ', label: '독감', group: '절차정보' },
  { key: 'vaccine:kennel', label: '켄넬코프', group: '절차정보' },
  { key: 'vaccine:covid', label: '코로나', group: '절차정보' },
  { key: 'vaccine:infectious_disease', label: '전염병검사', group: '절차정보' },
  { key: 'vaccine:external_parasite', label: '외부구충', group: '절차정보' },
  { key: 'vaccine:internal_parasite', label: '내부구충', group: '절차정보' },
  { key: 'vaccine:heartworm', label: '심장사상충', group: '절차정보' },
]

/** 디폴트 + 케이스별 토글을 합산한 백신 목록. */
export function getEffectiveVaccineList(destination: string | null | undefined, extraFields?: string[]): string[] {
  const base = getVaccineList(destination)
  if (!extraFields) return base
  const result = [...base]
  for (const f of extraFields) {
    if (f.startsWith('vaccine:')) {
      const v = f.slice('vaccine:'.length)
      if (!result.includes(v)) result.push(v)
    }
  }
  return result
}

/** 목적지별 백신/검사 목록. */
export function getVaccineList(destination: string | null | undefined): string[] {
  const override = getDestinationOverride(destination)
  return override?.vaccines ?? DEFAULT_CONFIG.vaccines
}

// ── Custom 목적지 (조직별 설정) 통합 헬퍼 ──

/** 케이스의 destination 토큰에 매칭되는 커스텀 목적지를 찾는다. 없으면 null. */
export function findCustomDestination(
  destination: string | null | undefined,
  config: DestinationOverridesConfig | null | undefined,
): CustomDestination | null {
  if (!destination || !config) return null
  const lower = destination.toLowerCase()
  for (const c of config.custom) {
    if (c.keywords.some((kw) => lower.includes(kw.toLowerCase()))) return c
  }
  return null
}

/** 하드코딩 vaccine 키 → DestinationVaccineEntry (기본 종 필터 적용). */
function applyHardcodedSpecies(key: string): DestinationVaccineEntry {
  const species = HARDCODED_VACCINE_SPECIES_DEFAULTS[key]
  return species ? { key, species } : { key }
}

/**
 * 케이스에 적용할 백신/검사 entries 를 반환.
 * 우선순위: 조직 커스텀 목적지 > 하드코딩 DESTINATION_OVERRIDES > DEFAULT_CONFIG.
 * extraFields 는 케이스별 토글된 추가 필드 (`vaccine:xxx`).
 */
export function getEffectiveVaccineEntries(
  destination: string | null | undefined,
  extraFields: string[] | undefined,
  customConfig: DestinationOverridesConfig | null | undefined,
): DestinationVaccineEntry[] {
  // 1) 커스텀 목적지 우선.
  const custom = findCustomDestination(destination, customConfig)
  if (custom) {
    // 항목별 species 가 지정돼 있으면 그대로, 미지정이면 그대로 둠 (사용자가 의도적으로 "모두" 선택).
    const result = [...custom.vaccines]
    appendToggleVaccines(result, extraFields)
    return result
  }
  // 2) 하드코딩 폴백 (디폴트 종 필터 자동 적용).
  const baseKeys = getVaccineList(destination)
  const result = baseKeys.map(applyHardcodedSpecies)
  appendToggleVaccines(result, extraFields)
  return result
}

function appendToggleVaccines(
  result: DestinationVaccineEntry[],
  extraFields: string[] | undefined,
): void {
  if (!extraFields) return
  for (const f of extraFields) {
    if (!f.startsWith('vaccine:')) continue
    const key = f.slice('vaccine:'.length)
    if (!result.some((e) => e.key === key)) {
      result.push(applyHardcodedSpecies(key))
    }
  }
}

/** 한 vaccine entry 가 현재 케이스 종에 적용되는지. species 미지정 = 모든 종. */
export function vaccineMatchesSpecies(
  entry: DestinationVaccineEntry,
  species: string | null | undefined,
): boolean {
  if (!entry.species) return true
  return entry.species === species
}

/** 커스텀 목적지에서 사용 가능한 모든 백신/검사 키. UI 의 체크박스 옵션 출처. */
export const ALL_VACCINE_KEYS = [
  'rabies',
  'rabies_titer',
  'general',
  'civ',
  'kennel',
  'covid',
  'infectious_disease',
  'external_parasite',
  'internal_parasite',
  'heartworm',
] as const

/** UI 표시용 라벨. */
export const VACCINE_KEY_LABELS: Record<string, string> = {
  rabies: '광견병',
  rabies_titer: '광견병항체검사',
  general: '종합백신',
  civ: '독감',
  kennel: '켄넬코프',
  covid: '코로나',
  infectious_disease: '전염병검사',
  external_parasite: '외부구충',
  internal_parasite: '내부구충',
  heartworm: '심장사상충',
}

/** 모든 케이스에 기본 적용되는 백신/검사 (광견병 + 항체검사). */
export const DEFAULT_VACCINE_KEYS: string[] = ['rabies', 'rabies_titer']

/**
 * 한 목적지가 디폴트 설정과 동일한지 (vaccines, extraFields, extraSection 모두 동일).
 * 동일하면 설정 UI 의 "목적지별 표시정보" 리스트에서 숨길 수 있다.
 */
export function isDestinationEqualToDefault(d: CustomDestination): boolean {
  if (d.extraSection) return false
  if (d.extraFields && d.extraFields.length > 0) return false
  // 백신 셋이 정확히 디폴트와 같은지 (순서 무관, species 필터 없음).
  const keys = d.vaccines.map((v) => v.key).sort()
  const defaults = [...DEFAULT_VACCINE_KEYS].sort()
  if (keys.length !== defaults.length) return false
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== defaults[i]) return false
    // species 필터 있으면 디폴트 아님.
    const entry = d.vaccines.find((v) => v.key === keys[i])
    if (entry?.species) return false
  }
  return true
}

/** 하드코딩 키 → 사용자 친화 표시명 (한글 첫번째 키워드 우선). */
function deriveDisplayName(id: string, keywords: string[]): string {
  const ko = keywords.find((k) => /[ㄱ-ㆎ가-힣]/.test(k))
  return ko ?? keywords[0] ?? id
}

/**
 * 하드코딩 DESTINATION_OVERRIDES 를 CustomDestination 모양으로 변환.
 * 설정 UI 에서 통합 리스트(커스텀 + 디폴트)로 노출하기 위함.
 */
export function getHardcodedDestinationsAsCustom(): CustomDestination[] {
  return Object.entries(DESTINATION_OVERRIDES).map(([id, override]) => {
    const baseKeys = override.vaccines ?? DEFAULT_CONFIG.vaccines
    const extraFields: DestinationExtraFieldEntry[] = (override.extraFields ?? []).map((k) => ({ key: k }))
    const out: CustomDestination = {
      id,
      name: deriveDisplayName(id, override.keywords),
      keywords: [...override.keywords],
      vaccines: baseKeys.map(applyHardcodedSpecies),
    }
    if (extraFields.length > 0) out.extraFields = extraFields
    if (override.extraSection) out.extraSection = override.extraSection
    return out
  })
}

/**
 * 케이스에 적용할 추가정보 extra fields entries 반환 (커스텀 우선, 폴백 하드코딩).
 */
export function getEffectiveExtraFieldEntries(
  destination: string | null | undefined,
  customConfig: DestinationOverridesConfig | null | undefined,
): DestinationExtraFieldEntry[] {
  const custom = findCustomDestination(destination, customConfig)
  if (custom) return custom.extraFields ?? []
  const override = getDestinationOverride(destination)
  return (override?.extraFields ?? []).map((k) => ({ key: k }))
}

/** 한 extra-field entry 가 현재 케이스 종에 적용되는지. */
export function extraFieldMatchesSpecies(
  entry: DestinationExtraFieldEntry,
  species: string | null | undefined,
): boolean {
  if (!entry.species) return true
  return entry.species === species
}

export type { CustomDestination, DestinationVaccineEntry, DestinationOverridesConfig, SpeciesFilter }
