import type { StepDefinition } from './types'

/**
 * 펫무브 portal 여정 step 카탈로그.
 *
 * 추가 시 규칙:
 * 1) id 는 kebab-case 전역 유일
 * 2) destinations 배열은 destination-config 의 DESTINATION_OVERRIDES 키
 * 3) order 는 보호자가 진행하는 자연스러운 순서 (10, 20, 30… 간격으로 미래 확장 여유)
 * 4) validationIds 는 procedure-checks/<country>.ts 의 id 와 정확히 일치 — check-mapping
 *    인덱스 자동 생성의 1차 출처
 *
 * 시안 단계 (Phase 11.0.7+): 13개 시드. 입력 폼은 단순 모양만 — 실제 렌더는 portal 측
 * 컴포넌트에서 type 별로 분기.
 */
export const JOURNEY_STEP_CATALOG: StepDefinition[] = [
  // ── 1. 펫무브 등록 ──────────────────────────────────────────────────────
  {
    id: 'intake',
    category: 'preparation',
    title: '펫무브 등록',
    shortLabel: '등록',
    description:
      '보호자와 동물 정보가 등록되었습니다. 이 정보는 검사, 신고, 서류 준비 등 여러 절차에 사용됩니다.\n정보 페이지에서 검토, 수정이 가능합니다.',
    doneSummary: '보호자와 동물 정보가 등록되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 10,
    done: 'always-done',
  },

  // ── 2. 마이크로칩 ─────────────────────────────────────────────────────
  {
    id: 'microchip',
    category: 'preparation',
    title: '마이크로칩 삽입',
    shortLabel: '칩',
    description:
      '국제 표준 규격(15자리 번호)의 내장형 마이크로칩을 삽입합니다.\n강아지는 동물등록도 필수입니다.',
    doneSummary: '마이크로칩 삽입이 완료되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 20,
    done: 'microchip-set',
    inputs: [
      {
        key: 'microchip',
        label: '마이크로칩 번호',
        type: 'text',
        required: true,
        helpText: '000 000 000 000 000 형식 (3자리씩 공백 구분)',
      },
      {
        key: 'microchip_implant_date',
        label: '시술일',
        type: 'date',
        helpText: '펫무브 등록 신청서의 달력과 동일 컴포넌트',
      },
    ],
    validationIds: ['common.microchip-after-birth'],
  },

  // ── 3. 광견병 백신 1차 ─────────────────────────────────────────────────
  {
    id: 'rabies-vaccine-1',
    category: 'vaccination',
    title: '광견병 백신(1차)',
    shortLabel: '백신1',
    description:
      '1차 광견병 백신을 접종합니다.\n\n생후 91일령 이후 접종해야 합니다.\n불활화(사독) 또는 재조합(변형) 백신을 사용합니다. (국내 유통되는 거의 모든 백신 허용)',
    doneSummary: '1차 광견병 백신 접종이 완료되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 30,
    earliest: { anchor: 'birth', daysAfter: 91 },
    done: 'has-rabies-entry',
    inputs: [
      { key: 'rabies_1_date', label: '접종일', type: 'date', required: true },
      { key: 'rabies_1_valid_until', label: '면역 유효기간', type: 'date' },
      { key: 'rabies_1_product', label: '약품명', type: 'text' },
      { key: 'rabies_1_manufacturer', label: '제조사', type: 'text' },
      { key: 'rabies_1_lot', label: '제조번호', type: 'text' },
      { key: 'rabies_1_product_expiry', label: '제품 유효기간', type: 'date' },
    ],
    allowAttachments: true,
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진, PDF로 보관하세요.',
    validationIds: ['jp.rabies-prime-after-91days-old'],
  },

  // ── 4. 광견병 백신 2차 ─────────────────────────────────────────────────
  {
    id: 'rabies-vaccine-2',
    category: 'vaccination',
    title: '광견병 백신(2차)',
    shortLabel: '백신2',
    description:
      '2차 광견병 백신을 접종합니다.\n\n1차 접종 후 30일 이상 지나서 접종합니다.\n1차 접종 면역 유효기간 이내에 접종합니다.\n일본 입국 때 면역 유효기간이 남아있어야 합니다.',
    doneSummary: '2차 광견병 백신 접종이 완료되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 35,
    earliest: { anchor: 'step:rabies-vaccine-1', daysAfter: 30 },
    done: 'has-rabies-booster',
    inputs: [
      { key: 'rabies_2_date', label: '접종일', type: 'date', required: true },
      { key: 'rabies_2_valid_until', label: '면역 유효기간', type: 'date' },
      { key: 'rabies_2_product', label: '약품명', type: 'text' },
      { key: 'rabies_2_manufacturer', label: '제조사', type: 'text' },
      { key: 'rabies_2_lot', label: '제조번호', type: 'text' },
      { key: 'rabies_2_product_expiry', label: '제품 유효기간', type: 'date' },
    ],
    allowAttachments: true,
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진, PDF로 보관하세요.',
    validationIds: [
      'jp.rabies-prime-booster-interval',
      'jp.rabies-booster-within-prime-validity',
      'jp.rabies-valid-until-on-departure',
      'jp.microchip-rabies-sequence',
      'jp.rabies-prime-before-microchip',
    ],
  },

  // ── 4. 광견병 항체검사 ──────────────────────────────────────────────────
  {
    id: 'rabies-titer',
    category: 'lab',
    title: '광견병 항체가 검사',
    shortLabel: '항체',
    description:
      '일본 지정 검사기관에서 광견병 항체가 검사를 받습니다.\n\n동물병원을 통해 의뢰할 수 있습니다.\n0.5 IU/mL 이상이면 합격입니다.\n2차 접종 면역 유효기간 이내에 검사합니다.',
    doneSummary: '광견병 항체가 검사가 완료되었습니다.',
    applicability: {
      destinations: [
        'japan',
        'eu',
        'uk',
        'ireland',
        'malta',
        'norway',
        'finland',
        'switzerland',
        'australia',
        'new_zealand',
        'malaysia',
        'china',
        'taiwan',
        'singapore',
        'indonesia',
        'india',
        'turkey',
        'ukraine',
        'israel',
      ],
      species: 'all',
      tripType: 'all',
    },
    order: 40,
    done: 'has-titer-entry',
    inputs: [
      { key: 'rabies_titer_date', label: '채혈일', type: 'date' },
      { key: 'rabies_titer_lab', label: '검사기관', type: 'select' },
      { key: 'rabies_titer_value', label: '검사결과', type: 'text' },
    ],
    allowAttachments: true,
    attachmentHint: '검사결과지 사본을 사진, PDF로 보관하세요.',
    validationIds: [
      'jp.rabies-titer-vs-booster',
      'jp.departure-180days-after-titer',
      'jp.departure-within-2years-of-titer',
      'jp.microchip-rabies-sequence',
    ],
  },

  // ── 항공권 구매 (일본 전용) ──────────────────────────────────────────────
  {
    id: 'flight-purchase',
    category: 'logistics',
    title: '항공권 구매',
    shortLabel: '항공권',
    description:
      '입국 가능 시기에 맞춰 항공권을 구매하세요.\n\n채혈일로부터 180일 후 ~ 2년 사이에 입국할 수 있습니다.\n일본 입국 때 광견병 예방접종 면역 유효기간이 남아있어야 합니다.\n항공사에 반려동물 동반 가능 여부를 확인하세요.',
    cardLine: '일본에 입국할 수 있습니다.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    order: 45,
    earliest: { anchor: 'step:rabies-titer', daysAfter: 180 },
    done: 'manual-flag:flight-purchased',
    // 출국 4 + 귀국 4. 귀국은 왕복 케이스에서만 노출 — 분기는 컴포넌트(FlightInputs)에서.
    inputs: [
      { key: 'entry_departure_airport', label: '출발 공항', type: 'text' },
      { key: 'entry_airport', label: '도착 공항', type: 'text' },
      { key: 'entry_flight_number', label: '편명', type: 'text' },
      { key: 'entry_transport', label: '운송 방법', type: 'select' },
      { key: 'return_departure_airport', label: '출발 공항', type: 'text' },
      { key: 'return_arrival_airport', label: '도착 공항', type: 'text' },
      { key: 'return_flight_number', label: '편명', type: 'text' },
      { key: 'return_transport', label: '운송 방법', type: 'select' },
    ],
    allowAttachments: true,
    attachmentHint: '구매한 항공권(e-티켓)을 사진, PDF로 보관하세요.',
  },

  // ── 5. 종합백신 (DHPP·FVRCP) ────────────────────────────────────────────
  {
    id: 'general-vaccine',
    category: 'vaccination',
    title: '종합백신 접종',
    shortLabel: '종합',
    description:
      '강아지는 DHPP(C), 고양이는 FVRCP. 출국 시점에 유효기간이 남아있어야 합니다.',
    doneSummary: '종합백신 접종이 완료되었습니다.',
    applicability: {
      destinations: [
        'australia',
        'new_zealand',
        'thailand',
        'malaysia',
        'singapore',
        'russia',
        'india',
        'uae',
        'hongkong',
        'guam',
        'philippines',
        'taiwan',
        'usa',
      ],
      species: 'all',
      tripType: 'all',
    },
    order: 50,
    done: 'has-general-vaccine',
    inputs: [
      { key: 'general_vaccine_dates', label: '접종일', type: 'date_array', hasValidUntil: true },
    ],
    allowAttachments: true,
  },

  // ── 6. 독감(CIV) — 강아지만 ─────────────────────────────────────────────
  {
    id: 'civ-vaccine',
    category: 'vaccination',
    title: '독감(CIV) 접종',
    shortLabel: '독감',
    description: '호주·뉴질랜드·인도 등 일부 국가는 강아지 인플루엔자 백신을 요구합니다.',
    doneSummary: '독감(CIV) 백신 접종이 완료되었습니다.',
    applicability: {
      destinations: ['australia', 'new_zealand', 'india'],
      species: 'dog',
      tripType: 'all',
    },
    order: 60,
    done: 'has-civ-vaccine',
    inputs: [
      { key: 'civ_dates', label: '접종일', type: 'date_array', hasValidUntil: true },
    ],
    allowAttachments: true,
  },

  // ── 7. 전염병 검사 ─────────────────────────────────────────────────────
  {
    id: 'infectious-disease-test',
    category: 'lab',
    title: '전염병 검사',
    shortLabel: '전염병',
    description:
      '호주(Brucella/Leptospira/Leishmania 등), 뉴질랜드 — 인증 실험실에서 음성 확인이 필요합니다.',
    doneSummary: '전염병 검사가 완료되었습니다.',
    applicability: {
      destinations: ['australia', 'new_zealand'],
      species: 'all',
      tripType: 'all',
    },
    order: 70,
    done: 'has-infectious-disease-test',
    inputs: [
      { key: 'infectious_disease_records', label: '검사일', type: 'date_array' },
    ],
    allowAttachments: true,
  },

  // ── 8. 외부구충 ────────────────────────────────────────────────────────
  {
    id: 'external-parasite',
    category: 'preparation',
    title: '외부구충',
    shortLabel: '외부',
    description:
      'EU 6국·호주·뉴질랜드 등에서 출국 직전 진드기/벼룩 처치가 요구됩니다.',
    doneSummary: '외부구충 처치가 완료되었습니다.',
    applicability: {
      destinations: [
        'uk',
        'ireland',
        'malta',
        'norway',
        'finland',
        'australia',
        'new_zealand',
        'turkey',
        'mexico',
        'brazil',
        'uae',
        'hawaii',
        'guam',
        'philippines',
      ],
      species: 'all',
      tripType: 'all',
    },
    order: 80,
    done: 'has-external-parasite',
    inputs: [
      { key: 'external_parasite_dates', label: '처치일', type: 'date_array' },
    ],
    allowAttachments: true,
  },

  // ── 9. 내부구충 ────────────────────────────────────────────────────────
  {
    id: 'internal-parasite',
    category: 'preparation',
    title: '내부구충',
    shortLabel: '내부',
    description:
      'EU 6국(영국·아일랜드·몰타·노르웨이·핀란드 + 북아일랜드)은 출국 24~120시간 전 praziquantel 류 촌충약이 필수입니다. 시간(분 단위)까지 기록됩니다.',
    doneSummary: '내부구충 투약이 완료되었습니다.',
    applicability: {
      destinations: [
        'uk',
        'ireland',
        'malta',
        'norway',
        'finland',
        'australia',
        'new_zealand',
        'turkey',
        'eu',
        'philippines',
      ],
      species: 'all',
      tripType: 'all',
    },
    order: 90,
    done: 'has-internal-parasite',
    inputs: [
      { key: 'internal_parasite_dates', label: '투약일', type: 'date_array' },
      { key: 'deworming_time', label: '투약 시각 (EU 6국 한정)', type: 'text', helpText: 'YYYY-MM-DD HH:mm 형식' },
    ],
    allowAttachments: true,
  },

  // ── 10. 수입허가 ───────────────────────────────────────────────────────
  {
    id: 'import-permit',
    category: 'permit',
    title: '수입 허가 신청',
    shortLabel: '허가',
    description:
      '호주(DAFF), 뉴질랜드(MPI), 대만(APHIA), 말레이시아(DVS) 등은 도착 전 수입허가가 필요합니다. 허가번호가 검역증에 명시되어야 합니다.',
    doneSummary: '수입 허가 신청이 완료되었습니다.',
    applicability: {
      destinations: ['australia', 'new_zealand', 'taiwan', 'malaysia'],
      species: 'all',
      tripType: 'all',
    },
    order: 100,
    deadline: { anchor: 'departure', daysBefore: 30 },
    done: 'manual-flag:import-permit-issued',
    inputs: [
      { key: 'permit_no', label: '허가 번호', type: 'text' },
    ],
    allowAttachments: true,
    attachmentHint: '허가서를 사진, PDF로 보관하세요.',
  },

  // ── 11. 내원 — 수의사 검진 ──────────────────────────────────────────────
  {
    id: 'vet-visit',
    category: 'document',
    title: '내원 · 임상검진',
    shortLabel: '내원',
    description:
      '대부분 국가는 출국 10일 이내(일본·EU 등) 또는 14일 이내 검진 기록을 요구합니다. 이 검진을 바탕으로 다음 단계의 검역증명서가 발급됩니다.',
    doneSummary: '임상검진이 완료되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 110,
    deadline: { anchor: 'departure', daysBefore: 10 },
    done: 'has-vet-visit',
    inputs: [
      { key: 'vet_visit_date', label: '내원일', type: 'date' },
    ],
    validationIds: ['jp.vet-visit-within-10days-of-departure'],
  },

  // ── 12. 검역증명서 발급 ────────────────────────────────────────────────
  {
    id: 'certificate-issue',
    category: 'document',
    title: '검역증명서 발급',
    shortLabel: '증명서',
    description:
      '농림축산검역본부 발급. 일본 EQC, EU AnnexIII, 호주 RNATT 등 목적지별 양식이 달라 펫무브워크에서 자동 생성됩니다.',
    doneSummary: '검역증명서 발급이 완료되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 120,
    deadline: { anchor: 'departure', daysBefore: 7 },
    done: 'manual-flag:certificate-issued',
    allowAttachments: true,
    attachmentHint: '발급된 검역증명서 PDF 가 자동 첨부됩니다.',
  },

  // ── 13. 항공 예약 ──────────────────────────────────────────────────────
  {
    id: 'flight-booking',
    category: 'logistics',
    title: '항공 예약 확정',
    shortLabel: '항공',
    description:
      '항공권 · 켄넬 · 위탁/기내 동반 여부를 확정합니다. 일본·태국 등은 항공편명까지 검역증명서에 기재되어야 합니다.',
    doneSummary: '항공 예약이 확정되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 130,
    done: 'manual-flag:flight-booked',
    inputs: [
      { key: 'entry_date', label: '도착일', type: 'date' },
      { key: 'entry_flight_number', label: '항공편명', type: 'text' },
      { key: 'entry_airport', label: '도착공항 (IATA)', type: 'text' },
    ],
  },

  // ── 14. 출국·도착 ──────────────────────────────────────────────────────
  {
    id: 'departure',
    category: 'travel',
    title: '출국 · 도착',
    shortLabel: '출국',
    description:
      '공항 검역대 → 항공 탑승 → 도착지 검역소 입국 심사. 도착 후 일부 국가는 7~10일 자가 격리 또는 검역소 격리가 적용됩니다.',
    doneSummary: '출국이 완료되었습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 140,
    deadline: { anchor: 'departure', daysBefore: 0 },
    done: 'departure-past',
  },
]
