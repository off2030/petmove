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

/**
 * 아키타입 — 규정 '가족'. 새 목적지는 가족을 고르고 델타만 적는다.
 * (설계: docs/destination-architecture-design.md §2)
 *  - eu-family: EU 24국 + 영국·아일랜드·몰타·노르웨이·핀란드·스위스·키프로스 —
 *    광견병 1회 + 항체(무기한) + 채혈 후 3개월 + 촌충(일부)
 *  - jp-2dose: 일본·중국 — 광견병 2회 + 항체 필수 + 도착 수입검역 + 왕복 수출검역
 *  - sea-permit: 태국·필리핀 — 광견병 1회 + 수입허가 2단계 + 종합백신 + 항체는 귀국용
 *  - generic: 그 외(admin 전용 국가) — 최소 구성
 */
export type DestinationArchetype = 'eu-family' | 'jp-2dose' | 'sea-permit' | 'generic'

/** 광견병 접종 프로파일 — 접종 모델·백신 제한을 선언. */
export interface DestinationRabiesProfile {
  /**
   * 프라임 접종 횟수. 1 = 1회 접종 + 부스터 모델(태국·필리핀·EU 패밀리),
   * 2 = 2회 프라임 모델(일본·중국). `SINGLE_DOSE_RABIES_DESTINATIONS` 의 파생원.
   */
  doses?: 1 | 2
  /** 1차 접종 가능 최소 일령(일). 예: 일본 91, EU 84(12주). */
  minAgeDays?: number
  /**
   * 최소 일령이 **달력 개월**로 규정된 경우(베트남 "at least 3 months of age").
   * 지정하면 판정이 일수가 아니라 달력 기준이 된다(StepEarliest.monthsAfter → meetsCalendarAge).
   * 일수로 환산하면 생월에 따라 89~92일로 흔들려 규정을 지킨 사람을 막는다.
   */
  minAgeMonths?: number
  /**
   * 면역 유효기간을 1년(연 1회 접종)만 인정 — 2·3년 라이선스 백신 입력 차단.
   * `RABIES_ONE_YEAR_VALIDITY_DESTINATIONS` 의 파생원.
   */
  oneYearVaccineOnly?: boolean
  /** 1·2차 최소 간격(일). 'soft' = 하드 차단 없이 순서·권고만(중국 30일). */
  doseIntervalDays?: number | 'soft'
  /**
   * 최근 접종일로부터 입국까지 최소 대기(일) — 유효 부스터는 면제(violatesVaccineWaitDays).
   * `RABIES_ENTRY_WAIT_DAYS` 의 파생원. 항공권 카드 저장 거부(validateRabiesEntryWait)와
   * 그 나라 주의 룰(`<cc>.rabies-min-Ndays-before-departure`)이 이 값을 공유한다.
   *
   * 0 또는 미지정 = 대기 요건 없음(캐나다). 예전엔 베트남 30일이 date-rules 안에
   * 상수(VN_RABIES_WAIT_DAYS)로 박혀 있어, 같은 모델의 나라를 올릴 때마다 함수를
   * 하나씩 복제해야 했다(2026-07-20 프로파일 파생으로 교체).
   *
   * ※ 태국·필리핀 21일은 아직 각자 validator 안에 있다 — 그쪽은 종합백신 대기까지 얽혀
   *   있어 이 필드로 합치지 않았다.
   */
  entryWaitDaysAfterVaccine?: number

  // ── 카드 문구 파생용 (buildRabiesCard) ────────────────────────────────
  // 광견병 카드는 목적지마다 '문장 조각의 조합'일 뿐이라 골격 하나에서 파생한다.
  // 여기 없는 나라 고유 문장은 extraLines 로 넣는다.

  /**
   * 최소 일령을 고객에게 어떻게 쓸지 — 규정 문구 그대로.
   * 예: '생후 91일'(일본·중국) / '생후 12주(84일)'(EU·태국·필리핀) / '생후 90일'(대만) /
   *     '생후 3개월'(베트남 — 달력 개월이라 일수로 환산하지 않는다).
   * 미지정이면 minAgeDays 에서 '생후 N일'로 자동 생성.
   */
  minAgeLabel?: string
  /** 인정 백신 제한 문장(대만 '불활화(사독) 백신만 인정돼요.'). */
  vaccineTypeLine?: string
  /**
   * 유효기간 문장. oneYearVaccineOnly 만으론 나라별 뉘앙스가 안 나온다 —
   * 중국 '백신의 종류에 상관없이 1년', 대만 '1년', 베트남 '1년 / 3년 백신 불인정'.
   */
  validityLine?: string
  /** 접종 시점 제약(태국 '입국 3주 전까지', 베트남 '출국 30일 전까지') — 여러 줄 가능. */
  timingLines?: string[]
  /** 그 나라에만 있는 추가 안내(태국 백신 수첩 요건 등). 카드 맨 끝에 붙는다. */
  extraLines?: string[]
}

/** 광견병 항체검사(RNATT) 프로파일. 한국 귀국용 2년 룰은 공통이라 여기 없음(titer-validity.ts). */
export interface DestinationTiterProfile {
  /**
   * 'entry' = 입국에 필수, 'return-only' = 입국엔 불요·한국 귀국용만
   * (기존 `rabiesTiterForReturnOnly: true` 와 같은 의미), 'none' = 표시 안 함.
   */
  need?: 'entry' | 'return-only' | 'none'
  /**
   * 입국용 유효기간(개월). null = 무기한(EU — 부스터 chain 유지 시 영구).
   * 미지정 = 입국용 만료 개념 없음. `TITER_ENTRY_VALIDITY_MONTHS` 의 파생원.
   */
  entryValidityMonths?: number | null
  /** 고객 화면 검사기관 코드 목록(titer-labs.ts). `TITER_LAB_CODES_BY_DEST` 의 파생원. */
  labCodes?: string[]
  /** 백신(최종 접종) 후 채혈까지 최소 대기(일). 예: EU 30. */
  minDaysAfterVaccine?: number
  /**
   * 채혈 후 입국까지 대기. 예: 일본 { days: 180 }, EU { months: 3 }.
   * `basisReceivedDate` = 규정 기준일이 **검체 수령일**(하와이 FAVN)인데 앱이 그 날짜를 입력받지
   * 않아 채혈일을 proxy 로만 쓰는 경우 true. 저장거부·안내 메시지가 계산된 특정 날짜를 단정하지
   * 않고 요건만 forward-looking 으로 표시한다(검사일 기준 아님).
   */
  entryWaitAfterTiter?: { days?: number; months?: number; basisReceivedDate?: boolean }
}

export interface DestinationOverride {
  /** 목적지 매칭 키워드 (대소문자 무시) */
  keywords: string[]
  /**
   * 백신/검사 오버라이드 (생략 시 디폴트).
   * 문자열이면 모든 종에 표시. 종별로 제한하려면 `{ key, species }` 형태로 지정
   * (예: 영국·아일랜드 등 촌충국의 내부구충은 개 전용 → `{ key: 'internal_parasite', species: 'dog' }`).
   */
  vaccines?: Array<string | DestinationVaccineEntry>
  /** 추가정보 섹션 컴포넌트 키 (생략 시 추가정보 없음) */
  extraSection?: string
  /**
   * 이 목적지가 활용하는 추가정보 필드 키 목록 (EXTRA_FIELD_DEFS 의 키).
   * extraSection 컴포넌트가 있어도 이 목록을 채우면 설정 UI 에 노출됨.
   *
   * 문자열이면 모든 종에 표시. 종별로 제한하려면 `{ key, species }` 형태로 지정
   * (예: 영국·아일랜드 등 촌충국의 구충시간은 개 전용 → `{ key: 'deworming_time', species: 'dog' }`).
   */
  extraFields?: Array<string | DestinationExtraFieldEntry>
  /**
   * 편도(trip_type='one_way')일 때 광견병 항체 검사(rabies_titer)를 표시하지 않을지.
   * 입국국 자체는 RNATT 비요구지만 한국 귀국용으로 디폴트 표시 중인 국가들에 사용.
   */
  rabiesTiterForReturnOnly?: boolean

  // ── 프로파일 필드 (Phase 1-b — docs/destination-architecture-design.md §3) ──
  // 87개 opt-in 등록 지점을 이 선언에서 파생하기 위한 뿌리. 전부 optional — 아직 소비자 없음.
  // Phase 1-c 에서 하드코딩 목록(SINGLE_DOSE_RABIES_DESTINATIONS 등)을 하나씩 파생으로
  // 교체하며 채운다. 매 교체마다 `pnpm lint:dest` 스냅샷 무변경으로 무동작을 증명.

  /** 규정 가족 — 카드 문구·서류·맡기기 템플릿의 기본값 한 벌을 상속(Phase 2~3). */
  archetype?: DestinationArchetype
  /** 광견병 접종 모델(횟수·일령·1년 백신 제한·간격). */
  rabies?: DestinationRabiesProfile
  /** 광견병 항체검사(입국용 필요성·유효기간·검사기관·대기). */
  titer?: DestinationTiterProfile
  /** 수입허가(사전 신청) — 존재 = 수입허가 카드 대상(태국·필리핀·호주 등). */
  importPermit?: {
    /** 출국 최소 N일 전 신청 마감. */
    applyDeadlineDays?: number
    /** 허가서 서류명(서류 탭 표기). */
    docName?: string
    /**
     * 보호자가 직접 온라인으로 신청하는 허가 — 대행 대상이 아니다(대만 APHIA e-permit).
     *
     * 태국(R.6)·필리핀(SPSIC)은 병원이 대행하므로 맡기기 상품 항목에 '수입허가증 신청'이
     * 들어가지만, 대만은 보호자가 웹사이트에서 직접 하므로 넣으면 안 된다(2026-07-19).
     * 여정 카드·서류 탭에는 그대로 노출된다 — 여기서 끄는 건 **맡기기 상품 항목**뿐.
     */
    selfApply?: boolean
    /**
     * 현지(목적국)에서만 신청 가능한 허가 — 한국 병원(로잔)이 대행할 수 없어 맡기기 상품
     * 항목에서 뺀다(selfApply 와 같은 효과, 다른 이유). 현지 등록 수입자·에이전시만 신청
     * 가능한 인도네시아(Barantin·농업부)·말레이시아(MAQIS)가 해당(2026-07-23).
     * selfApply(보호자 직접)와 구분 — 이쪽은 **현지 제3자/목적국 시스템**이 신청 주체다.
     * 여정 카드·서류 탭에는 그대로 노출된다 — 여기서 끄는 건 **맡기기 상품 항목**뿐.
     */
    localApplyOnly?: boolean
  }
  /** 도착 사전 통지 — 존재 = 사전 통지 카드 대상(아일랜드 24h·키프로스 48h 등). */
  advanceNotice?: {
    /** 도착 최소 N시간 전 하드 마감. */
    hardDeadlineHours?: number
    /** 카드 표기 라벨. */
    label?: string
  }
  /** 도착지 수입검역 — 카드 제목·계류 일수(중국 30일 등). */
  importQuarantine?: {
    title?: string
    quarantineDays?: number
  }
  /** 왕복 시 현지 수출검역. 'own-process' = 별도 검역 절차(일본), 'health-cert' = 증명서 발급형. */
  exportQuarantine?: {
    model?: 'own-process' | 'health-cert'
    docName?: string
  }
  /**
   * 펫무브워크 **신고 탭 '수입'·'수출' 칸이 이어지는 여정 카드** — 카드 id 하나만 적는다.
   * 상태 판정·저장 모델·필드는 전부 그 카드 선언에서 파생한다([[resolveReportBinding]]).
   *
   * ⛔ admin 안에 나라 분기를 다시 만들지 말 것 — 예전엔 read·write·폴백 세 벌의 손 명단이
   *   있었고, 명단에 없는 나라(하와이)는 신고 탭 '완료'가 앱 카드에 전혀 반영되지 않았다
   *   (2026-08-21). 선언이 없으면 그 칸은 운영자 수동값(by_dest 스코핑)으로만 남는다.
   *
   * 어느 카드를 걸지는 편집 판단이다 — 하와이처럼 '입국 신청'과 'CDC 신고'가 둘 다 신고인
   * 나라가 있어 카드에서 자동으로 고를 수 없다. 그래서 프로파일에 명시한다.
   */
  report?: {
    /** '수입' 칸과 이어질 카드 id (예: 'advance-notification', 'hi-import-declaration'). */
    importStep?: string
    /** '수출' 칸과 이어질 카드 id. 선언한 나라만 수출 칸이 뜬다(현재 일본 하나). */
    exportStep?: string
  }
  /**
   * 내원·임상검진 윈도우("출국일 포함 N일 이내"의 N — 기본 10).
   * 종 제한이 필요하면 배열로(촌충국 개 전용 4일 등). `VET_VISIT_WINDOW_OVERRIDES` 의 파생원.
   */
  vetVisitWindowDays?: number | Array<{ window: number; species?: SpeciesFilter }>
  /**
   * 종합백신 접종 후 출국까지 최소 대기(일). 저장 거부(validateGeneralVaccineEntryWait)와 그 나라
   * 주의 룰이 이 값을 공유. 광견병 rabies.entryWaitDaysAfterVaccine 의 종합백신판.
   * 예: 싱가포르 14·UAE 21·카자흐/러시아 20. (태국·필리핀 21은 아직 각 entry validator 내부.)
   */
  generalVaccineWaitDays?: number
  /**
   * 종합백신 면역 유효기간을 **1년만** 인정 — 2·3년 선택 저장 거부.
   * 광견병 `rabies.oneYearVaccineOnly` 의 종합백신판이고,
   * `GENERAL_VACCINE_ONE_YEAR_VALIDITY_DESTINATIONS` 의 파생원이다.
   */
  generalVaccineOneYearOnly?: boolean
  /** 펫무브 앱(포털) 목적지 화이트리스트 노출 여부. `APP_DESTINATIONS_KO` 의 파생원. */
  appSupported?: boolean
  /**
   * **편도만 있는 목적지** — 왕복 개념 자체가 없다(호주·뉴질랜드, 2026-07-27 사용자 확정).
   * 준비에 6개월 이상 걸리고 도착 후 계류까지 하는 이주형 이동이라 '갔다 오는' 케이스가 없다.
   *
   * 선언하면 세 곳이 함께 움직인다:
   *   · getTripType 이 저장값과 무관하게 'one_way' 를 돌려준다 → 왕복 전용 카드
   *     (현지 수출 검역·한국 수입 검역)가 getStepsForCase 에서 자동 제외된다
   *   · 항공권 카드의 귀국 항공권 입력 행이 사라진다(showReturn = tripType 파생)
   *   · 동물 상세의 '왕복·편도' 토글이 숨는다(선택할 게 없다)
   */
  oneWayOnly?: boolean
}

