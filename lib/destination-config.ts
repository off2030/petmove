/**
 * 목적지별 상세페이지 필드 + 증명서 버튼 설정.
 *
 * - DEFAULT_CONFIG: 모든 국가 공통
 * - DESTINATION_OVERRIDES: 국가별 차이점만 기술
 *
 * 국가 추가 시 DESTINATION_OVERRIDES에 항목 추가만 하면 됨.
 */

// ── 증명서 버튼 타입 ──

export interface CertButton {
  key: string        // 고유 키 (서버 액션 매칭용)
  label: string      // 버튼 표시 텍스트
  type: 'single' | 'multi'  // single: 바로 생성, multi: 다이얼로그 (sibling 선택)
  /** 이 버튼을 표시할 동물 종. 생략 시 모든 종에서 표시. */
  species?: 'dog' | 'cat'
}

// ── 디폴트 (모든 국가 공통) ──

export const DEFAULT_CONFIG = {
  고객정보: ['customer_name', 'phone'],
  // phone 렌더 시 AddressField(한국주소+영문주소) 자동 포함
  동물정보: ['pet_name', 'microchip', 'birth_date', 'species', 'sex', 'weight'],
  // species 렌더 시 BreedField+ColorField 자동 포함
  절차정보: ['status', 'destination', 'microchip_implant_date', 'departure_date'],
  vaccines: ['rabies', 'rabies_titer'] as string[],
  기타정보: ['memo'],
  // payment는 항상 기타정보 하단에 표시

  /** 디폴트 증명서 버튼 (모든 국가) */
  certs: [
    { key: 'form25', label: '별지25', type: 'single' },
    { key: 'form25AuNz', label: '별지25 EX', type: 'single' },
  ] as CertButton[],
}

// ── 국가별 오버라이드 ──

interface DestinationOverride {
  /** 목적지 매칭 키워드 (대소문자 무시) */
  keywords: string[]
  /** 백신/검사 오버라이드 (생략 시 디폴트) */
  vaccines?: string[]
  /** 추가정보 섹션 컴포넌트 키 (생략 시 추가정보 없음) */
  extraSection?: string
  /** 추가정보 섹션에 포함할 필드들 (해당 섹션이 없을 때 사용). */
  extraFields?: ('address_overseas')[]
  /** 추가 증명서 버튼 (디폴트 뒤에 붙음) */
  extraCerts?: CertButton[]
}

