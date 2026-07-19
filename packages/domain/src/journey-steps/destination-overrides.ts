import type { StepDefinition } from './types'
import { DESTINATION_OVERRIDES } from '../destination-config'

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
    // 일본 케이스에서만 '일본 수입 검역'으로 표시. 다른 목적지는 base 그대로.
    departure: {
      title: '일본 수입 검역',
      shortLabel: '수입',
      description:
        '일본 도착 후 공항 동물검역소에서 검역을 받으세요.\n위치는 공항마다 달라요. 일반적으로 입국 심사대를 지나 수화물 찾는 곳 근처에 있어요. 세관 심사대를 지나기 전에 검역을 먼저 받아야 해요.',
      doneSummary: '일본 수입 검역을 받았어요.',
      // 일본 수입검역은 도착 후 공항 검역소 방문이 핵심 — 출국일 경과(base 의
      // departure-past)가 아니라 검역일 입력 시 완료 처리. 검역일 필드도 노출.
      done: 'has-jp-import-quarantine',
      inputs: [
        { key: 'jp_import_quarantine_date', label: '검역일', type: 'date' },
      ],
      allowAttachments: true,
      attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
      links: [
        { url: '/guide/japan-airport-quarantine', label: '공항 동물검역소 위치' },
      ],
    },
    // 출국 전 임상검사 — 일본은 별지 제25호 외에 FormAC(혹은 RE)도 발급받아야 한다.
    // base 카드(destinations:'all')는 별지 제25호만 안내(태국·필리핀 등 공용). FormAC 안내는
    // 일본 전용이라 여기서만 description 을 덮어쓴다. (base 를 직접 고치면 전 목적지에 누수됨.)
    'vet-visit': {
      description:
        '출국일 기준 10일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)와 FormAC를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
    },
  },
  // ── 중국 (GACC 海关总署) ──────────────────────────────────────────────
  // 일본 골격(광견병 2회 + 항체검사)에 중국 고유를 얹는다. EU 와 달리 EU 승인기관·채혈 후
  // 3개월 대기·서류확인만 입국이 아니다: ①항체검사는 GACC 지정 채신 lab(한국 미포함) ②항공권
  // 대기 없음(도착일에 백신·항체 유효면 됨) ③미충족 시 30일 격리. 광견병 1년 백신만 인정(2·3년
  // 입력불가는 portal getSaveBlockError). 규정 상세·출처는 procedure-checks/cn.ts 헤더. (2026-07-18)
  china: {
    'rabies-vaccine-1': {
      description:
        '1차 광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 91일이 지난 후에 접종해야 해요.\n면역 유효기간은 백신의 종류에 상관없이 1년이에요.\n중국 입국 때 면역 유효기간이 남아있어야 해요.',
      validationIds: ['cn.rabies-prime-after-91days-old'],
    },
    'rabies-vaccine-2': {
      description:
        '2차 광견병 백신을 접종하세요.\n\n명확한 규정은 없지만 1차 접종 후 30일 이상 지나서 하는 것이 좋아요.\n1차 접종 면역 유효기간 이내에 접종하세요.\n면역 유효기간은 백신의 종류에 상관없이 1년이에요.\n중국 입국 때 면역 유효기간이 남아있어야 해요.',
      validationIds: [
        'cn.rabies-booster-within-prime-validity',
        'cn.rabies-only-1year-vaccine',
      ],
    },
    // 추가 백신(3차+) — base 는 일본 전용 jp.* 주의라, 중국은 cn.* 로 매핑(일본 parity).
    'rabies-vaccine-extra': {
      validationIds: [
        'cn.rabies-validity-expires-soon',
        'cn.rabies-extra-within-previous-validity',
      ],
    },
    'rabies-titer': {
      description:
        '중국 해관총서(GACC)가 지정한 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n2차 접종 후에 검사해야 해요.\n0.5 IU/mL 이상이면 합격이에요.\n검사 결과는 채혈일로부터 1년간 유효해요.',
      validationIds: [
        'cn.rabies-titer-chain-consistent',
        'cn.rabies-titer-vs-booster',
        'cn.rnatt-valid-1year-on-arrival',
      ],
    },
    // 항공권 — 중국은 채혈 후 대기 요건이 없다(EU 3개월·일본 180일과 다름). 입국 시 백신·항체
    // 유효만 필요. earliest/validationIds 로 대기 차단을 끈다(base 의 일본 180일 anchor 제거).
    'flight-purchase': {
      description:
        '중국 입국 일정에 맞춰 항공권을 구매하세요.\n\n중국은 광견병 항체 검사 후 별도의 대기 기간이 없어요. 마이크로칩·광견병 접종·항체 검사가 유효한 상태로 입국하면 돼요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '중국에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: [],
    },
    // 도착 — 중국 수입 검역. 마이크로칩 + 항체 ≥0.5 IU/ml + 현장검역 합격 시 격리 면제,
    // 미충족 시 GACC 지정 격리시설 30일.
    departure: importQuarantineCard({
      label: '중국',
      fieldKey: 'cn_import_quarantine_date',
      description:
        '중국 도착 후 공항 세관(해관)에서 검역을 받으세요.\n마이크로칩과 서류를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.\n입국 요건을 충족하지 못하면 지정 시설에서 30일간 격리되거나 한국으로 반송돼요.',
      helpText: '중국 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '수입 검역 확인 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '중국 수입 검역 서류',
      validationIds: ['cn.import-quarantine-date-valid'],
    }),
  },
  // ── 베트남 (DAH Cục Thú y) ────────────────────────────────────────────
  // 태국·필리핀 골격이지만 수입허가가 없다(Circular 25 제10조 — 2마리 이하 동반 면제).
  // 대신 출국 전 DAH 검역 신청(vn-advance-notice, order 47). 항체는 한국 귀국용만.
  // 규정 상세·출처는 procedure-checks/vn.ts 헤더.
  vietnam: {
    // 1회 접종국 — base 의 '광견병 백신 1차' 대신 '광견병 백신'(대만·태국과 같은 처리).
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description:
        '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 3개월이 지난 후에 접종해야 해요.\n출국 30일 전까지 접종해야 해요.\n면역 유효기간은 1년이에요. 3년 백신은 인정되지 않아요.\n베트남 입국 때 면역 유효기간이 남아있어야 해요.',
      doneSummary: '광견병 백신을 접종했어요.',
      done: 'has-rabies-valid',
      validationIds: ['vn.rabies-prime-after-91days-old', 'vn.microchip-before-rabies'],
    },
    // 항체검사 — 베트남 입국 요건이 아니다(DAH 의무 아님). 한국 귀국용이라 왕복에만 뜬다
    // (TITER_RETURN_ONLY_DESTINATIONS 파생). 베트남에 검사기관이 없어 한국에서 미리 받아야 한다.
    'rabies-titer': {
      description:
        '한국에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n베트남 입국에는 필요 없지만, 한국으로 돌아올 때 반드시 필요해요.\n베트남에는 검사 기관이 없으니 출국 전에 미리 받으세요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    // 항공권 — 일본의 항체 180일 대기 미적용(베트남은 항체 자체가 입국 요건 아님).
    // 제약은 광견병 접종 후 30일 대기 하나.
    'flight-purchase': {
      description:
        '베트남 입국 일정에 맞춰 항공권을 구매하세요.\n\n광견병 접종일로부터 30일이 지난 후에 입국할 수 있어요.\n지정된 공항으로만 입국할 수 있어요. 호치민(SGN)·하노이(HAN)·다낭(DAD)·나트랑(CXR)이에요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '베트남에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['vn.rabies-min-30days-before-departure'],
    },
    // 도착 — 요건 충족 시 무격리, 미충족 시 14일.
    departure: importQuarantineCard({
      label: '베트남',
      fieldKey: 'vn_import_quarantine_date',
      description:
        '베트남 도착 후 공항 동물검역소에서 검역을 받으세요.\n마이크로칩과 서류를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.\n입국 요건을 충족하지 못하면 지정 시설에서 14일간 격리되거나 한국으로 반송돼요.',
      helpText: '베트남 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '수입 검역 확인 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '베트남 수입 검역 서류',
      validationIds: ['vn.import-quarantine-date-valid'],
    }),
  },
  // ── 대만 (APHIA 動植物防疫檢疫署) ─────────────────────────────────────
  // 1회 접종 + 항체검사 모델(EU 골격)이지만 대기·허가 구조가 다르다: ①채혈 후 180일 대기
  // (일본과 같아 base 항공권 earliest anchor 를 그대로 상속) ②수입허가증을 도착 120일 전까지
  // 온라인 신청(격리 면제 조건 — 20일 전까지도 가능하나 7일 격리) ③요건 충족 시 무격리.
  // 불활화 백신만·유효 1년(2·3년 입력불가는 프로파일 oneYearVaccineOnly 파생). 종합백신 카드는
  // 대만 공식 요건에 없어 미노출(2026-07-18 사용자 결정). 규정 상세·출처는 procedure-checks/tw.ts.
  taiwan: {
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description:
        '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 90일이 지난 후에 접종해야 해요.\n불활화(사독) 백신만 인정돼요.\n면역 유효기간은 1년이에요.\n대만 입국 때 면역 유효기간이 남아있어야 해요.',
      doneSummary: '광견병 백신을 접종했어요.',
      earliest: { anchor: 'birth', daysAfter: 90 },
      done: 'has-rabies-valid',
      validationIds: ['tw.rabies-prime-after-90days-old', 'tw.microchip-before-rabies'],
    },
    'rabies-titer': {
      description:
        // 마이크로칩 스캔 후 채혈은 전 목적지 공통 절차이고 수의사가 하는 일이라 카드에 두지
        // 않는다(다른 12개 목적지 어디에도 없던 줄 — 2026-07-18 제거).
        //
        // 접종~채혈 간격: APHIA 공식 문답집(2024-02)에 규정 없음 — 채혈 시점은 입국일 기준
        // ('輸入 90 日前至輸入 1 年前')으로만 정해져 있다. USDA 대만 안내 페이지엔 'not sooner        // than 30 days after the primary vaccination'이 있으나 대만 공식 근거가 없어 단정하지
        // 않고 권고로만 적는다(중국 2차 접종 간격과 같은 방식).
        '대만 검역청(APHIA)이 인정하는 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n명확한 규정은 없지만 접종 후 30일 이상 지나서 검사하는 것이 좋아요.\n0.5 IU/mL 이상이면 합격이에요.\n검사 결과는 채혈일로부터 1년간 유효해요.',
      validationIds: ['tw.rnatt-after-rabies-vaccine'],
    },
    // 항공권 — 채혈 후 180일 대기는 일본과 동일(base earliest anchor 상속). 검증만 tw 로 교체.
    'flight-purchase': {
      description:
        // 120일 안내는 수입허가증 카드(order 43, 이 카드보다 앞)가 담당 — 중복이라 뺀다.
        '대만 입국 일정에 맞춰 항공권을 구매하세요.\n\n채혈일로부터 180일~1년 사이에 대만에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '대만에 입국할 수 있어요.',
      validationIds: ['tw.rnatt-180days-to-1year-before-arrival'],
    },
    // 수입허가증 — APHIA pet e-permit 온라인 신청. 도착 120일 전 = 격리 면제 조건.
    //
    // 항공권(45) 앞에 둔다(base 100 → 43). 대만은 신청에 항공권이 필요 없고(예정 입국일·도착
    // 공항만, 이후 1회 변경 가능) 마감이 도착 120일 전으로 훨씬 이르다 — 실무에서도 허가 신청을
    // 먼저 한다. 태국·필리핀(90·95 → 100)은 반대로 신청에 항공편 일정이 필수라 항공권이 앞이다.
    // 두 절차 사이에 의존이 없을 뿐 '동시에 하는 일'은 아니므로 concurrent 는 쓰지 않는다.
    'import-permit': {
      order: 43,
      description:
        '대만 수입 허가증을 신청하세요.\n\n도착 120일 전까지 온라인으로 신청하세요.\n도착 20일 전까지 신청할 수 있지만, 이 경우 대만 도착 후 7일간 지정 시설에서 격리돼요.',
      doneSummary: '대만 수입 허가증을 받았어요.',
      cardLine: '대만 수입 허가증을 신청하세요.',
      deadline: { anchor: 'departure', daysBefore: 120 },
      inputs: [{ key: 'import_permit_application_date', label: '신청일', type: 'date' }],
      attachmentHint: '수입 허가증(Import Permit)을 사진·PDF로 보관하세요.',
      attachmentLabel: '수입 허가증(Import Permit)',
      links: [
        { url: 'https://pet-epermit.aphia.gov.tw/index-eng.html', label: '수입 허가 신청(APHIA)' },
      ],
      validationIds: ['tw.import-permit-120days-before-entry'],
    },
    // 출국 전 임상검사 — 대만은 별지 제25호 외에 APHIA Form 002(대만 건강증명서)도
    // 발급받아야 한다. 일본(FormAC)·EU(Annex III)와 같은 자리·같은 문형.
    'vet-visit': {
      description:
        '출국일 기준 10일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)와 대만 건강증명서(APHIA Form 002)를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
    },
    departure: importQuarantineCard({
      label: '대만',
      fieldKey: 'tw_import_quarantine_date',
      description:
        '대만 도착 후 공항 동물검역소에서 검역을 받으세요.\n마이크로칩과 서류를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.\n입국 요건을 충족하지 못하면 지정 시설에서 7일간 격리되거나 한국으로 반송돼요.',
      helpText: '대만 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '수입 검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '대만 수입 검역 서류',
      validationIds: ['tw.import-quarantine-date-valid'],
    }),
  },
  // 일본을 뼈대로 — 'departure' 공용 카드를 그 나라 '[국가] 수입 검역' 도착 카드로 교체.
  // 목적지마다 따로 작성(검역일 필드도 나라별: {국가}_import_quarantine_date). 제목·설명은
  // 그 나라 가이드 기준, 일본과 같은 부분은 같은 문구. 완료신호는 그 나라 검역일 필드를 실어 보낸다.
  //
  // 태국 출처: DLD(축산국) AQS-Suvarnabhumi 공식 안내 + 태국 외교부 PDF(Rev. 30 Jan 2025)
  // + 주미 태국대사관 — 상세 수치는 procedure-checks/th.ts 헤더 주석 참고.
  thailand: seaPermitOverrides({
    label: '태국',
    // 광견병 백신 — 21일 대기·유효기간(입국일 기준)은 보호자가 백신 step 에서 조치 못 함 —
    // 항공권 구매 step 에 매핑. 여기는 접종일 자체의 요건만.
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
    rabiesValidationIds: ['th.rabies-prime-after-12weeks', 'th.microchip-before-rabies'],
    titerDescription:
      '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n\n0.5 IU/mL 이상이면 합격이에요.\n\n유효기간은 2년이에요.',
    // 종합백신 — 태국은 강아지 DHPPL(렙토스피라 포함) / 고양이 범백혈구감소증(FPV).
    // 광견병과 접종 종류·연령만 다르고 나머지 조건(칩 이후·21일 전·수입허가 2주 전·유효기간)은
    // 동일 — 광견병 카드 문구를 그대로 맞춤(종합백신은 최소 접종 연령 요건이 없어 그 줄만 생략).
    generalVaccine: {
      description:
        '강아지는 DHPPL(디스템퍼·전염성간염·파보·파라인플루엔자·렙토스피라), 고양이는 범백혈구감소증(FPV)이 포함된 종합백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
      descriptionBySpecies: {
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
      },
      validationIds: ['th.microchip-before-general-vaccine'],
    },
    // 항공권 — 일본(항체검사 180일)과 제약이 달라 교체: 백신 21일 대기 + 수입허가 일정(60일
    // 유효)이 기준. 수입 허가 신청에 항공편 일정이 필요하므로 항공권을 수입허가(100) 앞에(90).
    // 21일 룰은 입력 차단(validateThEntryDate)과 procedure-check 가 담당. 백신 '입국 전 만료'
    // (*.not-expired-on-arrival)는 각 백신 카드 situational 담당(ADVISORY_DEFERRED_CHECKS).
    flight: {
      description:
        '태국 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 3주가 지난 후에 입국할 수 있어요.\n항공권 구매 후 수입 허가 신청을 해요. 2주 이상 충분한 시간을 확보하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      order: 90,
      validationIds: [
        'th.rabies-21days-before-arrival',
        'th.general-vaccine-21days-before-arrival',
      ],
    },
    // 수입 허가 — 태국 입국 공항 동물검역소(AQS)에 이메일 신청. 허가 번호 대신 첨부·완료
    // 버튼으로 완료 처리(deriveImportPermitStatus). 출국 전 이메일로 받는 R.6 명칭으로 라벨
    // 교체(입국 검역 때 받는 R.7 은 수입 검역 카드에서). situational·완료 판정은 base 그대로.
    importPermit: {
      description:
        '입국 공항 동물검역소에 수입 허가 신청을 하세요.\n\n입국 7영업일 전까지 이메일로 신청해요.\n접종일로부터 2주가 지난 후에 신청할 수 있어요.\n수입 허가 통지서(R.6)가 발급되며 60일간 유효해요.',
      doneSummary: '태국 수입 허가 통지서(R.6)를 받았어요.',
      cardLine: '태국 수입 허가 신청을 하세요.',
      deadline: { anchor: 'departure', daysBefore: 9 },
      attachmentHint: '수입 허가 통지서(R.6)를 사진·PDF로 보관하세요.',
      attachmentLabel: '수입 허가 통지서(R.6)',
      links: [
        { url: '/forms/R1.1.pdf', label: '신청서 내려받기(R.1/1)' },
        { url: '/guide/th-aqs-contacts', label: '동물검역소 연락처(AQS)' },
      ],
      validationIds: [
        'th.import-permit-9days-before-entry',
        'th.import-permit-14days-after-vaccines',
      ],
    },
    importQuarantine: {
      fieldKey: 'th_import_quarantine_date',
      description:
        '태국 도착 후 공항 동물검역소(AQS)에서 검역을 받으세요.\n검사를 통과하면 수입 허가서(R.7)를 받아요.',
      helpText: '태국 동물검역소(AQS)에서 수입 검역을 받은 날짜',
      attachmentHint: '수입 허가서(R.7) 사본을 사진·PDF로 보관하세요.',
      validationIds: ['th.import-quarantine-date-valid'],
    },
  }),

  // 필리핀 출처: BAI(동물산업국) MC No.49(2022)·BAI Pet Import 공식 안내 + petmove.co.kr
  // 필리핀 가이드 — 상세 수치는 procedure-checks/ph.ts 헤더 주석 참고. 태국과 같은 골격
  // (광견병 1회·종별 종합백신·수입허가 2단계·도착검역) + 필리핀 고유: 구충 7~91일,
  // 생후 120일 입국 자격, 부스터는 대기 기간 면제.
  philippines: seaPermitOverrides({
    label: '필리핀',
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
    rabiesValidationIds: ['ph.rabies-prime-after-12weeks', 'ph.microchip-before-rabies'],
    titerDescription:
      '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n0.5 IU/mL 이상이면 합격이에요.\n한국 입국에 사용 시 유효기간은 2년이에요.',
    generalVaccine: {
      description:
        '강아지는 DHPPL(디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라), 고양이는 FVRCP(범백혈구감소증·허피스·칼리시)가 포함된 종합백신을 접종하세요.\n\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종해요.\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증·허피스바이러스·칼리시바이러스가 포함되어야 해요.\n마이크로칩 삽입 후 접종해요.\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      },
      validationIds: ['ph.microchip-before-general-vaccine'],
    },
    // 항공권 — 생후 120일·21일 대기 룰만. 백신 '입국 전 만료'는 각 백신 카드 situational 담당
    // (태국과 동일 — ADVISORY_DEFERRED_CHECKS).
    flight: {
      description:
        '필리핀 입국 일정에 맞춰 항공권을 구매하세요.\n\n4개월령 이상만 입국할 수 있어요.\n접종일로부터 3주가 지난 후 입국할 수 있어요.\n수입 허가증(SPSIC) 신청이 필요해요. 충분한 시간을 확보하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      order: 95,
      validationIds: [
        'ph.min-120days-on-arrival',
        'ph.rabies-prime-21days-before-arrival',
        'ph.general-vaccine-prime-21days-before-arrival',
      ],
    },
    // 수입 허가증(SPSIC) — Intercommerce 온라인 신청. 마감 배지 없음(고정 X일 전 규칙이 없어
    // base deadline 을 undefined 로 무효화). 권장 시점은 description 으로만 안내.
    importPermit: {
      title: '수입 허가증(SPSIC) 신청',
      description:
        '필리핀 수입 허가증(SPSIC)을 신청하세요.\n\nIntercommerce 사이트에서 온라인으로 신청해요.\n접종일로부터 2주가 지난 후에 신청할 수 있어요.\n신청일 기준 4개월령 이상이어야 해요. 3마리까지 신청할 수 있어요.\n승인까지 수 일이 걸려요. 최소 1~2주 전까지 신청하세요.\n수입 허가증은 발급일로부터 60일간 유효해요.',
      doneSummary: '필리핀 수입 허가증(SPSIC)을 받았어요.',
      cardLine: '필리핀 수입 허가증(SPSIC)을 신청하세요.',
      deadline: undefined,
      links: [
        { url: 'https://www.intercommerce.com.ph/login.asp?home=HOME', label: '수입 허가 신청(Intercommerce)' },
      ],
      attachmentLabel: '수입 허가증(SPSIC)',
      validationIds: ['ph.import-permit-14days-after-vaccines'],
    },
    importQuarantine: {
      fieldKey: 'ph_import_quarantine_date',
      description:
        '필리핀 도착 후 공항 동물검역소에서 BAI 동물검역관(VQO)에게 검역을 받으세요.',
      helpText: 'BAI 동물검역관(VQO)에게 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      validationIds: ['ph.import-quarantine-date-valid'],
    },
    // 필리핀 고유 — 내부구충만 필수(SPSIC 신청 7일~3개월 전). 외부구충은 SPSIC import terms
    // 7항상 "recommended but optional" 이라 카드 비노출(catalog 적용 목적지에서 제외).
    // 종합백신(50) 뒤·항체검사(55, 귀국용) 앞 order 52 — 입국 요건인 구충을 먼저 보여준다.
    extra: {
      'internal-parasite': {
        description:
          '내부 기생충 치료를 하세요.\n\n수입 허가증(SPSIC) 신청 전 7일~3개월 사이에 치료하세요.',
        doneSummary: '내부 기생충 치료를 했어요.',
        order: 52,
      },
    },
  }),

  // ── EU 패밀리 — 규정 동일(EU Reg 576/2013), 카드 한 벌을 만들어 8개 키에 복사 ─────
  // 예외만 나라별: 영국=촌충+화물 운송 / 아일랜드=촌충+사전 통지(ie-advance-notice 카드) /
  // 몰타=촌충+사전 통지(mt-advance-notice) / 노르웨이=촌충+사전 통지(no-advance-notice) /
  // 핀란드=촌충 / 키프로스=사전 통지(cy-advance-notice, 촌충 없음) / 스위스=수입허가(FSVO).
  // 촌충 카드(echinococcus-treatment)와 사전 통지 카드는 catalog 의 applicability 가 담당 —
  // 여기는 문구·검증 매핑만.
  // 출처: EU Reg 576/2013·2018/772 + petmove.co.kr EU/영국/스위스 가이드 + gov.ie·mattilsynet.no·
  // moa.gov.cy·servizz.gov.mt(사전 통지, 2026-07-16 확인).
  // 항체 검사 기관: 2026-04-22부터 농림축산검역본부 단일화 (petmove.co.kr 공지).
  eu: euFamilyOverrides({ label: '유럽연합(EU)', euAhc: true }),
  uk: (() => {
    const base = euFamilyOverrides({
      label: '영국',
      // flightExtraLine 미지정 — description 을 아래에서 통째로 재작성하므로 여기 넣어도 안 쓰임.
      departureDescription:
        '영국 도착 후 반려동물은 동물접수센터(Animal Reception Centre)로 옮겨져 검역관의 확인을 받아요.\n마이크로칩과 서류를 확인하는 데 2~8시간 정도 걸릴 수 있어요.\n보호자가 직접 데리러 가야 하며, 동물의 건강과 서류에 이상이 없으면 격리 없이 인도돼요.',
    })
    return {
      ...base,
      // 반려동물 화물 운송(경유 포함) 참고 링크 추가 — base 의 다른 필드(cardLine·validationIds
      // 등)를 잃지 않도록 flight-purchase 는 spread 후 필요한 필드만 덧붙인다.
      // description 은 전체 재작성 — base 템플릿의 마지막 줄("항공사에 반려동물 동반 가능
      // 여부를 꼭 확인하세요")이 영국은 애초에 기내 동반 자체가 불가(화물 전용)라 바로 위 줄과
      // 모순돼 보여 제거. 다른 EU 패밀리 국가는 기내·수하물 동반이 가능한 경우가 있어 그대로 둔다.
      'flight-purchase': {
        ...base['flight-purchase'],
        description:
          '영국 입국 일정에 맞춰 항공권을 구매하세요.\n\n광견병 항체 검사 채혈일로부터 3개월이 지난 후에 입국할 수 있어요.\n영국 입국 시 반려동물은 보호자와 같은 항공기로 갈 수 없어요. 화물로 보내야 하므로 동물 운송업체와 미리 협의하세요.',
        links: [
          {
            url: 'https://www.petmove.co.kr/blog/travel-to-uk-with-pet-via-france/',
            label: '반려동물과 함께 프랑스를 경유하여 영국으로 가는 방법',
          },
        ],
      },
      // 귀국 서류 — 영국은 base 템플릿(EU 반려동물 여권 대체 가능)과 달리 실제 발급 절차가
      // 다르다. 2026-04-22부로 GB 거주자는 EU 반려동물 여권 발급 자체가 막혀 대체 서류로
      // 의미 없어 제거. 대신 실제 발급 순서(① OV 섭외 ② 그 OV를 지정해 온라인 신청 ③ 그
      // OV에게 방문 진료·서명)를 단계별로 명시 — "아무 병원이나 예약 후 신청"으로 오해 방지.
      // "한국 출국 시 받은 동물검역증으로 대체 가능" 문구는 base(EU 일반 규정) 에서 그대로
      // 가져온 것이었는데, gov.uk EHC 3908 공식 페이지·가이드에 그런 대체 조항이 없어 삭제
      // (2026-07-17 재확인) — 오히려 "must apply" 로 명시된 필수 서류. 3908EHC 공식 서식
      // 원문(Section IV·V) 확인: 검진은 출국 48시간 이내(examined ... not more than 48 hours
      // prior to the proposed date of export), 증명서 자체는 발급일로부터 7일간 유효
      // (This certificate is valid for 7 days) — 두 조건이 별개라 함께 명시.
      'eu-export-cert': {
        description:
          '영국 정부 발행 건강증명서(Export Health Certificate, EHC 3908)를 준비하세요. 한국 입국을 위한 필수 서류예요.\n\nAPHA 공인 수의사(Official Veterinarian, OV) 명단에서 진료해줄 수의사를 먼저 찾아 연락하세요. 일반 동물병원이 아니라 OV 자격이 있는 수의사만 발급·서명할 수 있어요.\nEHC Online 시스템에서 정부 계정(Government Gateway)에 등록하고, 연락한 수의사를 인증자로 지정해 신청하세요.\n지정한 수의사를 찾아가 검진을 받고 건강증명서를 발급받으세요. 출국 48시간 이내에 검진을 받아야 하고, 발급된 증명서는 7일간 유효해요.',
        // base attachmentHint 가 'EU 반려동물 여권'을 예시로 들지만 영국은 그 대체가 안 통해
        // (위 description 참고) 별도로 교체.
        attachmentHint: '건강증명서(EHC) 사본을 사진·PDF로 보관하세요.',
        // 영국은 한국행 전용 공식 명칭(EHC 3908)이 있어 '{나라} 정부 인증 건강증명서' 대신
        // 실제 서류명을 쓴다(euFamilyOverrides 의 동적 라벨을 덮어씀).
        attachmentLabel: '건강증명서(EHC 3908)',
        // 한국행 전용 인증서(3908) 공식 페이지 — 신청 시스템·수의사 명단·서식 안내로 다시
        // 연결되는 허브라 링크 하나로 충분(아일랜드·노르웨이 등 사전통지 카드와 동일 패턴).
        links: [
          {
            url: 'https://www.gov.uk/export-health-certificates/export-cats-and-dogs-to-south-korea-certificate-3908',
            label: '건강증명서(EHC 3908) 안내',
          },
        ],
      },
    }
  })(),
  ireland: euFamilyOverrides({
    label: '아일랜드',
    departureDescription:
      '아일랜드 도착 후 공항에서 입국 검사(Compliance Check)를 받으세요.\n사전 통지 후 이메일로 안내받은 절차에 따라 진행돼요.\n검역관이 마이크로칩과 서류(건강증명서·광견병 항체 검사 결과지·촌충 치료 기록)를 확인해요.\n서류가 완비되고 건강에 이상이 없으면 격리 없이 바로 인도돼요.',
  }),
  malta: euFamilyOverrides({ label: '몰타' }),
  norway: {
    ...euFamilyOverrides({ label: '노르웨이' }),
    // 노르웨이는 EU 비회원국(EEA) → 한국 재입국 시 EU 반려동물 여권으로 검역증명서를 대체할 수
    // 없다. 한국 QIA 규정은 "EU 회원국에서 발행하고 출발국이 EU 회원국인 경우"만 여권 대체를
    // 허용(2026-07-17 확인). 공통 문구의 'EU 반려동물 여권' 대체 항목 제거.
    'eu-export-cert': {
      description:
        '노르웨이 정부가 인증한 건강증명서 또는 대체 서류를 준비하세요.\n현지 동물병원에서 건강증명서를 받은 뒤, 관할 당국(공무 수의사)의 최종 인증을 받으세요.\n다음 서류가 있다면 건강증명서를 새로 발급받지 않아도 돼요\n- 한국 출국 시 받은 동물검역증',
      // 이 블록이 euFamilyOverrides 의 'eu-export-cert' 를 통째로 대체하므로
      // attachmentLabel 도 여기서 다시 지정해야 한다(안 하면 원본 파일명으로 저장).
      attachmentLabel: '노르웨이 정부 인증 건강증명서',
    },
  },
  finland: euFamilyOverrides({ label: '핀란드' }),
  cyprus: euFamilyOverrides({ label: '키프로스' }),
  switzerland: {
    ...euFamilyOverrides({
      label: '스위스',
      flightExtraLine: '반려동물의 스위스 입국은 바젤·제네바·취리히 공항으로만 가능해요.',
    }),
    // 귀국 서류 — 스위스는 EU 처럼 자체 수출 의무가 없다(BLV: "출국 시 목적지국 규정을 따른다",
    // 수출자가 목적지 요건 충족 책임). 즉 일본·태국·필리핀(자체 수출검역 필수)·영국(EHC 자체
    // 법 의무)과 달리, 스위스 증명서는 '한국 입국 요건'을 맞추기 위한 것 → 한국이 재입국 시
    // 인정하는 '한국 출국 시 동물검역증'으로 대체 가능. 단 EU 비회원국이라 EU 여권 대체는 불가
    // (한국 QIA). 관할 당국은 칸톤(주) 수의청(2026-07-17 확인).
    'eu-export-cert': {
      description:
        '스위스 정부가 인증한 건강증명서 또는 대체 서류를 준비하세요.\n현지 임상 수의사에게 건강증명서를 받은 뒤, 관할 칸톤(주) 수의청의 공무 수의사에게 최종 인증을 받으세요.\n다음 서류가 있다면 건강증명서를 새로 발급받지 않아도 돼요\n- 한국 출국 시 받은 동물검역증',
      // 이 블록이 euFamilyOverrides 의 'eu-export-cert' 를 통째로 대체하므로
      // attachmentLabel 도 여기서 다시 지정해야 한다(안 하면 원본 파일명으로 저장).
      attachmentLabel: '스위스 정부 인증 건강증명서',
    },
    // 스위스 고유 — FSVO 수입허가 (EU 와 다른 유일한 추가 절차). 한국은 광견병 위험국이라 필요.
    // 신청 방법(양식·제출처)은 BLV 개·고양이 페이지에 링크(2026-07-17 확인).
    'import-permit': {
      description:
        '스위스 수입허가를 신청하세요.\n\n스위스 연방 식품안전수의청(FSVO)에 입국 최소 3주 전까지 신청해야 해요.\nFSVO 웹사이트에서 신청서를 내려받아 작성한 뒤 이메일로 제출해요.\n발급받은 허가서는 스위스 입국 검사 때 제시해요.\n반려동물의 스위스 입국은 바젤·제네바·취리히 공항으로만 가능해요.',
      doneSummary: '스위스 수입 허가증을 받았어요.',
      cardLine: '스위스 수입허가를 신청하세요.',
      deadline: { anchor: 'departure', daysBefore: 21 },
      links: [
        {
          url: 'https://www.blv.admin.ch/blv/en/home/tiere/reisen-mit-heimtieren/hunde-katzen-und-frettchen.html',
          label: '수입 허가 안내·신청(FSVO)',
        },
      ],
      attachmentLabel: '수입 허가증(FSVO)',
      validationIds: ['eu.ch-import-permit-21days-before-entry'],
    },
  },
}