export const DESTINATION_OVERRIDES: Record<string, DestinationOverride> = {
  japan: {
    keywords: ['일본', 'japan'],
    // 신고 탭 — 수입=NACCS 사전 신고, 수출=일본 수출 검역 신청(왕복 전용 카드).
    report: { importStep: 'advance-notification', exportStep: 'jp-export-quarantine' },
    archetype: 'jp-2dose',
    rabies: { doses: 2 },
    titer: { entryValidityMonths: 24 },
    appSupported: true,
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
    archetype: 'eu-family',
    rabies: { doses: 1 },
    // EU 패밀리 입국용 항체검사는 부스터 chain 유지 시 무기한(null) — 만료 알림 없음.
    titer: { entryValidityMonths: null },
    appSupported: true,
    // 사전 통지 — gov.ie Advance Notice Portal, 입국 24시간(1영업일) 전까지.
    advanceNotice: { hardDeadlineHours: 24 },
    vaccines: ['rabies', 'rabies_titer', { key: 'internal_parasite', species: 'dog' }],
    // 촌충약(Echinococcus, praziquantel)은 규정상 개 전용 — 고양이는 면제(EU Reg 2018/772).
    extraFields: ['address_overseas', { key: 'deworming_time', species: 'dog' }],
    // 임상검사 창 = 기본 10일. 예전엔 촌충 동시 내원 가정으로 개 window=4 였으나, 촌충
    // 타이밍(법정 24~120h)은 촌충 카드의 저장 차단이 담당하므로 임상검사까지 좁힐 근거가
    // 없다 — 2026-07-25 사용자 확정, 몰타·노르웨이·핀란드·영국의 같은 선언도 함께 제거.
  },
  malta: {
    keywords: ['몰타', 'malta'],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    titer: { entryValidityMonths: null },
    appSupported: true,
    // 사전 통지 — servizz.gov.mt 포털, 입국 3영업일 전까지(영업일 기준이라 시간 필드 미지정).
    advanceNotice: {},
    vaccines: ['rabies', 'rabies_titer', { key: 'internal_parasite', species: 'dog' }],
    extraFields: ['address_overseas', { key: 'deworming_time', species: 'dog' }],
  },
  norway: {
    keywords: ['노르웨이', 'norway'],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    titer: { entryValidityMonths: null },
    appSupported: true,
    // 사전 통지 — Mattilsynet 이메일, 입국 48시간 전까지.
    advanceNotice: { hardDeadlineHours: 48 },
    vaccines: ['rabies', 'rabies_titer', { key: 'internal_parasite', species: 'dog' }],
    extraFields: ['address_overseas', { key: 'deworming_time', species: 'dog' }],
  },
  finland: {
    keywords: ['핀란드', 'finland'],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    titer: { entryValidityMonths: null },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer', { key: 'internal_parasite', species: 'dog' }],
    extraFields: ['address_overseas', { key: 'deworming_time', species: 'dog' }],
  },
  // 키프로스 — 촌충 요건은 없지만(RABIES_FREE_EU_MEMBERS 아님, TAPEWORM 도 아님) 48시간
  // 사전 통지(moa.gov.cy 공식) 카드가 별도라 eu 묶음에서 분리. eu 보다 먼저 매칭.
  cyprus: {
    keywords: ['키프로스', 'cyprus'],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    // NOTE: titer.entryValidityMonths 미선언 — 종전 TITER_ENTRY_VALIDITY_MONTHS 에도 키프로스만
    // 빠져 있었다(현행 유지). 다른 EU 패밀리처럼 null(무기한)로 선언할지는 별도 결정.
    appSupported: true,
    // 사전 통지 — 지구 수의검역국 이메일(moa.gov.cy), 입국 48시간 전까지.
    advanceNotice: { hardDeadlineHours: 48 },
    extraFields: ['address_overseas'],
  },
  // 포르투갈 — 절차는 표준 EU 그대로지만 **도착 48시간 전 DGAV 도착 통보(Aviso de Chegada)가
  // 의무**라 eu 묶음에서 분리(키프로스와 같은 사유). eu 보다 먼저 매칭.
  //   · 근거: dgav.pt "O MAIS CEDO POSSÍVEL (o máximo pelo menos 48 horas antes da chegada)"
  //   · 보호자/위임자가 직접 보내야 하고(운송사 대행 불가) 지정 PEV 주소 외로 보내면 무효.
  //   · 통지 없이 도착하면 검사가 지연·거부될 수 있고, 미비 시 반송까지 간다.
  portugal: {
    keywords: ['포르투갈', 'portugal'],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    titer: { entryValidityMonths: null },
    appSupported: true,
    advanceNotice: { hardDeadlineHours: 48 },
    extraFields: ['address_overseas'],
  },
  eu: {
    keywords: [
      '유럽연합', '프랑스', '독일', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
      '스웨덴', '덴마크', '폴란드', '체코', '그리스',
      '헝가리', '루마니아', '불가리아', '크로아티아', '슬로바키아',
      '슬로베니아', '리투아니아', '라트비아', '에스토니아', '룩셈부르크',
      'france', 'germany', 'italy', 'spain', 'netherlands', 'belgium', 'austria',
      'sweden', 'denmark', 'poland', 'czech', 'greece',
      'hungary', 'romania', 'bulgaria', 'croatia', 'slovakia',
      'slovenia', 'lithuania', 'latvia', 'estonia', 'luxembourg',
      'eu',
    ],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    titer: { entryValidityMonths: null },
    appSupported: true,
    extraFields: ['address_overseas'],
  },
  switzerland: {
    // 스위스는 EU 솅겐 가입국이지만 통관은 별도. AnnexIII + 스위스 전용 BLV 신청서(CH) 동시 제출.
    keywords: ['스위스', 'switzerland'],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    titer: { entryValidityMonths: null },
    appSupported: true,
    // 스위스 전용 BLV 수입허가 신청서(CH) — 수입허가 카드 대상.
    importPermit: {},
    extraSection: 'switzerland',
    extraFields: ['email', 'entry_date', 'entry_airport', 'entry_purpose', 'cropped'],
  },
  uk: {
    keywords: ['영국', '북아일랜드', 'uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland'],
    archetype: 'eu-family',
    rabies: { doses: 1 },
    titer: { entryValidityMonths: null },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer', { key: 'internal_parasite', species: 'dog' }],
    extraSection: 'uk',
    // 촌충약(Echinococcus)은 규정상 개 전용 — 고양이는 구충시간 미표시.
    extraFields: ['address_overseas', { key: 'deworming_time', species: 'dog' }],
  },
  // ── 호주 (DAFF) — 한국 = Group 3(광견병 발생하나 잘 관리되는 나라) ──────────
  // 1차 출처: agriculture.gov.au "How to bring your dog to Australia from a Group 3 country"
  //   + "Rabies vaccination and tests for cats and dogs coming to Australia" (2026-07-27 전문 확인).
  // 아키타입 = sea-permit(광견병 1회 + 수입허가 2단계 + 종합백신 + 도착 계류). 다른 점 셋:
  //   ① 항체 채혈 **전에** 검역관의 마이크로칩 인증을 받으면 계류가 30일 → 10일로 줄어든다(전용 카드).
  //   ② 180일 대기의 기준일이 채혈일이 아니라 **검체의 검사실 도착일**이다(괌 120일과 같은 모델).
  //   ③ 반려동물이 보호자와 같이 못 가고 **화물(manifested cargo)로 멜버른 공항에만** 도착한다.
  australia: {
    keywords: ['호주', 'australia'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // "given when the dog was at least 84 days old" (Group 3 개 가이드 4.2). 예전 au.ts 헤더의
      //   '최소 연령 DAFF 미명시'는 오독이었다 — 원문에 84일이 명시돼 있다(2026-07-27 정정).
      minAgeDays: 84,
      // DAFF 원문은 "at least **84 days** old"(주 단위 표현 없음). 84일 = 정확히 12주라
      //   표기만 다른 목적지(EU 패밀리·태국·싱가포르 등 12곳)와 같은 형태로 통일한다
      //   (2026-07-27 사용자 지정). 판정값(minAgeDays)은 원문 그대로 84.
      minAgeLabel: '생후 12주(84일)',
      // 3년 백신도 제조사 지침대로면 인정 — oneYearVaccineOnly 선언하지 않는다("Rabies vaccines
      //   that are valid for 3 years are acceptable if given according to the manufacturer's
      //   instructions"). 대신 **항체 채혈일부터 출국일까지 유효기간이 하루도 끊기면 안 된다**
      //   (끊기면 재접종 → 재채혈 → 180일 재시작).
      validityLine: '항체 검사 채혈일부터 출국일까지 면역 유효기간이 하루도 끊기면 안 돼요.',
      // ⚠️ '접종 후 3~4주 뒤 채혈'은 **권고**다(정기 접종견은 더 일찍 가능 — "Check with your
      //   vet"). titer.minDaysAfterVaccine 으로 선언하면 저장 거부가 되므로 선언하지 않는다.
    },
    titer: {
      need: 'entry',
      // "The RNATT sample must be taken between 12 months and 180 days before the date of export."
      //   유효기간은 채혈일 기준 12개월(365일), 대기는 검체 도착일 기준 180일 — 기준일이 서로 달라
      //   둘 다 관리해야 한다. 쓸 수 있는 창이 180일~12개월로 좁다(카드 문구가 둘 다 말해야 함).
      entryValidityMonths: 12,
      // 180일의 1일차 = **검체가 검사실에 접수된 날**("at least 180 days after the RNATT sample
      //   arrives at the laboratory"). 앱은 채혈일을 proxy 로 쓰되(채혈 ≤ 도착이라 less strict)
      //   basisReceivedDate 로 그 사실을 표시한다 — 괌(120일)·하와이와 같은 처리.
      entryWaitAfterTiter: { days: 180, basisReceivedDate: true },
    },
    // 'kennel'(켄넬코프) — **DAFF 입국 요건은 아니다**(권장 백신). 그런데 Mickleham 계류시설
    //   예약에 접종 증명을 요구해서 실무상 필요하다(2026-07-27 사용자 확정). 카드 노출은
    //   destinationsWithVaccine('kennel') 파생이라 이 한 줄이 곧 켄넬코프 카드 스위치다.
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'kennel', 'infectious_disease', 'internal_parasite', 'external_parasite'],
    // 종합백신 = **렙토스피라 Canicola** 요건(7.2)이 본체다. DHPP 등 나머지는 "recommended,
    //   not mandatory". Canicola 는 "administered between 12 months and 14 days before export"
    //   → 출국 14일 전 대기를 저장 거부의 진실 출처로 선언한다.
    // ⚠️ generalVaccineOneYearOnly 는 선언하지 않는다 — 12개월 상한은 Canicola 부스터 규정이고,
    //   같은 카드에 기록되는 DHPP 는 3년 제품이 실재해 2·3년 선택을 막으면 정상 기록을 거부한다.
    //   12개월 상한은 주의 룰(au.*)로 다룬다.
    generalVaccineWaitDays: 14,
    extraSection: 'australia',
    // sample_received_date 는 rabies_titer_records[].received_date 로 이동 (광견병 항체 검사 편집화면에 표시).
    extraFields: [
      'permit_no', 'id_date',
      'address_overseas',
      // 출국 항공편 — 화물(cargo)·멜버른 도착 고정이라 도착일·편명·공항·운송방법만.
      'entry_date', 'entry_flight_number', 'entry_departure_airport', 'entry_airport', 'entry_transport',
    ],
    // 최종검진·건강증명서 배서 = "Within 5 days before your dog's export date". DAFF 자체
    //   예제(출국 1/30 → 최소 1/25)가 **5일 전 당일을 허용**하는데, 이 값은 `daysBetween >= window`
    //   로 차단하므로 5를 넣으면 4일까지만 허용돼 규정보다 하루 엄격해진다 → 6.
    vetVisitWindowDays: 6,
    // DAFF BICON — 수입자 직접 신청 → 로잔 맡기기 '수입 허가 신청' 제외.
    //   확정 '출국 N일 전' 마감은 규정에 없다(허가 유효기간이 RNATT 만료일에 연동). 대신 심사가
    //   20~40영업일(최대 123영업일) 걸린다는 사실을 카드 문구로 안내한다 — 싱가포르와 같은 처리.
    importPermit: { selfApply: true },
    // ⚠️ importQuarantine.quarantineDays 는 선언하지 않는다 — 호주 계류는 마이크로칩 인증 여부로
    //   10일/30일이 갈려 숫자 하나로 적을 수 없다. 두 값은 도착 카드 문구가 함께 말한다.
    // 개·고양이 규정을 모두 확인하고(2026-07-27) 카드·검증·서류·사진까지 끝나 앱에 노출한다.
    appSupported: true,
    // 편도 전용 — 준비 6개월 + 도착 계류라 '갔다 오는' 여정이 없다(2026-07-27 사용자 확정).
    oneWayOnly: true,
  },
  // ── 뉴질랜드 (MPI) — 한국 = category 3(광견병 부재 또는 잘 관리되는 나라) ──────
  // 1차 출처(2026-07-27 전문 확인):
  //   · Import Health Standard: Cats and Dogs 2026 (CATSDOGS.GEN, 2026-05-12 발효 2026-07-01)
  //   · "Bringing your Dog to New Zealand — Dogs from category 3 countries" 지원문서·체크리스트
  //   ⚠️ 경과 규정 — 2026-07-01 ~ 2027-04-01 은 구 IHS(2021)로도 통관되지만, 앱은 **신 IHS 하나만**
  //     구현한다. 두 벌을 동시에 안내하면 어느 쪽을 따르는지가 흐려지고, 2027-04-01 이후엔 신
  //     기준만 남는다. 지금 준비를 시작하는 고객은 어차피 신 기준으로 준비해야 안전하다.
  // 아키타입 = sea-permit(광견병 1회 + 수입허가 + 도착 계류). 호주와 형제지만 다른 점 넷:
  //   ① 계류가 **무조건 최소 10일**이다(호주처럼 10/30 으로 갈리지 않는다). 대신 계류 예약
  //      확인서가 **수입 허가 신청 서류**라 예약이 허가보다 **앞**이다(호주는 반대).
  //   ② 항체 채혈 창이 출국 **3~12개월**(호주는 180일~12개월). 하한이 캘린더 3개월이다.
  //   ③ 광견병 **1차 접종은 출국 6개월 전**이라는 별도 하한이 있다(부스터는 면제) →
  //      결과적으로 개는 **출국 시 생후 9개월 이상**이 된다.
  //   ④ 마이크로칩 인증(pre-export identification check)이 **채혈 시점에 따라 1회 또는 2회**다.
  new_zealand: {
    keywords: ['뉴질랜드', 'new zealand', 'nz'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // IHS 2.1.3(2) — "when the animal was at least 12 weeks of age".
      minAgeDays: 84,
      minAgeLabel: '생후 12주(84일)',
      // IHS 2.1.3(2) — "The vaccination(s) must remain continuously valid until shipment."
      //   호주(채혈일~출국일)와 달리 기준 구간이 '출국일까지'다.
      validityLine: '출국일까지 면역 유효기간이 끊기지 않아야 해요.',
      // ⚠️ '1차는 출국 6개월 전'을 entryWaitDaysAfterVaccine 으로 선언하지 않는다 —
      //   그 필드는 **최근 접종일**을 보고 유효 부스터를 면제하는데, MPI 6개월은
      //   **1차(또는 만료 후 재접종)에만** 붙는 조건부 하한이다. nz.ts 전용 룰이 판정하고,
      //   저장 거부는 전용 함수 validateNzPrimaryRabiesWait(date-rules)가 항공권 출국일
      //   입력에서 같은 판정(findOperativeRabiesPrimary 공유)으로 차단한다(2026-08-01).
    },
    titer: {
      need: 'entry',
      // IHS 2.1.3(3) — "on a sample taken ... not less than 3 months and not more than
      //   12 months before the date of shipment, with a result of at least 0.5 IU/mL".
      //   구 IHS(2021)의 24개월 상한은 **폐지**됐다 — 구 nz.ts 룰이 24개월이었다(2026-07-27 정정).
      entryValidityMonths: 12,
      // 하한 3개월은 캘린더 기준(호주 180일과 달리 일수가 아니다) → months 로 선언해
      //   validateEuEntryDate 의 월 경로를 탄다.
      entryWaitAfterTiter: { months: 3 },
    },
    // 폐충(lungworm, Angiostrongylus vasorum) — **신 IHS 2026 에서 새로 들어온 항목**(2.4).
    //   내부구충과 시점(출국 전 5일 이내)만 같고 약이 다르다(구충약이 폐충까지 커버하지 않는
    //   경우가 많다). 구충 카드에 얹어 두면 '구충약 하나로 끝'으로 읽혀 별도 카드로 뗀다
    //   (2026-07-29 사용자 지정 — 심장사상충을 구충에서 뗀 것과 같은 처리).
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'kennel', 'infectious_disease', 'external_parasite', 'internal_parasite', 'heartworm', 'lungworm'],
    extraSection: 'new_zealand',
    extraFields: [
      // 수입 허가 번호 + 마이크로칩 인증일(호주와 같은 'id_date' 재사용 — 같은 사실이다).
      'permit_no', 'id_date',
      'address_overseas',
      // 출국 항공편 — 오클랜드·크라이스트처치 두 공항에만 도착할 수 있다(지원문서 Arrival).
      'entry_date', 'entry_flight_number', 'entry_departure_airport', 'entry_airport', 'entry_transport',
    ],
    // IHS 1.12 — "inspected by a veterinarian in the 2 days before the date of shipment".
    //   이 값은 `daysBetween >= window` 로 차단하므로 '2일 이내'는 3이 맞다(호주 5일 → 6과 같은 규칙).
    vetVisitWindowDays: 3,
    // MPI 온라인 수입허가 — 보호자·수입자가 직접 신청 → 로잔 맡기기 '수입 허가 신청' 제외.
    importPermit: { selfApply: true },
    // ⚠️ importQuarantine.quarantineDays 는 선언하지 않는다 — 읽는 곳이 없는 죽은 선언이다
    //   (lint-validation-wiring 3단계가 잡는다). 최소 10일(IHS 1.15(3)(a))은 도착 계류 카드
    //   문구·계류시설 예약 카드가 직접 말한다. 베트남 14일과 같은 처리.
    // 강아지 규정(카드·검증·서류·사진)까지 끝나 앱에 노출한다. 고양이는 별도 확인 예정.
    appSupported: true,
    // 편도 전용 — 호주와 같은 이유(2026-07-27 사용자 확정).
    oneWayOnly: true,
  },
  thailand: {
    keywords: ['태국', 'thailand'],
    // 신고 탭 수입 = 수입 허가(R.6) 신청 카드.
    report: { importStep: 'import-permit' },
    archetype: 'sea-permit',
    // 1회 접종 + "최근 접종 12개월 이내" 관례 — 1년 유효기간만 취급(다년 백신 실무상 미인정).
    rabies: {
      doses: 1,
      // **고정 84일(12주)** — 1차 출처 재검증 완료(2026-07-20). DLD AQS 안내 PDF 각주
      // "animal was at least 12 weeks old at the time of administration" + 태국 MFA PDF
      // (Rev. 30 Jan 2025) "at least 12 weeks old at the time of vaccination".
      // 1차 출처 어디에도 '3 months'·'84 days' 표현은 없다 — 전부 "12 weeks" 다.
      //
      // ⚠️ 이 값들은 **태국에선 읽히지 않는다.** 태국 카드는 seaPermitOverrides 가 만들고
      //   거기서 earliest 를 84일로 하드코딩한다(buildRabiesCard 를 안 탄다). 그래서 예전
      //   값(91일·달력 3개월)이 실제와 달라도 증상이 없었고, 2026-07-20 에 그걸 '저장 거부
      //   버그'로 오독하는 일이 벌어졌다. 실제 동작은 계속 84일이었다.
      //   읽히지 않아도 **프로파일은 규정의 기록**이라 실제 값으로 맞춰 둔다. minAgeMonths 는
      //   선언하지 않는다 — 12주는 달력 개월 규칙이 아니다.
      minAgeDays: 84,
      minAgeLabel: '생후 12주(84일)',
      oneYearVaccineOnly: true,
      validityLine: '면역 유효기간은 1년이에요. 3년 백신은 인정되지 않아요.',
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
    },
    appSupported: true,
    importPermit: {},
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
    // 신고 탭 수입 = 수입 허가(SPSIC) 신청 카드.
    report: { importStep: 'import-permit' },
    archetype: 'sea-permit',
    // 1회 접종 + "최근 접종 12개월 이내" 관례 — 태국과 동일(다년 백신 실무상 미인정).
    rabies: { doses: 1, oneYearVaccineOnly: true },
    appSupported: true,
    importPermit: {},
    vaccines: ['rabies', 'rabies_titer', 'general', 'internal_parasite'],
    extraSection: 'philippines',
    extraFields: [
      'address_overseas', 'postal_code', 'email',
      'passport_number', 'passport_expiry_date', 'entry_airport',
    ],
    rabiesTiterForReturnOnly: true,
  },
  // ── 인도네시아 — 태국 골격 복제(2026-07-22) 후 규정값 교체 완료:
  //   광견병 불활화·생후 3개월(Barantan 87/2016), 항체 = 입국 요건, 자카르타 한정 입국,
  //   접종 후 대기 미선언(1차 출처에 일수 규정 없음). 서류 서식명은 2026-07-23 Barantin 원문으로
  //   KH-11(수출)·KH-14(도착 반출) 교체(required-docs.ts). 병원 발급 일반 영문 건강증명서(VHC)
  //   는 cert-config-defaults 의 vhc 증명서 그대로 유지.
  indonesia: {
    keywords: ['인도네시아', 'indonesia'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // ✅ **생후 3개월**(2026-07-22 조사 확정). 인도네시아 외교부 공관 안내가 인용한
      //   Keputusan Kepala Barantan No. 87/Kpts/KR.120/L.1/1/2016 원문:
      //   "HPR telah divaksin dengan vaksin rabies **inaktif** di negara asal pada saat
      //   berumur **paling kurang 3 (tiga) bulan**" — 불활화 백신 지정이라는 점도 함께 확인.
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // ⚠️ **접종 후 대기 일수를 선언하지 않는다**(2026-07-22 조사 결론). 1차 출처에 일수
      //   규정이 없다. 태국 복제값 21일은 근거가 없어 제거했다. 시중의 '30일'·'3개월'은
      //   2차 자료이거나 '출발국 3개월 격리' 조항과 혼동된 것으로 보인다.
      validityLine: '광견병 예방접종 유효기간은 1년이에요.',
    },
    // ✅ **항체검사가 입국 요건**(2026-07-22 조사 확정 + 가이드 절차에 포함).
    //   87/2016 원문: "HPR telah memiliki titer antibodi protektif" + "Hasil uji titer
    //   antibodi protektif dilampirkan pada sertifikat kesehatan hewan"
    //   — 광견병 발생국·청정국 분기 **양쪽 모두**에 항체검사 요구가 들어 있다.
    //   태국 복제본의 'return-only'("인도네시아 입국에는 필요 없지만")는 사실과 반대였다.
    //   ⚠️ 수치 0.5 IU/ml 는 1차 출처에 숫자가 없다("protektif"로만) — 국제 관행값을 쓴다.
    //   ⚠️ 채혈 시점·결과 유효기간은 1차 출처에서 확인 실패 → 선언하지 않는다.
    titer: { need: 'entry' },
    appSupported: true,
    // 현지 등록 수입자·에이전시만 현지 신청 가능 → 로잔 맡기기 상품 '수입 허가 신청' 제외(2026-07-23).
    importPermit: { localApplyOnly: true },
    // 종합백신 제외(2026-07-23 사용자 결정) — 가이드상 입국 필수가 아니라 카드·프로파일 모두에서
    // 뺐다(태국·말레이시아는 필수라 포함). 광견병·항체만 남긴다.
    vaccines: ['rabies', 'rabies_titer'],
    // 가이드: "출국 직전(항공기 탑승 전 10일 이내)에 수의사에게 임상 검사" — 기본값과 같아
    // 선언하지 않는다(getVetVisitWindowDays 기본 10).
    extraFields: [
      'passport_number', 'passport_expiry_date', 'passport_issuer',
      'address_overseas',
      'entry_date', 'entry_time', 'entry_flight_number', 'entry_airport',
    ],
  },
  india: {
    // 'india' / '인도' 는 'indonesia' / '인도네시아' 의 부분문자열이므로
    // getDestinationOverride 의 substring 매칭에서 indonesia 가 먼저 잡히도록 반드시 그 뒤에 위치.
    keywords: ['인도', 'india'],
    vaccines: ['rabies', 'rabies_titer', 'general', 'civ', 'kennel', 'covid'],
  },
  // ── 튀르키예 — ⚠️ 카자흐스탄 한 벌 복제(2026-07-22). 수치는 아직 카자흐스탄 것 그대로다.
  //   나라별 규정 확정 후 수정 예정(사용자 지정 — "카자흐스탄 복사").
  //
  // ⚠️ **알려진 충돌 3건 — 세부 수정 때 가장 먼저 볼 것** (구세대 조사는 교체 전 tr.ts 헤더/git):
  //   ①**항체검사(RNATT)가 입국 요건이다.** 튀르키예는 한국을 EU 분류상 unlisted third
  //     country 로 보아 RNATT 를 요구한다(채혈 ≥ 접종+30일, 0.5 IU/ml, 출국 ≤ 채혈+1년).
  //     복제값 `titer.need:'return-only'` 는 "튀르키예 입국에는 필요 없지만 한국으로 돌아올
  //     때 필요해요"라고 안내한다 — **사실과 반대**다. 카드 문구까지 함께 고쳐야 한다.
  //   ②최소 접종 연령이 **생후 12주(84일, EU Reg 576/2013 일치)** 인데 복제값은 달력 3개월.
  //   ③접종 후 대기가 **30일**인데 복제값은 20일(카자흐스탄 EAEU 값).
  //   그 외 구세대 조사: 구충(외부·내부) 출국 전날, 핏불·도사·도고 아르헨티노·필라 수입 금지.
  //
  // `vetVisitWindowDays: 2` 와 `extraFields` 는 **유지한다** — 둘 다 TK 증명서(PDF 자동 채움)
  //   시스템에 묶여 있고 여정 카드 골격과 무관하다. 복제로 지우면 발급되는 증명서가 깨진다.
  turkey: {
    keywords: ['튀르키예', '터키', 'turkey', 'türkiye', 'turkiye'],
    rabies: {
      doses: 1,
      // 가이드: "생후 12주 이후에 접종" — EU Reg 576/2013 과 같은 값이라 달력 개월이 아니라
      // 고정 84일이다(카자흐스탄 복제본의 '달력 3개월'을 정정).
      minAgeDays: 84,
      minAgeLabel: '생후 12주(84일)',
      // ⚠️ 21일로 정정(2026-07-23). 구 값 30일은 **항체검사 채혈 시점**(접종 후 30일)이
      //   '출국 30일 전 접종'으로 흘러든 것이었다(사용자 지적). 튀르키예는 EU unlisted 제3국
      //   모델이라(아래 titer 주석) 우크라이나와 같은 EU 표준 21일을 쓴다. 어차피 신규 채혈
      //   경로에선 30(채혈)+90(대기)가 지배해 이 값이 실효적으로 걸리는 일은 없다.
      timingLines: ['출국 21일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 21,
      // 가이드 "1년을 넘지 않아야 합니다" = **접종 후 경과 1년** 제한이지 3년 백신 자체를
      // 거부하는 규정이 아니다. 그래서 oneYearVaccineOnly(입력 차단)를 켜지 않고,
      // tr.rabies-within-12months-of-departure 주의로만 다룬다.
      validityLine: '접종 후 1년이 지나기 전에 입국해야 해요.',
    },
    // ✅ 항체검사 = **튀르키예 입국 요건** (EU unlisted 제3국 모델, 우크라이나와 동일).
    //   ⚠️ 2026-07-23 재정비. 사용자가 튀르키예 농림부 공식 안내(vskn.tarimorman.gov.tr)를
    //   근거로 정정: 채혈은 **마지막 접종 후 30일 이후**, 출국은 **채혈일로부터 3개월 이후**.
    //   항체가는 **고정 만료 없음** — 백신 유효기간이 끊기지 않고 이어지는 한 계속 유효하다
    //   (EU 모델과 동일 → entryValidityMonths: null). 백신 연속성이 끊기면 재검사+3개월 대기.
    //   구 값(entryValidityMonths: 12·접종~채혈 30일 '권고'·채혈 후 대기 없음)은 2026-07-22
    //   재작성 때 "근거 부족"으로 EU 규칙을 뺀 것이었는데, 위 공식 출처가 그 규칙들을 되살린다.
    //   왕복이면 한국 APQA '채혈일 도착 전 24개월'이 별도로 걸린다(귀국 공통 룰이 담당).
    titer: {
      need: 'entry',
      minDaysAfterVaccine: 30,
      entryWaitAfterTiter: { months: 3 },
      entryValidityMonths: null,
    },
    appSupported: true,
    // 종합백신 제거(가이드에 항목 자체가 없음) + 내·외부 기생충 복원(가이드 "여행 30일 이내").
    // 기생충 카드는 catalog 명단에 turkey 가 원래 있었는데, 카자흐스탄 복제로 vaccines 에서
    // 빠져 **카드는 뜨는데 입력 필드가 없는** 상태였다(2026-07-22 정정).
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    importQuarantine: {},
    // 임상검사(Clinical Examination)는 출국 24시간 이내 — TK.pdf 각주 6. window=2 →
    // 출국일 기준 diff<2 = 전날(1)·당일(0)만 유효(=24시간 이내). 한국 수출검역도 동일 창.
    vetVisitWindowDays: 2,
    // TK.pdf: 현지 수령인 주소(Consignee address) = 해외주소, 항공편명(Flight number) =
    // Registration no./flight number 칸. 둘 다 상세페이지에서 입력받아 자동 채움.
    // (Place of Loading 는 인천공항 고정 default — pdf-field-mappings.json text_4qrwb 참고.)
    extraFields: ['address_overseas', 'entry_flight_number'],
  },
  usa: {
    keywords: ['미국', 'usa', 'united states', 'america'],
    archetype: 'generic',
    // 한국은 CDC의 광견병 고위험국 목록에 없으므로 미국 **연방** 입국 자체에는 개의 광견병
    // 접종증명·항체검사가 기본 요건이 아니다. 연방 요건은 생후 6개월·보편형 스캐너로 판독
    // 가능한 마이크로칩·CDC Dog Import Form 뿐이고, 고양이는 서류 자체가 없다.
    // https://www.cdc.gov/importation/dogs/rabies-free-low-risk-countries.html
    // https://www.cdc.gov/importation/dogs/dog-import-form-instructions.html
    // 광견병 백신·항체·임상검사·한국 수출/수입검역 카드는 **캐나다와 동일**하게 운용한다
    // (2026-07-26 사용자 지정).
    //
    // ⚠️ '미국 입국 때 면역 유효기간이 남아있어야 해요'(buildRabiesCard 자동 문장)는
    //   **연방 기준으로는 사실이 아니다** — 접종 자체를 요구하지 않기 때문이다(2026-07-26 조사).
    //   접종이 실제로 필요한 근거는 **주(州) 법**이다: 39개 주가 광견병 접종을 의무화한다.
    //   그래서 자동 문장을 끄고(omitEntryValidity) 카드 문구를 직접 지정한다
    //   (destination-overrides 의 usa['rabies-vaccine-1'] description — 사용자 확정 3줄).
    //
    // ⚠️ 최소 연령 '생후 3개월' 은 조사로 확정된 값이다(2026-07-26). 미국 백신 라벨은 제조사마다
    //   갈린다 — RABVAC 3(Elanco)·Defensor 3(Zoetis)는 "3 months of age or older",
    //   IMRAB 3(Boehringer)·Nobivac Rabies(Merck)는 "12 weeks of age or older".
    //   전국 지침인 NASPHV Compendium 은 "All dogs and cats should be vaccinated against rabies
    //   at 3 months of age", 한국 귀국 요건(USDA)은 90일이다. 3개월은 12주보다 엄격해서
    //   **모든 라벨·주법·한국 귀국 요건을 동시에 만족**한다 → 12주로 완화하지 말 것.
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
    },
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    importQuarantine: { title: '미국 도착 검사' },
    exportQuarantine: {
      model: 'health-cert',
      docName: 'USDA endorsed International Health Certificate',
    },
    extraSection: 'usa',
    extraFields: [
      'overseas_phone',
      'passport_number',
      'holder_birth_date',
      'entry_date',
    ],
    rabiesTiterForReturnOnly: true,
  },
  // ── 멕시코 (SENASICA / 현장 OISA) ──────────────────────────────────────
  // ✅ 1차 출처 확보(2026-07-20). SENASICA 공식 영문 PDF 전문 대조.
  //   https://www.gob.mx/cms/uploads/attachment/file/938779/ENG.Viajas_con_tu_mascota_a_M_xico-Requisitos_y_procedimientos_para_viajar_a_M_xico_con_tu_mascota.pdf
  //   입국 요건은 **건강증명서 하나**로 수렴하고, 그 안에 5개 항목이 들어간다:
  //   공무수의사(또는 면허 민간수의사) 발급 / 수출자·수입자 성명·주소 / 광견병 접종일과
  //   유효기간(**3개월 미만은 면제**) / 임상 건강 / **6개월 이내 내·외부 구충**.
  //   증명서는 **발급일로부터 15일** 유효. 수입허가 불요. 격리 없음. 검사 무료.
  //
  // ⚠️ **마이크로칩은 입국 요건이 아니다** — SENASICA 문서에 조항 자체가 없다(사용자 확정값과 일치).
  //   SENASICA 수출증명서 안내에서만 "en caso de que el país destino lo requiera"(목적지국이
  //   요구하는 경우) 조건부로 등장한다. 그런데 **멕시코→한국 귀국 때는 ISO 칩이 필수**다
  //   (한국 요건). 방향이 정반대라 룰·문구에서 반드시 구분할 것.
  mexico: {
    keywords: ['멕시코', 'mexico'],
    rabies: {
      doses: 1,
      // 원문은 "animals under 3 months of age are exempted" / "menores de 3 meses" —
      // **달력 3개월**이고 '91 days'라는 표현은 공식 문서에 없다.
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // ⚠️ **SENASICA 에는 접종 후 대기 규정이 없다.** 구 주석의 "SENASICA: 도착 전 ≥15일
      //   명시"는 1차 출처를 찾지 못했다(상업 사이트 단독). 30일은 한국 출국검역 쪽 근거이고
      //   사용자 확정값이라 유지한다 — 멕시코보다 엄격해서 지키면 문제되지 않는다.
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 30,
    },
    // 멕시코 입국엔 불요(SENASICA 요건 목록에 없음). 한국 귀국용으로만 뜬다 —
    // 멕시코는 한국 기준 광견병 비발생 지정지역이 아니라 귀국 시 항체검사가 필요하다.
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    // 격리 없음 — OISA 서류심사 + 임상 육안검사뿐이고 통상 즉시 통관, 검사 수수료도 무료.
    importQuarantine: {},
    rabiesTiterForReturnOnly: true,
  },
  // ── 카자흐스탄 (농업부 수의통제감독위원회) ────────────────────────────
  // ✅ 1차 출처 확보(2026-07-20). **카자흐스탄 독자 규정이 아니라 EAEU 통일 수의요건**이
  //   직접 적용된다 — 카자흐스탄은 EAEU **정회원**이다(우즈베키스탄은 옵서버라 자국 규정을
  //   쓰는 것과 대비된다). 러시아·벨라루스·키르기스·아르메니아와 조문이 동일하다.
  //   관세동맹위원회 결정 제317호(2010-06-18) 부속서 4 「Единые ветеринарные требования」
  //   **제15장**(모피수·토끼·개·고양이). 카자흐 법령DB 등재: adilet.zan.kz/rus/docs/H10T0000317
  //
  // 제15장 원문 핵심:
  //   "Не позднее чем за **20 дней** до отправки животных вакцинируют, если они не были
  //    привиты в течение последних **12 месяцев**:
  //    — всех плотоядных — против **бешенства** …
  //    — **собак** — против чумы плотоядных, гепатита, вирусного энтерита, парво- и
  //      аденовирусных инфекций, **лептоспироза**;
  //    — **кошек** — против **панлейкопении**"
  //   → ⚠️ **종합백신에도 광견병과 똑같은 20일/12개월 규칙이 걸린다.** 다른 목적지엔 없는
  //     구조다(태국·필리핀은 종합백신 기한이 광견병과 별도). 카드·검증을 만들 때 주의.
  //     개 = 사실상 DHPPL, 고양이 = 범백 단독(허피스·칼리시는 조문에 없다).
  //   다년 백신 **인정** — "срок поддержания иммунитета вакциной против бешенства,
  //     составляющий **более одного года**, не истек" (또는 0.5 МЕ/мл 실험실 입증).
  //   재접종은 직전 접종 유효기간 내여야 한다("в период действия предшествующей вакцинации").
  //   개인동반 **2두 이하는 수입허가·격리 모두 면제**, 국제 반려동물 여권이 수의증명서를 갈음.
  //   제3국(한국)발은 도착지에서 여권 재발급·전환 불요.
  //   항체검사는 입국 요건이 **아니다** — 0.5 IU/ml 는 다년 백신의 면역 지속 입증 대체수단.
  //
  // ⚠️ 마이크로칩 — **EAEU 제15장에 의무 조항이 없다.** 요구되는 건 '국제 여권'이지 칩이
  //   아니다. 다만 카자흐 국내법(「Об ответственном обращении с животными」 2021-12-30)이
  //   2023-09-01부터 개·고양이 등록·칩을 의무화했고(국가DB TANBA), **한국 귀국엔 ISO 칩이
  //   필수**다. 사용자 확정값 '칩 필수 O'는 유지하되 근거는 '입국요건'이 아니라
  //   **'카자흐 동물등록법 + 한국 귀국요건'** 이다. 문구를 쓸 때 입국 요건으로 단정하지 말 것.
  //
  // 확인 실패(추측으로 채우지 않은 것):
  //  - **광견병 최소 접종 연령 3개월** — 제15장에서 상반된 판독이 나왔다(3개월 미만 반입
  //    금지인지 허용인지). 사용자 확정값이라 유지하되 카자흐 1차 근거로는 인용 불가.
  //  - 출국 전 임상검사 기한 5일(구판) vs 14일(현행 추정) — adilet 원문 SSL 오류로 미확인.
  //    보수적으로 5일 운용이 안전하다(5일을 지키면 14일도 충족).
  //  - 금지 견종·마리수 2두의 개/고양이 합산 여부 — 근거 없음(합산 보수 운용 권장).
  // ✅ **마이크로칩 필수** — 사용자 확인(2026-07-22, 근거 40-49). `kz.microchip-before-rabies`
  //   룰이 다른 나라에서 복제된 게 아닌지 의심했으나 요건이 맞으므로 유지한다.
  // ✅ 광견병 **생후 3개월 / 출국 20일 전** — 같은 확인에서 재확정(아래 값과 일치).
  //   ⚠️ 러시아어 이주 대행 사이트들은 '입국 30일 전 접종'·'접종 시 생후 12주'·'입국 시
  //     생후 15주'로 쓴다(2026-07-22 검색). **2차 자료라 채택하지 않았다** — 채택하려면
  //     원문(제15장/40-49)에서 확인할 것. 지금 값이 더 이르게 접종하도록 요구하지 않으므로
  //     30일이 진짜면 우리 쪽이 느슨한 셈이라, 다음 조사 때 우선 확인 대상이다.
  kazakhstan: {
    keywords: ['카자흐스탄', 'kazakhstan'],
    // 종합백신 출국 20일 전(EAEU 제15장) — 저장 거부·주의 공용.
    generalVaccineWaitDays: 20,
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // 20일 = 제15장 원문값(사용자 확정값과 일치). 상업 사이트의 '21일'은 근거 불명이다.
      timingLines: ['출국 20일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 20,
    },
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer', 'general'],
    importQuarantine: {},
    rabiesTiterForReturnOnly: true,
  },
  // ── 러시아 — ⚠️ 카자흐스탄 한 벌 복제(2026-07-22). 수치는 아직 카자흐스탄 것 그대로다
  //   (생후 3개월·출국 20일 전). 나라별 규정 확정 후 수정 예정(사용자 지정 — "카자흐스탄 복사").
  //   ⚠️ **알려진 충돌**: 러시아 1차 출처는 **30일**이다(Rosselkhoznadzor "출국 30일 이상 ~
  //     12개월 이내"). 복제값 20일은 카자흐스탄(EAEU 제15장) 것이라 러시아 기준보다 느슨하다.
  //     두 나라 다 EAEU 회원이지만 러시아는 자국 안내로 30일을 별도 공표한다 — 세부 수정 1순위.
  //   구세대 조사값은 procedure-checks/ru.ts 헤더(교체 전 git 이력)에 있다: 광견병 12주·
  //   출국 30일~12개월, 다년 백신도 최종 접종 12개월 이내, 개인 1인 2마리 한도, RNATT 입국 면제.
  //   러시아 규정 창은 14일(2026-07-22 조사 — Rosselkhoznadzor "в течение 14 дней" 원문.
  //   5일설=EAEU 구버전/역내이동, 러시아 10일설=1차 출처 없음). 그러나 **한국 검역소(APQA)
  //   별지25 증명 규정이 10일**이라 실무 바인딩은 10일 — getVetVisitWindowDays 가 min(기본
  //   10, 선언) 이라 14 선언은 무효였고, 혼란 방지를 위해 선언 자체를 제거했다(2026-07-25
  //   사용자 확정: "러시아는 14일이지만 한국 검역소 규정이 10일이라 10일이 맞다").
  russia: {
    keywords: ['러시아', 'russia'],
    // 종합백신 출국 20일 전(EAEU 제15장) — 저장 거부·주의 공용.
    generalVaccineWaitDays: 20,
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      timingLines: ['출국 20일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 20,
    },
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer', 'general'],
    importQuarantine: {},
    rabiesTiterForReturnOnly: true,
  },
  uae: {
    // 표준 표기는 **아랍에미리트**(외교부 국가명·외래어 표기법). 화면에 나가는 문구는 전부
    // 이쪽으로 통일했다(2026-07-22). '아랍에미레이트'는 **검색 별칭으로만** 남긴다 —
    // 관용 표기라 그렇게 치는 고객이 많고, keywords 는 화면에 안 보인다. 표시 문구로 쓰지 말 것.
    keywords: ['아랍에미리트', '아랍에미레이트', 'uae', 'united arab emirates'],
    // 종합백신 출국 21일 전(MOCCAE) — 저장 거부·주의 공용.
    generalVaccineWaitDays: 21,
    // ⚠️ 항체검사 카드를 **띄우지 않는다**(2026-07-22 수정. 되돌리지 말 것):
    //   ①입국 요건 아님 — MOCCAE 는 한국을 저위험국(Low-risk)으로 분류해 RNATT 를 요구하지
    //     않는다(procedure-checks/ae.ts 헤더의 1차 출처).
    //   ②귀국 요건도 아님 — 아랍에미리트는 검역본부 **광견병 비발생국**이라 한국 재입국 시
    //     항체검사가 면제된다(isRabiesFreeOrigin).
    //   양방향 모두 불필요한데 `rabiesTiterForReturnOnly: true` 가 남아 있어, 왕복 케이스에서
    //   "한국으로 돌아올 때 필요해요"라는 **틀린 안내 카드**가 떴다.
    //   `vaccines` 의 rabies_titer 는 유지한다 — 이미 검사를 받아 기록해 둔 케이스의 값이
    //   펫무브워크에서 사라지면 안 된다(입력은 가능, 안내만 하지 않음).
    titer: { need: 'none' },
    // ── 필리핀 골격 복제(2026-07-22, 사용자 지정) ──────────────────────────────
    // 구조만 빌렸고 값은 아랍에미리트 것이다 — 근거는 procedure-checks/ae.ts 헤더(MOCCAE).
    // ⚠️ 필리핀에서 **가져오지 않은 것**:
    //   · rabiesTiterForReturnOnly — 위 주석대로 항체는 양방향 모두 불필요하다(비발생국).
    //   · oneYearVaccineOnly — MOCCAE 에 1년 백신 한정 명문이 없다(ae.ts '별도' 항목).
    //   · extraSection 'philippines' — 필리핀 전용 추가정보 화면이라 무관.
    archetype: 'sea-permit',
    rabies: {
      // ae.ts: 저위험국(한국)발은 12주 이상. 보수적으로 91일 AND 캘린더 3개월을 함께 본다.
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      timingLines: ['출국 21일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 21,
    },
    // MOCCAE 사전 발급 수입 허가(90일 유효) — 필리핀 SPSIC 자리에 대응한다.
    // MOCCAE 수입 허가는 **보호자가 온라인으로 직접 신청**한다 — 로잔이 대행하지 않으므로
    //   맡기기 상품 항목에서 뺀다(2026-07-26 사용자 확정). 카드 문구도 '온라인으로 신청해요'.
    //   여정 카드·서류 탭에는 그대로 뜬다 — 여기서 빼는 건 맡기기 항목뿐(대만·호주와 같은 처리).
    importPermit: { selfApply: true },
    vaccines: ['rabies', 'rabies_titer', 'general', 'external_parasite', 'internal_parasite'],
    extraFields: ['address_overseas', 'entry_airport'],
    // ✅ 앱 노출(2026-07-22) — 9단계 점검을 마치고 켰다. 위에 적어 뒀던 미완 항목은 전부 해소:
    //   룰 등급 승격 / 수입허가·도착검역·수출검역·광견병 체인 룰 신설 / 내부 기생충 카드 추가 /
    //   수출 절차 강제 확인(MOCCAE 건강증명서 필수) / 서류·사진·공항 예시 등록.
    // ⚠️ 알림은 **의도적으로 비워 뒀다** — 수입 허가에 신청 마감일이 없어 마감 알림·발급 완료
    //   푸시를 만들지 않기로 확정(사용자 2026-07-22). reminders.ts·milestone-pushes.ts 주석 참고.
    appSupported: true,
  },
  // ── 싱가포르 (NParks/AVS — Schedule III) ────────────────────────────
  //   한국 = Schedule III(광견병 위험국). 확정 출처: NParks/AVS "Importing dogs and cats"
  //   (2026-06-18 갱신). Schedule I(호주·뉴질랜드·아일랜드·영국)·II(일본·미국·EU 다수·홍콩·
  //   스위스 등)에 없는 모든 나라가 Schedule III. 핵심: 입국 항체(RNATT) + 도착 후 AQC
  //   **30일 의무 격리** + 도착 시 광견병 재접종. sea-permit 골격(수입 허가 + 도착 검역 카드)에
  //   인니식 입국 항체를 얹었다. 광견병 비발생국이라 귀국 시 한국 항체검사는 면제(항체=입국용).
  singapore: {
    keywords: ['싱가포르', 'singapore'],
    archetype: 'sea-permit',
    // 편도 전용(2026-07-27 사용자 확정) — 호주·뉴질랜드와 같은 처리.
    //   구 sg-export-quarantine(왕복 전용 카드)은 도달 불가라 2026-08-01 제거
    //   (au·nz 카드·룰도 함께 — 조사 내용은 git history 참조). 왕복 지원 전환 시 되살릴 것.
    oneWayOnly: true,
    // 종합백신 출국 14일 전(Schedule III IV(a)(iv)(v)) — 저장 거부·주의 공용.
    generalVaccineWaitDays: 14,
    rabies: {
      doses: 1,
      // ✅ 규정 기준 = 생후 12주(84일). NParks Schedule III 조건 PDF: 광견병은 "제조사 권장"
      //   (라벨 통상 12주) + 유일한 연령 요건 "animal must be at least 12 weeks of age at the
      //   time of export". 태국·필리핀과 동일 기준으로 통일(구 91일 AND 3개월은 규정보다
      //   엄격한 과보수값이었다, 2026-07-24 원문 재확인).
      minAgeDays: 84,
      minAgeLabel: '생후 12주(84일)',
      validityLine: '입국 때 면역 유효기간이 남아있어야 해요.',
    },
    // ✅ 항체검사(RNATT) = 싱가포르 **입국 요건**. 접종 28일 후 채혈, 출국 90일 전·12개월 이내,
    //   0.5 IU/ml 이상. (NParks Schedule III IV(a)(iii)) 채혈 후 90일 대기 → 입력 차단 blocker.
    // 채혈 후 대기 = **정확히 90일**(NParks "not less than 90 days prior to export"). days 선언은
    //   validateEuEntryDate 의 TITER_ENTRY_WAIT_DAYS 로 자동 하드 차단된다(대만 180일과 달리
    //   '단순 하한'이라 전용 함수 불필요). sg.ts 주의 룰(departure-min-90days)도 90일로 일치.
    titer: {
      need: 'entry',
      minDaysAfterVaccine: 28,
      entryWaitAfterTiter: { days: 90 },
      entryValidityMonths: 12,
    },
    appSupported: true,
    // 수입 허가(Licence to Import Non-Food Animals) — 보호자가 GoBusiness 온라인 직접 신청.
    //   확정 '출국 N일 전' 마감 없음(90일 유효) → 마감 리마인더·발급 푸시 미등록(사용자 지정).
    importPermit: { selfApply: true },
    vaccines: ['rabies', 'rabies_titer', 'general', 'external_parasite', 'internal_parasite'],
    vetVisitWindowDays: 7,
    extraFields: [
      'passport_number', 'passport_expiry_date', 'passport_issuer',
      'address_overseas',
      'entry_date', 'entry_time', 'entry_flight_number', 'entry_airport',
    ],
  },
  // ── 홍콩 (AFCD — 어농자연호리서) ──────────────────────────────────────────
  // 아키타입 = sea-permit(태국·필리핀). 광견병 1회 + 종합백신 + 수입허가(Special Permit) 2단계
  //   + 도착 검역. 다른 점은 **항체검사가 왕복 어느 쪽에도 없다**(아래 titer 주석)는 것과
  //   **반려동물이 보호자와 같이 못 가고 화물(manifested cargo)로만 간다**는 것.
  // 1차 출처 = AFCD DC-02v05 Permit Terms(Group II, Jun-2025) — 전문은 procedure-checks/hk.ts 헤더.
  hongkong: {
    keywords: ['홍콩', 'hong kong', 'hongkong'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // DC-02v05 11(c) "In the case of primary vaccination the animal was at least 90 days
      //   old when it was vaccinated" — 규정값 그대로 90일(보수 91일+캘린더 3개월은 규정보다
      //   과잉이라 쓰지 않는다. 이스라엘 2026-07-25 정리와 같은 판단).
      minAgeDays: 90,
      minAgeLabel: '생후 90일',
      // "not less than 30 days and not more than 1 year prior to export" —
      //   30일 = 접종 후 입국 대기(저장 거부 validateRabiesEntryWait 가 이 값을 파생),
      //   1년 = 유효기간 1년만 인정(2·3년 백신 선택 차단).
      entryWaitDaysAfterVaccine: 30,
      oneYearVaccineOnly: true,
    },
    // ⚠️ 항체검사 카드를 **띄우지 않는다**(2026-07-22 수정. 아랍에미리트와 같은 사유·되돌리지 말 것):
    //   ①입국 요건 아님 — AFCD 는 한국을 Group II 로 분류하고 이 그룹은 RNATT 가 면제된다
    //     (procedure-checks/hk.ts 헤더의 1차 출처 DC-02v05).
    //   ②귀국 요건도 아님 — 홍콩은 검역본부 **광견병 비발생국**이라 한국 재입국 시 면제.
    //   `vaccines` 의 rabies_titer 는 기록 보존을 위해 유지(입력 가능, 안내만 하지 않음).
    titer: { need: 'none' },
    // DC-02v05 11(d) "not less than 14 days and not more than 1 year before export" —
    //   저장 거부(validateGeneralVaccineEntryWait)와 hk.ts 주의가 이 값을 공유.
    generalVaccineWaitDays: 14,
    // "not more than 1 year" 는 광견병 11(c)와 같은 절대 상한이라 종합백신도 1년만 인정한다
    //   (VC-DC2 (f) "not less than 14 days and not more than 1 year before coming into Hong
    //   Kong"). 광견병 rabies.oneYearVaccineOnly 의 종합백신판 — 3년 백신 저장 거부.
    generalVaccineOneYearOnly: true,
    appSupported: true,
    // Special Permit(AF240) — **해외에서 신청할 수 없다.** 홍콩 현지에서 신청비 납부와 동시에
    //   접수해야 해서 보호자는 현지 대리인(운송 에이전시)을 지정한다(펫무브 가이드 + AFCD
    //   "permit will not be sent by email or fax"). 인도네시아·말레이시아와 같은 이유로
    //   맡기기 상품 항목에서는 제외 — 여정 카드·서류 탭에는 그대로 노출된다.
    importPermit: { localApplyOnly: true },
    // 도착 24시간 전 통보 — DC-02v05 1항(Import & Export Section 당직자에게 업무시간 내 통보).
    advanceNotice: { hardDeadlineHours: 24 },
    vaccines: ['rabies', 'rabies_titer', 'general'],
    extraFields: [
      'passport_number', 'passport_expiry_date', 'passport_issuer',
      'address_overseas',
      'entry_date', 'entry_time', 'entry_flight_number', 'entry_airport',
    ],
  },
  // ── 하와이 (HDOA 동물검역소 — 5-Day-Or-Less / Direct Airport Release) ────
  // ⚠️ **일본(jp-2dose) 복제**(2026-07-24). 하와이는 섬 검역 + 광견병 2회 평생 + FAVN 항체
  //   필수라 일본과 같은 규정 '가족'이다. 복제 후 하와이 규정으로 세부값 조정 예정(사용자).
  //   규정값 출처 = procedure-checks/hi.ts(HDOA Checklist 1) + www 하와이 가이드.
  //   ⚠️ 일본에 있으나 하와이엔 **없어 복제하지 않은 것**:
  //     ①수출검역(미국은 반려동물 수출검역 절차가 없음) ②NACCS 사전신고(일본 전용 시스템).
  //     왕복 귀국은 공용 '한국 입국검역' 카드가 처리한다.
  //   ⚠️ extraSection 은 'hawaii' 유지 — AQS-279 서식 PDF 자동채움·섬(island) 매핑이
  //     hawaii_extra 에 묶여 있어 'japan' 으로 바꾸면 발급 서식이 깨진다.
  hawaii: {
    keywords: ['하와이', 'hawaii'],
    // 신고 탭 수입 = 하와이 입국 신청(AQS·HIPOP) 카드. CDC 신고(us-cdc-dog-import-form)도
    //   같은 자리의 '신고' 지만, 하와이 주(州) 검역 신청 쪽이 신고 탭이 추적하는 절차다.
    report: { importStep: 'hi-import-declaration' },
    archetype: 'jp-2dose',
    // 광견병 = 평생 2회(1차 + 부스터). 31일 간격·출국 31일 전·미만료는 hi.ts 가 검증.
    // 최소 연령 = hi.ts 보수 기준(생후 91일 AND 캘린더 3개월). buildRabiesCard 가 카드 문구·
    //   earliest 잠금을 이 값에서 파생. 하와이는 최소 연령을 고정하지 않고 백신 라벨을 따르는데
    //   (HAR §4-29-8.1), 라벨이 제품별로 12주(래비신)/3개월(디펜서)로 갈려 더 보수적인 3개월을
    //   택했다 — 카드·경고 문구 모두 '3개월'로 통일(2026-07-25 사용자 확정).
    // doseIntervalDays 31 = HDOA "more than 30 days apart"(≥31). 저장 거부(validateRabiesInterval)가
    // 이 값을 파생해 hi.rabies-doses-31days-apart 주의와 일치(예전엔 블록 30·주의 31로 하루 어긋남).
    rabies: { doses: 2, minAgeDays: 91, minAgeMonths: 3, minAgeLabel: '생후 3개월', doseIntervalDays: 31 },
    // 진드기(external_parasite) 처치 = 도착 14일 이내 필수(HDOA Checklist 1 Step 6 #4, hi.ts).
    //   ⚠️ 내부구충(internal_parasite)은 HDOA 요건이 아니라 제거했다 — 일본 복제 때 '기존 유지'로
    //   딸려온 잔재였고, 내부구충 카드 applicability 에도 하와이는 없어 필드만 떠 있는 어긋난
    //   상태였다(2026-07-25 사용자 확정 — HDOA는 진드기만 요구).
    vaccines: ['rabies', 'rabies_titer', 'external_parasite'],
    // FAVN 항체 = 하와이 **입국 요건**. 검체 lab 수령일 기준 출국 30일~36개월(hi.ts) → 유효 36개월.
    //   entryWaitAfterTiter.days:30 = 채혈 후 30일 대기 → 입국일 저장 거부(validateEuEntryDate
    //   제네릭이 TITER_ENTRY_WAIT_DAYS 로 자동 파생 + client·server 양쪽 커버). 싱가포르 90일과
    //   같은 자리 — 전용 함수 손수 배선 대신 프로파일 한 줄로 선언한다(2026-07-25).
    titer: {
      need: 'entry',
      entryValidityMonths: 36,
      // 기준일은 검체 수령일(앱 미입력) — 계산 날짜 미표시. days:30 은 채혈일 proxy 하한.
      entryWaitAfterTiter: { days: 30, basisReceivedDate: true },
    },
    appSupported: true,
    extraSection: 'hawaii',
    extraFields: [
      // 도착 검역(공항 동물검역소) 예약·완료 — 일본 jp_import_quarantine_date 대응.
      'hi_import_quarantine_date',
      // 출국 항공편 (한국 → 하와이)
      'departure_flight_date', 'entry_date', 'entry_departure_airport',
      'entry_airport', 'entry_flight_number', 'entry_time', 'entry_transport',
      // 귀국 항공편 (하와이 → 한국)
      'return_date', 'return_flight_number', 'return_departure_airport', 'return_arrival_airport', 'return_transport',
      // 하와이 AQS-279 서식·연락 (PDF 자동채움 — 유지 필수)
      'address_overseas', 'postal_code', 'email', 'overseas_phone',
      'passport_number', 'passport_expiry_date', 'passport_issuing_country', 'holder_birth_date',
    ],
  },
  // ── 괌 (Guam DOAG Animal Health — 미국령 광견병 청정지역) ────────────────
  // ✅ 1차 출처 확보(2026-07-26):
  //   - DOAG Animal Health 안내 — https://doag.guam.gov/animal-health-animal-control/
  //   - DOAG Pet Import Brochure(REV 08/09/2024) — 서류 체크리스트 표·면제지역 원문
  //     https://doag.guam.gov/wp-doag-content/uploads/2025/08/AH-PET-IMPORT-BROCHURE-FINAL-REV08092024.pdf
  //   - Guam Customs(CQA) 수입 요건 — 계류 4종·FAVN 기준·120일 기산점
  //     https://cqa.guam.gov/pet-import-requirements-3/
  //
  // **한국 = Non-Exempt(International)**. 면제지역은 호주·영국제도·하와이·일본·뉴질랜드뿐이고
  //   (브로슈어 EXEMPT AREAS 표), 그 지역도 120일 이상 거주해야 면제다. 한국은 해당 없음.
  //
  // 계류 4종(CQA) 중 한국 출발이 노릴 수 있는 건 **Calculated Quarantine** 하나다:
  //   · Full 120-day    — FAVN 없이 상업시설 120일. 평생 2회 접종 증명만.
  //   · Calculated      — FAVN 0.5 IU/mL 이상. "The day that the laboratory receives the
  //                       OIE-FAVN sample counts as the first day for the 120-day countdown."
  //                       입국 시점에 120일 중 남은 일수만 상업검역.
  //   · 5 Days or Less  — **미국 본토·군 시설 출발 전용**(FAVN 1.0 IU). 한국 해당 없음.
  //   · Exempt          — 위 5개 지역 120일 이상 거주. 한국 해당 없음.
  //   → 그래서 앱은 '채혈 후 120일'을 하와이(30일)와 같은 구조로 잡되, **도착해도 계류가
  //     0일이 되는 게 아니라 남은 일수만큼 계류**라는 점이 다르다. 카드 문구가 이걸 말해야 한다.
  //
  // 광견병(CQA): "at least two rabies vaccinations in its life prior to release from commercial
  //   quarantine, and the most recent rabies vaccination must still be current" — 평생 2회 이상.
  //   최근 접종은 release 기준 365일 이내(승인된 3년 백신은 36개월).
  //   ⛔ 최소 연령·접종 간격은 **선언하지 않는다** — 2020년 구 지침에는 '생후 3개월 + 1개월 후
  //      2차'가 있었으나 현행 브로슈어·CQA 어디에도 없다. 근거 없는 엄한 기준은 갈 수 있는
  //      사람을 막는다(몽골 3년백신·이스라엘 91일 정리와 같은 판단). 확인되면 그때 넣을 것.
  //
  // 종합백신(브로슈어 REQUIRED DOCUMENTS 4항): 개 = DHLPP + Bordetella / 고양이 = FVRCP.
  // 수입허가: Animal Entry Permit, $65/마리($60 permit + $5 license), **도착 30일 전 제출**
  //   ("must be submitted at least 30 days prior to the intended arrival date", 14일 미만은
  //   처리 보장 불가 → 장기 계류·입국 거부 위험). 브로슈어 FAQ 는 2~3개월 전 제출 권장.
  //   제출은 quarantine@doag.guam.gov 이메일. 검역시설 예약확인서가 신청 서류에 포함된다.
  // 개는 CDC Dog Import Form + 생후 6개월 이상(2024-08-01 시행) — 미국·하와이와 같은 카드 공유.
  //   한국은 CDC 고위험국이 아니라 Foreign Rabies & Microchip Form 은 불필요(브로슈어 표).
  guam: {
    keywords: ['괌', 'guam'],
    // 하와이와 같은 골격 — 광견병 2회 + 입국 항체 + 도착 계류(미국령 청정지역 공통).
    archetype: 'jp-2dose',
    // 최소 연령·접종 간격은 사용자 확정값(2026-07-26) — 현행 DOAG 공개자료에는 없고 2020년
    //   세부지침과 펫무브 www 가이드에만 있던 값이라 한 번 보류했다가, 사용자가 확정해 선언한다.
    rabies: { doses: 2, minAgeMonths: 3, minAgeLabel: '생후 3개월', doseIntervalDays: 30 },
    vaccines: ['rabies', 'rabies_titer', 'general', 'kennel', 'external_parasite', 'internal_parasite', 'heartworm'],
    titer: {
      need: 'entry',
      // 채혈이 아니라 **검사실 검체 도착일**이 120일의 1일차다(CQA 원문). 앱은 채혈일을 proxy 로
      // 쓰되 basisReceivedDate 로 그 사실을 표시한다 — 하와이 FAVN 과 같은 처리.
      entryWaitAfterTiter: { days: 120, basisReceivedDate: true },
      // 직전 광견병 접종 후 10일 — **저장 거부의 진실 출처**(TITER_MIN_DAYS_AFTER_VACCINE 파생).
      //   이 선언이 없으면 주의(gu.rnatt-after-rabies-10days)만 뜨고 입력은 그대로 저장된다
      //   — 실제로 접종 다음날 채혈이 저장됐다(2026-07-27 사용자 발견). 모로코·우크라이나가
      //   같은 이유로 차단이 빠져 있던 전례(2026-07-20)와 같은 함정이다.
      minDaysAfterVaccine: 10,
      // 12개월 = 사용자 확정(2026-07-26). www 괌 가이드의 "검사 유효기간은 1년" 과 같은 값이고,
      //   gu.ts 헤더에 있던 36개월(하와이 값 혼입)은 폐기했다.
      //   ⚠️ 대기 120일 + 유효 12개월이라 **쓸 수 있는 창이 120일~12개월**로 좁다. 채혈이 너무
      //   일러도 만료된다 — 카드 문구가 둘 다 말해야 한다.
      entryValidityMonths: 12,
    },
    // 종합백신·켄넬코프 출국 10일 대기 — **저장 거부의 진실 출처**(GENERAL_VACCINE_WAIT_DAYS
    //   파생). 이 선언이 없으면 주의(gu.general-vaccine-10days-before-arrival)만 뜨고 입력은
    //   그대로 저장된다 — 항체 10일이 같은 이유로 비어 있던 것과 같은 함정(2026-07-27).
    generalVaccineWaitDays: 10,
    // Animal Entry Permit — 보호자가 DOAG(quarantine@doag.guam.gov)에 직접 이메일로 제출한다.
    //   **로잔이 대행하지 않으므로 맡기기 상품 항목에서 뺀다**(2026-07-27 사용자 확정 — 괌은
    //   CDC 신고를 제외하면 대행하지 않는다). 여정 카드·서류 탭·마감 알림은 그대로 유지된다
    //   — 여기서 빼는 건 '대신해 드려요' 목록뿐(대만·아랍에미리트와 같은 처리).
    importPermit: { applyDeadlineDays: 30, docName: 'Animal Entry Permit', selfApply: true },
    // 레시피상 **마지막에 켠다** — 카드·검증·서류·사진이 모두 끝난 뒤(2026-07-26).
    //   이 플래그가 켜져야 항공권 카드(APP_SUPPORTED_DESTINATION_KEYS 파생)가 붙는다.
    appSupported: true,
  },
  // ── 브라질 (MAPA 규정 / VIGIAGRO 현장) ────────────────────────────────
  // ✅ 1차 출처 확보(2026-07-20). **Portaria MAPA nº 741, de 10/12/2024**(DOU 2024-12-12)가
  //   현행이고 구 Instrução Normativa 5/2013 은 **폐지**됐다(Art. 2º). MERCOSUL GMC RES.
  //   20/24 를 편입한 것이라 조문이 "Estados Partes" 표현을 쓰지만, MAPA 가 이걸 전체 입국
  //   근거·CVI 서식으로 게시하고 있어 제3국(한국)에도 적용된다.
  //   https://www.gov.br/agricultura/pt-br/assuntos/vigilancia-agropecuaria/animais-estimacao/portaria-mapa-no-741_2024-caninos-e-felinos-domesticos-1.pdf
  //
  // ⚠️ **코드가 브라질 입국 요건과 한국 귀국 요건을 뒤섞고 있었다**(2026-07-20 조사에서 발견).
  //   ①마이크로칩 — MAPA 영문 안내 원문 "A pet microchip is **not required** to enter Brazil."
  //     Art. 17 은 "쓸 거면 ISO 11784/11785 여야 한다"는 조건부일 뿐이다. 반면 **브라질→한국
  //     귀국 때는 ISO 칩이 필수**다. 방향이 반대다.
  //   ②접종 후 경과일 — 브라질 입국은 **21일**(Art. 10, 1차 접종에 한함). 코드의 30일은
  //     한국 귀국 요건("não inferior a 30 dias")이 흘러든 값이다.
  //
  // 규정값(Portaria 741/2024):
  //   Art. 9º  입국 시점 **90일 이상**이면 광견병 접종 필수, 백신은 유효기간 내
  //            ("dentro do seu período de vigência" — 다년 백신도 라벨 유효기간대로 인정)
  //   Art. 10  1차 접종은 **21일** 경과 후 출발 허용. 유효기간 만료 후 미재접종도 1차로 간주
  //   Art. 11  90일 미만은 미접종 입국 가능(수의당국이 CVI 에 증명)
  //   Art. 13  CVI **발급일 전 15일 이내** 내·외부 광범위 구충
  //   Art. 14  CVI **발급일 전 10일 이내** 임상검사
  //   Art. 6º  CVI 유효 **60일**(광견병 접종이 유효한 동안)
  //   → 구충·임상검사 기준일이 **출국일이 아니라 CVI 발급일**이다. CVI 가 최대 60일 유효라
  //     둘이 크게 벌어질 수 있다(procedure-checks/br.ts 의 기준일 주석 참고).
  //   항체검사 조항은 전문에 **없다**(sorologia/titulação 부재) → 입국 불요.
  //   수입허가 불요. 격리 조항 없음. 유럽 펫패스포트는 브라질에 무효.
  //   CVI 는 **정부 배서 필수** — "Certificates signed only by a private veterinarian are
  //   not accepted" → 한국은 APQA 배서.
  brazil: {
    keywords: ['브라질', 'brazil'],
    rabies: {
      doses: 1,
      // ⚠️ 원문은 "*접종* 최소 연령"이 아니라 "**입국 시점** 90일 이상이면 접종 필수"다.
      //   우리 모델엔 입국 시점 기준 면제 분기가 없어, 접종 최소 연령 90일로 근사한다.
      //   90일 미만 무접종 입국(Art. 11)은 지원하지 않는 셈 — 케이스가 생기면 분기 추가할 것.
      minAgeDays: 90,
      minAgeLabel: '생후 90일',
      timingLines: ['출국 21일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 21,
    },
    // 브라질 입국엔 불요. 한국 귀국용으로만(귀국 시 0.5 IU/mL 이상, 채혈 후 24개월 이내).
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    importQuarantine: {},
    rabiesTiterForReturnOnly: true,
  },
  china: {
    // 한국 = GACC 비지정 국가 → 광견병 항체 검사 필수.
    keywords: ['중국', 'china'],
    archetype: 'jp-2dose',
    // GACC 실무상 1년 라이선스 백신만 인정(2·3년 거부) — cn.rabies-only-1year-vaccine 와 같은 기준.
    // 1·2차 간격 30일은 하드 차단 없이 권고만(2026-07-17 순서만 유지 결정).
    rabies: {
      doses: 2,
      minAgeDays: 91,
      minAgeLabel: '생후 91일',
      oneYearVaccineOnly: true,
      doseIntervalDays: 'soft',
      validityLine: '면역 유효기간은 백신의 종류에 상관없이 1년이에요.',
    },
    // GACC 실무상 RNATT 입국용 채혈일 기준 1년(cn.rnatt-valid-1year-on-arrival 와 동일).
    titer: { entryValidityMonths: 12 },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
  },
  taiwan: {
    // APHIA(2023 BAPHIQ에서 개칭) — 광견병 1회(생후 90일·불활화만·유효 1년) + RNATT ≥0.5 IU/ml
    // (채혈일 + 180일~1년 사이 도착 = 격리 면제 핵심 조건) + 수입허가증(도착 20일 전까지 신청.
    // 격리 면제는 채혈 180일 조건에 더해 ①120일 전 신청 또는 ②검사기관·수출국 검역기관이
    // APHIA 로 보고서 직송 — 문답집 1150310, 2026-08-04 확인). 개·고양이 동일 요건.
    // APHIA Form 002 Import permit number 입력용으로 permit_no 추가정보 노출.
    // (Certificate number 는 후처리 수기 입력 — EQC No. 라벨이 일본 전용이라 공유하지 않음.)
    // 규정 상세·출처는 procedure-checks/tw.ts 헤더 주석.
    keywords: ['대만', 'taiwan'],
    // 신고 탭 수입 = 수입 허가(APHIA e-permit) 신청 카드.
    report: { importStep: 'import-permit' },
    // minAgeDays 를 두지 않는다 — 베트남 규정은 일수가 아니라 '생후 3개월(달력)'이고,
    // 판정은 카드의 earliest.monthsAfter + date-rules meetsCalendarAge 가 담당한다.
    rabies: {
      doses: 1,
      minAgeDays: 90,
      minAgeLabel: '생후 90일',
      oneYearVaccineOnly: true,
      vaccineTypeLine: '불활화(사독) 백신만 인정돼요.',
      validityLine: '면역 유효기간은 1년이에요.',
    },
    titer: { entryValidityMonths: 12, entryWaitAfterTiter: { days: 180 } },
    vaccines: ['rabies', 'rabies_titer'],
    extraFields: ['address_overseas', 'permit_no'],
    // APHIA pet e-permit — 로잔이 대행한다(2026-08-03 사용자 지정). selfApply 플래그의 유일한
    //   기능은 '맡기기 상품에서 제외'라, 대행하는 이상 붙여 둘 이유가 없어 뗀다.
    //   (여정 카드·서류 탭·발급 푸시는 이 플래그와 무관하게 종전 그대로.)
    importPermit: {
      // 120 → 20 (2026-08-04): 120일은 마감이 아니라 격리 면제 경로 중 하나 — 배지·주의·알림 전부 20일 기준.
      applyDeadlineDays: 20,
      docName: '수입 허가증(Import Permit)',
    },
    appSupported: true,
  },
  // ── 말레이시아 — ⚠️ 태국 한 벌 복제(2026-07-22). 세부 값은 아직 태국 것 그대로다.
  //   나라별 규정 확정 후 수정 예정(사용자 지정 — "태국 복사 후 나라별로 세부 수정").
  //   복제 전 구세대 조사값(DVS: 종합백신 필수·RNATT 면제·수입허가·계류장 14일 전 예약·
  //   도착 후 7일 격리·건강증명서 7일 창)은 git 이력(이 항목 + procedure-checks/my.ts 구버전) 참고.
  malaysia: {
    keywords: ['말레이시아', 'malaysia'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // ✅ 최소 연령 = **달력 3개월**("Ensure the age of your pet is above 3 months old",
      //   DVS Procedure PDF). 이건 접종 최소 연령이 아니라 **반입 시 동물 나이** 요건이지만,
      //   1회 접종국이라 이 카드가 그 게이트를 겸한다. 구 84일(태국 복제 보수값)은 일수라
      //   낀 달에 89~92일로 흔들려 3개월을 지킨 케이스를 막았다 → 달력 개월로 교체
      //   (2026-07-23, 카자흐스탄·멕시코와 같은 처리).
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // ✅ **광견병 = 불활화 백신, 출국 30일 전** — 2026-07-23 재조사로 확정. DVS R2 Non-Scheduled
      //   규정을 여러 독립 자료가 일치 인용("inactivated … at least 30 days before departure").
      //   구 주석의 '규정 PDF엔 없다'는 걱정 해소. (공식 PDF 는 스캔형이라 직독은 못 했다 —
      //   1차 원문 대조가 가능해지면 최종 확인할 것.)
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 30,
      validityLine: '입국 때 면역 유효기간이 남아있어야 해요.',
    },
    // 가이드: "말레이시아 입국 시 광견병항체검사는 필수가 아니지만, 한국으로 돌아오는 경우는 필수"
    // + "말레이시아에는 광견병항체검사 기관이 없기 때문에 … 한국에서 미리 해두시는 것을 권장".
    titer: { need: 'return-only' },
    appSupported: true,
    // 현지 등록 에이전시만 현지 신청 가능(한국 신청 불가) → 로잔 맡기기 '수입 허가 신청' 제외(2026-07-23).
    importPermit: { localApplyOnly: true },
    vaccines: ['rabies', 'rabies_titer', 'general'],
    // 가이드: "출국 직전(항공기 탑승 전 7일 이내)에 수의사에게 임상 검사" + "수출동물검역은
    // 대부분 10일 이내지만 말레이시아는 7일 이내". 태국 복제 때 지웠던 값을 되살렸다.
    vetVisitWindowDays: 7,
    extraFields: [
      'passport_number', 'passport_expiry_date', 'passport_issuer',
      'address_overseas',
      'entry_date', 'entry_time', 'entry_flight_number', 'entry_airport',
    ],
    rabiesTiterForReturnOnly: true,
  },
  // ── 모로코 (ONSSA — 국경검역소 PIF 16개소) ────────────────────────────
  // ✅ 1차 출처 확보(2026-07-20). ONSSA 공식 증명서 **양식 원본**을 직접 판독했다.
  //   한국 전용 수입 양식은 없고 **"Other Countries" 양식**이 적용된다:
  //   **I.CT.CN.JUIL.2025**(2025년 7월판) — onssa.gov.ma/wp-content/uploads/2025/07/Certificat-sanitaire-valide.pdf
  //
  // 양식 조항 원문:
  //   3항 "identified with permanent mark, **prior to** their vaccination against rabies"
  //   4항 "vaccinated against rabies **with inactivated vaccine**, and **at least 21 days
  //        have elapsed after the primary rabies vaccination**"
  //   5항 "Will be exported for a period **more than 12 months**; **Or** … **temporarily for
  //        a period less than 12 months**, and have been submitted to a blood sample … **at
  //        least 30 days after the previous rabies vaccination** … **of at least 0.5 IU/ml**"
  //   서명란 "Le vétérinaire officiel / Official veterinarian" + "Cachet officiel" → 정부 배서 필수.
  //
  // ⚠️ **입국 대기는 21일이다(30일 아님).** 구 주석·구 룰의 30일은 "ONSSA EU 양식 운용 표준"
  //   이라고만 적혀 있었고 양식 원문에는 21일뿐이다. 30일은 **항체검사 채혈 시점**(접종 후
  //   30일) 조건이 대기일로 흘러든 것으로 보인다. 두 숫자는 서로 다른 조항이다.
  //
  // ⚠️ **항체검사가 조건부다** — 5항은 양자택일이고 **12개월 초과 체류(영구 이주)를 고르면
  //   항체검사 조항이 삭제된다.** EU 양식(2023)·구 제3국 양식(2021)에서도 같은 구조가
  //   독립 확인됐다. 그럼에도 우리는 **need:'entry'(무조건 필수)로 둔다** — 왕복이면 모로코
  //   **출국** 양식(E.CARNI.CoréeSud.Juin.2015)이 항체검사를 무조건 요구하고, 한국 귀국에도
  //   필요해서 실무상 안 받는 선택지가 없다. 체류기간 분기를 넣을 만한 실익이 없다.
  //
  // 참고 — '항체검사 후 3개월 대기'는 **폐기된 구 규정**이다. 2021년판 아랍어 양식에는
  //   "수출 전 3개월 초과 12개월 미만 시점 채혈"이 있었으나 2025년 7월판에서 "접종 후 최소
  //   30일"로 대체됐다. 상업 사이트가 아직 3개월을 인용하는 건 stale 이다(사용자 확정값 일치).
  //
  // 금지 견종(확정) — ONSSA Avis au Public N°590(2021-02-09), 공동령 n°1677.18(2018-07-18):
  //   pitbull(Staffordshire Bull Terrier·American Staffordshire Bull Terrier), boerbull(Mastiff),
  //   Tosa → "l'importation de ce type de chiens au Maroc est **interdite**".
  // 도착 — 서류·동일성·임상 검사 후 통관, 검사 수수료 **10 디르함/두**. 격리 규정은 미발견
  //   (없다고 명시한 문구도 없다 — '규정 미발견'이 정확한 표현).
  //
  // 확인 실패(추측으로 채우지 않은 것):
  //  - **입국 방향 최소 접종 연령** — ONSSA 수입 양식에 연령 규정이 **없다**. 사용자 확정값
  //    3개월은 모로코→한국 **수출** 양식 제목("THREE MONTHS OLD AND MORE")이 근거다.
  //  - 접종 후 **상한**(12개월설)·다년 백신 인정 여부·입국용 항체 유효기간 — 전부 근거 없음.
  //  - 수입허가 필요 여부 — 영사 안내는 CITES 종만 언급, APHIS 2차 인용은 필요하다고 함(미대조).
  //  - 1항 "광견병 비발생국에서 출생 또는 최근 6개월 체류" 서약 — 한국은 청정국이 아니라
  //    APQA 수의사가 서명 가능한지 사전 확인이 필요하다(문서상 실재하는 리스크).
  morocco: {
    keywords: ['모로코', 'morocco'],
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      vaccineTypeLine: '불활화(사독) 백신만 인정돼요.',
      timingLines: ['출국 21일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 21,
    },
    titer: {
      need: 'entry',
      // 채혈은 접종 후 30일 경과 후(양식 5항). 채혈 후 대기는 **없다** — 우크라이나와 갈리는 점.
      minDaysAfterVaccine: 30,
    },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    importQuarantine: {},
  },
  // 1차 정부 영문 자료 부분 공개 패밀리 — USDA APHIS / 한국 QIA 정부 2차 안내·운용 룰 의존
  //
  // ⚠️ 아래 4국(몽골·우즈베키스탄·캄보디아·캐나다)은 **베트남 골격을 그대로 복제**한 것이다
  //   (2026-07-20 사용자 지정). 여정 카드·검증 룰·서류 구성이 베트남과 동일해야 한다는 전제로,
  //   사용자가 확인해 준 4개 델타(마이크로칩 필수 여부 / 광견병 최소 일령 / 입국 대기일)만
  //   나라별로 다르다. 3년 백신 불인정·도착 격리 14일 같은 **베트남 고유 규정값은 복제된
  //   상태**이며 나라별 개별 검토에서 정정할 예정이다 — 지금 "규정과 다르다"고 올리지 말 것.
  // ── 몽골 (GASI — General Agency for Specialized Inspection) ───────────
  // ✅ **한국 APQA 공식 안내문을 1차 근거로 확보했다** (2026-07-20 조사).
  //   「개·고양이 국가별 검역조건 — 몽골」 2024-04-30 개정판 PDF.
  //   목록 https://www.qia.go.kr/livestock/qua/list93webQiaCom.do (몽골 = id 60618)
  //   안내문 https://www.qia.go.kr/livestock/qua/downloadwebQiaCom.do?id=47407
  //   §1.2 검역조건 표 원문값:
  //     검역증명서 필수(출국 전 10일 이내) / 마이크로칩 **필수**(ISO 호환) / 광견병 **필수**
  //     (최소 12주령 이상, 입국 30일 이전) / 기타 백신 불필요 / **광견병 항체가 검사 불필요**
  //     / 사전수입허가 **불필요** / **입국 후 계류 불필요** / 기생충 처치 불필요
  //     / 기타: **반드시 Chinggis Khaan 국제공항을 통해 입국**
  //   → 도착 카드에 '격리'를 쓰면 안 되고(계류 불필요), 항공권 카드에 지정공항을 써야 한다.
  //
  // ⚠️ APQA 안내문 자체가 "해당 국가의 검증을 받은 공식 정보가 아니며 정확하지 않을 수
  //   있음"이라고 밝히고 있다. GASI(ssia.gov.mn) 원문은 접근 실패라 최상위 근거는 아니지만,
  //   상업 사이트보다 훨씬 상위이고 우리가 확보한 최선의 근거다.
  mongolia: {
    // 칩 필수 O → *.microchip-before-rabies 룰 보유(광견병 카드에 칩 선행 문구가 파생된다).
    keywords: ['몽골', 'mongolia'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // **달력 3개월을 쓴다 — 사용자 결정(2026-07-20).** APQA 안내문은 '최소 12주령'(84일)
      // 이지만 3개월을 유지한다. 펫무브 www 가이드가 '생후 3개월령 이후'이고, 실제 사례
      // 기준으로 그쪽이 맞다는 판단이다.
      //
      // ⚠️ 이 값은 **저장 거부까지 파생한다**(step.earliest → portal validateRabiesPrimeAge
      //   → getSaveBlockError). 알고 택한 트레이드오프다:
      //     - APQA 값(12주=84일)이 맞다면, 84~90일에 접종한 케이스는 적법한데도 접종일
      //       **입력이 거부된다.** 그 케이스를 만나면 이 값을 84일로 낮출 것.
      //     - 반대로 3개월이 맞는데 84일로 낮추면 미달 케이스를 조용히 통과시킨다.
      //   근거 상태: APQA 안내문(2024-04-30, 직접 확인) '12주령' vs www 가이드·구버전이
      //   인용한 USDA APHIS('3 months of age', 이번 조사에서 접근 실패로 미검증) 충돌.
      //   GASI(ssia.gov.mn) 1차 원문은 확보하지 못했다. 2차 출처 둘이 엇갈리는 상태다.
      //
      // ✅ **2026-07-21 재확인 — 3개월 유지로 결정(사용자).** 충돌을 알고 택한 값이다.
      //   다시 "APQA 는 12주인데 왜 3개월이냐"로 올리지 말 것. 84~90일 접종 실제 케이스가
      //   나타나면 그때 84일로 낮춘다.
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // ⚠️ oneYearVaccineOnly 를 **선언하지 않는다** (2026-07-20, 캄보디아·우즈벡과 같은 조치).
      //   APQA 표의 광견병 조건은 '최소 12주령'과 '입국 30일 이전' 두 줄뿐이고 **최대 유효기간
      //   행 자체가 없다**(상한을 두는 나라는 안내문에 명시된다). 12개월 상한을 말하는 유일한
      //   출처는 PetTravel.com(상업)이다. 결정적으로 **몽골 제출용 별지 제25호서식의
      //   '면역유효기간(Validity)' 란이 ☐1Y ☐2Y ☐3Y 체크박스**라, 3년 백신 기재가 서식
      //   차원에서 정상 지원된다. 3년 백신을 거부할 근거가 없다.
      //   validityLine 도 뺐다 — 유효기간 상한을 따지지 않으므로 할 말이 없다.
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 30,
    },
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    // 계류 일수를 **선언하지 않는다** — APQA 표 '입국 후 계류: 불필요'.
    importQuarantine: {},
    rabiesTiterForReturnOnly: true,
  },
  // ── 우즈베키스탄 (수의·축산개발국가위원회 — vetgov.uz) ────────────────
  // ✅ **1차 출처를 확보한 나라다** (2026-07-20 전수 조사). 캄보디아와 정반대 상황.
  //   국가수석수의검사관 결정 제04호(2014-02-28) 「수의(위생) 요건」 55p 원문 —
  //   https://vetgov.uz/upload/docs/vet-trebovanie.pdf
  //   **제15장** = 모피수·토끼·개·고양이 반입 요건(개·고양이 소관 조항).
  //   보조: lex.uz 제148호(2023-04-10) 제13조 — 개인동반 2두 이하 사전허가 면제 재확인
  //   https://lex.uz/ru/docs/6427764
  //
  // 제15장에서 확인된 핵심 두 가지:
  //  ①**항체검사를 일절 요구하지 않는다.** 55p 전문 기계 검색 결과 титр(역가)·нейтрализ
  //    (중화)·МЕ/мл(IU/ml)·FAVN·RNATT **전부 히트 0**. антител(항체)의 유일한 1건은 제17장
  //    **영장류** 조항(라사·에볼라·HIV)이라 개·고양이와 무관하다.
  //    → titer.need='return-only' 가 옳다. 구버전의 '입국 필수·유효 1년'은 **근거 없는 오설정**
  //      이었다. 되돌리지 말 것.
  //  ②**개인동반 2두 이하는 허가·격리가 모두 면제된다.** 원문:
  //    "Допускается ввоз собак и кошек, перевозимых для личного пользования в количестве
  //     не более 2-х голов, **без разрешения на ввоз и карантинирования** …"
  //    → 도착 카드에 '지정 시설 격리'를 쓰면 안 된다(베트남에서 복제된 문장이었다).
  uzbekistan: {
    // 칩 필수 O — 단, **공식 규정에는 마이크로칩 언급이 0회다.** 펫무브 www 가이드가
    // "마이크로칩 삽입이 필수입니다"라고 명시하고 사용자가 확인해 준 델타라 유지한다
    // (실무상 한국 수출검역 동물등록·귀국 항체검사에도 필요하다). 공식 근거는 없다는 점만
    // 기록해 둔다 — 나중에 '입국 요건'으로 단정하는 문구를 쓰지 말 것.
    keywords: ['우즈베키스탄', 'uzbekistan'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // ⚠️ oneYearVaccineOnly 를 **선언하지 않는다** (2026-07-20, 캄보디아와 같은 '(가) 완전 제거').
      //   공식 제15장에는 백신 '유효기간' 개념 자체가 없다. blocker 의 출처를 추적하면 상업
      //   사이트의 "30 days ~ 12 months prior" 한 줄뿐이고, 그건 검증 룰 근거로 쓰지 않는다.
      //   blocker 는 저장을 거부해 우회가 안 되므로 근거 없이 재접종을 강요하고 있었다.
      // validityLine 은 남긴다 — 펫무브 www 가이드에 "유효기간은 1년입니다"가 명시돼 있다.
      //   안내는 하되 3년 백신 입력을 막지는 않는다는 뜻이다.
      validityLine: '면역 유효기간은 1년이에요.',
      // 공식은 "출발 14일 전 접종(최근 6개월 내 접종력이 있으면 면제)"으로 30일보다 느슨하다.
      // 가이드·사용자 확인 델타인 30일을 유지한다 — 공식보다 보수적이라 안전하고, 30일을
      // 지키면 14일 요건은 자동 충족된다. (원문: "Не позднее, чем за 14 дней до отправки")
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 30,
    },
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    // 계류 일수를 **선언하지 않는다** — 개인동반 2두 이하는 공식 규정상 격리 면제다(위 ②).
    importQuarantine: {},
    rabiesTiterForReturnOnly: true,
  },
  // ── 베트남 (DAH Cục Thú y) ──────────────────────────────────────────
  // 태국·필리핀 골격(1회 접종 + 항체는 귀국용)이지만 **수입허가가 없다**:
  //  ①Thông tư 01/2026 제14조 — 동반 2마리 이하는 **사전 절차가 없다**. 수입허가도,
  //    출국 전 신고도 불요. 원문: "khai báo kiểm dịch nhập khẩu **trực tiếp tại Cơ quan kiểm
  //    dịch động vật cửa khẩu**" → 도착 공항 검역소 현장 신고.
  //  ②광견병 1회, 출국 30일 이상~12개월 이내, 3년 백신 불인정
  //  ③항체검사는 DAH 의무 아님 — 한국 귀국용만(rabiesTiterForReturnOnly)
  //  ④요건 충족 시 무격리, 미충족 시 도착 후 14일
  //  ⑤지정 입국공항 4곳(SGN·HAN·CXR·DAD), 견종 제한(Pit Bull·Tosa·Dogo Argentino)
  // 규정 상세·출처는 procedure-checks/vn.ts 헤더.
  vietnam: {
    keywords: ['베트남', 'vietnam'],
    archetype: 'sea-permit',
    // 1회 접종 + 3년 백신 불인정(USDA APHIS·미 대사관 일치). vn.rabies-only-1year-vaccine 이
    // blocker 로 이미 강제 중 — 프로파일에도 선언해 파생 경로를 맞춘다.
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      oneYearVaccineOnly: true,
      validityLine: '면역 유효기간은 1년이에요. 3년 백신은 인정되지 않아요.',
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
      // 구 VN_RABIES_WAIT_DAYS 상수 — 프로파일로 올려 저장 거부·주의 룰이 함께 파생된다.
      entryWaitDaysAfterVaccine: 30,
    },
    // 입국 요건 아님 — 한국 귀국용(need:'return-only' = rabiesTiterForReturnOnly 와 같은 의미).
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    // 도착 검역 — 요건 충족 시 무격리, 미충족 시 14일.
    importQuarantine: { quarantineDays: 14 },
    rabiesTiterForReturnOnly: true,
  },
  // ── 아르헨티나 — ⚠️ 베트남 한 벌 복제(2026-07-22). 세부 값은 아직 베트남 것 그대로다
  //   (달력 3개월·30일 대기·1년 백신만·미충족 시 14일 격리). 나라별 규정 확정 후 수정 예정
  //   (사용자 지정 — "베트남 복사 후 세부 수정").
  //   복제 전 구세대 조사값(SENASA, git 이력 procedure-checks/ar.ts 구버전 참고):
  //   광견병 3개월(90일)·1차 후 21일 권장(보수 30일)·유효기간 제조사 라벨(1년 제한 근거 없음)·
  //   건강증명서 CVI 10일 이내·CVI 60일 유효·내외부 구충 15일 이내·**수입허가 불요·격리 없음**·
  //   RNATT 귀국용·종합백신 의무 아님·칩 SENASA 의무 부재.
  argentina: {
    keywords: ['아르헨티나', 'argentina'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // ⚠️ SENASA 원문에는 **최소 접종 연령 규정이 없다**(2026-07-22 조사). 있는 것은
      //   "3개월 **미만**이면 접종 없이 입국 가능(연령 증명 + 90일 광견병 무발생 증명)"이라는
      //   **면제 조항**이다 — "3개월 전 접종은 무효"가 아니다. 지금 값은 카자흐스탄/베트남
      //   골격에서 온 보수값으로, 규정보다 엄격하다. 완화 여부는 사용자 확인 대상.
      //   원문: "Si el perro o gato es menor de 3 (tres) meses, la autoridad veterinaria
      //   deberá certificar la edad del animal y que el mismo no ha estado en ninguna
      //   propiedad donde ha ocurrido algún caso de rabia urbana en los últimos 90 días…"
      //   → **3개월 유지 확정**(2026-07-23 사용자, 보수값이지만 그대로). 다시 묻지 말 것.
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // ✅ **21일**(2026-07-22 SENASA 원문 확인, 사용자 지정 "조사결과 반영"). 30일이 아니다.
      //   원문: "Cuando se trate de animales vacunados por primera vez, la vacuna debe haber
      //   sido aplicada al menos 21 (veintiún) días previos al ingreso a la República Argentina."
      //   ⚠️ 두 가지 주의: ①기준점이 출국일이 아니라 **아르헨티나 입국일** ②**1차 접종에만**
      //   적용되고 유효기간이 이어지는 재접종은 대기 없음(violatesRabiesEntryWait 의 유효
      //   부스터 면제가 이 구조와 맞는다).
      //   ⚠️ 펫무브 www 가이드는 아직 '30일'이라 적혀 있다 — 웹사이트 갱신 필요(사용자 보고).
      timingLines: ['출국 21일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 21,
      // ⚠️ `oneYearVaccineOnly` 를 **켜지 않는다**(2026-07-22 조사로 제거). SENASA 는 제조사가
      //   부여한 유효기간을 그대로 인정한다 → **3년 백신 인정**. 베트남 복제로 켜져 있던
      //   blocker 는 근거가 없었다. 원문: "…con inmunidad vigente según el plazo de validez
      //   otorgado por el laboratorio fabricante de la vacuna."
    },
    titer: { need: 'return-only' },
    appSupported: true,
    // ✅ 내·외부 구충 추가(2026-08-02 사용자 지시). SENASA 원문: "Tratamiento contra
    //   parásitos internos y externos dentro de los 15 (quince) días previos a la fecha de
    //   emisión del CVI" — 브라질과 같은 구조(증명서 발급일 앵커)라 같은 창을 쓴다.
    vaccines: ['rabies', 'rabies_titer', 'external_parasite', 'internal_parasite'],
    // 격리 없음(SENASA·가이드: 미충족 시 입국 불가·격리 규정 없음) — 베트남 복제 잔재
    // importQuarantine: { quarantineDays: 14 } 제거(2026-07-23). quarantineDays 는 렌더되지도
    // 않던 죽은 값이라 표시엔 영향 없지만, 프로파일이 규정과 어긋나 있어 정리.
    rabiesTiterForReturnOnly: true,
  },
  // ── 캄보디아 (GDAHP — MAFF) ────────────────────────────────────────────
  // ⚠️ **1차 출처가 사실상 없는 나라다** (2026-07-20 전수 조사).
  //   GDAHP 공식 사이트(gdahp.maff.gov.kh)는 DNS 조회부터 실패하고, USDA APHIS 국가 페이지도
  //   한국 APQA 수출국가별 검역조건 목록도 캄보디아를 담고 있지 않다. 시중 숫자(3개월·30일·
  //   12개월)는 전부 상업 펫이동업체 사이트에서만 나오고 서로 베낀 문장이다.
  //   → 요건의 출처는 **펫무브 www 가이드(실제 이동 사례 기반)** 다. 공식 자료가 없는 상황에서
  //     이게 최선의 근거다(사용자 지정 2026-07-20).
  //   확보한 유일한 1차 출처 = WOAH 아시아 워크숍(2023-12) GDAHP 공무원 발표자료:
  //     "There are no animal quarantine stations in Cambodia but we have animal checkpoints"
  //     https://rr-asia.woah.org/app/uploads/2023/12/4-3-cambodia_practices-of-internation-trade.pdf
  //     → 격리시설이 없다. 도착 카드에 '지정 시설 격리'를 쓰면 안 된다.
  cambodia: {
    // 칩 필수 X → 베트남처럼 *.microchip-before-rabies 룰을 두지 않는다(칩 카드 자체는 공통).
    // 최소 일령은 **고정 91일**(사용자 지정) — 몽골·우즈벡·캐나다의 달력 3개월과 다르다.
    keywords: ['캄보디아', 'cambodia'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeLabel: '생후 91일',
      // ⚠️ oneYearVaccineOnly 를 **선언하지 않는다** (2026-07-20 사용자 결정 '(가) 완전 제거').
      //   베트남에서 복제될 때 딸려온 값인데 근거가 어디에도 없다 — 캄보디아 정부 자료 없음,
      //   펫무브 가이드 언급 없음, 상업 사이트는 오히려 "다년 백신도 접종 후 12개월 이내면
      //   유효"라는 다른 주장. blocker(저장 거부)라 근거 없이 재접종을 강요하고 있었다.
      //   validityLine 도 함께 뺐다 — 유효기간을 따지지 않으므로 할 말이 없다.
      //   (카드의 '캄보디아 입국 때 면역 유효기간이 남아있어야 해요'는 buildRabiesCard 기본선.)
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 30,
    },
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    importQuarantine: { quarantineDays: 14 },
    rabiesTiterForReturnOnly: true,
  },
  // ── 캐나다 (CFIA 제정 / CBSA 국경 집행) ──────────────────────────────
  // ✅ **1차 출처가 가장 충실한 나라다** (2026-07-20 조사). CFIA 결정트리의 콘텐츠 원본
  //   노드를 직접 열어 앵커별 원문을 추출했다(Date modified 2026-07-02).
  //   https://inspection.canada.ca/en/node/7059  (진입점 /en/importing-food-plants-animals/pets)
  //
  // 한국의 지위 — 분기 결정에 필수:
  //  - CFIA **광견병 청정국 목록에 없다**(호주·피지·핀란드·아이슬란드·아일랜드·일본·뉴질랜드·
  //    스웨덴·영국 9개국뿐).
  //  - CFIA **개 광견병 고위험국 목록에도 없다**(중국·북한·베트남은 등재, 한국 부재).
  //  → 한국 = '비청정국이지만 고위험국은 아님'. 개 dog-per-a8-rabies / 고양이 cat-dom-a3-rabies.
  //
  // 확정된 사실:
  //  - **필요 서류는 광견병 접종증명서 하나뿐이다.** 별도 건강증명서·정부 배서·수입허가 없음.
  //    원문: "When you arrive in Canada you'll need the following: a valid rabies vaccination
  //    certificate; and the dog appears healthy and meets humane transportation requirements"
  //  - **항체검사 불요**(접종 불가 동물의 면제 신청 경로에만 등장) → titer.need='return-only'.
  //  - **마이크로칩 불요**(개인 반려견·반려묘 모두). 상업 카테고리 8개월 미만 개만 필수.
  //    원문: "Canada does not require a microchip or tattoo identification for domestic dogs
  //    imported as personal pets or domestic cats"
  //  - **접종 후 대기 0일.** CFIA 원문 어디에도 최소 경과일 요건이 없다(21일·30일설은 오류).
  //  - **격리 없음.** Import Reference Document 원문: "Pet dogs imported from any country are
  //    not subject to post-import quarantine in Canada."
  //  - 8개월 미만 강아지 금지는 **상업 카테고리 + 고위험국**에만 걸린다. 한국은 고위험국이
  //    아니고 개인 동반은 상업이 아니라서 이중으로 해당 없음 — 3~8개월 요건이 8개월 이상과
  //    완전히 동일하다. 구버전 주석의 '동적 확인 필요'는 해소됐다.
  //  - 지정 입국공항 **없음**. 마리수 상한 **없음**(개인/상업 구분은 마리수가 아니라 목적).
  canada: {
    keywords: ['캐나다', 'canada'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      minAgeDays: 91,
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // ⚠️ oneYearVaccineOnly 를 **선언하지 않는다** (2026-07-20, 4국 중 근거가 가장 명확한 건).
      //   CFIA 는 증명서에 적힌 백신 유효기간을 **그대로 인정**하고, 미기재일 때만 1년으로
      //   강등한다. 원문(개): "specify the period of validity of the rabies vaccination
      //   (otherwise, it will be considered valid for 1 year from the date of vaccination)"
      //   원문(고양이): "specify the duration of immunity (otherwise, …)"
      //   → 3년 백신은 증명서에 3년이 적혀 있으면 3년간 유효하다. 재접종을 강요할 근거가 없다.
      //   ⚠️ 대신 진짜 위험은 **유효기간 미기재**다 — 한국 동물병원 증명서에 유효기간이 안
      //     적히는 경우가 흔한데, 그러면 3년 백신이라도 자동으로 1년으로 강등된다.
      //     그래서 validityLine 을 '거부' 문구가 아니라 **기재 안내**로 바꿔 남겼다.
      validityLine: '증명서에 백신 유효기간이 적혀 있어야 그대로 인정돼요. 적혀 있지 않으면 접종일부터 1년으로만 인정돼요.',
      // 대기 0일 — timingLines 없음(baseRabiesCard 가 '출국 N일 전' 줄을 만들지 않는다).
    },
    titer: { need: 'return-only' },
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    // 계류 일수를 **선언하지 않는다** — CFIA 명문 "not subject to post-import quarantine".
    importQuarantine: {},
    rabiesTiterForReturnOnly: true,
  },
  // ── 우크라이나 (Держпродспоживслужба — DPSS) ──────────────────────────
  // ✅ 1차 출처 확보(2026-07-20). 구 주석의 "공식 자료 부재 — 사례 기반"은 사실이 아니었다.
  //   근거 법령: 「수의학 및 동물복지법」 1206-IX(2026-03-01 시행), 농업정책부령 553/2018
  //   (z0346-19), 부령 **1366/2025**(z0510-25, 수의문서 발급 절차, 2026-03-01 시행 —
  //   구 288/2014 폐지). DPSS 안내: dpss.gov.ua
  //   ⚠️ dpss.gov.ua 는 한국·미국 IP 에서 직접 접속이 차단된다(리더 프록시 경유 필요).
  //
  // ⚠️⚠️ **영공이 민항기에 완전 폐쇄돼 있어 직항 입국이 불가능하다.**
  //   EASA CZIB-2022-01R13(Active, 2026-07-31까지) 전 FIR 대상. DPSS 자체 문서(2026-06-09)도
  //   "повітряний простір України закритий" 로 인정한다.
  //   → 실제 경로는 **한국 → EU 공항 → 육로 국경**(폴란드·슬로바키아·헝가리·루마니아·몰도바)
  //     이고, 그러면 **EU 입국 요건이 먼저 걸린다**(실질 병목이 EU 규정이다).
  //   앱 목적지로 여는 문제는 사용자 판단이 필요하다 — 단독 목적지 카드로 만들면 실제 절차와
  //   어긋난다. appSupported 를 켜기 전 반드시 결론을 낼 것.
  //
  // 확인된 요건(APHIS 미국 출발 안내 + DPSS 안내 교차):
  //   칩 ISO 필수(문신은 2011-07-03 이전 시술분만) → 칩 후 접종
  //   광견병 최소 **12주**("Pets under 12 weeks of age must not be vaccinated")
  //   접종 후 **21일** 대기(초회 또는 유효기간 경과 후 재접종인 경우)
  //   **3년 백신 인정 O**("Ukraine will accept a 3-year rabies vaccine")
  //   항체검사 **필수**, 0.5 IU/ml 이상, 채혈은 접종 후 **30일** 경과 후,
  //     채혈 후 **3개월(90일) 대기**("more than three (3) months prior to export")
  //   항체 유효기간 = **조건부 무기한** — "remains valid indefinitely as long as there has
  //     been no lapse in rabies vaccination coverage". EU 와 같은 모델이다.
  //   수입허가·사전신고 **불요**(2015년 법 191-VIII 로 수입허가 개념 자체가 삭제됨).
  //   도착 격리 **없음** — 553/2018 제1장 6항이 비상업 반려동물을 격리 요건에서 제외한다.
  //   마리수 5두 이하(DPSS 안내에만 있고 법령 본문엔 없어 근거가 약하다).
  //   수입 금지 견종 **없음** — 내각령 1164/2021 의 '위험 견종' 목록은 보험·입마개 규제이지
  //     수입 규제가 아니다(조문에 ввезення/імпорт 언급이 전무).
  //
  // ⚠️ 널리 퍼진 "도착 후 30일 격리", "항체 3~24개월 유효"는 **폐지된 2004년 명령 71호
  //   (z0768-04)** 잔재다. 553/2018 이 폐지했다. 쓰지 말 것.
  ukraine: {
    keywords: ['우크라이나', 'ukraine'],
    rabies: {
      doses: 1,
      minAgeDays: 84,
      minAgeLabel: '생후 12주(84일)',
      timingLines: ['출국 21일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 21,
    },
    titer: {
      need: 'entry',
      minDaysAfterVaccine: 30,
      // 채혈 후 3개월 대기 — 모로코와 갈리는 지점(모로코는 대기 없음).
      entryWaitAfterTiter: { months: 3 },
      // 조건부 무기한(접종 이력 단절 없을 것) — EU 와 같은 모델이라 null.
      // ⚠️ 다만 **왕복이면 한국 APQA 의 '채혈일 도착 전 24개월 이내'가 실효적으로 걸린다.**
      //   그건 귀국 방향 공통 룰(titer-validity.ts)이 담당한다.
      entryValidityMonths: null,
    },
    // ⚠️ 영공 폐쇄 상태다(위 주석). 카드에 'EU 경유 육로' 안내를 명시해 두고 노출한다.
    appSupported: true,
    vaccines: ['rabies', 'rabies_titer'],
    importQuarantine: {},
  },
  // ── 이스라엘 ─────────────────────────────────────────────────────────────
  // 아일랜드 골격 복제(2026-07-22, 사용자 지정). **구조만 빌렸고 값은 이스라엘 것이다** —
  //   근거는 procedure-checks/il.ts 헤더(gov.il 「Importing Dogs」·MOAG Pro 126).
  // ⚠️ archetype 'eu-family' 는 **카드 골격을 재사용하기 위한 것**이지 이스라엘이 EU 라는
  //   뜻이 아니다. EU 고유 문구(EU 승인 검사기관·EU 동물건강증명서·EU 반려동물 여권 대체)는
  //   destination-overrides 에서 이스라엘 전용으로 덮어야 한다. euAhc 는 켜지 않는다.
  // ⚠️ 아일랜드에서 **가져오지 않은 것**: 촌충 구충(internal_parasite)·구충 시간
  //   (deworming_time)·개 4일 내원 창 — EU 촌충국 전용 요건이라 이스라엘엔 근거가 없다.
  // 앱 노출 ON(2026-07-23). ✅ 1차 출처 확보(2026-07-23) — 이스라엘 수의국 공식 안내
  //   「Importing Dogs and Cats」(valid from 26/11/2023). 아래 미확인 3항목 해소:
  //   · 항체 유효기간(입국용) = **무기한**(EU 모델, 섹션 K "valid for all lifelong … if
  //     vaccinated annually or according the vaccine manufacture instruction")
  //     → titer.entryValidityMonths: null 선언(아래).
  //   · 도착 후 5일 내 지자체 등록 의무 = 현행(섹션 X, 개 전용·5633/2002법). 별도 카드는 미제작.
  //   · 사전 통보 = 공식은 **적재(출국) 2영업일 전**(섹션 P/Q), 벤구리온은 govforms 링크·그 외엔
  //     이메일(vs-airport@moag.gov.il 등). 입국 항/포 = 벤구리온 공항 + 하이파·아쉬도드·에일랏 항(섹션 L).
  //     ✅ il-advance-notice 카드·검증·알림 모두 '출국(적재) 2영업일 전' 기준으로 정정 완료
  //     (2026-07-23: 입력차단 D-2, 마감 알림 출국 D-11·D-4). 링크=govforms(벤구리온) + 수입허가 안내.
  israel: {
    keywords: ['이스라엘', 'israel'],
    archetype: 'eu-family',
    appSupported: true,
    rabies: {
      doses: 1,
      // gov.il 수의국 "12주 이상 접종" = 84일 — 우크라이나와 동일(사용자 확정 2026-07-25).
      // 구 '보수 91일 AND 캘린더 3개월'은 규정보다 최대 일주일 과잉이라 걷어냈다(③ 정확화).
      minAgeDays: 84,
      minAgeLabel: '생후 12주(84일)',
      timingLines: ['출국 30일 전까지 접종해야 해요.'],
      entryWaitDaysAfterVaccine: 30,
    },
    // 입국 요건으로 항체검사 필수(한국이 이스라엘 분류상 광견병 위험국). 채혈은 접종 30일 후.
    // ✅ 유효기간 = **무기한**(EU 모델). 1차 출처 확정(2026-07-23): 이스라엘 수의국 공식 안내
    //   「Importing Dogs and Cats」(valid from 26/11/2023) 섹션 K — "The rabies titer test is
    //   valid for all lifelong of the animal if he was vaccinated against rabies annually or
    //   according the vaccine manufacture instruction." → 백신 chain 유지 시 영구(null).
    //   ⚠️ 상업 사이트의 '채혈 후 90일(3개월) 대기'는 오류 — 공식 문서엔 없다. 그 90일은
    //   섹션 E.3의 '소유 90일'(수입허가 면제 조건)을 오독한 것. 3개월 대기를 다시 넣지 말 것.
    titer: { need: 'entry', minDaysAfterVaccine: 30, entryValidityMonths: null },
    // 사전 통보 — 실제 마감/입력차단/알림은 '출국(적재) 2영업일 전' 기준으로 catalog
    // il-advance-notice·date-rules·reminders 가 처리한다. hardDeadlineHours(entry 기준)는
    // 이스라엘엔 소비되지 않아(EU 4국 entry 테이블 전용) 값을 빼고 선언만 유지 —
    // ADVANCE_NOTICE_DESTINATIONS(presence 파생)에 들어가야 하므로.
    advanceNotice: { label: '사전 통지' },
    vaccines: ['rabies', 'rabies_titer'],
    extraFields: ['address_overseas'],
  },
  // ── 남아프리카공화국 (DALRRD — Department of Agriculture, Land Reform & Rural Development) ──
  // 1차 출처: 남아공 정부 동물 수입 안내(gov.za) · 농업부 Animal Health 신청서·수수료 문서 ·
  //   2024-04-01 AIA 사전승인 지침 · 공개된 개 Veterinary Health Certificate(2026-03판).
  //   조사 정리본은 docs/south-africa-pet-travel-guide-draft.md.
  // 아키타입 = sea-permit(광견병 1회 + 수입허가 + 도착 계류). 호주·뉴질랜드와 다른 점 넷:
  //   ① **항체 검사(RNATT)가 입국 요건이 아니다.** 광견병은 '접종 30일 경과 + 12개월 이내'
  //      두 조건뿐이라 채혈·대기가 통째로 없다 — 준비가 호주(6개월+)보다 훨씬 짧다.
  //   ② 허가가 **두 장**이다 — 근거법이 다르다. AIA 허가 = Animal Improvement Act 1998
  //      (Act 62/1998) 제16조(가축 개량) / 수의검역 수입허가 = Animal Diseases Act 1984
  //      (Act 35/1984, 방역). 개는 AIA 를 먼저 받아 그 허가서를 붙여 수의검역 허가를 신청한다.
  //      고양이는 AIA 면제(명문). ✅ DALRRD 보도자료 2024-04-10 원문 확인(2026-07-30) —
  //      상세 인용은 catalog 의 za-aia-permit 카드 주석.
  //   ③ 전염병 검사·심장사상충·계류가 전부 **개 전용**이다(고양이는 서류만 맞으면 격리 없음).
  //   ④ 계류는 약 14일이고 **한국이 면제국 목록에 없어서** 붙는다(품종·인증 여부와 무관).
  south_africa: {
    keywords: ['남아프리카공화국', '남아공', 'south africa'],
    archetype: 'sea-permit',
    rabies: {
      doses: 1,
      // 공개 건강증명서의 예외 조항이 '생후 3개월 미만 + 모견 접종'을 다룬다 = 접종 하한이
      //   **달력 3개월**이라는 뜻. 일수(84·91)로 환산하면 생월에 따라 89~92일로 흔들려
      //   규정을 지킨 케이스를 막는다 — 베트남·말레이시아·인도네시아와 같은 처리.
      minAgeMonths: 3,
      minAgeLabel: '생후 3개월',
      // "초회는 출국 30일 전 ~ 12개월 이내" — 유효한 접종 안에서 추가접종하면 30일 대기 면제.
      //   그 면제는 violatesVaccineWaitDays 가 이미 구현하고 있다(유효 부스터는 통과).
      entryWaitDaysAfterVaccine: 30,
      // 라이선스가 2·3년이어도 **입국일 기준 12개월 이내 접종**이어야 한다 → 1년만 인정.
      oneYearVaccineOnly: true,
      validityLine: '면역 유효기간은 1년이에요. 2년·3년 백신은 인정되지 않아요.',
    },
    // ⚠️ 항체 검사는 **입국 요건이 아니다**(공식 안내·건강증명서 어디에도 RNATT 항목이 없다).
    //   구 선언의 'RNATT' 주석은 조사 전 추정이었다 — 되살리지 말 것. 편도 전용이라 한국
    //   귀국용 항체도 없다(귀국 케이스는 목적지를 새로 만들어 진행).
    titer: { need: 'none' },
    // 전염병 검사 5종(Brucella canis · Trypanosoma evansi · Babesia gibsoni ·
    //   Dirofilaria immitis · Leishmania) + 심장사상충 예방 + 살진드기·기피 처치 — 전부 개 전용.
    //   심장사상충은 **검사(5종에 포함)와 예방 투약이 별개**라 카드도 나눈다(뉴질랜드와 같은 처리).
    vaccines: [
      'rabies',
      { key: 'infectious_disease', species: 'dog' },
      { key: 'heartworm', species: 'dog' },
      { key: 'external_parasite', species: 'dog' },
    ],
    extraFields: ['permit_no', 'address_overseas'],
    // 건강증명서 작성 = 출국 전 10일 이내(한국 별지 제25호와 같은 창) → 기본값 그대로.
    // 수입허가는 VetPermits 이메일 신청이고 AIA 는 Animal Improvement Registrar 이메일이라
    //   둘 다 보호자·대행사가 직접 낸다 → 로잔 맡기기 '수입 허가 신청' 제외.
    importPermit: { selfApply: true },
    // ⚠️ importQuarantine.quarantineDays 는 선언하지 않는다 — 읽는 곳이 없는 죽은 선언이다
    //   (호주·뉴질랜드와 같은 판단). '약 14일'은 도착 카드·검역시설 예약 카드가 직접 말한다.
    // 강아지 규정(카드·검증·서류)까지 끝나 앱에 노출한다. 고양이는 별도 확인 예정.
    // ⚠️ 히어로 사진 **미등록** — 등록 전까지 목적지 카드에 사진 없이 표시된다
    //   (apps/portal/public/destinations/southafrica-NN.webp + hero-blur-placeholders.ts).
    appSupported: true,
    // 편도 전용(2026-07-27 사용자 확정).
    oneWayOnly: true,
  },
}

// ── 헬퍼 함수 ──

/**
 * 프로파일 조건을 만족하는 목적지 키 목록 — 하드코딩 명단을 프로파일 파생으로 대체할 때
 * 사용(Phase 1-c). 순서는 DESTINATION_OVERRIDES 선언 순서(소비자는 전부 membership 만 봄).
 */
export function destinationKeysWhere(
  pred: (override: DestinationOverride) => boolean,
): string[] {
  return Object.entries(DESTINATION_OVERRIDES)
    .filter(([, override]) => pred(override))
    .map(([key]) => key)
}

/** vaccines 선언(문자열·{key,species} 혼용)에 특정 검사 키가 포함된 목적지 키 목록. */
export function destinationsWithVaccine(vaccineKey: string): string[] {
  return destinationKeysWhere((o) =>
    (o.vaccines ?? DEFAULT_CONFIG.vaccines).some(
      (v) => (typeof v === 'string' ? v : v.key) === vaccineKey,
    ),
  )
}

/**
 * 항체검사가 **입국 요건이 아니라 한국 귀국용**인 목적지 — 왕복에만 항체 카드를 노출한다.
 *
 * `rabiesTiterForReturnOnly`(구 선언) 또는 `titer.need === 'return-only'`(프로파일) 에서 파생.
 * 예전엔 catalog 의 `roundOnlyDestinations` 에 태국·필리핀만 손으로 적혀 있었다. 그래서
 * 프로파일에 선언한 나라를 앱에 올려도 왕복 항체 카드가 안 떴다(베트남 — 2026-07-19 발견).
 * 한국 귀국엔 항체검사가 필수라 카드가 없으면 보호자가 준비 자체를 모른다.
 */
export const TITER_RETURN_ONLY_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => !!o.rabiesTiterForReturnOnly || o.titer?.need === 'return-only',
)

/**
 * 촌충(에키노코쿠스) 의무국 — EU Reg 2018/772 (영국·아일랜드·몰타·노르웨이·핀란드).
 * '개 전용 내부구충'(vaccines 의 { key:'internal_parasite', species:'dog' } 선언)이 이 규정의
 * 코드상 표현이라 그 선언에서 파생. eu.ts 촌충 check 와 촌충 치료 카드가 공유.
 */
export const TAPEWORM_DESTINATIONS: string[] = destinationKeysWhere((o) =>
  (o.vaccines ?? []).some(
    (v) => typeof v !== 'string' && v.key === 'internal_parasite' && v.species === 'dog',
  ),
)

/**
 * 펫무브 앱(포털)에서 목적지로 선택 가능한 나라 — 전체 여정 카드 + 서류 탭 구성이 끝난
 * 나라만(`appSupported` 파생). 포털 화이트리스트(app-destinations.ts)와 '전 여정 구성'
 * 전제 카드(항공권 구매)가 이 목록을 공유한다.
 */
export const APP_SUPPORTED_DESTINATION_KEYS: string[] = destinationKeysWhere(
  (o) => !!o.appSupported,
)

/** 수입허가 사전 신청국 — `importPermit` 선언 파생. 수입허가 카드 대상. */
export const IMPORT_PERMIT_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => !!o.importPermit,
)