export const DESTINATION_OVERRIDES: Record<string, DestinationOverride> = {
  japan: {
    keywords: ['일본', 'japan'],
    extraSection: 'japan',
    extraCerts: [
      { key: 'formAC', label: 'Form AC', type: 'single' },
      { key: 'formRE', label: 'Form RE', type: 'single' },
    ],
  },
  eu: {
    keywords: [
      '유럽연합', '프랑스', '독일', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
      '스웨덴', '덴마크', '폴란드', '체코', '포르투갈', '그리스',
      '헝가리', '아일랜드', '루마니아', '불가리아', '크로아티아', '슬로바키아',
      '슬로베니아', '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '키프로스', '몰타',
      'france', 'germany', 'italy', 'spain', 'netherlands', 'belgium', 'austria',
      'sweden', 'denmark', 'poland', 'czech', 'portugal', 'greece',
      'hungary', 'ireland', 'romania', 'bulgaria', 'croatia', 'slovakia',
      'slovenia', 'lithuania', 'latvia', 'estonia', 'luxembourg', 'cyprus', 'malta',
      'eu',
    ],
    extraFields: ['address_overseas'],
    extraCerts: [
      { key: 'annexIII', label: 'EU', type: 'multi' },
    ],
  },
  switzerland: {
    // 스위스는 EU 솅겐 가입국이지만 통관은 별도. AnnexIII + 스위스 전용 BLV 신청서(CH) 동시 제출.
    keywords: ['스위스', 'switzerland'],
    extraSection: 'switzerland',
    extraCerts: [
      { key: 'annexIII', label: 'EU', type: 'multi' },
      { key: 'ch', label: 'CH', type: 'single' },
    ],
  },
  uk: {
    keywords: ['영국', 'uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland'],
    extraFields: ['address_overseas'],
    extraCerts: [
      { key: 'annexIII', label: 'EU', type: 'multi' },
      { key: 'uk', label: 'UK', type: 'multi' },
    ],
  },
  australia: {
    keywords: ['호주', 'australia'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'infectious_disease', 'internal_parasite', 'external_parasite'],
    extraSection: 'australia',
    extraCerts: [
      { key: 'idDeclaration', label: 'ID', type: 'single' },
      { key: 'au', label: 'AU', type: 'single', species: 'dog' },
      { key: 'au2', label: 'AU 2', type: 'single', species: 'dog' },
      { key: 'auCat', label: 'AU', type: 'single', species: 'cat' },
      { key: 'auCat2', label: 'AU 2', type: 'single', species: 'cat' },
    ],
  },
  new_zealand: {
    keywords: ['뉴질랜드', 'new zealand', 'nz'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'kennel', 'infectious_disease', 'external_parasite', 'internal_parasite', 'heartworm'],
    extraSection: 'new_zealand',
    extraCerts: [
      { key: 'nz', label: 'NZ', type: 'single' },
      { key: 'ovd', label: 'OVD', type: 'single' },
    ],
  },
  thailand: {
    keywords: ['태국', 'thailand'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
    extraSection: 'thailand',
    extraCerts: [
      { key: 'formR11', label: 'R.11', type: 'single' },
    ],
  },
  philippines: {
    keywords: ['필리핀', 'philippines'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'internal_parasite'],
    extraSection: 'philippines',
  },
  indonesia: {
    // 인도네시아는 별도 양식 없이 병원 발급 일반 영문 건강증명서(VHC) 제출.
    keywords: ['인도네시아', 'indonesia'],
    vaccines: ['rabies', 'rabies_titer'],
    extraCerts: [
      { key: 'vhc', label: 'VHC', type: 'single' },
    ],
  },
  turkey: {
    keywords: ['터키', 'turkey', 'türkiye', 'turkiye'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    extraCerts: [
      { key: 'vhc', label: 'VHC', type: 'single' },
    ],
  },
  usa: {
    keywords: ['미국', 'usa', 'united states', 'america'],
    extraSection: 'usa',
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
    extraCerts: [
      { key: 'sgp', label: 'SGP', type: 'single' },
    ],
  },
  hongkong: {
    keywords: ['홍콩', 'hong kong', 'hongkong'],
    vaccines: ['rabies', 'rabies_titer', 'general'],
  },
  hawaii: {
    keywords: ['하와이', 'hawaii'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    extraSection: 'hawaii',
    extraCerts: [
      { key: 'aqs', label: 'AQS-279', type: 'single' },
    ],
  },
  guam: {
    keywords: ['괌', 'guam'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'kennel', 'external_parasite', 'internal_parasite', 'heartworm'],
  },
  brazil: {
    keywords: ['브라질', 'brazil'],
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
  },
  // ── 향후 추가 ──
  // us: { keywords: ['미국', 'usa'], vaccines: [...], extraCerts: [...] },
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
  { key: 'vaccine:civ', label: 'CIV', group: '절차정보' },
  { key: 'vaccine:kennel', label: '켄넬코프', group: '절차정보' },
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

/** 목적지별 증명서 버튼 목록 (디폴트 + 국가별 추가). species 지정 시 해당 종 전용 버튼만 포함. */
export function getCertButtons(destination: string | null | undefined, species?: string | null): CertButton[] {
  const override = getDestinationOverride(destination)
  const all = [...DEFAULT_CONFIG.certs, ...(override?.extraCerts ?? [])]
  if (!species) return all.filter(b => !b.species)
  return all.filter(b => !b.species || b.species === species)
}