// ── 아키타입 템플릿 (Phase 2 — docs/destination-architecture-design.md) ────────
//
// 카드 한 벌의 **구조**(완료 신호·order·입력 모양·라벨 패턴)는 템플릿이 강제하고, 나라
// 고유 규정 **문구·검증 id** 만 주입한다 — 중국 추가 때 겪은 '구조 누락'(카드 빠짐,
// 완료 신호 불일치)을 반복하지 않기 위한 장치. 문구 보존은 lint:copy 골든이 증명.
//
//  - eu-family: euFamilyOverrides — 규정 동일(EU Reg 576/2013), 문구까지 공통 + 나라 델타.
//  - sea-permit: seaPermitOverrides — 광견병 1회 + 종별 종합백신 + 수입허가 2단계 + 도착검역
//    구조 공통, 규정 수치·서류명이 나라별이라 문구는 주입식(태국·필리핀).
//  - jp-2dose: base catalog 자체가 일본 골격 — 템플릿 없음. 중국처럼 나라 문구를 통째로
//    덮어쓰되, 도착 검역 카드는 importQuarantineCard 로 구조를 공유한다.

/**
 * '[국가] 수입 검역' 도착 카드 factory — 나라별 검역일 필드(quarantine:<field> 완료 신호,
 * by_dest 분리 저장)를 실은 공통 구조. sea-permit 템플릿과 중국(jp-2dose)이 공유.
 */
