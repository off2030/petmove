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

/**
 * 한 동물(case)에 동시에 진행할 수 있는 목적지(여정) 최대 개수.
 * 완료되어 '지난 여정'으로 내려간 목적지는 제외 — 활성 목적지만 카운트.
 * UI(목적지 추가 버튼)·server action(addCaseDestination) 양쪽에서 이 값으로 막는다.
 */
export const MAX_DESTINATIONS_PER_CASE = 3

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
  /**
   * 편도(trip_type='one_way')일 때 광견병 항체 검사(rabies_titer)를 표시하지 않을지.
   * 입국국 자체는 RNATT 비요구지만 한국 귀국용으로 디폴트 표시 중인 국가들에 사용.
   */
  rabiesTiterForReturnOnly?: boolean
}

export const DESTINATION_OVERRIDES: Record<string, DestinationOverride> = {
  japan: {
    keywords: ['일본', 'japan'],
    extraSection: 'japan',
    extraFields: [
      // 출국 항공편 (한국 → 일본) — 항공권 정보. 날짜는 한국 출발 기준.
      // departure_flight_date 는 케이스의 departure_date(출국일) 컬럼과 양방향 sync
      // (updateCaseField / share-link hardcode — 한일 노선 같은 날 출발=도착).
      // entry_date(도착일) 는 의미상 일본 도착일이지만 한일 같은 날이라 미사용.
      // 출/입국 항공편 시간(departure_flight_time)은 일본에선 불필요 → 미노출.
      'departure_flight_date', 'entry_flight_number', 'entry_departure_airport',
      'entry_airport', 'entry_transport',
      // 귀국 항공편 (일본 → 한국) — 동일 순서
      'return_date', 'return_flight_number', 'return_departure_airport', 'return_arrival_airport', 'return_transport',
      // 수출검역 예약 (왕복 시 일본 출국검역)
      'jp_export_quarantine_date', 'jp_export_quarantine_time',
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
    extraFields: ['address_overseas', 'deworming_time'],
  },
  malta: {
    keywords: ['몰타', 'malta'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraFields: ['address_overseas', 'deworming_time'],
  },
  norway: {
    keywords: ['노르웨이', 'norway'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraFields: ['address_overseas', 'deworming_time'],
  },
  finland: {
    keywords: ['핀란드', 'finland'],
    vaccines: ['rabies', 'rabies_titer', 'internal_parasite'],
    extraFields: ['address_overseas', 'deworming_time'],
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
    extraFields: ['address_overseas', 'deworming_time'],
  },
  australia: {
    keywords: ['호주', 'australia'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'infectious_disease', 'internal_parasite', 'external_parasite'],
    extraSection: 'australia',
    // sample_received_date 는 rabies_titer_records[].received_date 로 이동 (광견병 항체 검사 편집화면에 표시).
    extraFields: ['permit_no', 'id_date'],
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
    // 표시 순서: 여권 정보 → 해외주소 → 항공편(날짜·시간·항공편명·도착공항).
    extraFields: [
      'passport_number', 'passport_expiry_date', 'passport_issuer',
      'address_overseas',
      'entry_date', 'entry_time', 'entry_flight_number', 'entry_airport',
    ],
    rabiesTiterForReturnOnly: true,
  },
  philippines: {
    keywords: ['필리핀', 'philippines'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'internal_parasite'],
    extraSection: 'philippines',
    extraFields: [
      'address_overseas', 'postal_code', 'email',
      'passport_number', 'passport_expiry_date', 'entry_airport',
    ],
    rabiesTiterForReturnOnly: true,
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
    rabiesTiterForReturnOnly: true,
  },
  mexico: {
    keywords: ['멕시코', 'mexico'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    rabiesTiterForReturnOnly: true,
  },
  russia: {
    keywords: ['러시아', 'russia'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
    rabiesTiterForReturnOnly: true,
  },
  uae: {
    keywords: ['아랍에미레이트', '아랍에미리트', 'uae', 'united arab emirates'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'external_parasite', 'internal_parasite'],
    rabiesTiterForReturnOnly: true,
  },
  singapore: {
    keywords: ['싱가포르', 'singapore'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'external_parasite', 'internal_parasite'],
  },
  hongkong: {
    keywords: ['홍콩', 'hong kong', 'hongkong'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
    rabiesTiterForReturnOnly: true,
  },
  hawaii: {
    keywords: ['하와이', 'hawaii'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    extraSection: 'hawaii',
    // 하와이는 기본적으로 미국 — USA 의 추가정보 필드 모두 포함 (overseas_phone, entry_date 추가).
    // 출국 항공편 그룹: 출국일(departure_flight_date)·도착일(entry_date)·항공편명·도착시간.
    extraFields: ['address_overseas', 'postal_code', 'email', 'overseas_phone', 'passport_number', 'passport_expiry_date', 'passport_issuing_country', 'holder_birth_date', 'departure_flight_date', 'entry_date', 'entry_flight_number', 'entry_time'],
  },
  guam: {
    keywords: ['괌', 'guam'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'kennel', 'external_parasite', 'internal_parasite', 'heartworm'],
  },
  brazil: {
    keywords: ['브라질', 'brazil'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    rabiesTiterForReturnOnly: true,
  },
  china: {
    // 한국 = GACC 비지정 국가 → 광견병 항체 검사 필수.
    // 중국은 1년 라이선스 백신만 인정 (2년/3년 거부).
    keywords: ['중국', 'china'],
    vaccines: ['rabies', 'rabies_titer'],
  },
  taiwan: {
    // APHIA(2023 BAPHIQ에서 개칭) — 광견병 항체 검사 필수, 채혈일 + 180일 후 도착, 7일 격리 (수입허가 20일 전 신청 시 면제).
    // BAPHIQ Form 002 Import permit number 입력용으로 permit_no 추가정보 노출.
    // (Certificate number 는 후처리 수기 입력 — EQC No. 라벨이 일본 전용이라 공유하지 않음.)
    keywords: ['대만', 'taiwan'],
    vaccines: ['rabies', 'rabies_titer'],
    extraFields: ['address_overseas', 'permit_no'],
  },
  malaysia: {
    // DVS — 종합백신 필수, RNATT 면제(말레이시아 입국 한정 — 한국 귀국 시는 필요).
    // 수입허가 + 계류장 14일 전 예약 + 도착 후 7일 격리.
    keywords: ['말레이시아', 'malaysia'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
    rabiesTiterForReturnOnly: true,
  },
  morocco: {
    // ONSSA — 광견병 출국 30일 전, 도착 시 수의사 검역. RNATT 는 한국 귀국용.
    keywords: ['모로코', 'morocco'],
    vaccines: ['rabies', 'rabies_titer'],
    rabiesTiterForReturnOnly: true,
  },
  // 1차 정부 영문 자료 부분 공개 패밀리 — USDA APHIS / 한국 QIA 정부 2차 안내·운용 룰 의존
  mongolia: {
    keywords: ['몽골', 'mongolia'],
    vaccines: ['rabies', 'rabies_titer'],
    rabiesTiterForReturnOnly: true,
  },
  vietnam: {
    keywords: ['베트남', 'vietnam'],
    vaccines: ['rabies', 'rabies_titer'],
    rabiesTiterForReturnOnly: true,
  },
  argentina: {
    // 광견병 출국 30일 전 추가 룰.
    keywords: ['아르헨티나', 'argentina'],
    vaccines: ['rabies', 'rabies_titer'],
    rabiesTiterForReturnOnly: true,
  },
  uzbekistan: {
    // 광견병 출국 30일 전 + 입국용 항체검사(유효기간 1년) 필수 → 편도에서도 항체검사 표시.
    keywords: ['우즈베키스탄', 'uzbekistan'],
    vaccines: ['rabies', 'rabies_titer'],
  },
  cambodia: {
    keywords: ['캄보디아', 'cambodia'],
    vaccines: ['rabies', 'rabies_titer'],
    rabiesTiterForReturnOnly: true,
  },
  canada: {
    // USDA 호환 — 입국 시 광견병 백신만 요구. RNATT 는 한국 귀국용.
    keywords: ['캐나다', 'canada'],
    rabiesTiterForReturnOnly: true,
  },
  ukraine: {
    // 공식 자료 부재 — 사례 기반. 광견병 21일 + RNATT 3개월/1년 + 건강증명서 48시간.
    keywords: ['우크라이나', 'ukraine'],
    vaccines: ['rabies', 'rabies_titer'],
  },
  israel: {
    // 광견병 후 30일 + RNATT 필수 + 도착 5일 이내 등록.
    keywords: ['이스라엘', 'israel'],
    vaccines: ['rabies', 'rabies_titer'],
  },
  south_africa: {
    // 광견병 + RNATT + 전염병검사(ARC-OVI, Brucella/Babesia/Ehrlichia/Trypanosoma 등) + 심장사상충.
    keywords: ['남아프리카공화국', '남아공', 'south africa'],
    vaccines: ['rabies', 'rabies_titer', 'infectious_disease', 'heartworm'],
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

/**
 * 다중 목적지에서 "현재 활성" 토큰을 결정.
 * - activeDestination 이 있으면 그 값
 * - 없으면 destination 의 첫 토큰
 * - 모두 비어있으면 null
 */
export function resolveActiveDestination(
  destination: string | null | undefined,
  activeDestination: string | null | undefined,
): string | null {
  if (activeDestination) return activeDestination
  return parseDestinations(destination)[0] ?? null
}

/**
 * case.data.trip_type 에서 단일 목적지 토큰의 왕복/편도 값을 읽음.
 * 미저장 또는 비매칭 시 디폴트 'round'.
 */
export function getTripType(
  data: Record<string, unknown> | null | undefined,
  destinationToken: string | null | undefined,
): 'round' | 'one_way' {
  if (!destinationToken) return 'round'
  const map = (data?.['trip_type'] as Record<string, unknown> | undefined) ?? {}
  return map[destinationToken] === 'one_way' ? 'one_way' : 'round'
}

/**
 * 입국에 광견병 항체검사(RNATT)가 필요 없는 목적지 — 항체검사는 한국 귀국용만.
 * (예: 미국·캐나다·멕시코 등 USDA 호환국). 이 나라들은 입국에 "유효한 광견병 접종"만
 * 요구하므로 수출 증명서의 광견병 dose 는 가장 최근 1건이면 충분 (anchor 확장 불필요).
 * destination-config 의 rabiesTiterForReturnOnly 플래그 기반.
 */
export function isRabiesTiterReturnOnly(
  destination: string | null | undefined,
): boolean {
  const override = getDestinationOverride(destination)
  return !!override?.rabiesTiterForReturnOnly
}

/**
 * 활성 목적지가 "편도일 때 광견병 항체 검사를 숨기는 국가" 인지 여부.
 * 입국 항체검사가 귀국용일 뿐이면 편도에선 숨김 — isRabiesTiterReturnOnly 와 동일 플래그.
 */
export function isRabiesTiterHiddenForOneWay(
  destination: string | null | undefined,
): boolean {
  return isRabiesTiterReturnOnly(destination)
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

/**
 * 한국 농림축산검역본부 지정 '광견병 비발생 지역'. 이 지역(국가)에서 한국으로 (재)입국하는
 * 개·고양이는 광견병 중화항체가(RNATT) 검사를 면제받는다 → 귀국 항체검사 2년 룰
 * (common.kr-return-titer-within-2years)도 비발생국이면 적용하지 않는다.
 *
 * ⚠️ APQA 는 이 목록을 정적으로 공표하지 않으며 발생 상황에 따라 **실시간 변동**한다. 당국도
 * "입국 전 검역기관(동물검역과 054-912-0427) 확인"을 요구한다(qia.go.kr). 아래는 petmove
 * 블로그(/blog/rabies-free-countries/) **2024-01-04 스냅샷** 기준 초기값으로, 확정 데이터가
 * 아니라 '안내(info)'용이다. 갱신은 이 두 상수만 고친다.
 *
 * 매칭은 목적지 토큰(원본 국가명) 기준 — eu 묶음 24개국이 비발생/발생으로 섞여 있어
 * (독일=비발생, 프랑스=발생) destinationKey 가 아닌 실제 국가명 기준이 필수다.
 */
// 비발생국에 해당하는 1:1 destinationKey (eu 묶음 제외).
const RABIES_FREE_DESTINATION_KEYS: Array<keyof typeof DESTINATION_OVERRIDES> = [
  'japan', 'australia', 'new_zealand', 'uk', 'ireland', 'malta', 'finland',
  'switzerland', 'singapore', 'hongkong', 'hawaii', 'guam', 'uae',
]
// eu 묶음(24개국) 중 비발생 회원국 토큰(소문자). 발생국(프랑스·스페인·네덜란드·덴마크·폴란드·
// 그리스·헝가리·루마니아·크로아티아·슬로바키아)은 제외 — 그쪽은 귀국 2년 룰 적용.
const RABIES_FREE_EU_MEMBERS = new Set<string>([
  '독일', 'germany', '이탈리아', 'italy', '벨기에', 'belgium', '오스트리아', 'austria',
  '스웨덴', 'sweden', '체코', 'czech', '포르투갈', 'portugal', '불가리아', 'bulgaria',
  '슬로베니아', 'slovenia', '리투아니아', 'lithuania', '라트비아', 'latvia',
  '에스토니아', 'estonia', '룩셈부르크', 'luxembourg', '키프로스', 'cyprus',
])

/**
 * 활성 목적지가 한국 지정 광견병 비발생 지역인지 — 귀국 항체검사 면제 판정용.
 * (위 RABIES_FREE_* 주석의 변동성·면책 참고. 코드 단정이 아니라 안내 기준값.)
 */
export function isRabiesFreeOrigin(destination: string | null | undefined): boolean {
  if (!destination) return false
  if (RABIES_FREE_DESTINATION_KEYS.some((k) => matchesDestinationKey(destination, k))) return true
  // eu 묶음은 실제 국가 토큰으로 비발생/발생이 갈린다.
  if (matchesDestinationKey(destination, 'eu')) {
    return parseDestinations(destination).some((t) => RABIES_FREE_EU_MEMBERS.has(t.toLowerCase()))
  }
  return false
}

/**
 * 내원·임상검진일은 출국일 포함 N일 이내여야 함 — 목적지별 윈도우 N.
 * 한국 APQA 디폴트 10일. 비표준만 명시; 값은 규정 문구의 "N일 이내" N 그대로.
 * 다중 목적지 시 가장 엄격한 윈도우(최소값) 적용.
 *
 * Source of truth — 각 목적지의 규정 (출처 packages/domain/src/procedure-checks/*.ts).
 *
 * 비교 규칙: `days >= window` 면 거부. 예) window=10 → days 0~9 OK, 10+ 거부.
 *
 * NOTE: 뉴질랜드/터키는 규정상 "2일 이내(48시간/MPI 2일)" 이지만 max-2-days-before
 * 해석으로 window=3 적용 중. 규정 문구와 표시 disconnect — 별도 정리 대상.
 */
const VET_VISIT_WINDOW_OVERRIDES: Array<{
  key: keyof typeof DESTINATION_OVERRIDES
  window: number
}> = [
  { key: 'malaysia', window: 7 },
  { key: 'singapore', window: 7 },
  { key: 'australia', window: 5 },
  { key: 'russia', window: 5 },
  { key: 'new_zealand', window: 3 },
  { key: 'turkey', window: 3 },
]

const VET_VISIT_DEFAULT_WINDOW_DAYS = 10

/**
 * 입력된 목적지(콤마 구분 가능)에 대한 내원일↔출국일 윈도우 일수.
 * 반환값은 규정의 "N일 이내" N. 다중 목적지 시 가장 엄격한 윈도우(최소값) 반환.
 */
export function getVetVisitWindowDays(destination: string | null | undefined): number {
  if (!destination) return VET_VISIT_DEFAULT_WINDOW_DAYS
  let min = VET_VISIT_DEFAULT_WINDOW_DAYS
  for (const ov of VET_VISIT_WINDOW_OVERRIDES) {
    if (matchesDestinationKey(destination, ov.key) && ov.window < min) {
      min = ov.window
    }
  }
  return min
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
  rabies_titer: '광견병 항체 검사',
  general: '종합백신',
  civ: '독감',
  kennel: '켄넬코프',
  covid: '코로나',
  infectious_disease: '전염병검사',
  external_parasite: '외부구충',
  internal_parasite: '내부구충',
  heartworm: '심장사상충',
}

/** 모든 케이스에 기본 적용되는 백신/검사 (광견병 + 항체 검사). */
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
