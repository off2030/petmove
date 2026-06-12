import type { StepDefinition } from './types'

/**
 * step 의 일부 속성을 목적지별로 override 하기 위한 매핑.
 *
 * - 키: destination-config 의 destinationKey ('japan' | 'eu' | 'australia' | …).
 * - 값: stepId → Partial<StepDefinition>. 비어있는 객체이거나 키가 없으면 base catalog 그대로 사용.
 *
 * 안전 권장 (현재 코드는 enforce 하지 않음):
 *   - description / title / shortLabel 같은 표시용 텍스트 override 권장.
 *   - applicability / done / validationIds 같은 검증·완료 시그널은 base 만 쓰는 것을 권장.
 *     국가별 검증은 procedure-checks/<country>.ts 와 step.validationIds 로 분리 관리.
 *
 * 채워나가는 방식: 목적지별 차이가 확인되는 step 만 점진적으로 추가.
 */
export const STEP_DESTINATION_OVERRIDES: Record<
  string,
  Partial<Record<string, Partial<StepDefinition>>>
> = {
  japan: {
    // 'departure'(출국·도착)은 전 목적지 공용 — 일본은 도착 후 공항 검역이 핵심이라
    // 일본 케이스에서만 '일본 수입 동물검역'으로 표시. 다른 목적지는 base 그대로.
    departure: {
      title: '일본 수입 동물검역',
      shortLabel: '수입',
      description:
        '일본 도착 후 공항 동물검역소에서 검역을 받으세요.\n위치는 공항마다 다릅니다. 일반적으로 입국 심사대를 지나 수화물 찾는 곳 근처에 있습니다. 세관 심사대를 지나기 전에 검역을 먼저 받아야 합니다.',
      doneSummary: '일본 수입 동물검역을 받았습니다.',
      // 일본 수입검역은 도착 후 공항 검역소 방문이 핵심 — 출국일 경과(base 의
      // departure-past)가 아니라 검역일 입력 시 완료 처리. 검역일 필드도 노출.
      done: 'has-jp-import-quarantine',
      inputs: [
        { key: 'jp_import_quarantine_date', label: '검역일', type: 'date' },
      ],
      allowAttachments: true,
      attachmentHint: '검역증 사본을 사진, PDF로 저장하세요.',
      links: [
        { url: '/guide/japan-airport-quarantine', label: '일본 주요 공항 동물검역소 위치' },
      ],
    },
  },
  // 일본을 뼈대로 — 'departure' 공용 카드를 그 나라 '[국가] 수입 동물검역' 도착 카드로 교체.
  // 목적지마다 따로 작성(검역일 필드도 나라별: {국가}_import_quarantine_date). 제목·설명은
  // 그 나라 가이드 기준, 일본과 같은 부분은 같은 문구. 완료신호는 그 나라 검역일 필드를 실어 보낸다.
  //
  // 태국 출처: DLD(축산국) AQS-Suvarnabhumi 공식 안내 + 태국 외교부 PDF(Rev. 30 Jan 2025)
  // + 주미 태국대사관 — 상세 수치는 procedure-checks/th.ts 헤더 주석 참고.
  thailand: {
    // 광견병 백신 — 태국은 1회면 충분(2차 카드 제외)이라 '(1차)' 라벨을 떼고, 생후 기준도
    // 일본(91일)과 달리 12주(84일). 21일 대기·유효기간 요건을 카드에서 직접 안내.
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description:
        '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종합니다.\n생후 12주(84일)가 지난 후에 접종해야 합니다.\n입국 21일 전까지 접종해야 합니다.\n수입 허가 신청 2주 전까지 접종해야 합니다.\n입국 때 면역 유효기간이 남아있어야 합니다.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요합니다. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 합니다.',
      doneSummary: '광견병 백신을 접종했습니다.',
      earliest: { anchor: 'birth', daysAfter: 84 },
      // 1회 접종국 단일 카드 — 최근 접종 유효기간이 입국 전 만료면 미완료(추가 접종 안내).
      done: 'has-rabies-valid',
      // 21일 대기·유효기간(입국일 기준)은 보호자가 백신 step 에서 조치 못 함 — 항공권
      // 구매 step(flight-purchase)에 매핑. 여기는 접종일 자체의 요건만.
      validationIds: ['th.rabies-prime-after-12weeks', 'th.microchip-before-rabies'],
    },
    // 광견병 항체 검사 — 태국 입국엔 불필요, 한국 귀국용(왕복에만 노출 — roundOnlyDestinations).
    // 일본 문구(지정 검사기관·2차 접종)가 맞지 않아 교체.
    'rabies-titer': {
      description:
        '한국으로 돌아올 때 필요한 광견병 항체 검사를 받으세요.\n\n태국 입국에는 필요하지 않지만, 한국 입국 때 반드시 필요합니다.\n동물병원을 통해 의뢰할 수 있습니다.\n0.5 IU/mL 이상이면 합격입니다.\n검사 결과는 채혈일로부터 2년간 유효합니다. 한국으로 돌아오는 날까지 유효해야 합니다.',
    },
    // 종합백신 — 태국은 강아지 DHPPL(렙토스피라 포함) / 고양이 범백혈구감소증(FPV).
    // 종별 요건이 달라 descriptionBySpecies 로 분리 표시. description 은 종 미상 폴백.
    // 광견병과 접종 종류·연령만 다르고 나머지 조건(칩 이후·21일 전·수입허가 2주 전·유효기간)은
    // 동일 — 광견병 카드 문구를 그대로 맞춤(종합백신은 최소 접종 연령 요건이 없어 그 줄만 생략).
    'general-vaccine': {
      description:
        '강아지는 DHPPL(디스템퍼·전염성간염·파보·파라인플루엔자·렙토스피라), 고양이는 범백혈구감소증(FPV)이 포함된 종합백신을 접종하세요.\n\n마이크로칩 삽입 후 접종합니다.\n입국 21일 전까지 접종해야 합니다.\n수입 허가 신청 2주 전까지 접종해야 합니다.\n입국 때 면역 유효기간이 남아있어야 합니다.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요합니다. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 합니다.',
      descriptionBySpecies: {
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해야 합니다.\n한국 백신은 렙토스피라 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종합니다.\n입국 21일 전까지 접종해야 합니다.\n수입 허가 신청 2주 전까지 접종해야 합니다.\n입국 때 면역 유효기간이 남아있어야 합니다.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요합니다. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 합니다.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증(FPV)\n마이크로칩 삽입 후 접종합니다.\n입국 21일 전까지 접종해야 합니다.\n수입 허가 신청 2주 전까지 접종해야 합니다.\n입국 때 면역 유효기간이 남아있어야 합니다.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요합니다. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 합니다.',
      },
      validationIds: ['th.microchip-before-general-vaccine'],
    },
    // 항공권 구매 — 일본(항체검사 180일)과 제약이 달라 교체: 백신 21일 대기 + 수입허가
    // 일정(60일 유효)이 기준. 백신·수입허가 뒤로 순서 조정(order 105 — 수입허가 100 다음).
    'flight-purchase': {
      description:
        '태국 입국 가능 시기에 맞춰 항공권을 구매하세요.\n\n광견병 백신과 종합백신 접종일로부터 21일이 지난 후에 입국할 수 있습니다.\n수입 허가 신청에 항공편 일정이 필요합니다. 늦어도 입국 2주 전까지 항공권을 준비하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '태국에 입국할 수 있습니다.',
      order: 105,
      // 일본의 180일 anchor(항체 검사) 미적용 — 21일 룰은 입력 차단(validateThEntryDate)과
      // 아래 procedure-check 가 담당.
      earliest: undefined,
      // th.rabies-not-expired-on-arrival 은 항공권이 아니라 '추가 백신' 카드의 situational
      // 안내가 담당 (일본 jp.rabies-valid-until-on-departure 와 동일 모델 — scenario 의
      // ADVISORY_DEFERRED_CHECKS 로 상단 주의 중복 차단).
      validationIds: [
        'th.rabies-21days-before-arrival',
        'th.general-vaccine-21days-before-arrival',
        'th.general-vaccine-not-expired-on-arrival',
      ],
    },
    // 수입 허가 — 태국 입국 공항 동물검역소(AQS)에 이메일 신청. 신청 → 허가증 2단계
    // (base 카드의 deriveImportPermitStatus 모델 그대로, 문구·마감만 태국 기준).
    'import-permit': {
      description:
        '입국 공항 동물검역소에 수입 허가를 신청하세요.\n\n입국 7영업일 전까지 이메일로 신청합니다.\n신청서(R1/1), 여권 사본, 항공편 일정, 반려동물 사진, 마이크로칩·예방접종 증명서, 백신 수첩 등이 필요합니다.\n수입 허가증은 발급일로부터 60일간 유효합니다.',
      doneSummary: '태국 수입허가증을 받았습니다.',
      cardLine: '태국 수입 허가를 신청하세요.',
      deadline: { anchor: 'departure', daysBefore: 14 },
      links: [{ url: '/guide/th-aqs-contacts', label: '태국 동물검역소(AQS) 연락처' }],
      validationIds: [
        'th.import-permit-9days-before-entry',
        'th.import-permit-14days-after-vaccines',
      ],
    },
    departure: {
      title: '태국 수입 동물검역',
      shortLabel: '수입',
      description:
        '태국 도착 후 공항 동물검역소(AQS)에서 수입 검역을 받으세요.\n수완나품 공항은 입국 심사 후 수하물 찾는 곳(8번 벨트 근처)에 동물검역소가 있습니다.\n검역 수수료는 동물 1마리당 500바트(현금)입니다.\n검사를 통과하면 수입승인서(R-6)와 수입허가증(R-7)이 발급됩니다.\n서류가 완비되고 건강에 이상이 없으면 격리 없이 바로 인도됩니다. 서류가 미비하거나 전염병 증상이 있으면 최대 30일 격리될 수 있으며, 격리 비용은 보호자가 부담합니다.',
      doneSummary: '태국 수입 동물검역을 받았습니다.',
      done: 'quarantine:th_import_quarantine_date',
      inputs: [
        {
          key: 'th_import_quarantine_date',
          label: '검역일',
          type: 'date',
          helpText: '태국 동물검역소(AQS)에서 수입 검역을 받은 날짜',
        },
      ],
      allowAttachments: true,
      attachmentHint: '검역증(수입승인서 R-6·수입허가증 R-7) 사본을 사진, PDF로 저장하세요.',
      validationIds: ['th.import-quarantine-date-valid'],
    },
    // 한국 수입 동물검역(왕복 마지막) — 검역일 ≥ 귀국일 재검증을 태국 룰로 연결.
    // (base 의 jp.kr-import-quarantine-date-valid 는 country=japan 이라 태국 케이스에선 미실행.)
    'kr-import-quarantine': {
      validationIds: ['th.kr-import-quarantine-date-valid'],
    },
  },

  // 필리핀 출처: BAI(동물산업국) MC No.49(2022)·BAI Pet Import 공식 안내 + petmove.co.kr
  // 필리핀 가이드 — 상세 수치는 procedure-checks/ph.ts 헤더 주석 참고. 태국과 같은 골격
  // (광견병 1회·종별 종합백신·수입허가 2단계·도착검역) + 필리핀 고유: 구충 7~91일,
  // 생후 120일 입국 자격, 부스터는 대기 기간 면제.
  philippines: {
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description:
        '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 합니다.\n생후 12주(84일)가 지난 후에 접종해야 합니다.\n수입허가증(SPSIC) 신청 14일 전까지 접종을 완료하세요.\n필리핀 입국 때 면역 유효기간(1년)이 남아있어야 합니다.\n이전 접종의 유효기간 안에 추가 접종(부스터)을 한 경우에는 대기 기간 없이 바로 출국할 수 있습니다.',
      doneSummary: '광견병 백신을 접종했습니다.',
      earliest: { anchor: 'birth', daysAfter: 84 },
      done: 'has-rabies-valid',
      validationIds: ['ph.rabies-prime-after-12weeks', 'ph.microchip-before-rabies'],
    },
    'rabies-titer': {
      description:
        '한국으로 돌아올 때 필요한 광견병 항체 검사를 받으세요.\n\n필리핀 입국에는 필요하지 않지만, 한국 입국 때 반드시 필요합니다.\n필리핀 현지에서는 검사가 어려우므로 출국 전에 한국에서 미리 받아두세요.\n동물병원을 통해 의뢰할 수 있습니다.\n0.5 IU/mL 이상이면 합격입니다.\n검사 결과는 채혈일로부터 2년간 유효합니다. 한국으로 돌아오는 날까지 유효해야 합니다.',
    },
    'general-vaccine': {
      description:
        '강아지는 DHLPPi(디스템퍼·전염성간염·렙토스피라·파라인플루엔자·파보바이러스), 고양이는 FVRCP(범백혈구감소증·허피스·칼리시)가 포함된 종합백신을 접종하세요.\n\n수입허가증(SPSIC) 신청 14일 전까지 접종을 완료하세요.\n필리핀 입국 때 면역 유효기간이 남아있어야 합니다.',
      descriptionBySpecies: {
        dog: '종합백신(DHLPPi)을 접종하세요.\n\n디스템퍼·전염성간염·렙토스피라·파라인플루엔자·파보바이러스 예방을 포함해야 합니다.\n한국 백신은 렙토스피라 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종합니다.\n수입허가증(SPSIC) 신청 14일 전까지 접종을 완료하세요.\n필리핀 입국 때 면역 유효기간이 남아있어야 합니다.\n이전 접종의 유효기간 안에 추가 접종(부스터)을 한 경우에는 대기 기간 없이 바로 출국할 수 있습니다.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증·허피스바이러스·칼리시바이러스가 포함되어야 합니다.\n마이크로칩 삽입 후 접종합니다.\n수입허가증(SPSIC) 신청 14일 전까지 접종을 완료하세요.\n필리핀 입국 때 면역 유효기간이 남아있어야 합니다.\n이전 접종의 유효기간 안에 추가 접종(부스터)을 한 경우에는 대기 기간 없이 바로 출국할 수 있습니다.',
      },
      validationIds: ['ph.microchip-before-general-vaccine'],
    },
    // 구충 — 필리핀은 SPSIC 신청일 기준 7~91일 사이 처치 기록이 필요(내부 필수·외부 권장).
    // base 문구(EU·호주 중심)와 달라 교체.
    'external-parasite': {
      description:
        '외부 기생충(진드기·벼룩) 구충을 받으세요.\n\n수입허가증(SPSIC) 신청일 기준 91일 이내, 7일 이전에 동물병원에서 받으세요.\n수의사의 치료 기록이 필요합니다.',
      doneSummary: '외부구충 처치를 받았습니다.',
    },
    'internal-parasite': {
      description:
        '내부 기생충 구충을 받으세요.\n\n수입허가증(SPSIC) 신청일 기준 91일 이내, 7일 이전에 동물병원에서 받으세요.\n수의사의 치료 기록이 필요합니다.',
      doneSummary: '내부구충 투약을 받았습니다.',
    },
    'flight-purchase': {
      description:
        '필리핀 입국 일정에 맞춰 항공권을 구매하세요.\n\n생후 120일(4개월)이 지나야 필리핀에 입국할 수 있습니다.\n광견병 백신과 종합백신을 1회만 접종한 경우, 접종일로부터 21일이 지난 후에 입국할 수 있습니다. (유효기간 안에 추가 접종을 한 경우는 대기 기간이 없습니다.)\n수입 허가 신청에 항공편 일정이 필요합니다. 늦어도 입국 2주 전까지 항공권을 준비하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '필리핀에 입국할 수 있습니다.',
      order: 95,
      earliest: undefined,
      // ph.rabies-not-expired-on-arrival 은 '추가 백신' 카드 situational 이 담당 (태국과 동일).
      validationIds: [
        'ph.min-120days-on-arrival',
        'ph.rabies-prime-21days-before-arrival',
        'ph.general-vaccine-prime-21days-before-arrival',
        'ph.general-vaccine-not-expired-on-arrival',
      ],
    },
    'import-permit': {
      title: '수입허가증(SPSIC) 신청',
      description:
        '필리핀 수입허가증(SPSIC)을 신청하세요.\n\nIntercommerce 사이트에서 일회성 수입자(One-time Importer)로 등록한 후 온라인으로 신청합니다.\n광견병·종합백신 접종 14일 후부터 신청할 수 있습니다.\n생후 120일(4개월) 이상이어야 하며, 1회 최대 3마리까지 신청할 수 있습니다.\n예방접종 증명서, 구충 기록, 마이크로칩 증명서, 반려동물 사진을 PDF 또는 JPG(5MB 이하)로 첨부합니다.\n승인까지 수일이 걸립니다. 출발 1~2주 전까지 신청하세요.\n수입허가증은 발급일로부터 60일간 유효하며 연장할 수 없습니다.',
      doneSummary: '필리핀 수입허가증(SPSIC)을 받았습니다.',
      cardLine: '필리핀 수입허가증(SPSIC)을 신청하세요.',
      deadline: { anchor: 'departure', daysBefore: 10 },
      links: [
        { url: 'https://www.intercommerce.com.ph/registrationbai.asp', label: 'Intercommerce 수입자 등록' },
        { url: 'https://www.bai.gov.ph/Travelers/PET', label: 'BAI 반려동물 수입 안내' },
      ],
      attachmentLabel: '수입허가증(SPSIC)',
      validationIds: ['ph.import-permit-14days-after-vaccines'],
    },
    departure: {
      title: '필리핀 수입 동물검역',
      shortLabel: '수입',
      description:
        '필리핀 도착 후 공항에서 BAI 동물검역관(VQO)에게 수입 검역을 받으세요.\n수입허가증(SPSIC) 원본, 한국 수출 동물검역증 원본, 예방접종 증명서, 마이크로칩 증명서를 제시합니다.\nSPSIC 발급 수수료와 검역 수수료는 도착 공항 검역 사무소에서 납부합니다.\n서류가 완비되고 건강에 이상이 없으면 격리 없이 바로 인도됩니다. 요건을 충족하지 못하면 격리되거나 반송될 수 있으며, 비용은 보호자가 부담합니다.',
      doneSummary: '필리핀 수입 동물검역을 받았습니다.',
      done: 'quarantine:ph_import_quarantine_date',
      inputs: [
        {
          key: 'ph_import_quarantine_date',
          label: '검역일',
          type: 'date',
          helpText: 'BAI 동물검역관(VQO)에게 수입 검역을 받은 날짜',
        },
      ],
      allowAttachments: true,
      attachmentHint: '검역 서류 사본을 사진, PDF로 저장하세요.',
      validationIds: ['ph.import-quarantine-date-valid'],
    },
    'kr-import-quarantine': {
      validationIds: ['ph.kr-import-quarantine-date-valid'],
    },
  },

  // ── EU 패밀리 — 규정 동일(EU Reg 576/2013), 카드 한 벌을 만들어 7개 키에 복사 ─────
  // 예외만 나라별: 영국=촌충+화물 운송 / 아일랜드=촌충+사전 통지(ie-advance-notice 카드) /
  // 몰타·노르웨이·핀란드=촌충 / 스위스=수입허가(FSVO). 촌충 카드(echinococcus-treatment)와
  // 사전 통지 카드는 catalog 의 applicability 가 담당 — 여기는 문구·검증 매핑만.
  // 출처: EU Reg 576/2013·2018/772 + petmove.co.kr EU/영국/스위스 가이드 + gov.ie.
  // 항체 검사 기관: 2026-04-22부터 농림축산검역본부 단일화 (petmove.co.kr 공지).
  eu: euFamilyOverrides({ label: '유럽연합(EU)' }),
  uk: euFamilyOverrides({
    label: '영국',
    flightExtraLine:
      '영국 입국 시 반려동물은 보호자와 같은 항공기 객실·수하물로 탈 수 없고 별도 화물로 운송됩니다. 운송 일정을 항공사와 미리 협의하세요.',
    departureDescription:
      '영국 도착 후 공항 동물검역소(동물접수센터)에서 수입 검사를 받으세요.\n검역관이 마이크로칩과 서류(건강증명서·광견병 항체 검사 결과지·촌충 구충 기록)를 확인합니다.\n서류가 완비되고 건강에 이상이 없으면 격리 없이 인도됩니다.',
  }),
  ireland: euFamilyOverrides({
    label: '아일랜드',
    departureDescription:
      '아일랜드 도착 후 공항에서 입국 검사(Compliance Check)를 받으세요.\n사전 통지 후 이메일로 안내받은 절차에 따라 진행됩니다.\n검역관이 마이크로칩과 서류(건강증명서·광견병 항체 검사 결과지·촌충 구충 기록)를 확인합니다.\n서류가 완비되고 건강에 이상이 없으면 격리 없이 바로 인도됩니다.',
  }),
  malta: euFamilyOverrides({ label: '몰타' }),
  norway: euFamilyOverrides({ label: '노르웨이' }),
  finland: euFamilyOverrides({ label: '핀란드' }),
  switzerland: {
    ...euFamilyOverrides({
      label: '스위스',
      flightExtraLine: '반려동물의 스위스 입국은 바젤·제네바·취리히 공항으로만 가능합니다.',
    }),
    // 스위스 고유 — FSVO 수입허가 (EU 와 다른 유일한 추가 절차).
    'import-permit': {
      description:
        '스위스 수입허가를 신청하세요.\n\n스위스 연방 식품안전수의청(FSVO)에 입국 최소 3주 전까지 신청해야 합니다.\n발급받은 허가서는 스위스 입국 검사 때 제시합니다.\n반려동물의 스위스 입국은 바젤·제네바·취리히 공항으로만 가능합니다.',
      doneSummary: '스위스 수입허가증을 받았습니다.',
      cardLine: '스위스 수입허가를 신청하세요.',
      deadline: { anchor: 'departure', daysBefore: 21 },
      links: [
        {
          url: 'https://www.blv.admin.ch/blv/en/home/tiere/reisen-mit-heimtieren.html',
          label: 'FSVO 반려동물 입국 안내',
        },
      ],
      attachmentLabel: '수입허가증(FSVO)',
      validationIds: ['eu.ch-import-permit-21days-before-entry'],
    },
  },
}