function importQuarantineCard(opts: {
  label: string
  /** 검역일 필드 키 — `{국가코드}_import_quarantine_date` (destination-scoped-fields 등록 필요). */
  fieldKey: string
  description: string
  helpText: string
  attachmentHint: string
  attachmentLabel?: string
  /**
   * **필수** — 그 나라 수입검역일 룰(`{국가}.import-quarantine-date-valid`).
   *
   * 선택으로 두었더니 대만·중국이 안 넘겨서 base 카드의 `jp.import-quarantine-date-valid`
   * 를 그대로 물려받았고, 룰의 country 가 japan 이라 두 나라에선 검증이 아예 돌지 않았다
   * (2026-07-19 발견). 화면에 안 보이는 배선이라 눈으로는 못 잡는다 — 타입으로 강제한다.
   * 교차 국가 지목은 `pnpm lint:validation-wiring` 이 전수 검사한다.
   */
  validationIds: string[]
}): Partial<StepDefinition> {
  const card: Partial<StepDefinition> = {
    title: `${opts.label} 수입 검역`,
    shortLabel: '수입',
    description: opts.description,
    doneSummary: `${opts.label} 수입 검역을 받았어요.`,
    done: `quarantine:${opts.fieldKey}`,
    inputs: [{ key: opts.fieldKey, label: '검역일', type: 'date', helpText: opts.helpText }],
    allowAttachments: true,
    attachmentHint: opts.attachmentHint,
  }
  if (opts.attachmentLabel) card.attachmentLabel = opts.attachmentLabel
  if (opts.validationIds) card.validationIds = opts.validationIds
  return card
}