/**
 * 도착 사전 통지국(아일랜드·몰타·노르웨이·키프로스) — `advanceNotice` 선언 파생.
 * 전용 카드(ie/mt/no/cy-advance-notice)는 규정 고유라 1:1 수작업 유지 — 이 목록은
 * 서비스(맡기기) 상세 등 '사전 통지 포함' 묶음 소비자용.
 */
export const ADVANCE_NOTICE_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => !!o.advanceNotice,
)

/** 목적지 키 → 대표 한글 라벨(첫 한글 keyword). 파생 목록을 한글 토큰 소비자가 쓸 때 사용. */
export function destinationKoLabel(key: string): string {
  const kw = DESTINATION_OVERRIDES[key]?.keywords ?? []
  return kw.find((k) => /[가-힣]/.test(k)) ?? kw[0] ?? key
}

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
/**
 * 편도만 있는 목적지인가 — 프로파일 `oneWayOnly` 파생(호주·뉴질랜드).
 * 왕복·편도 토글 노출, 귀국 항공권 입력, 왕복 전용 카드가 모두 이 한 곳을 본다.
 */
export function isOneWayOnlyDestination(destination: string | null | undefined): boolean {
  return !!getDestinationOverride(destination)?.oneWayOnly
}

/**
 * 광견병 항체 **검체 접수일**(검사기관이 검체를 받은 날)을 대기 기준으로 쓰는 목적지인가 —
 * 프로파일 `titer.entryWaitAfterTiter.basisReceivedDate` 파생(호주·괌·하와이).
 *
 * 이 목적지들만 앱 항체 카드에 '검체 접수일' 입력칸을 띄운다. 미입력이면 채혈일로 대신
 * 판정한다(채혈 ≤ 도착이라 덜 엄격 — 규정을 지킨 사람을 막지 않는 방향).
 */