/**
 * EU 패밀리 공통 카드 한 벌 — 나라 표기(label)와 나라별 한 줄만 갈아끼우는 factory.
 * 규정이 동일(EU Reg 576/2013)하므로 문구도 한 곳에서 관리한다.
 */
function euFamilyOverrides(opts: {
  /** 카드 문구의 목적지 표기 (예: '영국', '유럽연합(EU)'). */
  label: string
  /** 항공권 카드에 덧붙일 나라별 한 줄 (영국 화물 운송·스위스 공항 제한 등). */
  flightExtraLine?: string
  /** 입국 검사 카드 본문 교체 (기본: 여행자 입국 지점 TPE 안내). */
  departureDescription?: string
}): Partial<Record<string, Partial<StepDefinition>>> {
  const { label, flightExtraLine, departureDescription } = opts
  return {
    // 광견병 백신 — 1회 + 항체 검사 모델(2차 카드 제외). 생후 12주(84일), 마이크로칩 이후.
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description: `광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 합니다.\n생후 12주(84일)가 지난 후에 접종해야 합니다.\n${label} 입국 때 면역 유효기간이 남아있어야 합니다.\n유효기간이 끝나기 전에 추가 접종을 계속하면 광견병 항체 검사를 다시 받지 않아도 됩니다.`,
      doneSummary: '광견병 백신을 접종했습니다.',
      earliest: { anchor: 'birth', daysAfter: 84 },
      done: 'has-rabies-valid',
      validationIds: ['eu.rabies-prime-after-12weeks', 'eu.microchip-before-rabies'],
    },
    // 항체 검사 — 접종 30일 후 채혈. 2026-04-22부터 농림축산검역본부 단일 검사.
    'rabies-titer': {
      description: `${label} 입국을 위한 광견병 항체 검사를 받으세요.\n\n광견병 백신 접종 후 30일이 지나서 채혈해야 합니다.\n검사는 농림축산검역본부에서 합니다. 동물병원을 통해 의뢰하세요.\n0.5 IU/mL 이상이면 합격입니다.\n광견병 백신을 유효기간 안에 계속 추가 접종하면 검사 결과는 계속 유효합니다.`,
      validationIds: ['eu.titer-min-30days-after-vaccine'],
    },
    // 항공권 — 채혈 + 3개월(캘린더) 대기. 입력 차단(validateEuEntryDate)과 짝.
    'flight-purchase': {
      description: `${label} 입국 가능 시기에 맞춰 항공권을 구매하세요.\n\n광견병 항체 검사 채혈일로부터 3개월이 지난 후에 입국할 수 있습니다.${flightExtraLine ? `\n${flightExtraLine}` : ''}\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.`,
      cardLine: `${label}에 입국할 수 있습니다.`,
      // 3개월은 캘린더 기준(89~92일 가변)이라 고정 일수 earliest 미적용 — 입력 차단이 담당.
      earliest: undefined,
      // eu.rabies-valid-until-on-departure 는 '추가 백신' 카드 situational 이 담당 (일본 모델).
      validationIds: ['eu.departure-min-3months-after-titer'],
    },
    // 도착 — 여행자 입국 지점(TPE) 서류·마이크로칩 확인. 검역 confirm 모델 재사용.
    // 필드는 패밀리 공용(eu_import_quarantine_date) — by_dest 가 목적지별 분리 보장.
    departure: {
      title: `${label} 입국 검사`,
      shortLabel: '입국',
      description:
        departureDescription ??
        `${label} 도착 후 공항의 여행자 입국 지점(Travellers' Point of Entry)에서 입국 검사를 받으세요.\n검역관이 마이크로칩과 서류(건강증명서·광견병 항체 검사 결과지)를 확인합니다.\n서류가 완비되고 건강에 이상이 없으면 격리 없이 바로 인도됩니다.`,
      doneSummary: `${label} 입국 검사를 받았습니다.`,
      done: 'quarantine:eu_import_quarantine_date',
      inputs: [
        {
          key: 'eu_import_quarantine_date',
          label: '검사일',
          type: 'date',
          helpText: `${label} 도착 후 입국 검사를 받은 날짜`,
        },
      ],
      allowAttachments: true,
      attachmentHint: '확인받은 서류 사본을 사진, PDF로 저장하세요.',
      validationIds: ['eu.import-quarantine-date-valid'],
    },
    // 한국 수입 동물검역(왕복 마지막) — 검역일 ≥ 귀국일 재검증을 EU 룰로 연결.
    'kr-import-quarantine': {
      validationIds: ['eu.kr-import-quarantine-date-valid'],
    },
  }
}

/**
 * base step + destination override 를 머지해 최종 StepDefinition 반환.
 * destinationKey 가 null 이거나 매칭 override 가 없으면 base 그대로.
 */
export function resolveStepForDestination(
  step: StepDefinition,
  destinationKey: string | null | undefined,
): StepDefinition {
  if (!destinationKey) return step
  const override = STEP_DESTINATION_OVERRIDES[destinationKey]?.[step.id]
  if (!override) return step
  return { ...step, ...override }
}