/**
 * sea-permit 아키타입(태국·필리핀) 카드 한 벌 factory.
 *
 * 템플릿이 강제하는 구조:
 *  - 광견병 백신 = 1회 단일 카드('백신' 라벨, 생후 84일, has-rabies-valid — 만료 시 미완료)
 *  - 항체 검사 = 한국 귀국용 → order 55 (종합백신 50 뒤 — 광견병·종합백신이 '다음 할 일'에
 *    동시에 뜨게. base 40 이면 항체검사가 두 백신 사이를 막는다)
 *  - 항공권 = 채혈 후 대기 없음(earliest 제거) + `{label}에 입국할 수 있어요` 카드라인.
 *    order 는 수입허가(100) 앞뒤 나라별.
 *  - 수입허가 = 신청일 입력만(permit_no 제거) — deriveImportPermitStatus 2단계 모델
 *  - 도착 = importQuarantineCard 공통 구조
 */
function seaPermitOverrides(opts: {
  label: string
  rabiesDescription: string
  rabiesValidationIds: string[]
  titerDescription: string
  generalVaccine: Pick<
    Partial<StepDefinition>,
    'description' | 'descriptionBySpecies' | 'validationIds'
  >
  flight: { description: string; order: number; validationIds: string[] }
  importPermit: Partial<StepDefinition>
  importQuarantine: {
    fieldKey: string
    description: string
    helpText: string
    attachmentHint: string
    /** 필수 — importQuarantineCard 와 같은 이유(그 나라 룰을 반드시 지목). */
    validationIds: string[]
  }
  /** 나라 고유 추가 카드 오버라이드(필리핀 internal-parasite 등). */
  extra?: Partial<Record<string, Partial<StepDefinition>>>
}): Partial<Record<string, Partial<StepDefinition>>> {
  return {
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description: opts.rabiesDescription,
      doneSummary: '광견병 백신을 접종했어요.',
      earliest: { anchor: 'birth', daysAfter: 84 },
      done: 'has-rabies-valid',
      validationIds: opts.rabiesValidationIds,
    },
    'rabies-titer': { description: opts.titerDescription, order: 55 },
    'general-vaccine': opts.generalVaccine,
    'flight-purchase': {
      description: opts.flight.description,
      cardLine: `${opts.label}에 입국할 수 있어요.`,
      order: opts.flight.order,
      // 일본의 180일 anchor(항체 검사) 미적용 — 입국 대기 룰은 입력 차단·procedure-check 담당.
      earliest: undefined,
      validationIds: opts.flight.validationIds,
    },
    'import-permit': {
      inputs: [{ key: 'import_permit_application_date', label: '신청일', type: 'date' }],
      ...opts.importPermit,
    },
    departure: importQuarantineCard({ label: opts.label, ...opts.importQuarantine }),
    ...opts.extra,
  }
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
  /** EU 회원국(24개국)만 true — 출국 전 임상검사 카드에 EU 동물건강증명서(Annex III) 안내를
   *  덧붙인다. 비EU(영국·노르웨이·스위스)는 자체 증명서라 끈다. */
  euAhc?: boolean
}): Partial<Record<string, Partial<StepDefinition>>> {
  const { label, flightExtraLine, departureDescription, euAhc } = opts
  const overrides: Partial<Record<string, Partial<StepDefinition>>> = {
    // 광견병 백신 — 1회 + 항체 검사 모델(2차 카드 제외). 생후 12주(84일), 마이크로칩 이후.
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description: `광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n${label} 입국 때 면역 유효기간이 남아있어야 해요.`,
      doneSummary: '광견병 백신을 접종했어요.',
      earliest: { anchor: 'birth', daysAfter: 84 },
      done: 'has-rabies-valid',
      validationIds: ['eu.rabies-prime-after-12weeks', 'eu.microchip-before-rabies'],
    },
    // 항체 검사 — 접종 30일 후 채혈. EU 승인 검사기관(2000/258/EC 등재) 안내.
    'rabies-titer': {
      description: `EU 승인 검사기관에서 광견병 항체 검사를 받으세요.\n\n광견병 접종 후 30일 이상 지나서 검사하세요.\n동물병원을 통해 의뢰할 수 있어요.\n0.5 IU/mL 이상이면 합격이에요.`,
      validationIds: ['eu.titer-min-30days-after-vaccine'],
    },
    // 항공권 — 채혈 + 3개월(캘린더) 대기. 입력 차단(validateEuEntryDate)과 짝.
    'flight-purchase': {
      description: `${label} 입국 일정에 맞춰 항공권을 구매하세요.\n\n광견병 항체 검사 채혈일로부터 3개월이 지난 후에 입국할 수 있어요.${flightExtraLine ? `\n${flightExtraLine}` : ''}\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.`,
      cardLine: `${label}에 입국할 수 있어요.`,
      // 3개월은 캘린더 기준(89~92일 가변)이라 고정 일수 earliest 미적용 — 입력 차단이 담당.
      earliest: undefined,
      // eu.rabies-valid-until-on-entry 는 '추가 백신' 카드 situational 이 담당 (일본 모델).
      validationIds: ['eu.entry-min-3months-after-titer'],
    },
    // 도착 — 여행자 입국 지점(TPE) 서류·마이크로칩 확인. 검역 confirm 모델 재사용.
    // 필드는 패밀리 공용(eu_import_quarantine_date) — by_dest 가 목적지별 분리 보장.
    departure: {
      title: `${label} 입국 검사`,
      shortLabel: '입국',
      description:
        departureDescription ??
        `${label} 도착 후 공항 세관/검역 당국에서 입국 검사를 받으세요.\n마이크로칩과 서류를 확인해요.`,
      doneSummary: `${label} 입국 검사를 받았어요.`,
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
      attachmentHint: '확인받은 서류 사본을 사진·PDF로 보관하세요.',
      // base catalog 의 attachmentLabel('Import Quarantine Certificate')은 일본 수입검역증
      // 전용 — EU 패밀리는 새로 발급되는 서류가 없고 기존 서류를 확인만 받으므로 잘못 새고
      // 있었다(2026-07-16 발견·수정). 실제로 저장하는 건 확인받은 기존 서류의 사본.
      attachmentLabel: '입국 확인 서류',
      validationIds: ['eu.import-quarantine-date-valid'],
    },
    // 귀국 서류 — EU 패밀리. 나라명(label) 동적 표기 + 대체 서류(EU 여권·한국 검역증) 안내.
    // base(catalog) 는 비EU 유럽(영국·노르웨이 등)이 공유하므로 EU 키만 여기서 갈아끼운다.
    'eu-export-cert': {
      description: `${label} 정부가 인증한 건강증명서 또는 대체 서류를 준비하세요.\n현지 동물병원에서 건강증명서를 받은 뒤, 관할 당국(공무 수의사)의 최종 인증을 받으세요.\n다음 서류가 있다면 건강증명서를 새로 발급받지 않아도 돼요\n- EU 반려동물 여권\n- 한국 출국 시 받은 동물검역증`,
      // 첨부 파일명 — 나라마다 고정 명칭이 없는 서류라 '{나라} 정부 인증 건강증명서'로 만든다
      // (EU 24국은 선택 국가 토큰이 label 로 들어와 '프랑스 정부 인증 건강증명서'가 된다).
      attachmentLabel: `${label} 정부 인증 건강증명서`,
    },
  }
  if (euAhc) {
    // base 'vet-visit'(별지25만 안내)에 EU 동물건강증명서(Annex III) 발급 안내를 추가한다.
    // EU 회원국 입국 필수 서류(Reg. (EU) 2026/705 Annex III). 비EU(영국·스위스 등)엔 미적용.
    overrides['vet-visit'] = {
      description:
        '출국일 기준 10일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)와 EU 동물건강증명서(Annex III)를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
    }
  }
  return overrides
}