export function usesTiterReceivedDate(destination: string | null | undefined): boolean {
  return !!getDestinationOverride(destination)?.titer?.entryWaitAfterTiter?.basisReceivedDate
}

export function getTripType(
  data: Record<string, unknown> | null | undefined,
  destinationToken: string | null | undefined,
): 'round' | 'one_way' {
  if (!destinationToken) return 'round'
  // 편도 전용 목적지(호주·뉴질랜드)는 저장값과 무관하게 편도 — 기존 케이스에 'round' 가
  //   남아 있어도 왕복 카드가 되살아나지 않게 여기서 단일 판정한다.
  if (isOneWayOnlyDestination(destinationToken)) return 'one_way'
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

/**
 * 이 목적지 여정에 광견병 항체검사(RNATT)가 등장하는가 — 입국용이든 한국 귀국용이든.
 *
 * false 인 목적지는 **여정에 항체 카드 자체가 없다**: 입국 요건도 아니고(titer.need 'none')
 * 한국 귀국 때도 면제되는(광견병 비발생국) 조합 — 홍콩·아랍에미리트가 여기 해당한다.
 * 이 나라들도 `vaccines` 에 rabies_titer 를 남겨 기록 입력은 받으므로, 입력 사실만 보고
 * 안내·푸시를 내보내면 **여정에 없는 단계의 알림**이 나간다(2026-07-26 항체 완료 푸시 수정).
 *
 * 'return-only'(미국·캐나다 등)는 true — 편도에선 카드가 숨지만 목적지 자체는 항체를 쓴다.
 */
// ⛔ requiresInfectiousDiseaseTest(목적지만 보는 전염병 검사 게이트)를 다시 만들지 말 것 —
//   2026-07-30 삭제. 이 검사는 호주·뉴질랜드·남아공 모두 **강아지 전용**인데 종을 안 봐서
//   고양이 케이스에 기록만 있으면 완료 푸시가 나갔다. 목적지 명단을 따로 들지 말고
//   **카드 applicability 에 직접 물어본다**(portal milestone-pushes.ts 의 infectiousTestCardApplies
//   — isStepApplicable + buildCaseJourneyContext). 목적지·종·왕복이 한 번에 맞는다.

export function usesRabiesTiter(destination: string | null | undefined): boolean {
  const o = getDestinationOverride(destination)
  // ① 명시적 제외 — titer.need 'none'. `vaccines` 에 rabies_titer 가 남아 있어도(기록 입력을
  //    허용하려고 남긴다) 여정에 카드가 없으므로 여기서 끝낸다. 홍콩·아랍에미리트가 이 경우.
  if (o?.titer?.need === 'none') return false
  // ② titer 선언이 있으면 쓴다 — need('entry'/'return-only')든 유효기간만(일본 24개월·EU null)이든.
  //    ⛔ need 만 보던 예전 판정으로 되돌리지 말 것 — 일본·영국·아일랜드·몰타·핀란드·키프로스·
  //    스위스는 need 를 선언하지 않고 유효기간만 쓰는데, 이들이 전부 광견병 비발생국이라
  //    ③④를 지나 false 로 떨어졌다(2026-07-26 맡기기 감사에서 발견).
  if (o?.titer) return true
  // ③ 귀국용 전용 선언(태국·필리핀 등 구 플래그).
  if (o?.rabiesTiterForReturnOnly) return true
  // ④ 백신 목록 선언.
  const usesTiterVaccine = (o?.vaccines ?? []).some(
    (v) => (typeof v === 'string' ? v : v.key) === 'rabies_titer',
  )
  if (usesTiterVaccine) return true
  // ⑤ EU 패밀리 — 한국은 EU unlisted 제3국이라 **입국에 항체검사가 필수**다. 프로파일이
  //    archetype 만 선언하고 titer·vaccines 를 비워 두는 나라(키프로스)가 있어 여기서 받는다.
  if (o?.archetype === 'eu-family') return true
  // ⑥ 귀국용 — 광견병 발생국이면 한국 재입국에 항체검사가 필요하다(비발생국은 면제).
  return !isRabiesFreeOrigin(destination)
}

/** 단일 목적지 토큰에 매칭되는 오버라이드 반환. 없으면 null. */
export function getDestinationOverride(destination: string | null | undefined): DestinationOverride | null {
  if (!destination) return null
  const lower = destination.toLowerCase()
  // ① **맵의 키 자체**로 먼저 찾는다(2026-07-31 신설). keywords 에는 사람이 쓰는 이름만 들어
  //   있어서, 코드가 키(`south_africa`·`hong_kong`)를 넘기면 아무것도 안 잡히고 null 이 됐다.
  //   그러면 호출자가 조용히 기본 분기로 떨어진다 — 맡기기 화면이 목적지 키를 넘기는 바람에
  //   usesRabiesTiter 가 ⑥(광견병 발생국이면 true)까지 내려가, **여정에 항체 카드가 없는
  //   남아공·홍콩의 맡기기 목록에 '광견병 항체 검사'가 들어가 있었다**(사용자 발견).
  //   'uae' 처럼 키가 우연히 keywords 에도 있던 목적지만 멀쩡했다.
  const byKey = DESTINATION_OVERRIDES[lower]
  if (byKey) return byKey
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
 *
 * ⚠️ **키 형태도 받는다**(2026-07-29 수정). 예전엔 keywords 만 봤는데, 호출부 상당수가
 * 목적지 **키**를 넘긴다(portal 의 destinationKey). 'australia'·'turkey' 처럼 키가 영문
 * keyword 와 같은 나라는 우연히 통과했지만, **밑줄이 들어간 키는 전부 실패**했다
 * (new_zealand·south_africa — keywords 는 'new zealand' 로 띄어쓰기다).
 * 그 결과 뉴질랜드 내부구충 30일 저장 거부가 등록만 되고 조용히 죽어 있었다
 * (validateParasiteDateForDestination 이 이 함수로 목적지를 고른다).
 */
export function matchesDestinationKey(
  destination: string | null | undefined,
  key: keyof typeof DESTINATION_OVERRIDES,
): boolean {
  if (!destination) return false
  const override = DESTINATION_OVERRIDES[key]
  if (!override) return false
  const tokens = parseDestinations(destination).map((t) => t.toLowerCase())
  if (tokens.includes(String(key).toLowerCase())) return true
  const keywords = override.keywords.map((k) => k.toLowerCase())
  return tokens.some((t) => keywords.includes(t))
}

/**
 * 한국 농림축산검역본부 지정 '광견병 비발생 지역'. 이 지역(국가)에서 한국으로 (재)입국하는
 * 개·고양이는 광견병 중화항체가(RNATT) 검사를 면제받는다 → 귀국 항체검사 2년 룰
 * (common.kr-return-titer-within-2years)·귀국 항체 만료 알림(titerReminderTargets)도
 * 비발생국이면 적용하지 않는다.
 *
 * **1차 출처(2026-07-22 교체)** — 검역본부 공고 「광견병 비발생 국가(지역)」
 *   https://www.qia.go.kr/viewwebQiaCom.do?id=52639&type=1_5hwwsdxetc
 *   첨부 「(23.1분기) 해외 광견병 비발생국(지역) 현황 조정」(downloadwebQiaCom.do?id=43954),
 *   **2023-04-04 기준** 목록 전문을 그대로 옮긴 것이다. 근거 고시는 가축 외 포유류동물
 *   수입위생조건(농식품부고시 제2021-42호)·지정검역물의 검역방법 및 기준.
 *   (구 출처였던 petmove 블로그 2024-01-04 스냅샷은 이 공식 목록과 전부 일치했다 — 값 변경 없음.)
 *
 * ⚠️ APQA 는 이 목록을 정적으로 공표하지 않으며 발생 상황에 따라 **실시간 변동**한다
 * (WOAH 발생 통보 시 자동 삭제 / 청정 선언 시 분기별 추가). 당국도 "입국 전 검역기관
 * (동물검역과 054-912-0427) 확인"을 요구한다. 그래서 이 값은 확정 데이터가 아니라
 * **'안내(info)'용**이고, 입력 차단·강한 주의로 쓰지 않는다. 갱신은 이 상수 하나만 고친다.
 *
 * 매칭이 **destinationKey 가 아니라 목적지 토큰(실제 국가명)** 기준인 이유:
 *  ① eu 묶음 24개국이 비발생/발생으로 섞여 있다(독일=비발생, 프랑스=발생).
 *  ② 공고 목록 50개국이 destinations.json 에 선택 가능한데 그중 23개국은
 *     DESTINATION_OVERRIDES 에 키가 없다(몰디브·피지·아이슬란드 등). 예전엔 판정이
 *     override 키 기반이라 이 나라들이 통째로 '발생국'으로 떨어져, 면제 대상인데도
 *     귀국 항체 2년 안내·만료 알림이 나갔다(2026-07-22 발견·수정).
 */
/**
 * 공고 목록 국가명 — 한글은 공고 표기와 destinations.json 표기를 **둘 다** 넣고(공고 '세이셜'
 * vs 우리 '세이셸' 처럼 다른 경우가 있다), 영문은 destinations.json 의 en 과 각 목적지
 * override 의 keywords 별칭(북아일랜드·아랍에미레이트 구표기 등)을 함께 넣는다.
 * 비교는 normalizeRabiesFreeToken(소문자 + 공백 제거) 후 exact match.
 */
const RABIES_FREE_TOKENS: ReadonlySet<string> = new Set(
  [
    // ── 아메리카 ──
    '괌', 'guam', '과들루프섬', '과들루프', 'guadeloupe', '마르티니크', 'martinique',
    '바베이도스', 'barbados', '세인트빈센트그레나딘', 'saint vincent and the grenadines',
    '아루바', 'aruba', '자메이카', 'jamaica', '케이맨 제도', '케이맨제도', 'cayman islands',
    '하와이', 'hawaii',
    // ── 아시아 ──
    '몰디브', 'maldives', '바레인', 'bahrain', '브루나이', 'brunei',
    // 공고는 '사이프러스', 우리 목적지 표기는 '키프로스'.
    '사이프러스', '키프로스', 'cyprus',
    '싱가포르', 'singapore',
    // uae override 는 구표기 '아랍에미레이트'를 검색 별칭으로 유지한다.
    '아랍에미리트', '아랍에미레이트', 'uae', 'united arab emirates',
    '일본', 'japan', '쿠웨이트', 'kuwait', '홍콩', 'hong kong', 'hongkong',
    // ── 아프리카 ──
    '레위니옹섬', '레위니옹', 'reunion', '모리셔스', 'mauritius',
    '상투메프린시페', 'sao tome and principe',
    // 공고는 '세이셜', destinations.json 은 '세이셸'.
    '세이셜', '세이셸', 'seychelles',
    '지부티', 'djibouti', '카보베르데', 'cape verde', '코모로', 'comoros',
    // ── 오세아니아 ──
    '뉴칼레도니아', 'new caledonia', '뉴질랜드', 'new zealand', 'nz',
    '미크로네시아', 'micronesia', '바누아투', 'vanuatu', '사모아', 'samoa',
    '월리스프투나', '월리스푸투나', 'wallis and futuna', '키리바시', 'kiribati',
    '파푸아뉴기니', 'papua new guinea', '프랑스령 폴리네시아', '프랑스령폴리네시아',
    'french polynesia', '피지', 'fiji', '호주', 'australia',
    // ── 유럽 ──
    // ⚠️ 노르웨이는 공고 목록에 **없다**(비발생국 아님). 유럽이라고 넣지 말 것.
    '독일', 'germany', '라트비아', 'latvia', '룩셈부르크', 'luxembourg',
    '리투아니아', 'lithuania', '리히텐슈타인', 'liechtenstein', '몬테네그로', 'montenegro',
    '몰타', 'malta', '벨기에', 'belgium', '불가리아', 'bulgaria', '산마리노', 'san marino',
    '스웨덴', 'sweden', '스위스', 'switzerland', '슬로베니아', 'slovenia',
    '아이슬란드', 'iceland', '아일랜드', 'ireland', '안도라', 'andorra',
    '에스토니아', 'estonia',
    // uk override 의 별칭 전부 — 영국 본토·구성국 표기 어느 것으로 저장돼도 잡히게.
    '영국', '북아일랜드', 'uk', 'united kingdom', 'england', 'scotland', 'wales',
    'northern ireland',
    '오스트리아', 'austria', '이탈리아', 'italy', '체코', 'czech', '포르투갈', 'portugal',
    '핀란드', 'finland',
  ].map((t) => t.toLowerCase().replace(/\s+/g, '')),
)

function normalizeRabiesFreeToken(token: string): string {
  return token.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * 활성 목적지가 한국 지정 광견병 비발생 지역인지 — 귀국 항체검사 면제 판정용.
 * (위 주석의 변동성·면책 참고. 코드 단정이 아니라 안내 기준값.)
 *
 * 다중 목적지(콤마 구분)는 **하나라도 비발생이면 true** — 기존 동작 유지. 활성 목적지 하나만
 * 넘기는 호출부(procedure-check ctx·titerReminderTargets)가 정상 경로다.
 * 'eu'·'유럽연합' 같은 묶음 라벨은 회원국이 섞여 있어 목록에 넣지 않는다(= 면제 아님).
 */
export function isRabiesFreeOrigin(destination: string | null | undefined): boolean {
  if (!destination) return false
  return parseDestinations(destination).some((t) =>
    RABIES_FREE_TOKENS.has(normalizeRabiesFreeToken(t)),
  )
}

const VET_VISIT_DEFAULT_WINDOW_DAYS = 10

/**
 * 입력된 목적지(콤마 구분 가능)에 대한 내원일↔출국일 윈도우 일수.
 * "출국일 포함 N일 이내"의 N — 한국 APQA 디폴트 10일, 비표준은 각 목적지 프로파일의
 * `vetVisitWindowDays` 선언이 진실 출처(근거 주석도 그쪽에).
 * 반환값은 규정의 "N일 이내" N. 다중 목적지 시 가장 엄격한 윈도우(최소값) 반환.
 * 비교 규칙: `days >= window` 면 거부. 예) window=10 → days 0~9 OK, 10+ 거부.
 * species 를 주면 종별 override(촌충 구충 등)를 반영 — 미지정 시 종 제한 override 는 건너뛴다.
 */
export function getVetVisitWindowDays(
  destination: string | null | undefined,
  species?: string | null,
): number {
  if (!destination) return VET_VISIT_DEFAULT_WINDOW_DAYS
  let min = VET_VISIT_DEFAULT_WINDOW_DAYS
  for (const [key, override] of Object.entries(DESTINATION_OVERRIDES)) {
    const declared = override.vetVisitWindowDays
    if (declared === undefined) continue
    const entries = typeof declared === 'number' ? [{ window: declared }] : declared
    for (const ov of entries) {
      if (ov.species && ov.species !== species) continue
      if (matchesDestinationKey(destination, key) && ov.window < min) {
        min = ov.window
      }
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
  { key: 'vaccine:external_parasite', label: '외부 기생충 치료', group: '절차정보' },
  { key: 'vaccine:internal_parasite', label: '내부 기생충 치료', group: '절차정보' },
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

/** 목적지별 백신/검사 목록 (키만). */
export function getVaccineList(destination: string | null | undefined): string[] {
  const override = getDestinationOverride(destination)
  const vaccines = override?.vaccines ?? DEFAULT_CONFIG.vaccines
  return vaccines.map((v) => (typeof v === 'string' ? v : v.key))
}

/**
 * 목적지별 백신/검사 entries (종 필터 포함). 명시 species > 하드코딩 디폴트.
 * 예: 촌충국 uk 는 internal_parasite 를 { species: 'dog' } 로 명시 → 고양이 미표시.
 */
function getHardcodedVaccineEntries(destination: string | null | undefined): DestinationVaccineEntry[] {
  const override = getDestinationOverride(destination)
  const vaccines = override?.vaccines ?? DEFAULT_CONFIG.vaccines
  return vaccines.map((v) => (typeof v === 'string' ? applyHardcodedSpecies(v) : v))
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
  // 2) 하드코딩 폴백 (명시 species 우선 + 디폴트 종 필터 자동 적용).
  const result = getHardcodedVaccineEntries(destination)
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
  'lungworm',
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
  external_parasite: '외부 기생충 치료',
  internal_parasite: '내부 기생충 치료',
  heartworm: '심장사상충',
  lungworm: '폐충',
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
    const baseVaccines = override.vaccines ?? DEFAULT_CONFIG.vaccines
    const extraFields: DestinationExtraFieldEntry[] = (override.extraFields ?? []).map((k) => (typeof k === 'string' ? { key: k } : k))
    const out: CustomDestination = {
      id,
      name: deriveDisplayName(id, override.keywords),
      keywords: [...override.keywords],
      // 명시 species(예: 촌충국 internal_parasite='dog') 는 그대로, 문자열은 하드코딩 디폴트 적용.
      vaccines: baseVaccines.map((v) => (typeof v === 'string' ? applyHardcodedSpecies(v) : v)),
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
  return (override?.extraFields ?? []).map((k) => (typeof k === 'string' ? { key: k } : k))
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