/**
 * EU 패밀리(eu 키) 카드 라벨 — 실제 선택 국가 토큰을 그대로 표기한다(앱은 ko 국가명
 * '프랑스'·'독일' 을 토큰으로 저장). 토큰이 없거나 generic('유럽연합'·'eu'·'유럽')이면
 * '유럽연합(EU)' 으로 폴백. (영국·아일랜드 등 1:1 키는 각자 고정 라벨을 쓰므로 무관.)
 */
function euLabelFromToken(token: string | null | undefined): string {
  const t = (token ?? '').trim()
  if (!t) return '유럽연합(EU)'
  const lower = t.toLowerCase()
  if (lower === 'eu' || lower === 'europe' || t.includes('유럽')) return '유럽연합(EU)'
  return t
}

/**
 * base step + destination override 를 머지해 최종 StepDefinition 반환.
 * destinationKey 가 null 이거나 매칭 override 가 없으면 base 그대로.
 *
 * EU 패밀리(eu 키)는 24개국이 한 오버라이드를 공유하므로, 카드 라벨만 실제 선택 국가명
 * (destinationToken)으로 동적 생성한다 — '프랑스' → '프랑스 입국 검사'. validationIds 등
 * 검증 시그널은 라벨과 무관하게 동일해서 check-mapping(정적 eu 엔트리를 읽음)과 어긋나지 않는다.
 * destinationToken 미전달(레거시 호출)이면 '유럽연합(EU)' 공통 라벨로 폴백.
 */
export function resolveStepForDestination(
  step: StepDefinition,
  destinationKey: string | null | undefined,
  destinationToken?: string | null,
): StepDefinition {
  if (!destinationKey) return step
  const overrides =
    destinationKey === 'eu'
      ? euFamilyOverrides({ label: euLabelFromToken(destinationToken), euAhc: true })
      : (STEP_DESTINATION_OVERRIDES[destinationKey] ?? archetypeStepOverrides(destinationKey))
  const override = overrides?.[step.id]
  if (!override) return step
  return { ...step, ...override }
}

/**
 * 명시 오버라이드가 없는 목적지의 아키타입 기본 카드 한 벌 — 새 목적지가 프로파일에
 * `archetype` 선언만 하면 표준 문구를 받는 fallback (Phase 2). 현행 목적지는 전부
 * STEP_DESTINATION_OVERRIDES 에 명시 엔트리가 있어 이 경로를 타지 않는다(무동작).
 *
 *  - eu-family: euFamilyOverrides 한 벌(라벨 = 첫 한글 keyword). euAhc 는 'eu' 키 전용
 *    (개별 카드국 컨벤션과 동일하게 꺼짐).
 *  - jp-2dose·sea-permit·generic: 규정 수치·서류명이 나라 고유라 자동 문구 없음 —
 *    seaPermitOverrides / 나라별 명시 작성이 필요하다(설계 원칙: 규정 고유는 수작업).
 */
function archetypeStepOverrides(
  destinationKey: string,
): Partial<Record<string, Partial<StepDefinition>>> | undefined {
  const profile = DESTINATION_OVERRIDES[destinationKey]
  if (profile?.archetype === 'eu-family') {
    const kw = profile.keywords ?? []
    const label = kw.find((k) => /[가-힣]/.test(k)) ?? kw[0] ?? destinationKey
    return euFamilyOverrides({ label })
  }
  return undefined
}
