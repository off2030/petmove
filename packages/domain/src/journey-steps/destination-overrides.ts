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
/**
 * 귀국용(한국 입국) 항체검사만 필요한 목적지의 항체 카드 검증.
 *
 * ⚠️ 이 목적지들은 항체 카드를 `roundOnlyDestinations` 파생으로 받는다. 그래서 카드가
 *   base 의 **일본 룰(jp.*)을 그대로 물려받은 채** 13개국에서 조용히 죽어 있었다
 *   (2026-07-22 발견 — 룰의 country 가 japan 이라 실행 자체가 안 됐다).
 *   배선 린트가 roundOnlyDestinations 를 안 보고 있어 못 잡던 사각지대였다(함께 수정).
 * 이 나라들엔 입국용 항체 요건이 없으므로 한국 귀국 2년 룰 하나만 남긴다.
 */
const RETURN_ONLY_TITER_CHECKS = ['common.kr-return-titer-within-2years']

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
      // 저장 이름 = 서류탭 이름(일본 수입 동물검역증). 예전엔 이 override 에 label 이 없어
      // base 의 'Import Quarantine Certificate'(영문)가 그대로 쓰였다 — 서류탭은 한글인데
      // 저장만 영문이라 갈렸다. 일반명 검역증은 '{국가} 수입/수출 동물검역증'으로 통일
      // (2026-07-20 사용자 지정).
      attachmentLabel: '일본 수입 동물검역증',
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
    // 문구·완료·earliest 는 프로파일 파생(buildRabiesCard). 2회 접종국이라 title 이
    // '광견병 백신 1차', done 은 base(has-rabies-entry) 를 그대로 쓴다.
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'china',
      label: '중국',
      // microchip-before-rabies 가 빠져 있어 중국만 이 경고가 카드 배지 대신 상단
      // caseAlert 로 샜다(대만·태국·베트남은 광견병 카드에 붙음 — 2026-07-19 전수조사).
      validationIds: ['cn.rabies-prime-after-91days-old', 'cn.microchip-before-rabies'],
    }),
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
        // 이미 만료(오늘 기준) '주의' — 2회국 공통(만료 재구성 B, 2026-07-25).
        'common.rabies-extra-validity-expired',
      ],
    },
    'rabies-titer': {
      description:
        '중국 해관총서(GACC)가 지정한 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n2차 접종 후에 검사해야 해요.\n0.5 IU/mL 이상이면 합격이에요.\n검사 결과는 채혈일로부터 1년간 유효해요.',
      validationIds: [
        'cn.rabies-titer-chain-consistent',
        'cn.rabies-titer-vs-booster',
        'cn.rnatt-valid-1year-on-arrival',
        // 이미 만료(오늘 기준) '주의' — 중국은 추가 검사 카드가 없어 본 항체 카드에(만료 재구성 B).
        'cn.rnatt-validity-expired',
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
      // 중국은 도착 검역 후 발급되는 증서가 없다(해관 확인만) — '검역 서류'로 통일.
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '중국 수입 검역 서류',
      validationIds: ['cn.import-quarantine-date-valid'],
    }),
  },
  // ── 하와이 (HDOA 동물검역소 — 5-Day-Or-Less / Direct Airport Release) ────
  // ⚠️ **일본(jp-2dose) 복제**(2026-07-24). 중국과 같은 골격(광견병 2회 + FAVN 항체 입국 요건 +
  //   도착 검역)에 하와이 고유(FAVN 30일~36개월·진드기 14일·섬 검역)를 얹었다. 문구·수치는
  //   복제 후 하와이 규정으로 조정 예정(사용자). 규정값 출처 = procedure-checks/hi.ts.
  //   ⚠️ 수출검역·NACCS 사전신고는 하와이에 없어 복제하지 않음(destination-config 주석 참고).
  hawaii: {
    // 광견병 1차 — 프로파일 파생(buildRabiesCard). 2회 접종국이라 title '광견병 백신 1차'.
    // omitEntryValidity: 입국 때 면역 유효 문장은 1차가 아니라 '가장 최근(2차)' 접종에 걸리는
    // 조건이라 1차 카드에서 뺀다(일본과 같은 처리). 1차는 칩 선행·최소연령만 안내하고, 입국
    // 유효는 2차 카드가 다룬다(2026-07-25 사용자 지적).
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'hawaii',
      label: '하와이',
      omitEntryValidity: true,
      validationIds: ['hi.rabies-prime-after-12weeks', 'hi.microchip-before-rabies'],
    }),
    // 광견병 2차 — 평생 2회 + 도즈 간 31일(HDOA "more than 30 days apart" = strict >30 = ≥31).
    // 날짜 잠금도 31일로 덮는다 — base(catalog) 는 일본식 daysAfter:30 이라 1차+30일이 선택
    // 가능했고, 고르는 순간 hi.rabies-doses-31days-apart 주의가 떴다(입력칸과 검증 룰 불일치).
    // earliest 를 31로 맞추면 애초에 30일째를 못 고른다(2026-07-25 사용자 확정).
    'rabies-vaccine-2': {
      description:
        '2차 광견병 백신을 접종하세요.\n\n1차 접종 후 31일 이상 지나서 접종해야 해요.\n하와이 입국 때 면역 유효기간이 남아있어야 해요.',
      earliest: { anchor: 'step:rabies-vaccine-1', daysAfter: 31 },
      validationIds: ['hi.rabies-2-doses-required', 'hi.rabies-doses-31days-apart'],
    },
    // 추가 백신(3차+) — base 는 일본 전용 jp.* 주의라, 하와이는 도즈 간격 룰로 매핑(일본 parity).
    'rabies-vaccine-extra': {
      validationIds: [
        'hi.rabies-doses-31days-apart',
        // 이미 만료(오늘 기준) '주의' — 2회국 공통(만료 재구성 B, 2026-07-25).
        'common.rabies-extra-validity-expired',
      ],
    },
    // FAVN(OIE-FAVN) 항체 = 하와이 **입국 요건**. 검체 검사기관 수령일 기준 출국 30일~36개월.
    'rabies-titer': {
      description:
        '미국 농무부(USDA) 승인 검사기관에서 FAVN 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n유효기간은 3년이에요.\n0.5 IU/mL 이상이면 합격이에요.',
      validationIds: ['hi.favn-sample-30days-to-36months-before-arrival'],
    },
    // 추가 항체검사(재검사) — base 는 일본 전용 jp.titer.* 주의라 하와이 FAVN 룰로 교체.
    //   hi.favn 은 모든 titer 기록을 순회 검증하므로 재검사 카드도 이 룰을 지목한다.
    'rabies-titer-extra': {
      validationIds: ['hi.favn-sample-30days-to-36months-before-arrival'],
    },
    // 항공권 — 하와이 입국 제약은 FAVN 검체가 검사기관에 도착한 날로부터 30일(일본 항체 180일
    //   대기와 같은 자리 = 항공권 카드에서 안내·검증) + 도착일 면역 유효.
    //   ⚠️ '최근 광견병 접종 31일 전' 문구는 뺐다 — 항체 채혈은 반드시 접종 이후이고 검체 수령
    //   후 다시 30일을 기다리므로, 도착일은 자동으로 접종+31일을 넘겨 이 조건이 FAVN 30일 대기에
    //   완전히 포함된다(중복 안내라 의미 없음, 2026-07-25 사용자 지적). 다만 hi.rabies-latest-
    //   31days-before-arrival 룰은 유지 — 항체검사 미입력 케이스에선 hi.favn 이 SKIP 되어 이
    //   룰만 단독 안전망으로 작동한다. earliest 잠금은 anchor 가 titer 검체 수령일이라 현재 anchor
    //   체계로 못 걸어 문구 안내 + hi.favn 주의로 다룬다.
    'flight-purchase': {
      description:
        '하와이 입국 일정에 맞춰 항공권을 구매하세요.\n\n광견병 항체 검사 검체가 검사기관에 도착한 날로부터 30일이 지난 후에 입국할 수 있어요.\n호놀룰루(HNL) 공항 동물검역소 운영시간에 맞는 도착 시간인지 확인하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '하와이에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: [
        'hi.rabies-latest-31days-before-arrival',
        'hi.rabies-not-expired-on-arrival',
        'hi.favn-sample-30days-to-36months-before-arrival',
      ],
    },
    // 도착 — 하와이 공항 동물검역소(5-Day-Or-Less / Direct Airport Release). 요건 충족 시
    //   공항에서 바로 인계(DAR), 미충족 시 최대 120일 검역.
    departure: importQuarantineCard({
      label: '하와이',
      fieldKey: 'hi_import_quarantine_date',
      description:
        '하와이 도착 후 공항 동물검역소에서 검역을 받으세요.\n서류와 마이크로칩을 확인해요. 준비에 문제가 없으면 공항에서 바로 인계받을 수 있어요(Direct Airport Release).\n입국 요건을 충족하지 못하면 검역소에서 최대 120일간 격리돼요.',
      helpText: '하와이 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '하와이 수입 검역 서류',
      validationIds: ['hi.import-quarantine-date-valid'],
    }),
    // CDC Dog Import Form — 연방 요건이라 base 카드(usa 와 공유)를 그대로 쓰되, 순서만
    // 조정: 입국 신청(46) 뒤·진드기 처치(80) 앞(2026-07-26 사용자 지정 — 처음 '임상검사
    // 직전(105)'에서 진드기와 순서 교체. 진드기는 출국 14일 이내 창이라 임상검사 쪽이 자연스럽다).
    'us-cdc-dog-import-form': {
      order: 75,
    },
    // 진드기 처치 — 출국 14일 이내(long-acting tick product). base 는 일반 문구라 하와이 룰 지목.
    'external-parasite': {
      // 멕시코·브라질·UAE 카드와 같은 문형(사용자 지정 2026-07-23) — 카드엔 특정 기생충(진드기)·
      // 제품 상세를 지목하지 않고 '외부 기생충 치료 + N일 이내'만. 상세(장시간 작용 진드기 제품·
      // Revolution 불가·건강증명서 기재)는 hi.tick-treatment-within-14days 룰 설명(staff)에 보존.
      // HDOA는 '도착 14일 이내'라 도착일 기준(멕시코와 같은 arrival 기준 문형).
      description: '외부 기생충 치료를 하세요.\n\n하와이 도착일 기준 14일 이내에 해야 해요.',
      validationIds: ['hi.tick-treatment-within-14days'],
    },
  },
  // ── 괌 (Guam DOAG Animal Health) ─────────────────────────────────────
  // 하와이와 같은 뼈대(미국령 광견병 청정지역 — 광견병 2회 + FAVN + 도착 계류 + CDC 신고).
  // **결정적 차이**: 하와이는 30일을 못 채우면 격리인데, 괌은 120일 중 **남은 일수만큼 계류**다
  //   (CQA Calculated Quarantine — "only as many days in commercial quarantine as required to
  //   reach 120 total days since the FAVN blood sample reached the laboratory").
  //   즉 요건 미달이 '못 감'이 아니라 '오래 갇힘'이라, 카드 문구가 그 트레이드오프를 말하고
  //   검증도 저장 거부가 아니라 주의로 둔다(gu.ts 헤더 참고).
  // 순서: 항체(40) → 종합백신(50) → **검역시설 예약(95) → 수입 허가(100) → 항공권(102)**.
  //   허가 신청 서류에 예약확인서가 들어가고, 허가·예약이 확정되기 전에 항공권을 잡으면 안 된다.
  // 생후 3개월·접종 간격 30일은 **사용자 확정값**(2026-07-26). 현행 DOAG 공개자료에는 없고
  //   2020년 세부지침·www 괌 가이드에만 있어 한 번 보류했다가, 확정을 받아 카드에 올렸다.
  //   프로파일(rabies.minAgeMonths 3 / doseIntervalDays 30)이 진실 출처 — 카드 문구와
  //   earliest 잠금이 거기서 파생된다.
  guam: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'guam',
      label: '괌',
      // 1차 카드에서 '입국 때 면역 유효기간이 남아있어야 해요' 줄 제거(2026-07-26 사용자 지정).
      //   괌은 평생 2회 접종국이라 입국 시점에 유효해야 하는 건 **최근 접종(2차 이상)**이다.
      //   1차 카드에 그 줄이 있으면 1차 유효기간을 맞춰야 하는 것처럼 읽힌다 — 하와이도 같은
      //   이유로 omitEntryValidity 를 쓴다. 요건 자체는 2차 카드 문구와 항공권 카드 검증
      //   (gu.rabies-not-expired-on-arrival)이 담당한다.
      omitEntryValidity: true,
      validationIds: ['gu.microchip-before-rabies', 'gu.rabies-prime-after-3months-old'],
    }),
    'rabies-vaccine-2': {
      description:
        '2차 광견병 백신을 접종하세요.\n\n1차 접종 후 30일 이상 지나서 접종해야 해요.\n괌 입국 때 최근 접종의 면역 유효기간이 남아있어야 해요.',
      earliest: { anchor: 'step:rabies-vaccine-1', daysAfter: 30 },
      validationIds: [
        'gu.rabies-2-doses-required',
        'gu.rabies-doses-30days-apart',
        // chain 단절 주의 — 저장 거부(findRabiesChainBreak)의 짝. 없으면 저장은 막히는데
        //   펫무브워크에는 끊긴 chain 이 안 보인다(사용자 확정 "체인 유지되어야 해", 2026-07-27).
        'gu.rabies-booster-within-prime-validity',
      ],
    },
    'rabies-vaccine-extra': {
      validationIds: [
        'gu.rabies-booster-within-prime-validity',
        'common.rabies-extra-validity-expired',
      ],
    },
    'rabies-titer': {
      // 120일은 **채혈일이 아니라 검사기관이 검체를 받은 날**부터 센다(CQA 원문). 앱은 검체
      //   수령일을 입력받지만 비어 있으면 채혈일을 proxy 로 쓰므로, 문구도 '검체가 도착한 날'로 쓴다.
      // 항체 카드 문형은 전 목적지 공통(2026-07-27 전수 대조로 정렬):
      //   ①검사기관 → ②동물병원 의뢰 → ③채혈 시점 조건 → ④합격 기준 → ⑤유효기간.
      //   유효기간이 1년인 나라(중국·대만·싱가포르)는 '검사 결과는 채혈일로부터 1년간 유효해요'
      //   문형을 쓴다 — 2·3년인 나라의 '유효기간은 N년이에요'와 구분된다.
      // ⛔ 120일 대기·계류 트레이드오프를 여기 다시 쓰지 말 것 — **입국 대기는 항공권 카드가
      //   담당**하는 게 하우스 규칙이다(하와이 30일도 항공권 카드에 있다). 예전엔 이 카드에
      //   3줄이 더 붙어 있어 다른 목적지보다 길고 설명체라 결이 달랐다.
      description:
        '미국 질병통제센터(CDC) 승인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n2차 광견병 접종 후 10일 이상 지나서 검사해야 해요.\n0.5 IU/mL 이상이면 합격이에요.\n검사 결과는 채혈일로부터 1년간 유효해요.',
      validationIds: [
        'gu.rnatt-120days-before-arrival',
        'gu.rnatt-after-rabies-10days',
        // 상한(12개월) — 대기 120일만 보고 상한을 안 보면 너무 일찍 검사한 케이스가
        //   만료된 채 통과한다. 카드 문구('1년간 유효')와 짝을 맞춘다(2026-07-27).
        'gu.departure-within-12months-of-titer',
      ],
    },
    'rabies-titer-extra': {
      validationIds: [
        'gu.rnatt-120days-before-arrival',
        'gu.rnatt-after-rabies-10days',
        'gu.departure-within-12months-of-titer',
      ],
    },
    'general-vaccine': {
      // 항체 검사(40) **앞**으로 당긴다(2026-07-27 사용자 지정) — 백신 3장을 먼저 묶고
      //   그 다음에 검사로 넘어가는 흐름. base 는 50이라 그대로 두면 항체 뒤에 온다.
      //   (실제 시간 순서는 항체가 먼저다 — 120일 대기라 가장 이르다. 화면 순서는 '백신 →
      //   검사'라는 이해하기 쉬운 묶음을 택한 것.)
      order: 38,
      // 문형은 전 목적지 공통(2026-07-27 전수 대조로 정렬 — 태국·필리핀·홍콩과 같은 구조):
      //   ①종별 백신 구성을 **리드 문장**에 / ②시점 조건 / ③입국 때 유효기간.
      //   ⛔ '접종증명서에 동물 정보와 접종일·유효기간이 적혀 있어야 해요' 같은 **서류 요건은
      //   카드에 쓰지 않는다** — 서류 탭이 담당한다(다른 목적지 카드에 그런 줄이 없다).
      // 시점 조건이 **아예 빠져 있었다** — 룰(gu.general-vaccine-10days-before-arrival)은
      //   출국 10일 전을 판정하는데 카드가 그 말을 안 했다(2026-07-27 사용자 지적으로 발견).
      // 백신 구성 출처: 브로슈어 REQUIRED DOCUMENTS 4항(개 DHLPP + Bordetella / 고양이 FVRCP).
      description:
        '종합백신을 접종하세요.\n\n강아지는 DHLPP, 고양이는 FVRCP 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n출국 10일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        dog: '종합백신(DHLPP)을 접종하세요.\n\n디스템퍼·전염성간염·렙토스피라·파보바이러스·파라인플루엔자 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n출국 10일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n허피스·칼리시·범백혈구감소증 예방을 포함해야 해요.\n출국 10일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      },
      // 켄넬코프(Bordetella)는 **이 카드가 함께 다룬다** — 앱에 켄넬코프 전용 카드가 없고,
      //   DOAG 도 개의 백신 기록을 'DHLPP and Bordetella' 한 묶음으로 요구한다. 그래서 켄넬코프
      //   룰도 여기서 지목한다(룰이 어느 카드에도 안 붙으면 경고가 상단으로 샌다).
      validationIds: ['gu.general-vaccine-10days-before-arrival'],
    },
    // 켄넬코프 — 종합백신과 별개 백신이라 카드를 나눴다(2026-07-27 사용자 지정).
    //   요건은 종합백신과 같다(출국 10일 전 + 입국 때 유효기간). DOAG 브로슈어는 개의 백신
    //   기록을 'DHLPP and Bordetella' 로 나란히 요구한다.
    'kennel-cough-vaccine': {
      description:
        '켄넬코프(Bordetella) 백신을 접종하세요.\n\n출국 10일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      validationIds: ['gu.kennel-cough-10days-before-arrival'],
    },
    'external-parasite': {
      // 도착 14일 이내라 실제로 가장 늦게 하는 절차 — 임상검사(110) 바로 앞으로 모은다
      //   (2026-07-27 사용자 지정). base 는 80이라 그대로 두면 항공권·허가보다 앞에 온다.
      order: 106,
      description: '외부 기생충 치료를 하세요.\n\n괌 도착일 기준 14일 이내에 해야 해요.',
      validationIds: ['gu.external-parasite-within-14days'],
    },
    'internal-parasite': {
      order: 107,
      description: '내부 기생충 치료를 하세요.\n\n괌 도착일 기준 14일 이내에 해야 해요.',
      validationIds: ['gu.internal-parasite-within-14days'],
    },
    // 심장사상충 — 구충과 별개 절차라 카드를 나눴다(2026-07-27 사용자 지정).
    //   요건은 구충과 같다(도착 14일 이내).
    'heartworm-test': {
      description: '심장사상충 검사·예방을 하세요.\n\n괌 도착일 기준 14일 이내에 해야 해요.',
      validationIds: ['gu.heartworm-within-14days'],
    },
    'import-permit': {
      title: '수입 허가 신청',
      description:
        '괌 농무부(DOAG)에 수입 허가(Animal Entry Permit)를 신청하세요.\n\n검역시설 예약확인서와 접종·검사 서류를 함께 이메일로 제출해요.\n도착 30일 전까지 제출해야 하고, 늦으면 계류가 길어지거나 입국이 거부될 수 있어요.\n수수료는 반려동물 1마리당 65달러예요.',
      doneSummary: '괌 수입 허가증을 받았어요.',
      cardLine: '괌 수입 허가를 신청하세요.',
      // **신청 → 발급 2단계 모델**(신청일 입력=진행 중, 허가증 첨부·완료 버튼=완료).
      //   ⛔ 버튼 완료로 바꾸지 말 것(2026-07-27 시도했다가 되돌림) — 괌은 하와이 입국 신청과
      //   달리 **실제 허가증(Animal Entry Permit, $65)이 발급된다.** 하와이는 접수번호만 나와
      //   '신청=끝'이라 버튼 완료가 맞지만, 괌은 신청과 발급 사이에 대기가 있고 허가서에 적힌
      //   조건이 계류 기간을 정한다. 대행하지 않아도(selfApply) 보호자가 직접 내므로 신청일을
      //   알고, 그래서 30일 마감 판정도 의미가 있다. 싱가포르·대만과 같은 구조.
      inputs: [{ key: 'import_permit_application_date', label: '신청일', type: 'date' }],
      attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
      attachmentLabel: '괌 수입 허가증(Animal Entry Permit)',
      links: [
        { url: 'https://doag.guam.gov/animal-health-animal-control/', label: '수입 허가 안내(DOAG)' },
      ],
      validationIds: ['gu.import-permit-30days-before-arrival'],
    },
    'flight-purchase': {
      // 항공권 카드 문형은 전 목적지 공통(2026-07-27 전수 대조로 정렬):
      //   리드 '<나라> 입국 일정에 맞춰 항공권을 구매하세요.' → 연령 조건 → 대기 조건 →
      //   (검역소 운영시간) → **마지막 줄은 '항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.'**
      // 120일 2단계는 **대만 항공권 카드와 같은 문형** — 대만도 괌도 대기를 못 채워도 입국은
      //   되고 대가가 격리·계류일 뿐이라 "…하면 …할 수 있어요 / 그 전에도 …지만, 이 경우 …돼요".
      //   대만처럼 항체 유효기간 줄도 함께 둔다 — 괌은 창이 120일~12개월로 좁아 항공 날짜를
      //   고를 때 두 경계가 다 필요하다.
      // ⛔ '수입 허가와 검역시설 예약을 확정한 뒤에 구매하세요'로 되돌리지 말 것 — 항공권이
      //   **먼저**다(order 92). 허가 신청 서류에 항공 일정표가 들어간다.
      // 도착 시간 줄(2026-07-27 팩트체크) — 괌은 하와이처럼 공항에 정부 검역소가 상주하는 게
      //   아니라 **예약한 민간 시설이 공항으로 데리러 온다**(CQA: "the licensed commercial
      //   kennel quarantine facility that you have registered with will pick your pet up from
      //   the airport"). 그래서 기준은 공항이 아니라 **시설 운영시간**이다 — Harper Valley
      //   Kennels 공개값 10:00–17:00 예약제·현지/연방 공휴일 휴무.
      //   ⛔ '검역시설이 공항에서 동물을 받을 수 있는 시간'으로 되돌리지 말 것 — 공항에 상주
      //   창구가 있는 것처럼 읽히고, 그런 시간대는 공식 문서에 없다.
      description:
        '괌 입국 일정에 맞춰 항공권을 구매하세요.\n\n광견병 항체 검사 검체가 검사기관에 도착한 날로부터 120일이 지난 후에 입국하면 계류를 최소화할 수 있어요.\n그 전에도 입국할 수 있지만, 이 경우 남은 기간만큼 괌 지정 시설에서 계류돼요.\n검사 결과는 채혈일로부터 1년간 유효해요.\n항공권 구매 후 검역시설 예약과 수입 허가 신청을 해요.\n예약한 검역시설의 운영시간에 맞는 도착 시간인지 확인하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      descriptionBySpecies: {
        // 생후 6개월은 CDC 규칙이라 **개 전용**(필리핀 4개월령·홍콩 5개월령과 같은 자리).
        dog: '괌 입국 일정에 맞춰 항공권을 구매하세요.\n\n강아지는 생후 6개월 이상만 입국할 수 있어요.\n광견병 항체 검사 검체가 검사기관에 도착한 날로부터 120일이 지난 후에 입국하면 계류를 최소화할 수 있어요.\n그 전에도 입국할 수 있지만, 이 경우 남은 기간만큼 괌 지정 시설에서 계류돼요.\n검사 결과는 채혈일로부터 1년간 유효해요.\n항공권 구매 후 검역시설 예약과 수입 허가 신청을 해요.\n예약한 검역시설의 운영시간에 맞는 도착 시간인지 확인하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
        cat: '괌 입국 일정에 맞춰 항공권을 구매하세요.\n\n광견병 항체 검사 검체가 검사기관에 도착한 날로부터 120일이 지난 후에 입국하면 계류를 최소화할 수 있어요.\n그 전에도 입국할 수 있지만, 이 경우 남은 기간만큼 괌 지정 시설에서 계류돼요.\n검사 결과는 채혈일로부터 1년간 유효해요.\n항공권 구매 후 검역시설 예약과 수입 허가 신청을 해요.\n예약한 검역시설의 운영시간에 맞는 도착 시간인지 확인하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      },
      cardLine: '괌에 입국할 수 있어요.',
      // 검역시설 예약(95) **앞**(2026-07-27 사용자 지적). 시설은 도착 날짜를 잡아 예약하고,
      //   DOAG 허가 신청 서류에도 **Flight Itinerary** 가 들어간다(브로슈어 REQUIRED DOCUMENTS
      //   5항) — 항공 일정이 먼저 있어야 뒤 두 절차가 성립한다.
      //   ⛔ 허가 뒤(102)로 되돌리지 말 것. 원 근거였던 "허가 전에 항공권을 확정하지 말라"는
      //   **결제 확정 시점** 주의였지 절차 순서가 아니다.
      order: 92,
      earliest: undefined,
      validationIds: [
        'gu.dog-entry-age-six-months',
        'gu.rabies-not-expired-on-arrival',
        'gu.rnatt-120days-before-arrival',
        // 상한(12개월)도 이 카드에 — **출국일을 미뤄서** 항체가 만료되는 건 항공권을 고칠 때
        //   드러나야 한다. 하와이는 한 룰이 30일·36개월 양쪽을 보는데 괌은 두 룰로 나뉘어 있어
        //   하한만 걸어 두면 상한이 항체 카드에만 남는다(2026-07-27 사용자 지적으로 발견).
        'gu.departure-within-12months-of-titer',
      ],
    },
    'us-cdc-dog-import-form': {
      // 항공권(102) 뒤 — CDC 서식에 도착 정보를 적는다. 하와이(75)와 순서 근거가 다르다.
      order: 105,
    },
    departure: importQuarantineCard({
      label: '괌',
      fieldKey: 'gu_import_quarantine_date',
      // ⛔ '계류 기간은 수입 허가서에 적힌 조건에 따라 정해져요' 를 되살리지 말 것
      //   (2026-07-27 제거) — 1차 출처에 없는 문장이다. DOAG·CQA 어디에도 "허가증에 계류
      //   조건이 기재된다"는 표현이 없다. 계류 기간은 **FAVN 검체가 검사기관에 도착한 날부터
      //   120일 중 남은 기간**으로 계산되고(CQA 예시 포함), 그 내용은 항공권 카드가 말한다.
      //   서류 탭의 수입 허가증 설명에서도 같은 이유로 뺐다.
      description:
        '괌 도착 후 지정 검역시설에서 계류해요.\n\n공항에서 서류와 마이크로칩을 확인한 뒤 검역시설 직원이 동물을 인수해요.\n계류가 끝나면 시설 수의사의 최종 검사를 받고 인도돼요.',
      helpText: '괌 지정 검역시설에 입소한 날짜',
      attachmentHint: '검역·계류 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '괌 수입 검역 서류',
      validationIds: ['gu.import-quarantine-date-valid'],
    }),
  },
  // ── 베트남 (DAH Cục Thú y) ────────────────────────────────────────────
  // 태국·필리핀 골격이지만 수입허가가 없다(Thông tư 01/2026 제14조 — 2마리 이하 동반 면제).
  // 사전 신고도 없다 — 도착 공항 검역소에서 현장 신고(같은 조). 항체는 한국 귀국용만.
  // 규정 상세·출처는 procedure-checks/vn.ts 헤더.
  vietnam: {
    // 문구·완료·earliest 는 프로파일 파생(buildRabiesCard) — 규정값은 destination-config.
    // 최소 일령이 달력 3개월이라 minAgeMonths 가 earliest.monthsAfter 로 넘어간다.
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'vietnam',
      label: '베트남',
      // rabies-only-1year-vaccine 은 blocker(저장 거부)인데 어느 카드에도 안 붙어 있어
      // 경고가 상단으로 샜다(중국은 2차 카드에 붙어 있음 — 2026-07-19 전수조사).
      // 베트남은 1회 접종국이라 2차 카드가 없으므로 1차 카드가 받는다.
      // 마이크로칩 선행 룰은 없다 — 베트남은 칩 자체가 입국 요건이 아니라 접종과의 순서를
      // 따질 이유가 없다(사용자 지정 2026-07-20). 칩은 한국 수출검역(강아지 동물등록)과
      // 귀국 항체검사 때문에 실무상 넣지만, 그건 베트남 입국 요건이 아니다.
      validationIds: [
        'vn.rabies-prime-after-3months-old',
        'vn.rabies-booster-within-prime-validity',
        'vn.rabies-only-1year-vaccine',
      ],
    }),
    // 항체검사 — 베트남 입국 요건이 아니다(DAH 의무 아님). 한국 귀국용이라 왕복에만 뜬다
    // (TITER_RETURN_ONLY_DESTINATIONS 파생). 베트남에 검사기관이 없어 한국에서 미리 받아야 한다.
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        // 첫 줄은 태국·필리핀(같은 '한국 귀국용' 항체 카드)과 같은 문형을 쓴다. 베트남 사정
        // (현지 검사기관 없음 → 출국 전 한국에서)은 아래 줄에 둔다 — 첫 줄을 나라별로 바꾸면
        // 같은 카드가 목적지마다 다른 문장으로 시작한다(2026-07-19 사용자 지적).
        // 귀국용 항체 카드 문구는 태국·필리핀과 통일한다 — "…입국에는 필요 없지만, 한국으로
        // 돌아올 때 필요해요. / 유효기간은 2년이에요."(사용자 지정 2026-07-20).
        // '베트남에는 검사 기관이 없으니…' 한 줄만 베트남 고유 사정으로 남긴다.
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n베트남 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n베트남에는 검사 기관이 없으니 출국 전에 미리 받으세요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    // 항공권 — 일본의 항체 180일 대기 미적용(베트남은 항체 자체가 입국 요건 아님).
    // 제약은 광견병 접종 후 30일 대기 하나.
    'flight-purchase': {
      description:
        // 접종 대기 문구는 태국·필리핀 문형으로 통일 — '접종일로부터 N…이 지난 후에 입국할 수
        // 있어요'(사용자 지정 2026-07-20). 베트남만 '광견병' 접두를 달고 있었다.
        // 단위는 일 그대로 — 30일은 주로 떨어지지 않는다(태국·필리핀 21일 = 3주).
        '베트남 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 30일이 지난 후에 입국할 수 있어요.\n지정된 공항으로만 입국할 수 있어요. 호치민(SGN)·하노이(HAN)·다낭(DAD)·나트랑(CXR)이에요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
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
      // 발급되는 검역증이 확정된 나라는 '검역증'(일본과 동일). 발급물이 없거나 미확인인
      // 나라(중국·대만·필리핀)만 '검역 서류'로 뭉뚱그린다 — 2026-07-20 사용자 지정 통일.
      attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
      // 서류 목록의 'vn-import-quarantine-cert' 와 이름을 맞춘다 — 일본(Import Quarantine
      // Certificate)·태국(R.7)처럼 발급되는 서류 이름으로 저장되게(2026-07-20).
      attachmentLabel: '베트남 수입 동물검역증',
      validationIds: ['vn.import-quarantine-date-valid'],
    }),
  },
  // ── 아르헨티나 — 베트남 골격 복제(2026-07-22) 후 SENASA·가이드로 정정 완료(2026-07-23):
  //   광견병 21일(입국 기준·1차만)·3년 백신 인정·격리 없음(항공권 30→21, 도착 14일격리→입국불가).
  //   최소 접종 연령 3개월은 보수값이나 사용자 확정 유지. 베트남 고유 사실은 미복제(지정 입국공항
  //   줄·'검사 기관 없음' 줄·금지 견종·2마리 한도).
  //   귀국 수출 검역 = **SENASA CVI(국제수의증명서) 필수** — 2026-07-23 조사로 대만식(강제 X)이
  //     아니라 인도네시아·일본식 **필수 수출 검역**으로 확정, ar-export-quarantine 카드 추가
  //     (catalog.ts). 베트남 복제 그룹(캄보디아·몽골·우즈벡·캐나다·베트남)과 달리 아르헨은 SENASA라는
  //     명확한 정부 발급 기관이 있어 카드를 만들었다 — 그룹 나머지는 별도 판단.
  argentina: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'argentina',
      label: '아르헨티나',
      // 칩 선행 룰 없음 — SENASA 는 칩을 입국 요건으로 두지 않는다(한국 수출검역 때문에 실무상
      // 넣을 뿐). 1년 백신 blocker 는 SENASA 가 제조사 유효기간을 인정해 2026-07-22 제거했다.
      validationIds: [
        'ar.rabies-prime-after-3months-old',
        'ar.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n아르헨티나 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    'flight-purchase': {
      // ✅ 21일로 정정(2026-07-23) — 규칙(entryWaitDaysAfterVaccine:21)·펫무브 가이드("입국일
      //   기준 최소 21일 전")와 어긋난 '30일'(베트남 복제 잔재)이었다. 광견병 카드는 21로
      //   맞아 있었는데 항공권 카드만 30이라 나라 안에서 모순이었다.
      description:
        '아르헨티나 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 21일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '아르헨티나에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['ar.rabies-min-21days-before-departure'],
    },
    departure: importQuarantineCard({
      label: '아르헨티나',
      fieldKey: 'ar_import_quarantine_date',
      // ✅ '14일 격리·반송'(베트남 복제 잔재) 제거(2026-07-23). 펫무브 가이드: "아르헨티나의
      //   수입 조건을 충족하지 못하는 경우 **입국할 수 없습니다**" — 격리 규정이 없다. SENASA
      //   조사도 격리 없음. 충족 시 통과 / 미충족 시 입국 불가로만 안내한다.
      description:
        '아르헨티나 도착 후 공항 동물검역소에서 검역을 받으세요.\n마이크로칩과 서류를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.\n입국 요건을 충족하지 못하면 입국할 수 없어요.',
      helpText: '아르헨티나 도착 후 수입 검역을 받은 날짜',
      // 발급되는 검역증 미확인 — 4국 복제 전례대로 '검역 서류'로 뭉뚱그린다(베트남 Mẫu 15a 는
      // 베트남 고유 서식이라 복제하지 않는다). 확인되면 정식 이름으로 올릴 것.
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '아르헨티나 수입 검역 서류',
      validationIds: ['ar.import-quarantine-date-valid'],
    }),
  },
  // ── 베트남 골격 복제 4국 (캄보디아·몽골·우즈베키스탄·캐나다) ──────────────
  // 2026-07-20 사용자 지정: "카드와 그에 걸린 검증 룰을 포함한 모든 것이 베트남과 같다".
  // 베트남과 같은 골격 — 광견병 1회 + 항체는 귀국용 + 수입허가/사전신고 없음 + 도착 검역.
  // 나라별로 다른 것은 사용자가 확인해 준 3가지뿐:
  //   마이크로칩 필수(몽골·우즈벡 O / 캄보디아·캐나다 X) — 칩 선행 문구는 광견병 카드의
  //     validationIds 에 `<cc>.microchip-before-rabies` 가 있는지에서 파생된다(buildRabiesCard)
  //   최소 일령(캄보디아 고정 91일 / 나머지 달력 3개월) — 프로파일 rabies 블록에서 파생
  //   접종 후 입국 대기(30일 / 캐나다 0일) — 프로파일 entryWaitDaysAfterVaccine 에서 파생
  //
  // ⚠️ 베트남 고유 규정(3년 백신 불인정·미충족 시 14일 격리)이 복제된 상태다. 각 나라
  //   개별 검토에서 정정할 예정 — 지금 "규정과 다르다"고 올리지 말 것.
  // ⚠️ 왕복 귀국 전 **현지 수출 검역 카드는 아직 없다**(사용자 지정: 나라별 조사가 필요해
  //   나중에 따로 만든다). 베트남의 vn-export-quarantine 에 해당하는 카드가 4국엔 빠져 있다.
  cambodia: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'cambodia',
      label: '캄보디아',
      // 칩 선행 룰 없음 — 베트남과 같이 칩이 입국 요건이 아니다(사용자 지정).
      // kh.rabies-only-1year-vaccine 도 없다 — 근거 부재로 제거(kh.ts 주석 참고).
      validationIds: [
        'kh.rabies-prime-after-91days-old',
        'kh.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        // '캄보디아에는 검사 기관이 없으니…' 는 펫무브 www 가이드 문장이다("캄보디아에는
        // 광견병항체검사 기관이 없기 때문에 … 한국에서 미리 해두시는 것을 권장"). 복제할 때
        // 베트남 고유 사정으로 오해해 뺐다가 되살렸다(2026-07-20). 이 줄이 없으면 왕복
        // 여행자가 현지에서 받으면 된다고 생각하고 출국해 **귀국할 방법이 없어진다.**
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n캄보디아 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n캄보디아에는 검사 기관이 없으니 출국 전에 미리 받으세요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    'flight-purchase': {
      description:
        '캄보디아 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 30일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '캄보디아에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['kh.rabies-min-30days-before-departure'],
    },
    departure: importQuarantineCard({
      label: '캄보디아',
      fieldKey: 'kh_import_quarantine_date',
      // ⚠️ '지정 시설에서 격리' 문구를 **쓰지 않는다** — 1차 출처와 정면충돌한다(2026-07-20).
      //   GDAHP 공무원 발표자료(WOAH 아시아 워크숍 2023-12): "There are no animal quarantine
      //   stations in Cambodia but we have animal checkpoints" — 격리시설 자체가 없다.
      //   베트남(미충족 시 14일 격리)에서 복제되며 딸려온 문장이라 근거가 없었다.
      //   공항 검사팀 3곳은 확인된 사실 — 정부결정 71·72·73호(2009-07-21)가 프놈펜·시엠립·
      //   프레아시하누크 국제공항에 동물·축산물 검사팀을 설치했다.
      description:
        '캄보디아 도착 후 공항에서 동물 검역을 받으세요.\n서류를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.\n프놈펜·시엠립·시아누크빌 국제공항에 동물 검사팀이 있어요.',
      helpText: '캄보디아 도착 후 수입 검역을 받은 날짜',
      // 발급되는 검역증이 확인되지 않았다(베트남 Mẫu 15a 처럼 확정된 서식이 없음) —
      // 중국·대만·필리핀과 같은 '검역 서류' 표기. 확인되면 정식 이름으로 올릴 것.
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '캄보디아 수입 검역 서류',
      validationIds: ['kh.import-quarantine-date-valid'],
    }),
  },
  mongolia: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'mongolia',
      label: '몽골',
      // 칩 필수국 — microchip-before-rabies 가 있어야 카드에 '마이크로칩 삽입 후에 접종해야
      // 해요' 줄이 파생된다(buildRabiesCard 의 requiresChipFirst).
      // mn.rabies-only-1year-vaccine 은 없다 — APQA 표에 최대 유효기간 행이 없고 별지 25호
      // 서식이 1Y/2Y/3Y 를 지원한다. 근거 부재로 제거했다(mn.ts 주석 참고).
      validationIds: [
        'mn.rabies-prime-after-3months-old',
        'mn.microchip-before-rabies',
        'mn.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        // '몽골에는 검사 기관이 없으니…' 는 펫무브 www 가이드 문장이다("몽골에는 광견병항체
        // 검사 기관이 없기 때문에 … 한국에서 미리 해두시는 것을 권장"). 복제할 때 베트남 고유
        // 사정으로 오해해 빠져 있었다 — 캄보디아와 같은 누락이라 같이 되살렸다(2026-07-20).
        // 이 줄이 없으면 왕복 여행자가 현지에서 받으면 된다고 생각하고 출국해 **귀국할 방법이
        // 없어진다.**
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n몽골 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n몽골에는 검사 기관이 없으니 출국 전에 미리 받으세요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    'flight-purchase': {
      // 지정 입국공항은 APQA 안내문 §1.2 표 '기타' 행 원문이다 — "반드시 Chinggis Khaan
      // 국제 공항을 통해 몽골로 입국". 베트남(4곳)과 같은 문형으로 쓴다. 복제 시엔 이 사실을
      // 몰라 줄 자체가 없었다(2026-07-20 조사에서 확보).
      description:
        '몽골 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 30일이 지난 후에 입국할 수 있어요.\n지정된 공항으로만 입국할 수 있어요. 울란바토르 칭기즈칸(UBN)이에요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '몽골에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['mn.rabies-min-30days-before-departure'],
    },
    departure: importQuarantineCard({
      label: '몽골',
      fieldKey: 'mn_import_quarantine_date',
      // ⚠️ '지정 시설에서 격리' 문구를 **쓰지 않는다** — APQA 표 '입국 후 계류: 불필요'.
      //   베트남(미충족 시 14일 격리)에서 복제되며 딸려온 문장이라 근거가 없었다. 미충족 시
      //   결과는 APQA 주의사항 문형대로 '입국 거부·반송'이다.
      description:
        '몽골 도착 후 공항 동물검역소에서 검역을 받으세요.\n마이크로칩과 서류를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.\n입국 요건을 충족하지 못하면 입국이 거부되거나 한국으로 반송될 수 있어요.',
      helpText: '몽골 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '몽골 수입 검역 서류',
      validationIds: ['mn.import-quarantine-date-valid'],
    }),
  },
  uzbekistan: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'uzbekistan',
      label: '우즈베키스탄',
      // uz.rabies-only-1year-vaccine 은 없다 — 공식 제15장에 백신 유효기간 조항 자체가 없어
      // 근거 부재로 제거했다(uz.ts 주석 참고).
      validationIds: [
        'uz.rabies-prime-after-3months-old',
        'uz.microchip-before-rabies',
        'uz.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n우즈베키스탄 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    'flight-purchase': {
      description:
        '우즈베키스탄 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 30일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '우즈베키스탄에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['uz.rabies-min-30days-before-departure'],
    },
    departure: importQuarantineCard({
      label: '우즈베키스탄',
      fieldKey: 'uz_import_quarantine_date',
      // ⚠️ '지정 시설에서 격리' 문구를 **쓰지 않는다** — 공식 규정과 정면충돌한다(2026-07-20).
      //   수의요건 제15장: "…в количестве не более 2-х голов, **без разрешения на ввоз и
      //   карантинирования**…" = 개인동반 2두 이하는 허가도 격리도 면제. 베트남(미충족 시 14일
      //   격리)에서 복제되며 딸려온 문장이라 근거가 없었다.
      // 미충족 시 실제 결과는 www 가이드 문장 그대로 '입국 불가'다.
      description:
        // 첫 줄은 베트남·캄보디아와 같은 '검역을 받으세요'로 통일(2026-07-21). '심사를
        // 받으세요'만 이 나라만 달랐다. 2·3줄은 이미 같은 틀이라 그대로 둔다 —
        // '2마리 이하'는 lex.uz 원문의 실제 면제 조건이라 일반 문구로 바꾸지 않는다.
        '우즈베키스탄 도착 후 공항 동물검역소에서 검역을 받으세요.\n서류를 확인해요. 반려동물 2마리 이하를 동반하면 격리 없이 통과할 수 있어요.\n입국 요건을 충족하지 못하면 입국할 수 없어요.',
      helpText: '우즈베키스탄 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '우즈베키스탄 수입 검역 서류',
      validationIds: ['uz.import-quarantine-date-valid'],
    }),
  },
  canada: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'canada',
      label: '캐나다',
      // 칩 선행 룰 없음(칩 필수 X) + 대기 룰 없음(0일) — 다른 3국과 다른 두 지점.
      // ca.rabies-only-1year-vaccine 도 없다 — CFIA 가 증명서 기재 유효기간을 그대로 인정해
      // 근거가 정반대였다(ca.ts 주석 참고).
      validationIds: [
        'ca.rabies-prime-after-3months-old',
        'ca.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        // ⚠️ '캐나다에는 검사 기관이 없으니 출국 전에 미리 받으세요' 를 **쓰지 않는다**
        //   (사용자 지정 2026-07-21). www 가이드에는 그 문장이 있지만 카드에서는 뺐다.
        //   서류탭의 noLocalTiterLab 옵션도 같이 껐다. 되살리지 말 것.
        //   (캄보디아·몽골·베트남은 그대로 유지 — 캐나다만 제외한 것이다.)
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n캐나다 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    // 항공권 — 접종 후 대기가 없다(캐나다 0일). 대기 문구·저장 거부·주의 룰이 모두 빠진다.
    'flight-purchase': {
      description:
        // '대기 기간이 없어요' 안내는 쓰지 않는다(사용자 지정 2026-07-21) — 없는 요건을
        // 설명하는 문장이라 다른 나라 항공권 카드에도 없다. 되살리지 말 것.
        '캐나다 입국 일정에 맞춰 항공권을 구매하세요.\n\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '캐나다에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: [],
    },
    // ⚠️ 캐나다는 **'동물검역소 검역' 모델이 아니다** — 카드를 전면 다시 썼다(2026-07-20 조사).
    //   복제 문구("공항에서 검역", "지정 시설에서 격리")는 두 군데 다 사실과 달랐다:
    //    ①격리 — CFIA Import Reference Document 명문 "Pet dogs imported from any country are
    //      **not subject to post-import quarantine** in Canada." 격리 자체가 없다.
    //    ②검역 주체 — 실제로는 **CBSA 국경관리관의 서류 검사 + 육안 검사**다. 원문:
    //      "…will have a **documentary inspection by the Canada Border Services Agency (CBSA)**
    //       to ensure the animal's rabies vaccination is valid and the animal description
    //       matches. … The CBSA will also **visually inspect** the animal … The CBSA may
    //       contact the CFIA when veterinary guidance or expertise is needed."
    //   미충족 시 결과도 격리가 아니라 **접종 명령 또는 반송**이다.
    //   수수료는 CBSA 공표 요율(첫 마리 CAD $36.95, 추가 $6.16, 미국발만 면제 = 한국발 적용).
    //   금액을 카드에 박지 않는다 — 환율·요율이 바뀌면 거짓말이 된다. '수수료를 내야 해요'까지만.
    departure: importQuarantineCard({
      label: '캐나다',
      fieldKey: 'ca_import_quarantine_date',
      description:
        // 다른 나라 도착 카드와 같은 3줄·같은 리듬으로 맞췄다(2026-07-21).
        //   1줄 = '[나라] 도착 후 <기관/장소>에서 …를 받으세요' (CBSA 를 여기로 올림)
        //   2줄 = 'X를 확인해요. [조건]이면 격리 없이 통과할 수 있어요.' ← 두 마디 고정
        //   3줄 = 그 나라 고유 사항(캐나다는 수수료 현장 납부)
        // '캐나다는 입국 후 격리가 없어요'는 뺐다 — 없는 요건을 설명하는 문장이라
        // 항공권 카드의 '대기 기간이 없어요'와 같은 부류다. 2줄의 '격리 없이 통과할 수
        // 있어요'가 이미 같은 뜻을 담는다. 되살리지 말 것.
        '캐나다 도착 후 국경관리기관(CBSA)의 입국 심사를 받으세요.\n광견병 접종증명서와 반려동물 정보를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.\n검사 수수료는 현장에서 내야 해요.',
      helpText: '캐나다 도착 후 입국 심사를 받은 날짜',
      // 발급물이 확인되지 않았다 — CFIA·CBSA 가 입국자에게 증서를 준다는 언급이 없다.
      // 수수료 영수증 외엔 없는 것으로 보이나 명문 근거가 없어 '서류'로 뭉뚱그린다.
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '캐나다 수입 검역 서류',
      validationIds: ['ca.import-quarantine-date-valid'],
    }),
  },
  // ── 미국 (CDC 저위험국 경로 + 주별 조건 + 한국 귀국) ─────────────────
  // 한국 출발 기본 경로를 다룬다. 개가 최근 6개월 고위험국에 있었다면 별도 CDC 경로가
  // 필요하므로 eligibility 카드와 blocker 가 이 기본 여정의 사용을 멈추고 상담을 안내한다.
  usa: {
    // 마이크로칩 — 전용 override 제거(2026-07-26 사용자 지시): 설명문·노출 조건 모두 base 와
    // 통일(전 목적지 공통 카드·상시 표시). CDC 요건(보편형 스캐너 판독)은 ISO 15자리 칩이 충족.
    // 광견병 백신·항체 — **캐나다와 동일**(2026-07-26 사용자 지정). '한국 귀국용' 전용
    // 문구·왕복 한정·90일 미만 면제(us-return-rabies-or-other)를 모두 걷어내고 캐나다처럼
    // 프로파일 파생 표준 카드 + 귀국용 항체 문형을 쓴다.
    'rabies-vaccine-1': {
      ...buildRabiesCard({
        destKey: 'usa',
        label: '미국',
        // '미국 입국 때 면역 유효기간이…' 자동 문장을 끈다 — 연방은 접종 자체를 요구하지
        // 않아 입국 요건으로 단정하면 거짓이 된다(2026-07-26 조사).
        omitEntryValidity: true,
        validationIds: [
          'us.rabies-prime-after-3months-old',
          'us.rabies-booster-within-prime-validity',
        ],
      }),
      // 문구는 **사용자가 불러준 3줄 그대로**(2026-07-26). 다듬거나 줄을 더하지 말 것.
      // buildRabiesCard 의 고정 문장 순서(최소연령 → extraLines)로는 '연방/주' 줄을 최소연령
      // **앞**에 둘 수 없어 description 만 명시 지정한다. 나머지(제목·완료문구·입력 잠금
      // earliest·검증 id)는 그대로 파생값을 쓴다.
      // ⚠️ 캐나다에서 함께 넘어왔던 두 줄은 사용자가 뺐다 — 되살리지 말 것:
      //   '증명서에 백신 유효기간이 적혀 있어야…'(CFIA 고유 규정) / '미국 도착일에 면역 유효기간이…'
      description:
        '광견병 백신을 접종하세요.\n\n미국 연방 입국 요건은 아니지만, 접종을 요구하는 주가 많아요.\n생후 3개월이 지난 후에 접종해야 해요.',
    },
    'rabies-titer': {
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n미국 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
      validationIds: RETURN_ONLY_TITER_CHECKS,
    },
    'flight-purchase': {
      // 사용자 확정 3줄(2026-07-26). 이동장 규격·출발일/도착일 입력 안내 문장은 뺐다 — 되살리지 말 것.
      description:
        '미국 입국 일정에 맞춰 항공권을 구매하세요.\n\n강아지는 미국 도착일에 생후 6개월 이상이어야 해요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '미국 입국 일정을 확인하세요.',
      earliest: undefined,
      validationIds: ['us.dog-entry-age-six-months'],
    },
    // 출국 전 임상검사·한국 수출검역·한국 수입검역 — override 없음 = base 그대로(캐나다와
    // 동일, 2026-07-26 사용자 지정). '미국 도착 주 별도 건강증명서' 문장도 함께 제거됨.
    departure: {
      ...importQuarantineCard({
        label: '미국',
        fieldKey: 'us_import_quarantine_date',
        // 문구는 **사용자가 불러준 그대로**(2026-07-26). 다듬거나 줄을 더하지 말 것.
        // 캐나다·하와이 도착 카드와 같은 리듬으로 맞춘 것이다:
        //   1줄 '[나라] 도착 후 <기관>에서 …를 받으세요' / 2줄 확인 대상 / 3줄 통과 조건.
        // 구 문구(종별 혼합 1문단 + '원본과 전자 사본을 바로 꺼낼 수 있게 준비하세요')는
        // 이 리듬을 벗어나 이질감이 있다는 사용자 지적으로 교체됨 — 되살리지 말 것.
        description:
          '미국 도착 후 국경관리기관(CBP)의 입국 심사를 받으세요.\n마이크로칩과 CDC 신고 접수증을 확인해요.\n준비에 문제가 없으면 격리 없이 통과할 수 있어요.',
        helpText: '미국 도착 후 입국 검사를 받은 날짜',
        attachmentHint: '입국 검사 관련 서류나 영수증이 있다면 사진·PDF로 보관하세요.',
        attachmentLabel: '미국 입국 검사 서류',
        // us.dog-arrival-hygiene(구제역 위생 안내)는 2026-07-26 사용자 결정으로 삭제 — 사유는
        // procedure-checks/us.ts 의 삭제 자리 주석 참고. 되살리지 말 것.
        validationIds: ['us.import-inspection-date-valid'],
      }),
      // 고양이 — CDC 개 수입 규칙 대상이 아니라 연방 서류 요건이 없다(광견병 접종증명서도
      // 불요). 남는 건 '건강해 보일 것' 하나라 확인 대상 줄을 빼고 2줄로 간다
      // (사용자 확정 2026-07-26 — 그대로 쓸 것). description(종 미상 폴백)은 강아지 판 유지.
      descriptionBySpecies: {
        cat: '미국 도착 후 국경관리기관(CBP)의 입국 심사를 받으세요.\n건강에 문제가 없으면 격리 없이 통과할 수 있어요.',
      },
      title: '미국 입국 검사',
      doneSummary: '미국 입국 검사를 마쳤어요.',
    },
  },
  // ── 베트남 골격 복제 2차 5국 (모로코·우크라이나·멕시코·브라질·카자흐스탄) ──────
  // 2026-07-20. 앞선 4국(캄보디아·몽골·우즈베키스탄·캐나다)과 같은 골격이지만 델타가 더 크다:
  //   모로코·우크라이나 — 항체검사가 **입국 요건**(titer.need='entry') → 카드 문구가 '한국
  //     귀국용'이 아니다. 우크라이나는 채혈 후 3개월 대기까지 있다(모로코는 없음).
  //   멕시코·브라질 — 내·외부 구충이 필수(base catalog 의 구충 카드를 쓴다).
  //   카자흐스탄 — 종합백신이 필수이고 **광견병과 같은 20일/12개월 규칙**이 걸린다.
  // 규정 근거는 전부 각 procedure-checks 헤더와 destination-config 프로파일 주석에 있다.
  morocco: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'morocco',
      label: '모로코',
      validationIds: [
        'ma.rabies-prime-after-91days-old',
        'ma.microchip-before-rabies',
        'ma.rabies-min-21days-before-departure',
        'ma.rabies-booster-within-prime-validity',
      ],
    }),
    // 항체검사가 **입국 요건**이라 '한국으로 돌아올 때 필요해요' 문형을 쓰지 않는다.
    // 채혈 시점(접종 후 30일)이 핵심이고, 채혈 후 대기는 없다.
    'rabies-titer': {
      description:
        // 두 줄을 뺐다(사용자 지정 2026-07-21). 되살리지 말 것:
        //   '모로코 입국에는 검사 후 따로 기다리는 기간이 없어요.' — 없는 요건을 설명하는
        //     문장이다(캐나다 '대기 기간이 없어요'와 같은 부류).
        //   '다만 모로코에서 주변 유럽 국가로 여행하려면 채혈 후 3개월…' — 한국 왕복 여정과
        //     무관한 제3국 이동 안내라 이 카드의 범위 밖이다.
        // 근거(www 가이드에 두 문장 다 있음)는 여기 주석에 보존.
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n광견병 접종일로부터 30일이 지난 후에 채혈해야 해요.\n0.5 IU/mL 이상이면 합격이에요.',
      // ⚠️ base 항체 카드는 일본 전용 룰(jp.*)을 달고 있다 — 덮어쓰지 않으면 모로코 케이스에서
      //   검증이 아예 실행되지 않는다(lint:validation-wiring 이 '적용되지 않는 룰'로 잡는다).
      //   모로코는 채혈 시점 제약(접종 후 30일)만 있고 채혈 후 대기가 없다.
      validationIds: ['ma.rnatt-min-30days-after-vaccine'],
    },
    'flight-purchase': {
      description:
        // '접종일로부터 21일이 지난 후에 입국할 수 있어요.' 를 뺐다(사용자 지정 2026-07-21).
        // 광견병 카드가 '출국 21일 전까지 접종해야 해요'로 같은 규칙을 이미 말한다.
        // 21일 규칙 자체는 살아 있다 — 입력 시 저장 거부(validateRabiesEntryWait)와
        // ma.rabies-min-21days-before-departure 주의가 그대로 동작한다.
        '모로코 입국 일정에 맞춰 항공권을 구매하세요.\n\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '모로코에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['ma.rabies-min-21days-before-departure'],
    },
    departure: importQuarantineCard({
      label: '모로코',
      fieldKey: 'ma_import_quarantine_date',
      // 격리는 '규정 미발견'이다 — 없다고 명시한 문구도 없어서 단정하지 않는다.
      description:
        // ⚠️ '검사 수수료 마리당 10디르함'을 뺐다(2026-07-21 조사). ONSSA 공식 요금표
        //   「Liste des prestations payantes」(2019-07-19 개정) 30쪽 전체에 **10디르함 항목이
        //   없다.** 수입 측에 개·고양이 전용 라인도 없고, 가장 가까운 건 SA-I-11
        //   "Oiseaux de plaisance et autres animaux de compagnie" — Tête — **100 Dh** 이다.
        //   10 인지 100 인지 확정할 수 없으므로 금액을 쓰지 않는다. 되살리려면 요금표 원문
        //   근거부터 확보할 것.
        '모로코 도착 후 국경 검역소에서 검역을 받으세요.\n검역기관(ONSSA) 수의사가 서류와 반려동물을 확인해요.\n통과하면 세관에서 검역 증명을 받아 입국해요.',
      helpText: '모로코 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '모로코 수입 검역 서류',
      validationIds: ['ma.import-quarantine-date-valid'],
    }),
  },
  ukraine: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'ukraine',
      label: '우크라이나',
      validationIds: [
        'ua.rabies-prime-after-12weeks',
        'ua.microchip-before-rabies',
        'ua.rabies-min-21days-before-departure',
        'ua.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      description:
        // 두 줄을 뺐다(사용자 지정 2026-07-22). 되살리지 말 것:
        //   '우크라이나 입국에 필요해요.' — 우크라이나 여정 카드에 있다는 사실 자체가
        //     이미 그 말이다.
        //   '접종을 거르지 않으면 결과는 계속 유효해요.' — 조건부 무기한 유효(EU 모델)라는
        //     근거는 destination-config ukraine 주석에 보존.
        // EU 방식 통일(2026-07-23) — 3개월 대기는 항공권 카드에만 둔다. EU 항체검사 카드가
        // 3개월을 언급하지 않는 것과 같은 배치(중복 제거).
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n광견병 접종일로부터 30일이 지난 후에 채혈해야 해요.\n0.5 IU/mL 이상이면 합격이에요.',
      validationIds: [
        'ua.rnatt-min-30days-after-vaccine',
        'ua.titer-value-min-0.5iu',
      ],
    },
    'flight-purchase': {
      // ⚠️ 영공 폐쇄를 카드에 명시한다 — 직항이 없다는 걸 모르면 항공권부터 잘못 산다.
      description:
        '우크라이나 입국 일정에 맞춰 항공권을 구매하세요.\n\n항체 검사 채혈일로부터 3개월이 지나야 입국할 수 있어요.\n우크라이나 영공이 닫혀 있어 직항편이 없어요. 유럽 공항까지 비행기로 간 뒤 육로로 국경을 넘어야 해요.\n유럽을 거치므로 유럽 입국 요건도 함께 확인하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '우크라이나에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: [
        'ua.rabies-min-21days-before-departure',
        'ua.departure-min-3months-after-titer',
      ],
    },
    departure: importQuarantineCard({
      label: '우크라이나',
      fieldKey: 'ua_import_quarantine_date',
      description:
        '우크라이나 도착 후 국경 검역소에서 검역을 받으세요.\n서류와 반려동물을 확인해요. 요건을 갖추면 격리 없이 통과할 수 있어요.\n육로로 국경을 넘으므로 국경 검문소에서 받게 돼요.',
      helpText: '우크라이나 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '우크라이나 수입 검역 서류',
      validationIds: ['ua.import-quarantine-date-valid'],
    }),
  },
  mexico: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'mexico',
      label: '멕시코',
      // 칩 선행 룰 없음 — SENASICA 문서에 칩 조항 자체가 없다(칩은 귀국 때 필요).
      validationIds: [
        'mx.rabies-prime-after-91days-old',
        'mx.rabies-min-30days-before-departure',
        'mx.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n멕시코 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    'flight-purchase': {
      description:
        '멕시코 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 30일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '멕시코에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['mx.rabies-min-30days-before-departure'],
    },
    // 기본 카드 문구('진드기·벼룩 … 호주·뉴질랜드 등에서 요구돼요')를 덮어쓴다(2026-07-22).
    // SENASICA 원문은 **"desparasitados interna y externamente dentro de los seis meses
    // previos"** — 내·외부를 묶어 '도착 전 6개월 이내'만 말하고 특정 기생충을 지목하지 않는다.
    // ⚠️ **6개월이 맞다 — 브라질(출국 15일)과 혼동해 15일로 바꾸지 말 것**(2026-07-22 확인).
    //   두 나라는 근거도 방향도 다르다: 멕시코는 **입국국의 수입 요건**(도착 전 6개월),
    //   브라질은 증명서 발급 기준 15일. 참고로 멕시코 요건 중 '15일'은 기생충이 아니라
    //   **건강증명서 유효기간**(Certificado de Buena Salud, 발급 후 최대 15일)이다.
    'external-parasite': {
      description: '외부 기생충 치료를 하세요.\n\n멕시코 도착일 기준 6개월 이내에 해야 해요.',
      validationIds: ['mx.external-parasite-within-6months'],
    },
    'internal-parasite': {
      description: '내부 기생충 치료를 하세요.\n\n멕시코 도착일 기준 6개월 이내에 해야 해요.',
      validationIds: ['mx.internal-parasite-within-6months'],
    },
    departure: importQuarantineCard({
      label: '멕시코',
      fieldKey: 'mx_import_quarantine_date',
      // 격리 없음·수수료 무료가 SENASICA 명문이라 그대로 쓴다. 진드기 발견 시 유치는
      // 실제로 일어나는 일이라 함께 안내한다.
      description:
        // 형제 도착 카드(중국·베트남·몽골·대만·우크라이나)와 같은 3줄 틀로 축약(2026-07-22).
        // ⛔ 뺀 두 줄 — 되살리려면 사용자 확인부터. 근거는 SENASICA 원문에 있다:
        //   · '이동장은 깨끗해야 하고, 현장에서 예방 처치를 해요.' — 검역 통과의 조건이 아니라
        //     현장 절차 서술이라 행동을 바꾸지 않는다.
        //   · '반추동물 성분이 든 사료·간식·침구는 반입할 수 없어요.' — 사실이지만 검역 카드가
        //     아니라 짐 싸기 정보다. 다른 나라 도착 카드도 반입 금지 품목을 싣지 않는다.
        //   · '진드기가 발견되면 보호자가 수의사를 불러 …' — 사용자 지정 삭제(2026-07-22).
        //     근거는 SENASICA 원문("contacta a un médico veterinario de tu elección …
        //     los gastos generados correrán por tu cuenta")에 있으나 카드엔 쓰지 않는다.
        '멕시코 도착 후 공항 검역사무소(OISA)에서 검역을 받으세요.\n서류와 반려동물을 확인해요. 격리도 검사 수수료도 없어요.',
      helpText: '멕시코 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '멕시코 수입 검역 서류',
      validationIds: ['mx.import-quarantine-date-valid'],
    }),
  },
  brazil: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'brazil',
      label: '브라질',
      // 칩 선행 룰 없음 — MAPA "A pet microchip is not required to enter Brazil."
      validationIds: [
        'br.rabies-prime-after-91days-old',
        'br.rabies-min-21days-before-departure',
        'br.rabies-booster-within-prime-validity',
      ],
    }),
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n브라질 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    'flight-purchase': {
      description:
        '브라질 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 21일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '브라질에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['br.rabies-min-21days-before-departure'],
    },
    // 기본 카드 문구를 덮어쓴다(2026-07-22). 두 가지가 어긋나 있었다:
    //  ① 15일 창이 카드에 없어 배지가 뜨고 나서야 알게 됐다.
    //  ② 기본 문구의 '진드기·벼룩'과 '호주·뉴질랜드 등에서 요구돼요'는 **브라질 원문에 없다** —
    //     MAPA 는 "broad-spectrum treatment against internal and external parasites"로
    //     내·외부를 묶어 말할 뿐 특정 기생충을 지목하지 않는다. 브라질 화면에서 다른 나라
    //     이름을 나열하는 것도 맞지 않는다.
    // ⚠️ 15일의 기준점 — 원문은 "국제수의증명서 발급일 기준 15일"이고 그 증명서는 **한국이
    //   발급하는 수출 검역증**이다(가는 방향 요건이므로). 브라질 CVI(귀국 편 서류)로 착각해
    //   기준을 바꾸지 말 것 — 2026-07-22 그렇게 고칠 뻔했다. 한국 수출 검역은 출국 10일 이내라
    //   출국일 기준이 실무상 타당한 근사다.
    'external-parasite': {
      description: '외부 기생충 치료를 하세요.\n\n출국일 기준 15일 이내에 해야 해요.',
      validationIds: ['br.external-parasite-within-15days'],
    },
    'internal-parasite': {
      description: '내부 기생충 치료를 하세요.\n\n출국일 기준 15일 이내에 해야 해요.',
      validationIds: ['br.internal-parasite-within-15days'],
    },
    departure: importQuarantineCard({
      label: '브라질',
      fieldKey: 'br_import_quarantine_date',
      // ⚠️ **'국제수의증명서(CVI)'라고 쓰지 말 것**(2026-07-22 수정). 도착 때 내는 서류는
      //   **한국이 발급한 수출 검역증**이다. 브라질 CVI 는 같은 케이스의 **귀국 편** 서류라
      //   (br-export-quarantine), 두 카드가 같은 이름을 쓰면 고객이 "브라질 서류를 미리
      //   받아 가야 하나"로 읽는다. 실제로 그렇게 쓰여 있었다.
      //   (브라질 원문은 출발국 증명서도 CVI 로 통칭한다 — 용어 자체가 틀린 건 아니지만,
      //    우리 화면에선 방향을 구분해 부르는 쪽이 안전하다.)
      description:
        '브라질 도착 후 공항 농축산 검역기관(VIGIAGRO)에서 검역을 받으세요.\n한국에서 받은 수출 검역증과 반려동물을 확인해요. 요건을 갖추면 격리 없이 통과할 수 있어요.\n요건을 충족하지 못하면 입국이 거부되거나 반송될 수 있어요.',
      helpText: '브라질 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '브라질 수입 검역 서류',
      validationIds: ['br.import-quarantine-date-valid'],
    }),
  },
  // ── 아랍에미리트 — 필리핀 골격 복제(2026-07-22) ─────────────────────────
  // ⚠️ 항체 카드는 없다(프로파일 titer.need='none'). 입국 요건도 귀국 요건도 아니다 —
  //   근거는 destination-config 의 uae 주석. 항체 문구를 다시 넣지 말 것.
  // 값은 전부 ae.ts 헤더(MOCCAE)에서 왔다 — 광견병 출국 21일 전, 종합백신 21일 전,
  //   내·외부 기생충 출국 14일 이내.
  uae: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'uae',
      label: '아랍에미리트',
      validationIds: [
        'ae.rabies-prime-after-91days-old',
        'ae.microchip-before-rabies',
        'ae.rabies-min-21days-before-departure',
        'ae.rabies-booster-within-prime-validity',
      ],
    }),
    'general-vaccine': {
      // 항공권(45)보다 앞으로 — 종합백신이 입국 요건이라 준비 순서상 먼저다(사용자 지정
      // 2026-07-22). 34 = 광견병 1차(30) 바로 뒤. 35 는 rabies-vaccine-2 가 써서 피한다
      // (아랍에미리트는 1회 접종국이라 2차 카드가 안 뜨지만, 동점 순서는 불안정하다).
      // 카자흐스탄과 같은 처리.
      order: 34,
      description:
        '종합백신을 접종하세요.\n\n출국 21일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        // ✅ MOCCAE 요건 — 개는 디스템퍼·전염성간염(아데노 2형)·파보·렙토, 고양이는 FVRCP
        //   세 가지(허피스·칼리시·범백). 질병명이 아예 없던 것을 채웠다(2026-07-22).
        //   ⛔ 파라인플루엔자는 요건이 아니다 — DHPP 제품명에 들어 있을 뿐이다. 넣지 말 것.
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n출국 21일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n허피스바이러스·칼리시바이러스·범백혈구감소증 예방을 포함해야 해요.\n출국 21일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      },
      validationIds: [
        'ae.general-vaccine-required',
        'ae.general-vaccine-21days-before-departure',
        // 이미 만료(오늘 기준) '주의' — 종합백신 카드국 공통(만료 재구성 B, 2026-07-25).
        'common.general-vaccine-validity-expired',
      ],
    },
    // 수입 허가증 — 기본 카드 문구가 '호주(DAFF)·뉴질랜드(MPI)·대만(APHIA)·말레이시아(DVS)'를
    // 나열해 아랍에미리트 화면에서 엉뚱했다. MOCCAE 값으로 교체.
    // ✅ MOCCAE 공식 서비스 페이지 확인(2026-07-23, 사용자 조사): 온라인 전용(디지털 서비스
    //   계정 필요 — 방문자도 등록 가능) / 수수료 **마리당 200디르함** 카드 결제 /
    //   처리 **약 1영업일**(서비스견·정서지원견·의료 목적견은 최대 5영업일) /
    //   허가 **90일 유효** / 일반 반려견·고양이는 **신청 단계 첨부서류 없음**.
    // ⚠️ 개인은 **연간 2마리**까지(개2·고양이2·개1+고양이1). UAE 거주 반려동물의 재입국은
    //   예외가 있을 수 있다 — 룰(ae.max-2pets-per-year)은 운영자 전용이라 카드엔 안 쓴다.
    // 표기는 '수입 허가증' — 대만·말레이시아·인도네시아·필리핀·스위스와 같은 문형
    //   (2026-07-23 정정. 아랍에미리트만 '수입 허가'로 적혀 있었다).
    'import-permit': {
      // ⛔ 사용자가 불러준 최종 원문(2026-07-23). 세 문단 그대로 — 문장 추가·병합 금지.
      //   함께 빠진 것(근거는 위 주석에 보존): 마리당 200디르함 수수료, 처리 1영업일,
      //   '너무 일찍 신청하면 만료' 경고. 되살리려면 사용자 확인부터.
      description:
        '검역기관(MOCCAE)에 수입 허가를 신청하세요.\n\n온라인으로 신청해요.\n\n허가증은 발급일로부터 90일간 유효해요.',
      cardLine: '아랍에미리트 수입 허가를 신청하세요.',
      doneSummary: '아랍에미리트 수입 허가증을 받았어요.',
      // 마감 배지 제거(2026-07-26) — base 의 '출국 30일 전'을 물려받고 있었는데, MOCCAE 는
      //   신청 마감일을 정하지 않는다. 같은 근거로 마감 알림·발급 푸시는 이미 만들지 않았고
      //   (reminders.ts·milestone-pushes.ts 주석), 배지만 남아 없는 기한을 말하고 있었다.
      //   90일 유효 상한은 카드 문구가 담당한다.
      // 버튼 완료 카드 — 홍콩·말레이시아·인도네시아와 같은 모델로 통일(2026-07-26 사용자 결정).
      //   보호자가 MOCCAE 에 온라인으로 직접 신청하지만, 카드가 요구하던 신청일 검증(구
      //   ae.import-permit-within-90days = 출국일 순서 + 90일 유효)을 걷고 '확인'만 받는다.
      deadline: undefined,
      buttonComplete: true,
      done: 'dated:import_permit_application_date',
      inputs: [
        {
          key: 'import_permit_application_date',
          label: '허가 취득일',
          type: 'date',
          helpText: '수입 허가증을 받은 날짜',
        },
      ],
      validationIds: [],
      links: [
        {
          url: 'https://moccae.gov.ae/en/services/import-permit-pets',
          label: '반려동물 수입 허가증 신청 (MOCCAE)',
        },
      ],
    },
    // 항공권 — base 는 일본 항체 180일 룰을 달고 있다(아랍에미리트엔 항체 자체가 없다).
    // 광견병 21일 대기만 남긴다.
    'flight-purchase': {
      description:
        '아랍에미리트 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 21일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '아랍에미리트에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['ae.rabies-min-21days-before-departure'],
    },
    'external-parasite': {
      description: '외부 기생충 치료를 하세요.\n\n출국일 기준 14일 이내에 해야 해요.',
      validationIds: ['ae.external-parasite-within-14days'],
    },
    'internal-parasite': {
      description: '내부 기생충 치료를 하세요.\n\n출국일 기준 14일 이내에 해야 해요.',
      validationIds: ['ae.internal-parasite-within-14days'],
    },
    // ⛔ 검역 반출(release) 안내를 뺐다(사용자 지정 2026-07-23). 되살리지 말 것.
    //   근거는 남긴다 — 도착 후 MOCCAE 시스템에서 반출을 따로 신청·결제하고 외관 검사를
    //   받아야 전자 반출승인이 나오며, 수수료는 개 500 / 고양이 250디르함(수입 허가와 별개).
    //   종별 금액이 달라 descriptionBySpecies 로 나눠 뒀던 것도 함께 제거했다.
    departure: importQuarantineCard({
      label: '아랍에미리트',
      fieldKey: 'ae_import_quarantine_date',
      description:
        '아랍에미리트 도착 후 공항 검역소에서 검역을 받으세요.\n한국에서 받은 수출 검역증과 반려동물을 확인해요.\n요건을 갖추면 격리 없이 통과할 수 있어요.',
      helpText: '아랍에미리트 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '아랍에미리트 수입 검역 서류',
      validationIds: ['ae.import-quarantine-date-valid'],
    }),
  },
  kazakhstan: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'kazakhstan',
      label: '카자흐스탄',
      validationIds: [
        'kz.rabies-prime-after-3months-old',
        'kz.microchip-before-rabies',
        'kz.rabies-booster-within-prime-validity',
        'kz.rabies-min-20days-before-departure',
      ],
    }),
    // ⚠️ 종합백신에도 광견병과 같은 20일/12개월 규칙이 걸린다 — EAEU 제15장이 두 백신을
    //   같은 문장에서 규율한다. 다른 목적지(태국·필리핀)와 다른 지점이라 문구로 명시한다.
    // 종합백신 — 광견병(30) 바로 아래로 올린다(사용자 지정 2026-07-22). 카자흐스탄은 종합백신이
    // **입국 요건**이라 귀국용 항체검사(40)보다 먼저 보여주는 게 준비 순서에 맞다.
    // 종별 분리는 태국·필리핀과 같은 문형(descriptionBySpecies).
    //
    // ⚠️ **질병명 — 조문은 6개, 카드는 5개. 둘 다 맞다**(2026-07-22 사용자 확인으로 결착).
    //   EAEU 제15장 원문(procedure-checks/kz.ts 헤더에 전문 인용): "против чумы плотоядных,
    //   гепатита, **вирусного энтерита**, парво- и аденовирусных инфекций, лептоспироза"
    //   → 조문은 '바이러스성 장염'을 따로 센다. 그러나 이는 **파보바이러스성 장염**을 가리키는
    //     말이라 백신 라벨에선 **P(파보) 하나로 충족**된다. 별도 성분이 아니다.
    //   → 그래서 **고객 카드엔 5개만 쓴다** — '장염'을 항목으로 올리면 라벨에 없는 성분을
    //     찾게 만든다. 조문 6개는 여기 주석과 kz.ts 헤더에 보존.
    //   라벨 대조표(사용자 제공): D=필수 / H(CAV-1)=필수 / P=필수 / L=필수 /
    //     CAV-2=아데노 요건 충족에 중요 / **Pi(파라인플루엔자)는 규정상 필수 아님**.
    //   ⛔ '일반적인 DHPPL 또는 DHPPiL 계열이면 대체로 충족돼요.' 는 넣었다가 삭제
    //     (사용자 지정 2026-07-22). 되살리지 말 것 — 위 대조표는 여기 주석으로만 보존한다.
    //   고양이는 панлейкопения(범백혈구감소증) 하나뿐이다(허피스·칼리시는 조문에 없다).
    'general-vaccine': {
      // 34 = 광견병 1차(30) 바로 뒤. 35 는 rabies-vaccine-2 가 이미 쓰고 있어 동점을 피한다
      // (카자흐스탄은 1회 접종국이라 2차 카드가 안 뜨지만, 동점 순서는 불안정해 피한다).
      order: 34,
      description:
        '종합백신을 접종하세요.\n\n출국 20일 전까지 접종해야 해요.\n최근 12개월 안에 접종했다면 다시 맞지 않아도 돼요.',
      descriptionBySpecies: {
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·아데노바이러스·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n출국 20일 전까지 접종해야 해요.\n최근 12개월 안에 접종했다면 다시 맞지 않아도 돼요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증 예방을 포함해야 해요.\n출국 20일 전까지 접종해야 해요.\n최근 12개월 안에 접종했다면 다시 맞지 않아도 돼요.',
      },
      // 만료(12개월) 룰은 카드 안내와 중복이라 포털에서 숨는다 — 그래도 카드에 지목은 해
      // 둔다(펫무브워크 배지 위치 + 배선 린트 3단계 'orphan-rule' 방지).
      validationIds: [
        'kz.general-vaccine-min-20days-before-departure',
        'kz.general-vaccine-not-expired-on-arrival',
        // 이미 만료(오늘 기준) '주의' — 종합백신 카드국 공통(만료 재구성 B, 2026-07-25).
        'common.general-vaccine-validity-expired',
      ],
    },
    'rabies-titer': {
      // 귀국용 항체검사만 필요한 목적지 — 일본 룰(jp.*)이 물려 내려오던 것을 끊는다.
      validationIds: RETURN_ONLY_TITER_CHECKS,
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n카자흐스탄 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    },
    'flight-purchase': {
      description:
        '카자흐스탄 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 20일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '카자흐스탄에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['kz.rabies-min-20days-before-departure'],
    },
    departure: importQuarantineCard({
      label: '카자흐스탄',
      fieldKey: 'kz_import_quarantine_date',
      description:
        '카자흐스탄 도착 후 국경 검역소에서 검역을 받으세요.\n국제 반려동물 여권과 서류를 확인해요.\n반려동물 2마리 이하는 수입 허가와 격리가 모두 면제돼요.',
      helpText: '카자흐스탄 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '카자흐스탄 수입 검역 서류',
      validationIds: ['kz.import-quarantine-date-valid'],
    }),
  },
  // ── 러시아·튀르키예 — ⚠️ 카자흐스탄 한 벌 복제(2026-07-22) ──────────────
  // 사용자 지정: 카자흐스탄 구성을 그대로 복사하고 세부는 다음 단계에서 나라별로 수정한다.
  // 문구·수치(생후 3개월·20일 대기·종합백신 12개월 면제)는 전부 카자흐스탄 것이다.
  // 나라별 알려진 충돌은 destination-config 의 각 프로파일 주석 참고 —
  //   러시아: 실제 대기 30일 / 튀르키예: 항체가 **입국 요건**·84일·30일.
  //
  // 'rabies-titer' 카드는 RETURN_ONLY_TITER_CHECKS 를 지목한다 — base 카드의 일본 전용
  //   룰(jp.*)을 덮지 않으면 이 나라 케이스에서 아무 검증도 돌지 않는다(13개국에서 같은 문제가
  //   있었고 530668cb 에서 정리됐다). 귀국용 항체 카드는 전부 이 상수를 쓴다.
  russia: {
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'russia',
      label: '러시아',
      validationIds: [
        'ru.rabies-prime-after-3months-old',
        'ru.microchip-before-rabies',
        'ru.rabies-booster-within-prime-validity',
        'ru.rabies-min-20days-before-departure',
      ],
    }),
    'general-vaccine': {
      // 34 = 광견병 1차(30) 바로 뒤 — 카자흐스탄과 동일(입국 요건이라 귀국용 항체보다 앞).
      order: 34,
      description:
        '종합백신을 접종하세요.\n\n출국 20일 전까지 접종해야 해요.\n최근 12개월 안에 접종했다면 다시 맞지 않아도 돼요.',
      descriptionBySpecies: {
        // ✅ 가이드 기준 정정(2026-07-23). 구 '아데노바이러스'는 전염성간염(CAV)과 같은 병이라
        //   중복이었고 DHPPL 의 파라인플루엔자(Pi)가 빠져 있었다. 가이드: '개 디스템퍼, 전염성
        //   간염, 렙토스피라증, 개 파보바이러스, 개 파라인플루엔자'. 순서는 라벨(D·H·P·Pi·L)로.
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n출국 20일 전까지 접종해야 해요.\n최근 12개월 안에 접종했다면 다시 맞지 않아도 돼요.',
        // ✅ 가이드가 FVRCP 3종(범백·허피스·칼리시)을 명시 — 범백만 적던 것을 채웠다(필리핀과 통일).
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증·허피스바이러스·칼리시바이러스 예방을 포함해야 해요.\n출국 20일 전까지 접종해야 해요.\n최근 12개월 안에 접종했다면 다시 맞지 않아도 돼요.',
      },
      validationIds: [
        'ru.general-vaccine-min-20days-before-departure',
        'ru.general-vaccine-not-expired-on-arrival',
        // 이미 만료(오늘 기준) '주의' — 종합백신 카드국 공통(만료 재구성 B, 2026-07-25).
        'common.general-vaccine-validity-expired',
      ],
    },
    'rabies-titer': {
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n러시아 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
      validationIds: RETURN_ONLY_TITER_CHECKS,
    },
    'flight-purchase': {
      description:
        '러시아 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 20일이 지난 후에 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '러시아에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['ru.rabies-min-20days-before-departure'],
    },
    departure: importQuarantineCard({
      label: '러시아',
      fieldKey: 'ru_import_quarantine_date',
      // ✅ 카자흐스탄 복제 잔재 정정(2026-07-23). 구 '국경 검역소·국제 반려동물 여권·2마리 이하
      //   수입허가·격리 면제'는 전부 카자흐스탄(EAEU 육로) 것이다. 러시아 가이드: "공항의 동물
      //   검역소(Veterinary Customs Station)에서 심사 … 충족하지 못하는 경우 입국할 수 없습니다"
      //   — 격리·2마리 면제 규정 없음, 공항 심사다.
      description:
        '러시아 도착 후 공항 동물검역소에서 검역을 받으세요.\n마이크로칩과 서류를 확인해요.\n입국 요건을 충족하지 못하면 입국할 수 없어요.',
      helpText: '러시아 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '러시아 수입 검역 서류',
      validationIds: ['ru.import-quarantine-date-valid'],
    }),
  },
  turkey: {
    // 임상검사·한국 수출 검역 — 튀르키예 창은 2일(프로파일 vetVisitWindowDays: 2, TK 증명서).
    // base 문구(10일)가 차단(2일)과 어긋나던 것 정정(2026-07-25 — 싱가포르와 같은 부류).
    'vet-visit': {
      description:
        '출국일 기준 2일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
      deadline: { anchor: 'departure', daysBefore: 1, window: true },
    },
    'certificate-issue': {
      description:
        '출국일 기준 2일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.',
      deadline: { anchor: 'departure', daysBefore: 1, window: true },
    },
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'turkey',
      label: '튀르키예',
      validationIds: [
        'tr.rabies-prime-after-12weeks',
        'tr.microchip-before-rabies',
        'tr.rabies-booster-within-prime-validity',
        'tr.rabies-min-21days-before-departure',
        'tr.rabies-within-12months-of-departure',
      ],
    }),
    // 항체검사 = **튀르키예 입국 요건**. ⚠️ 2026-07-23 EU 모델(우크라이나)로 재정비 —
    // 채혈은 접종 후 30일 이후, 출국은 채혈 후 3개월 이후. 유효기간은 조건부 무기한이라
    // '몇 개월 유효' 문구를 쓰지 않는다(백신 연속성이 곧 유효성 — 근거는 destination-config
    // turkey 주석). 우크라이나 titer 카드와 같은 문형.
    'rabies-titer': {
      // EU 방식 통일(2026-07-23) — 3개월 대기는 항공권 카드에만 둔다(중복 제거, 우크라이나와 동일).
      description:
        '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n광견병 접종일로부터 30일이 지난 후에 채혈해야 해요.\n0.5 IU/mL 이상이면 합격이에요.',
      validationIds: ['tr.rnatt-min-30days-after-vaccine', 'tr.titer-value-min-0.5iu'],
    },
    // 내·외부 기생충 — 가이드 "여행 30일 이내". 멕시코·브라질 카드와 같은 문형으로 통일
    // (사용자 지정 2026-07-23): 카드엔 특정 기생충(진드기·촌충 Echinococcus)을 지목하지 않고
    // '외부/내부 기생충 치료 + 출국일 기준 N일 이내'만 쓴다. 기생충 종류는 검증 룰 설명(staff)에 보존.
    'external-parasite': {
      description: '외부 기생충 치료를 하세요.\n\n출국일 기준 30일 이내에 해야 해요.',
      validationIds: ['tr.external-parasite-within-30days'],
    },
    'internal-parasite': {
      description: '내부 기생충 치료를 하세요.\n\n출국일 기준 30일 이내에 해야 해요.',
      validationIds: ['tr.internal-parasite-within-30days'],
    },
    'flight-purchase': {
      description:
        '튀르키예 입국 일정에 맞춰 항공권을 구매하세요.\n\n항체 검사 채혈일로부터 3개월이 지나야 입국할 수 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '튀르키예에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['tr.rabies-min-21days-before-departure', 'tr.departure-min-3months-after-titer'],
    },
    departure: importQuarantineCard({
      label: '튀르키예',
      fieldKey: 'tr_import_quarantine_date',
      // 튀르키예는 도착 시 국경 수의검역(공항 국경수의검문소 VSKN, 서류·마이크로칩·개체 확인)을
      // 한다 — 다른 나라 도착 카드와 같은 '검역 받으세요' 패턴. 요건(광견병 항체검사 포함) 충족 시
      // 격리 없이 통과, 미충족 시 격리·반송(공식 tarimorman.gov.tr "karantina altına alınır").
      // ⚠️ 미충족 시 결과(격리·반송) 줄은 카드에서 뺐다(사용자 지정 2026-07-23) — 격리 일수(21일설)가
      // 상업 사이트 근거뿐이고 요건 충족 고객에겐 해당 없어서. 공식(tarimorman.gov.tr)엔
      // 'karantina altına alınır'(격리)가 있으니 1차 일수 확인되면 형제 카드처럼 되살릴 것.
      description:
        '튀르키예 도착 후 공항 동물검역소에서 검역을 받으세요.\n마이크로칩과 서류를 확인해요. 준비에 문제가 없으면 격리 없이 통과할 수 있어요.',
      helpText: '튀르키예 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '튀르키예 수입 검역 서류',
      validationIds: ['tr.import-quarantine-date-valid'],
    }),
  },
  // ── 대만 (APHIA 動植物防疫檢疫署) ─────────────────────────────────────
  // 1회 접종 + 항체검사 모델(EU 골격)이지만 대기·허가 구조가 다르다: ①채혈 후 180일 대기
  // (일본과 같아 base 항공권 earliest anchor 를 그대로 상속) ②수입허가증을 도착 120일 전까지
  // 온라인 신청(격리 면제 조건 — 20일 전까지도 가능하나 7일 격리) ③요건 충족 시 무격리.
  // 불활화 백신만·유효 1년(2·3년 입력불가는 프로파일 oneYearVaccineOnly 파생). 종합백신 카드는
  // 대만 공식 요건에 없어 미노출(2026-07-18 사용자 결정). 규정 상세·출처는 procedure-checks/tw.ts.
  taiwan: {
    // 문구·완료·earliest 전부 프로파일에서 파생(buildRabiesCard). 규정값은 destination-config
    // 의 rabies 블록에 있고, 여기선 그 나라 검증 룰만 지목한다.
    'rabies-vaccine-1': buildRabiesCard({
      destKey: 'taiwan',
      label: '대만',
      validationIds: [
        'tw.rabies-prime-after-90days-old',
        'tw.microchip-before-rabies',
        'tw.rabies-booster-within-prime-validity',
      ],
    }),
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
    // 추가 검사 — 유효기간 1년이 지나기 전에 다시 받으면 체인이 유지돼 대기가 없다.
    // base 는 일본 문구('일본 입국 전에…')라 목적지 override 로 갈아끼운다.
    //
    // 검증은 추가 채혈일 자체를 보는 룰을 지목한다(tw.rnatt-after-rabies-vaccine 은 모든
    // 채혈 기록을 순회하므로 추가 검사분도 포함). 만료·대기 판정은 항공권 카드의
    // tw.rnatt-180days-to-1year-before-arrival 담당 — 여기 또 붙이면 같은 경고가 두 번 뜬다.
    'rabies-titer-extra': {
      description:
        '대만 입국 전에 추가 검사를 받으세요.\n\n직전 검사의 유효기간이 끝나기 전에 받으면 대기 없이 입국할 수 있어요.\n유효기간이 지난 뒤에 받으면 채혈일로부터 180일을 다시 기다려야 해요.\n\n검사 결과가 나올 때까지 수 주가 걸리는 점을 고려해 여유 있게 검사를 진행하세요.',
      validationIds: ['tw.rnatt-after-rabies-vaccine'],
    },
    // 항공권 — 채혈 후 180일 대기는 일본과 동일(base earliest anchor 상속). 검증만 tw 로 교체.
    'flight-purchase': {
      description:
        // 120일 안내는 수입허가증 카드(order 43, 이 카드보다 앞)가 담당 — 중복이라 뺀다.
        // 두 단계를 다 적는다 — '180일~1년 사이'로만 쓰면 90~180일 구간 고객이 못 가는 걸로
        // 읽는다(실제로는 입국 가능 + 7일 격리). 입력불가를 90일로 푼 것과 어긋나던 자리다.
        // 수입허가 카드가 120일/20일을 같은 방식으로 적는 것과 문형을 맞춘다(2026-07-19).
        '대만 입국 일정에 맞춰 항공권을 구매하세요.\n\n채혈일로부터 180일이 지난 후에 입국하면 격리 없이 통과할 수 있어요.\n90일이 지나면 입국할 수 있지만, 이 경우 대만 도착 후 7일간 지정 시설에서 격리돼요.\n검사 결과는 채혈일로부터 1년간 유효해요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '대만에 입국할 수 있어요.',
      // 수입허가 마감(120/20일) 주의도 여기에 둔다 — 수입허가 카드가 아니라.
      // 신청일은 이미 지나간 사실이라 못 바꾸고, 어긋났을 때 **바꿀 수 있는 건 출국일뿐**이다.
      // 조치할 수 있는 칸이 있는 카드에 안내를 붙인다(2026-07-19 사용자 결정).
      validationIds: [
        'tw.rnatt-180days-to-1year-before-arrival',
        'tw.import-permit-120days-before-entry',
        // 접종 후 선적 대기(1차 90일/부스터 30일)도 여기 — 접종일은 과거 사실이라
        // 어긋나면 바꿀 수 있는 건 출국일뿐이다.
        'tw.rabies-shipment-window',
      ],
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
        '대만 수입 허가를 신청하세요.\n\n도착 120일 전까지 온라인으로 신청하세요.\n도착 20일 전까지 신청할 수 있지만, 이 경우 대만 도착 후 7일간 지정 시설에서 격리돼요.',
      doneSummary: '대만 수입 허가증을 받았어요.',
      cardLine: '대만 수입 허가를 신청하세요.',
      // 2단계 마감 — 120일(격리 면제) 놓치면 20일(진짜 마지막, 도착 후 7일 격리)로 넘어간다.
      deadline: { anchor: 'departure', daysBefore: 120, fallbackDaysBefore: 20 },
      inputs: [{ key: 'import_permit_application_date', label: '신청일', type: 'date' }],
      attachmentHint: '수입 허가증(Import Permit)을 사진·PDF로 보관하세요.',
      attachmentLabel: '수입 허가증(Import Permit)',
      links: [
        { url: 'https://pet-epermit.aphia.gov.tw/index-eng.html', label: '수입 허가 신청(APHIA)' },
      ],
      // 마감 주의는 항공권 카드가 표시한다(위 flight-purchase 주석 참고) — 여기서 지목하면
      // 신청일 칸 옆에 뜨는데, 그 칸은 이미 지나간 사실이라 고칠 수가 없다.
      // 신청일 자체의 입력불가(출국 이후·20일 미만)는 validateImportPermitFiledDate 담당.
      validationIds: [],
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
      // 대만은 도착 검역 후 발급되는 증서가 확인되지 않는다(required-docs.ts 대만 블록
      // 주석 참고) — '검역 서류'로 통일.
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '대만 수입 검역 서류',
      validationIds: ['tw.import-quarantine-date-valid'],
    }),
  },
  // ── 호주 (DAFF, Group 3 — 강아지) ─────────────────────────────────────────
  // 출처: agriculture.gov.au "How to bring your dog to Australia from a Group 3 country"
  //   + "Rabies vaccination and tests..." 전문(2026-07-27 확인). 수치 근거는 procedure-checks/au.ts.
  // sea-permit 골격(광견병 1회 + 수입허가 + 종합백신 + 도착 계류)에 호주 고유 절차를 얹는다:
  //   마이크로칩 인증(au-identity-check, order 25) · 계류시설 예약(au-quarantine-reservation, 44) ·
  //   독감(CIV) · 전염병 검사 · 내외부 구충.
  // 종별 처리(Group 3 cat guide 전문 확인, 2026-07-27) — 고양이는 CIV·렙토 Canicola·
  //   리슈만편모충·브루셀라가 **전부 없고** 종합백신도 권장일 뿐이다. 그래서 종합백신·전염병
  //   검사 카드는 catalog 의 `speciesByDestination: { australia: 'dog' }` 로 고양이에게 아예
  //   뜨지 않는다. 외부구충만 시작일이 갈려(개 30일·고양이 21일) descriptionBySpecies 로 나눴다.
  //   나머지 카드(마이크로칩 인증·광견병·항체·허가·계류·운송·구충·임상검사·검역)는 양 종 동일하다.
  australia: seaPermitOverrides({
    key: 'australia',
    label: '호주',
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n출국 때 면역 유효기간이 남아 있어야 해요.',
    rabiesValidationIds: [
      'au.rabies-prime-after-84days',
      'au.microchip-before-rabies',
      'au.rabies-booster-within-prime-validity',
      'au.rabies-valid-from-titer-to-departure',
    ],
    // ⚠️ titerDescription 을 팩토리에 넘기지 않는다 — 팩토리판은 order 55 · **귀국용** 룰로
    //   만들어지는데 호주 항체는 **입국 요건**이라 아래 extra['rabies-titer'] 가 통째로 교체한다.
    //   넘기면 같은 문구가 두 벌 생겨 한쪽만 고치는 사고가 난다(싱가포르에 남아 있는 중복).
    // 종합백신 = **렙토스피라 Canicola** 요건(7.2)이 본체. DHPP 등 나머지는 권장 사항이다.
    //   백신 대신 MAT 검사를 받는 선택지도 규정에 있어(7.3) 마지막 줄로 안내한다.
    generalVaccine: {
      // 백신 카드 4장을 광견병(30) 뒤에 연달아 — 종합 32 · 독감 34 · 켄넬코프 36
      //   (2026-07-27 사용자 지정). 항체(40)·수입허가(42)·계류시설 예약(44)이 그 뒤로 밀린다.
      order: 32,
      // 문형은 렙토를 요구하는 다른 목적지(괌·아랍에미리트·카자흐스탄·러시아·태국·말레이시아·
      //   필리핀)와 같은 형태로 맞췄다(2026-07-27). 특히 **'한국 백신은 렙토스피라(L)…' 경고**는
      //   그 7곳이 모두 다는 줄인데 호주에만 빠져 있었다 — 호주는 렙토 Canicola 가 **유일한
      //   의무 항목**이라 오히려 가장 필요한 자리다.
      description:
        '종합백신을 접종하세요.\n\n처음 접종하면 2~4주 간격으로 2회 접종해요.\n출국 14일 전까지 접종해야 해요.\n접종 유효기간은 1년이에요.\n\n렙토스피라 예방을 포함한 백신을 권장해요. 그렇지 않은 경우 렙토스피라 검사(MAT)를 받아야 해요.',
      validationIds: [
        'au.general-vaccine-14days-before-departure',
        'au.general-vaccine-within-12months',
      ],
    },
    // 항공권이 아니라 **운송 예약** — 반려동물이 보호자와 같은 항공기로 갈 수 없고 정식 항공
    //   화물(manifested cargo)로만 간다(6.3). 홍콩·영국과 같은 문형.
    flight: {
      title: '운송 예약',
      shortLabel: '운송',
      doneSummary: '운송 예약을 했어요.',
      attachmentHint: '운송 예약 확인서·항공권(e-티켓)을 사진·PDF로 보관하세요.',
      description:
        '계류 예약 날짜에 맞춰 운송을 예약하세요.\n\n반려동물은 보호자와 같은 항공기 객실이나 수하물로 갈 수 없어요. 정식 항공 화물로만 보내요.\nIATA 규격 이동장이 필요해요.\n멜버른 국제공항에 바로 도착해야 해요. 다른 공항에 내려 국내선으로 옮길 수 없어요.\n항체 검사 검체가 검사기관에 도착한 날부터 180일이 지난 뒤에 도착할 수 있어요.\n경유는 가능하지만 승인국 공항의 국제구역에서 다른 동물과 접촉하지 않아야 해요.',
      // 계류시설 예약(44) 다음 — DAFF 순서(허가 → 계류 예약 → 운송 예약)와 같게.
      order: 46,
      validationIds: ['au.titer-min-180days-after-sample-received'],
    },
    // 수입 허가(BICON) — 항체 결과지 + RNATT 선언서를 갖춘 뒤 신청. 확정 마감일은 규정에
    //   없고(허가 유효기간이 RNATT 만료일에 연동) 심사에 20~40영업일이 걸린다는 사실만 안내한다.
    //   → base 의 '출국 30일 전' 마감 배지는 내린다(싱가포르·홍콩과 같은 처리).
    importPermit: {
      description:
        '호주 검역당국(DAFF)의 BICON에서 수입 허가를 신청하세요.\n\n항체 검사 결과지와 RNATT 선언서를 함께 제출해요.\n신청할 때 수수료를 전액 결제해요.\n허가가 나오기까지 보통 20~40영업일 걸리고, 길면 123영업일까지 걸릴 수 있어요.\n허가는 항체 검사가 만료되는 날(채혈일부터 12개월)까지만 유효해요.\n호주에 도착하는 날에도 허가가 유효해야 해요.',
      doneSummary: '호주 수입 허가를 받았어요.',
      cardLine: '호주 수입 허가를 신청하세요.',
      attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
      attachmentLabel: '호주 수입 허가증',
      // 항체(40) 다음, 계류시설 예약(44) 앞 — 허가를 받아야 계류를 예약할 수 있다(6.1).
      order: 42,
      deadline: undefined,
      inputs: [
        { key: 'import_permit_application_date', label: '신청일', type: 'date' },
        { key: 'permit_no', label: '허가 번호', type: 'text' },
      ],
      validationIds: ['au.import-permit-not-after-departure'],
      links: [{ url: 'https://bicon.agriculture.gov.au/', label: '수입 허가 신청 (BICON)' }],
    },
    // 도착 = 멜버른 공항에서 검역관이 인수 → Mickleham 계류시설. 계류 일수는 마이크로칩 인증 여부로 갈린다.
    importQuarantine: {
      fieldKey: 'au_import_quarantine_date',
      description:
        '호주 도착 후 검역관이 멜버른 공항에서 반려동물을 인수해 Mickleham 계류시설로 옮겨요.\n\n마이크로칩 인증을 받았으면 최소 10일, 받지 않았으면 최소 30일 계류해요.\n도착 24시간 이내에 무사히 도착했다는 안내를 이메일로 받아요.\n서류·검사·기생충에 문제가 있으면 계류가 길어질 수 있어요.\n계류 비용을 모두 결제해야 반려동물이 나올 수 있어요.',
      helpText: '호주 도착 후 계류를 시작한 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '호주 수입 검역 서류',
      validationIds: ['au.import-quarantine-date-valid'],
    },
    extra: {
      // 입국 항체 배선 override — 팩토리 기본(order 55 · 귀국용 룰)을 호주 입국 항체로 교체.
      //   호주는 광견병 비발생국이라 귀국 항체는 면제된다(isRabiesFreeOrigin) → 귀국용 룰 불필요.
      'rabies-titer': {
        description:
          '호주 검역당국이 인정하는 검사기관에서 광견병 항체 검사(RNATT)를 받으세요.\n\n마이크로칩 인증을 받은 뒤, 다른 방문에서 채혈해야 해요.\n채혈 전에 마이크로칩을 확인해요.\n0.5 IU/mL 이상이면 합격이에요.\n검체가 검사기관에 도착한 날부터 180일이 지나야 출국할 수 있어요.\n검사 결과는 채혈일부터 12개월간 유효하고, 출국일까지 유효해야 해요.\n처음 접종한 경우에는 접종 3~4주 후에 채혈하는 것이 좋아요.',
        validationIds: [
          'au.titer-after-rabies',
          'au.titer-min-180days-after-sample-received',
          'au.titer-within-12months-of-export',
        ],
      },
      // 독감(CIV) — **한국·미국 출발 개는 필수**(7.2 "For USA and South Korea only").
      //   ⛔ '2회 정확히 14일 간격'은 DAFF 요건이 아니다(구 au.ts 룰의 과잉 해석). 규정은
      //     "제조사 지침대로 기초 접종 완료 + 마지막 접종은 출국 14일 전 이상"뿐이다.
      'civ-vaccine': {
        order: 34,
        description:
          '개 인플루엔자(CIV) 백신을 접종하세요.\n\n처음 접종하면 2주 간격으로 2회 접종해요.\n출국 14일 전까지 접종해야 해요.\n접종 유효기간은 1년이에요.',
        validationIds: ['au.civ-14days-before-departure', 'au.civ-within-12months'],
      },
      // 켄넬코프 — **DAFF 입국 요건이 아니다**(권장 백신). Mickleham 계류시설 예약에 접종
      //   증명을 요구해서 넣는다(2026-07-27 사용자 확정). 그래서 카드도 계류시설 예약(44)
      //   앞에 둔다. 요건이 아니므로 날짜 판정 룰은 두지 않는다.
      'kennel-cough-vaccine': {
        order: 36,
        description:
          '켄넬코프(Bordetella) 백신을 접종하세요.\n\n호주 입국 요건은 아니지만, 계류시설 예약을 위해 필요해요.',
      },
      // 전염병 검사 — 리슈만편모충(전 개체) + 브루셀라(중성화 안 한 개체) + 렙토 MAT(백신 미접종 시).
      //   세 검사 모두 출국 45일 이내 채혈이라 한 카드에 묶는다(admin 도 같은 필드를 공유).
      'infectious-disease-test': {
        description:
          '전염병 검사를 받아 음성을 확인하세요.\n\n출국 45일 이내에 채혈해요.\n리슈만편모충(Leishmania infantum) 검사는 모든 강아지가 받아요. 정량 IFAT 또는 정량 ELISA만 인정돼요.\n중성화하지 않았다면 브루셀라(Brucella canis) 검사도 받아요. RSAT·TAT(SAT)·IFAT만 인정돼요.\n렙토스피라 Canicola 백신을 접종하지 않았다면 MAT 검사를 받아요.\n간이 키트(SNAP·신속검사) 결과는 인정되지 않아요.',
        validationIds: ['au.infectious-disease-test-within-45days'],
      },
      // 외부구충 — 개 30일(7.6) / 고양이 21일(고양이 가이드 7.3). 시작 시점만 다르고 나머지는
      //   같아서 descriptionBySpecies 로 갈랐다. DAFF 예제(개 1/1 처치 → 최소 1/31 출국,
      //   고양이 1/1 → 1/22)대로 **N일 전 당일 시작**까지 허용된다.
      'external-parasite': {
        description:
          '외부 기생충 치료를 하세요.\n\n진드기와 벼룩을 접촉 살충하는 제품이어야 해요.\n강아지는 출국 30일 전, 고양이는 21일 전에 시작해서 출국일까지 약효가 끊기지 않도록 제조사 지침대로 반복해요.\n치료를 시작한 뒤에는 병원에 갈 때마다 기생충 검사를 받아요.\n진드기나 벼룩이 발견되면 제거하고 처치 기간을 다시 시작해야 할 수 있어요.',
        descriptionBySpecies: {
          dog: '외부 기생충 치료를 하세요.\n\n진드기와 벼룩을 접촉 살충하는 제품이어야 해요.\n출국 30일 전에 시작해서, 출국일까지 약효가 끊기지 않도록 제조사 지침대로 반복해요.\n치료를 시작한 뒤에는 병원에 갈 때마다 기생충 검사를 받아요.\n진드기나 벼룩이 발견되면 제거하고 30일을 다시 시작해야 할 수 있어요.',
          cat: '외부 기생충 치료를 하세요.\n\n진드기와 벼룩을 접촉 살충하는 제품이어야 해요.\n출국 21일 전에 시작해서, 출국일까지 약효가 끊기지 않도록 제조사 지침대로 반복해요.\n치료를 시작한 뒤에는 병원에 갈 때마다 기생충 검사를 받아요.\n진드기나 벼룩이 발견되면 제거하고 21일을 다시 시작해야 할 수 있어요.',
        },
        validationIds: ['au.external-parasite-protocol-dog', 'au.external-parasite-protocol-cat'],
      },
      // 내부구충 — 45일 이내 2회 · 14일 이상 간격 · 2차는 출국 5일 이내(7.7).
      //   "It's acceptable to do the final vet check and second internal parasite treatment at
      //   the same vet visit" — 임상검사와 같은 날 가능하다는 안내를 그대로 넣는다.
      'internal-parasite': {
        description:
          '내부 기생충 치료를 하세요.\n\n선충과 조충을 모두 없애는 약이어야 해요.\n출국 45일 이내에 2회 치료해요.\n두 번의 치료는 14일 이상 벌어져야 해요.\n2차 치료는 출국 5일 이내에 해요. 출국 전 임상검사와 같은 날에 해도 돼요.',
        validationIds: ['au.internal-parasite-protocol'],
      },
      // 임상검사 — 호주 창은 5일(프로파일 vetVisitWindowDays: 6 = '5일 전 당일까지 허용').
      //   base 문구(10일)가 그대로 노출되면 차단과 어긋난다(싱가포르 7일과 같은 정정).
      'vet-visit': {
        description:
          '출국일 기준 5일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)와 호주 건강증명서(Veterinary Health Certificate)를 발급받아요.\n\n마이크로칩 확인, 전염병 증상 확인, 외부 기생충 검사를 함께 받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
        deadline: { anchor: 'departure', daysBefore: 5, window: true },
      },
      // 한국 수출 검역도 같은 5일 창(validateKrExportDate 가 getVetVisitWindowDays 공유).
      //   DAFF 는 배서를 **최종검진과 2차 내부구충 이후**에 받으라고 못박는다(8.3) — 순서
      //   제약은 validateKrExportDate(검역일 ≥ 임상검사일)가 이미 담당한다.
      'certificate-issue': {
        description:
          '출국일 기준 5일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.\n임상검사와 2차 내부 기생충 치료를 마친 뒤에 방문해야 해요.',
        deadline: { anchor: 'departure', daysBefore: 5, window: true },
      },
    },
  }),
  // ── 뉴질랜드 (MPI, category 3 — 강아지) ────────────────────────────────────
  // 출처: Import Health Standard Cats and Dogs 2026(CATSDOGS.GEN) 전문 + category 3 개 지원문서
  //   ·체크리스트(2026-07-27 확인). 수치 근거는 procedure-checks/nz.ts 헤더.
  // sea-permit 골격에 뉴질랜드 고유 절차를 얹는다:
  //   마이크로칩 인증(nz-identity-check, 25) · 계류시설 예약(nz-quarantine-reservation, 42) ·
  //   독감(CIV) · 전염병 검사 · 심장사상충 · 내외부 구충.
  // 호주와 형제지만 **베끼면 틀리는 자리**가 넷이다(각 카드 주석에 이유를 적었다):
  //   ① 계류는 무조건 최소 10일 — '10일/30일' 문장을 가져오지 말 것
  //   ② 계류 예약이 수입 허가 **신청 서류**라 순서가 예약(42) → 허가(44)
  //   ③ 항체 채혈 창이 출국 3~12개월(호주는 검체 도착일 180일~12개월)
  //   ④ 마이크로칩 인증과 채혈을 **같은 날 해도 된다**(호주는 금지)
  new_zealand: seaPermitOverrides({
    key: 'new_zealand',
    label: '뉴질랜드',
    // IHS 2.1.3(2) — 12주 + 불활화·재조합 백신 + 출국까지 연속 유효 + **1차는 출국 6개월 전**.
    //   마지막 줄이 뉴질랜드 고유다(호주엔 없다). 결과적으로 개는 출국 시 생후 9개월 이상이 된다.
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n불활화 백신이나 재조합 백신이어야 해요.\n처음 접종했거나 유효기간이 끊긴 뒤 다시 접종했다면, 출국 6개월 전까지 접종해야 해요.\n출국일까지 면역 유효기간이 끊기지 않아야 해요.',
    rabiesValidationIds: [
      'nz.rabies-prime-after-84days',
      'nz.microchip-before-rabies',
      'nz.rabies-booster-within-prime-validity',
      'nz.rabies-primary-min-6months-before',
      'nz.rabies-valid-until-departure',
    ],
    // ⚠️ titerDescription 을 팩토리에 넘기지 않는다 — 팩토리판은 order 55 · **귀국용** 룰인데
    //   뉴질랜드 항체는 **입국 요건**이라 아래 extra['rabies-titer'] 가 통째로 교체한다(호주와 동일).
    //   뉴질랜드는 광견병 비발생국이라 귀국 항체도 면제된다(isRabiesFreeOrigin).
    // 종합백신 — **MPI 입국 요건이 아니다.** 지원문서 "Routine quarantine vaccinations: Check
    //   which of the following vaccinations are required by the quarantine facility your pet will
    //   be going to." 즉 계류시설 요구사항이다. 켄넬코프와 같은 취급(호주는 렙토 Canicola 가
    //   입국 요건이라 문구가 완전히 다르다 — 가져오지 말 것).
    generalVaccine: {
      // 백신 카드 4장을 광견병(30) 뒤에 연달아 — 종합 32 · 독감 34 · 켄넬코프 36(호주와 같은 배치).
      order: 32,
      description:
        '종합백신을 접종하세요.\n\n뉴질랜드 입국 요건은 아니지만, 계류시설에서 요구해요.\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해요.\n어떤 백신이 필요한지는 예약한 계류시설에 확인하세요.',
      // 날짜 판정 룰을 두지 않는다 — 입국 요건이 아니라 시설 요구사항이라 규정상 기한이 없다.
      validationIds: [],
    },
    // 항공권 — 화물칸 운송이지만 호주처럼 '정식 항공 화물 전용'은 아니다(지원문서는 crate in the
    //   cargo hold 라고만 한다). 그래서 카드 이름을 '운송 예약'으로 바꾸지 않는다.
    //   도착 공항은 **오클랜드·크라이스트처치 두 곳뿐**이다.
    flight: {
      description:
        '뉴질랜드 입국 일정에 맞춰 항공권을 구매하세요.\n\n오클랜드나 크라이스트처치 공항에만 도착할 수 있어요.\n온도가 조절되는 화물칸에 IATA 규격 이동장으로 실려요.\n항공사에 따라 운송업체를 통해서만 예약할 수 있으니 미리 확인하세요.\n항체 검사 채혈일로부터 3개월이 지난 후에 출국할 수 있고, 채혈일로부터 12개월 안에 출국해야 해요.',
      // 계류시설 예약(42) · 수입 허가(44) 다음 — 허가가 나와야 일정을 확정할 수 있다.
      order: 46,
      validationIds: [
        'nz.titer-3to12months-before-departure',
        // 생후 9개월 하한도 여기 — 접종일·생일은 이미 지나간 사실이라 바꿀 수 있는 건 출국일뿐이다.
        'nz.dog-min-9months-on-departure',
      ],
    },
    // 수입 허가 — MPI 온라인. 계류 예약 확인서·RCF·항체 결과지·접종 기록 4종이 신청 서류다
    //   (IHS 1.13.2). 마이크로칩 인증이 MPI 시스템에 등록돼 있어야 허가가 나온다.
    //   확정 '출국 N일 전' 마감은 규정에 없고 "at least 8 weeks before it is required" +
    //   "30 working days for processing" 라는 사실만 있다 → base 마감 배지는 내린다(호주와 동일).
    importPermit: {
      description:
        '뉴질랜드 검역당국(MPI) 온라인 시스템에서 수입 허가를 신청하세요.\n\n계류시설 예약 확인서, 광견병 증명서(RCF), 항체 검사 결과지, 광견병 접종 기록을 함께 제출해요.\n검역관이 마이크로칩 인증을 MPI에 등록해야 허가가 나와요.\n서류가 모두 접수된 뒤 심사에 30영업일이 걸려요.\n허가가 필요한 날보다 최소 8주 전에 신청하세요.',
      doneSummary: '뉴질랜드 수입 허가를 받았어요.',
      cardLine: '뉴질랜드 수입 허가를 신청하세요.',
      attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
      attachmentLabel: '뉴질랜드 수입 허가증',
      order: 44,
      deadline: undefined,
      inputs: [
        { key: 'import_permit_application_date', label: '신청일', type: 'date' },
        { key: 'permit_no', label: '허가 번호', type: 'text' },
      ],
      validationIds: ['nz.import-permit-not-after-departure'],
      links: [
        { url: 'https://animalplantimportpermit.mpi.govt.nz/', label: '수입 허가 신청 (MPI)' },
      ],
    },
    // 도착 = 오클랜드·크라이스트처치 공항 → MPI 승인 계류시설로 직행, 최소 10일.
    //   ⛔ 호주의 '마이크로칩 인증을 받았으면 10일, 아니면 30일' 문장을 복사하지 말 것 —
    //     뉴질랜드는 인증이 필수라 분기가 없다.
    importQuarantine: {
      fieldKey: 'nz_import_quarantine_date',
      description:
        '뉴질랜드 도착 후 MPI 승인 계류시설에서 최소 10일 계류해요.\n\n공항에서 계류시설까지 바로 옮겨져요. 이동은 시설이 준비해요.\n도착 후 72시간 이내에 MPI 검역관의 검진을 받고, 계류가 끝날 때 한 번 더 받아요.\n서류·검사·기생충에 문제가 있으면 계류가 길어질 수 있어요.\n뉴질랜드에 도착한 뒤에는 거주지 지방의회에 반려견을 등록해야 해요.',
      helpText: '뉴질랜드 도착 후 계류를 시작한 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '뉴질랜드 수입 검역 서류',
      validationIds: ['nz.import-quarantine-date-valid'],
    },
    extra: {
      // 입국 항체 배선 override — 팩토리 기본(order 55 · 귀국용 룰)을 뉴질랜드 입국 항체로 교체.
      //   ⚠️ 호주와 다른 두 가지: (a) 채혈 창이 **출국 3~12개월**(검체 도착일이 아니라 채혈일 기준),
      //     (b) 마이크로칩 인증과 **같은 날 채혈 가능**(IHS 1.11 guidance 명시).
      'rabies-titer': {
        order: 40,
        description:
          '뉴질랜드 검역당국(MPI)이 인정하는 검사기관에서 광견병 항체 검사(RNATT)를 받으세요.\n\n마이크로칩 인증을 받은 뒤에 채혈해요. 인증과 같은 날에 채혈해도 돼요.\n채혈 전에 마이크로칩을 확인해요.\n0.5 IU/mL 이상이면 합격이에요.\n출국 3개월 전부터 12개월 전 사이에 채혈해야 해요.\n처음 접종한 경우에는 접종 3~4주 후에 채혈하는 것이 좋아요.',
        validationIds: ['nz.titer-after-rabies', 'nz.titer-3to12months-before-departure'],
      },
      // 독감(CIV) — IHS 2.9(2). 한국은 MPI-STD-SAA 의 CIV 위험국 목록에 있다(지원문서
      //   "Dogs from Canada, Korea (Republic) and USA only"). **백신 또는 PCR 검사** 둘 중 하나다.
      'civ-vaccine': {
        order: 34,
        description:
          '개 인플루엔자(CIV) 백신을 접종하세요.\n\n한국에서 출발하는 강아지는 접종하거나 검사를 받아야 해요.\nCIV H3N8·H3N2에 효과가 있는 백신이어야 해요.\n출국 14일 전까지, 12개월 이내에 접종해야 해요.\n계류가 끝날 때까지 면역 유효기간이 남아 있어야 해요.\n\n접종하지 않았다면 출국 10일 이내에 PCR 검사를 받아 음성을 확인해요.',
        validationIds: ['nz.civ-14days-before-departure', 'nz.civ-within-12months'],
      },
      // 켄넬코프 — 종합백신과 같은 이유(계류시설 요구사항). 호주와 같은 문형.
      'kennel-cough-vaccine': {
        order: 36,
        description:
          '켄넬코프(Bordetella) 백신을 접종하세요.\n\n뉴질랜드 입국 요건은 아니지만, 계류시설에서 요구해요.',
      },
      // 전염병 검사 — 바베시아 깁소니(2.7) + 리슈만편모충(2.12) + 렙토 Canicola MAT(2.13) +
      //   브루셀라(2.8, 중성화 안 한 개체). **네 검사 모두 출국 30일 이내 채혈**이라 한 카드에 묶는다.
      //   바베시아 채혈만 추가 제약이 있다 — 1차 외부구충 14일 후 이후여야 한다(2.7(1)).
      'infectious-disease-test': {
        description:
          '전염병 검사를 받아 음성을 확인하세요.\n\n출국 30일 이내에 채혈해요.\n바베시아 깁소니(Babesia gibsoni)·리슈만편모충(Leishmania infantum)·렙토스피라 Canicola(MAT) 검사는 모든 강아지가 받아요.\n중성화하지 않았다면 브루셀라(Brucella canis) 검사도 받아요.\n바베시아 검사 채혈은 1차 외부 기생충 치료 14일 후부터 할 수 있어요.\n승인된 검사기관에서 받아야 하고, 동물병원 내부 간이 검사는 인정되지 않아요.',
        validationIds: [
          'nz.infectious-disease-test-within-30days',
          'nz.infectious-disease-test-after-external-parasite',
        ],
      },
      // 외부구충 — IHS 2.2(2). 개는 **2회**이고 기준이 서로 다르다:
      //   1차 = 바베시아 채혈 14일 전까지 / 2차(마지막) = 출국 16일 이내 / 1차부터 출국까지 연속 보호.
      //   ⛔ 호주의 '출국 30일 전에 시작' 문장을 가져오지 말 것 — 뉴질랜드 하한은 바베시아 채혈 기준이다.
      'external-parasite': {
        description:
          '외부 기생충 치료를 하세요.\n\n진드기와 벼룩을 없애는 제품으로 두 번 치료해요.\n1차 치료는 바베시아 검사 채혈 14일 전까지 해요.\n2차 치료는 출국 16일 이내에 해요.\n1차 치료부터 출국일까지 약효가 끊기지 않도록 제조사 지침대로 반복해요.\n치료할 때마다 진드기·벼룩이 없는지 확인받아요.',
        // 고양이는 회수·기준이 다르다 — IHS 2.2(1): **한 번**, 출국 16일 이내, 그때부터
        //   출국일까지 연속 보호. 바베시아 검사가 개 전용이라 '채혈 14일 전' 하한이 없다.
        //   개 문구를 그대로 보여주면 없는 절차를 요구하게 된다.
        descriptionBySpecies: {
          dog: '외부 기생충 치료를 하세요.\n\n진드기와 벼룩을 없애는 제품으로 두 번 치료해요.\n1차 치료는 바베시아 검사 채혈 14일 전까지 해요.\n2차 치료는 출국 16일 이내에 해요.\n1차 치료부터 출국일까지 약효가 끊기지 않도록 제조사 지침대로 반복해요.\n치료할 때마다 진드기·벼룩이 없는지 확인받아요.',
          cat: '외부 기생충 치료를 하세요.\n\n진드기와 벼룩을 없애는 제품으로 출국 16일 이내에 치료해요.\n치료한 날부터 출국일까지 약효가 끊기지 않도록 제조사 지침대로 반복해요.\n치료할 때와 출국 2일 전 검진에서 진드기·벼룩이 없는지 확인받아요.',
        },
        validationIds: ['nz.external-parasite-protocol'],
      },
      // 내부구충 — IHS 2.3(1): 1차 출국 30일 이내 + 14일 이상 간격 + 2차 출국 5일 이내.
      //   폐충(Angiostrongylus vasorum, 2.4)도 출국 5일 이내라 2차와 같은 방문에서 끝난다.
      'internal-parasite': {
        description:
          '내부 기생충 치료를 하세요.\n\n선충과 조충(에키노코쿠스 포함)을 모두 없애는 약이어야 해요.\n1차 치료는 출국 30일 이내에 해요.\n2차 치료는 출국 5일 이내에 하고, 1차와 14일 이상 벌어져야 해요.\n2차 치료 때 폐충(Angiostrongylus vasorum) 약도 함께 투여해요.',
        validationIds: ['nz.internal-parasite-protocol'],
      },
      // 심장사상충 — IHS 2.11. 검사(생후 7개월 이상, 출국 30일 이내)와 예방 투약(출국 5일 이내)이
      //   한 카드에 들어간다. 카드 입력칸은 날짜 배열 하나(heartworm_dates)라 두 사실을 같이 적는다.
      'heartworm-test': {
        description:
          '심장사상충 검사와 예방 투약을 하세요.\n\n출국일 기준 생후 7개월 이상이면 출국 30일 이내에 채혈해서 검사를 받아요.\n모든 강아지는 출국 5일 이내에 예방약을 투여해요. 지속형 예방 주사를 맞고 있다면 유효기간 안에 있으면 돼요.\n승인된 검사기관에서 받아야 하고, 동물병원 내부 간이 검사는 인정되지 않아요.',
        validationIds: ['nz.heartworm-within-30days'],
      },
      // 임상검사 — IHS 1.12: 출국 **2일 이내**(프로파일 vetVisitWindowDays: 3 과 짝).
      //   base 문구(10일)가 그대로 노출되면 차단과 어긋난다(호주 5일과 같은 정정).
      'vet-visit': {
        description:
          '출국일 기준 2일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)와 뉴질랜드 건강증명서(Model Veterinary Certificate)를 발급받아요.\n\n마이크로칩 확인, 전염병 증상 확인, 외부 기생충 검사를 함께 받아요. 중성화하지 않은 강아지는 생식기 검사도 받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
        deadline: { anchor: 'departure', daysBefore: 2, window: true },
      },
      // 한국 수출 검역도 같은 2일 창(validateKrExportDate 가 getVetVisitWindowDays 공유).
      //   순서 제약(검역일 ≥ 임상검사일)은 validateKrExportDate 가 이미 담당한다.
      'certificate-issue': {
        description:
          '출국일 기준 2일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.\n임상검사와 2차 내부 기생충 치료를 마친 뒤에 방문해야 해요.',
        deadline: { anchor: 'departure', daysBefore: 2, window: true },
      },
    },
  }),
  // 일본을 뼈대로 — 'departure' 공용 카드를 그 나라 '[국가] 수입 검역' 도착 카드로 교체.
  // 목적지마다 따로 작성(검역일 필드도 나라별: {국가}_import_quarantine_date). 제목·설명은
  // 그 나라 가이드 기준, 일본과 같은 부분은 같은 문구. 완료신호는 그 나라 검역일 필드를 실어 보낸다.
  //
  // 태국 출처: DLD(축산국) AQS-Suvarnabhumi 공식 안내 + 태국 외교부 PDF(Rev. 30 Jan 2025)
  // + 주미 태국대사관 — 상세 수치는 procedure-checks/th.ts 헤더 주석 참고.
  thailand: seaPermitOverrides({
    key: 'thailand',
    label: '태국',
    // 광견병 백신 — 21일 대기·유효기간(입국일 기준)은 보호자가 백신 step 에서 조치 못 함 —
    // 항공권 구매 step 에 매핑. 여기는 접종일 자체의 요건만.
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
    rabiesValidationIds: [
      'th.rabies-prime-after-12weeks',
      'th.microchip-before-rabies',
      // 저장 거부(findRabiesChainBreak)의 짝. 1회 접종국이면 앱이 이미 저장을 막는데,
      // 짝 룰이 없어 펫무브워크에선 끊긴 chain 이 안 보였다(2026-07-21 lint 로 발견).
      'th.rabies-booster-within-prime-validity',
    ],
    // 귀국용 항체 — 태국 입국 요건이 아니라는 설명이 아예 빠져 있었다. 고객이 이 검사를 왜
    // 받는지 알 수 없는 상태였다. 베트남·필리핀과 같은 문형으로 통일(사용자 지정 2026-07-20).
    titerDescription:
      '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n태국 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    // 종합백신 — 태국은 강아지 DHPPL(렙토스피라 포함) / 고양이 범백혈구감소증(FPV).
    // 광견병과 접종 종류·연령만 다르고 나머지 조건(칩 이후·21일 전·수입허가 2주 전·유효기간)은
    // 동일 — 광견병 카드 문구를 그대로 맞춤(종합백신은 최소 접종 연령 요건이 없어 그 줄만 생략).
    generalVaccine: {
      description:
        '강아지는 DHPPL(디스템퍼·전염성간염·파보·파라인플루엔자·렙토스피라), 고양이는 범백혈구감소증(FPV)이 포함된 종합백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
      descriptionBySpecies: {
        // ✅ DLD 원문(2025-01-30 개정판) 그대로 — "Dogs: Rabies, Canine Distemper, Canine
        //   Hepatitis, Canine Parvovirus, and Leptospirosis / Cats: Rabies, Feline Panleukopenia".
        //   ⛔ **파라인플루엔자를 다시 넣지 말 것**(2026-07-22 삭제). 원문에 없다 —
        //     DHPPL 제품명의 'P'에서 온 표기였다. 고양이는 범백 하나뿐이다(허피스·칼리시 X).
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n입국 3주 전까지 접종해야 해요.\n수입 허가 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.\n\n수입 허가 신청에 접종 증명서와 백신 수첩이 필요해요. 백신 수첩에는 모든 페이지에 마이크로칩 번호와 수의사의 서명 혹은 스탬프가 있어야 해요.',
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
        // R7 60일 유효 — 너무 이른 신청(출국 전 만료). 입력 차단과 같은 함수(2026-07-25).
        'th.import-permit-within-60days',
      ],
    },
    importQuarantine: {
      fieldKey: 'th_import_quarantine_date',
      description:
        '태국 도착 후 공항 동물검역소(AQS)에서 검역을 받으세요.\n검사를 통과하면 수입 허가서(R.7)를 받아요.',
      helpText: '태국 동물검역소(AQS)에서 수입 검역을 받은 날짜',
      attachmentHint: '수입 허가서(R.7) 사본을 사진·PDF로 보관하세요.',
      // 특수명이 있으면 그 이름으로 저장한다. label 을 안 주면 base 의
      // 'Import Quarantine Certificate' 가 쓰여, 실제로 받는 건 허가서인데 검역증 이름으로
      // 저장되고 있었다(2026-07-20 수정).
      attachmentLabel: '수입 허가서(R.7)',
      validationIds: ['th.import-quarantine-date-valid'],
    },
  }),

  // ── 말레이시아 — ⚠️ 태국 한 벌 복제(2026-07-22). 문구·수치는 아직 태국 것 그대로다
  //   (21일 대기·수입허가 7영업일·R.6/R.7 서식명 등). 나라별 규정 확정 후 수정 예정.
  //   태국 전용 링크 2개(R.1/1 신청서 PDF·태국 AQS 연락처 페이지)만 뺐다 — 타국 자료 오안내 방지.
  malaysia: seaPermitOverrides({
    key: 'malaysia',
    label: '말레이시아',
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n출국 30일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.'
    ,
    rabiesValidationIds: [
      'my.rabies-prime-after-3months',
      'my.microchip-before-rabies',
      'my.rabies-booster-within-prime-validity',
      'my.rabies-min-30days-before-departure',
    ],
    // 가이드: "말레이시아에는 광견병항체검사 기관이 없기 때문에, 당장 한국으로 돌아올 예정이
    // 없는 경우라도 한국에서 미리 해두시는 것을 권장합니다."
    titerDescription:
      '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n말레이시아 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n말레이시아에는 검사 기관이 없으니 출국 전에 미리 받으세요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    // 가이드: 강아지 = 광견병·디스템퍼·전염성간염·렙토스피라·파보·파라인플루엔자 /
    //         고양이 = 광견병·범백혈구감소증
    generalVaccine: {
      description:
        '강아지는 DHPPL, 고양이는 범백혈구감소증(FPV)이 포함된 종합백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        // 질병명 순서를 D·H·P·Pi·L 로 맞춤(2026-07-23) — 태국·아랍에미리트와 통일.
        // ⚠️ **파라인플루엔자는 유지**(태국·필리핀과 달리 말레이시아는 실제 요건). 펫무브
        //   말레이시아 가이드: '개 디스템퍼, 전염성 간염, 렙토스피라증, 개 파보바이러스,
        //   개 파라인플루엔자'. 항목은 그대로, 순서만 라벨 순으로 정렬했다.
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      },
      validationIds: ['my.microchip-before-general-vaccine'],
    },
    flight: {
      description:
        '말레이시아 입국 일정에 맞춰 항공권을 구매하세요.\n\n접종일로부터 30일이 지난 후에 입국할 수 있어요.\n계류장 예약을 먼저 해야 수입 허가를 신청할 수 있어요. 예약은 최소 14일 전에 하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      order: 90,
      validationIds: ['my.rabies-min-30days-before-departure'],
    },
    // ✅ 가이드 기준으로 전면 교체(2026-07-22) — 태국식(한국에서 이메일 신청·R.6·60일 유효)은
    //   말레이시아에 맞지 않는다. 가이드: "말레이시아 수입허가증은 필리핀, 태국 등과 달리
    //   한국에서 신청할 수 없으며, 말레이시아 현지 에이전시에 의뢰하여 진행해야 합니다.
    //   수입허가증은 계류장 공간 예약 후에 신청할 수 있습니다. 계류장 예약은 최소 14일 전에
    //   해야 하며 … MAQIS 담당자가 신청 정보를 검토해서 수입허가증을 발급합니다."
    importPermit: {
      // ✅ 2026-07-23 조사 반영(MAQIS·DVS 원문). 이 절차는 **반도·라부안 기준**이다 —
      //   사바(코타키나발루)·사라왁(쿠칭)은 별도 수의당국·독립 허가라 이 카드를 쓰면 안 된다.
      // 핵심 두 가지를 카드에 담았다:
      //   ① 신청이 SPEED(수입자 등록) → Dagang Net ePermit(허가 신청)의 **2단계**라 계정
      //      등록이 선행된다. 여권번호만 넣는 일반 여행자 포털이 아니다.
      //   ② **허가 승인 ≠ 검역소 예약** — 허가 후 MAQIS 동물검역소를 따로 예약해야 한다.
      //      검역소 자리가 없으면 허가가 있어도 예정일에 입국 못 한다.
      // ⚠️ 개인 직접 신청도 가능하지만 SPEED·Dagang Net 계정·현지 수하인이 필요해 단발성
      //   입국엔 현지 에이전트가 현실적(원문 안내). 고객 문구는 '현지 에이전트'로 표기
      //   (2026-07-24 '에이전트'로 전 목적지 통일 — NParks 영문 "agent" 기준).
      // ⛔ 사용자가 불러준 최종 원문(2026-07-23). 세 문단 그대로 — 문장 추가·병합 금지.
      //   함께 빠진 것(근거는 위 주석·아래 링크에 보존): 계류장 14일 전 예약, SPEED→ePermit
      //   2단계, '허가 ≠ 검역소 예약'. 되살리려면 사용자 확인부터.
      description:
        '말레이시아 현지 에이전트를 통해 수입 허가를 신청하세요.\n\n현지 등록 에이전트만 신청이 가능해서 한국에서는 신청할 수 없어요.\n\n말레이시아 검역기관(MAQIS)에 문의하면 등록 에이전트 리스트를 받을 수 있어요.\n\n계류장 예약을 함께 진행해요.',
      doneSummary: '말레이시아 수입 허가증을 받았어요.',
      cardLine: '말레이시아 수입 허가를 신청하세요.',
      attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
      attachmentLabel: '수입 허가증',
      // 버튼 완료 카드 — 홍콩과 같은 이유(2026-07-26 사용자 결정). 현지 등록 에이전트만 신청할
      //   수 있어(localApplyOnly) 보호자는 신청일을 모르고, 아는 것은 '허가가 나왔다'는 사실뿐.
      //   신청일 기반 검증(구 my.import-permit-not-after-departure)도 함께 삭제했다.
      // 마감 배지 제거 — base 의 '출국 30일 전'은 물려받은 값이고 근거가 없다. 같은 이유로
      //   마감 알림·발급 푸시도 이미 만들지 않았다(reminders.ts·milestone-pushes.ts 주석).
      buttonComplete: true,
      done: 'dated:import_permit_application_date',
      deadline: undefined,
      inputs: [
        {
          key: 'import_permit_application_date',
          label: '허가 취득일',
          type: 'date',
          helpText: '수입 허가증을 받은 날짜',
        },
      ],
      validationIds: [],
      // ① 신청·등록 절차(MAQIS) ② 반려동물 수입 안내·에이전트 문의(DVS). 둘 다 200 확인.
      links: [
        { url: 'https://www.maqis.gov.my/index.php/permohonan-permit/', label: '수입 허가 신청 절차 (MAQIS)' },
        { url: 'https://www.dvs.gov.my/index.php/pages/view/1941', label: '반려동물 수입 안내·문의처 (DVS)' },
      ],
    },
    // 가이드: "증명 서류 확인 후 문제가 없으면 반려동물은 계류시설로 이동합니다. 일반적인
    // 격리기간은 7일입니다." — 태국(격리 없음)과 갈리는 지점이라 도착 카드에 명시한다
    // (사용자 지정 2026-07-22: 격리 안내는 "해당국 수입검역 카드"에).
    importQuarantine: {
      fieldKey: 'my_import_quarantine_date',
      description:
        '말레이시아 도착 후 공항 검역소에서 검역을 받으세요.\n서류를 확인한 뒤 계류시설로 이동해요.\n일반적인 격리 기간은 7일이에요.',
      helpText: '말레이시아 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '말레이시아 수입 검역 서류',
      validationIds: ['my.import-quarantine-date-valid'],
    },
    extra: {
      // 임상검사·한국 수출 검역 — 말레이시아 창은 7일(프로파일 vetVisitWindowDays: 7).
      // base 문구(10일)가 차단(7일)과 어긋나던 것 정정(2026-07-25 — 싱가포르와 같은 부류).
      'vet-visit': {
        description:
          '출국일 기준 7일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
        deadline: { anchor: 'departure', daysBefore: 6, window: true },
      },
      'certificate-issue': {
        description:
          '출국일 기준 7일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.',
        deadline: { anchor: 'departure', daysBefore: 6, window: true },
      },
    },
  }),

  // ── 싱가포르 (NParks/AVS — Schedule III) ─────────────────────────────
  //   한국 = Schedule III(광견병 위험국). 입국 항체(RNATT) + 도착 후 AQC **30일 의무 격리** +
  //   도착 시 광견병 재접종. sea-permit 골격 + 인니식 입국 항체(need:entry). 채혈 후 대기
  //   (90일)는 프로파일 titer.entryWaitAfterTiter.days=90 이 validateEuEntryDate 하드 차단으로
  //   배선. 광견병 비발생국이라 귀국 항체 면제(항체=입국용). 귀국 수출검역=sg-export-quarantine.
  singapore: seaPermitOverrides({
    key: 'singapore',
    label: '싱가포르',
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
    rabiesValidationIds: [
      'sg.rabies-prime-after-12weeks',
      'sg.microchip-before-rabies',
      'sg.rabies-booster-within-prime-validity',
      'sg.rabies-valid-until-on-departure',
    ],
    // 항체(RNATT) = 싱가포르 **입국 요건**(귀국용 아님). 접종 28일 후 채혈, 채혈 후 3개월 대기.
    titerDescription:
      'WOAH 표준검사실 또는 Schedule I·II 국가의 승인 검사기관에서 광견병 항체 검사(RNATT)를 받으세요.\n\n국내에 검사기관이 없어서 일반적인 동물병원에서는 이 검사를 진행하지 않아요. 병원 방문 전 검사 가능 여부를 확인하세요.\n광견병 접종 28일 후에 채혈해야 해요.\n0.5 IU/mL 이상이면 합격이에요.\n검사 결과는 채혈일로부터 1년간 유효해요.',
    // ✅ NParks Schedule III 필수 코어만(2026-07-24 원문 확인): 개 = 디스템퍼·전염성간염(개
    //   아데노바이러스 1형)·파보바이러스(DHP), 고양이 = 칼리시·허피스1·범백혈구감소증. 말레이시아
    //   복제 잔재였던 개 '파라인플루엔자·렙토스피라'는 싱가포르 요건이 아니라 삭제.
    generalVaccine: {
      description:
        '종합백신을 접종하세요.\n\n강아지는 디스템퍼·전염성간염·파보바이러스, 고양이는 범백혈구감소증·허피스바이러스·칼리시바이러스 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n출국 14일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        dog: '종합백신을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n출국 14일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신을 접종하세요.\n\n범백혈구감소증·허피스바이러스·칼리시바이러스 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n출국 14일 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      },
      validationIds: [
        'sg.microchip-before-general-vaccine',
        'sg.comprehensive-vaccine-14days-before-departure',
        'sg.comprehensive-vaccine-valid-on-departure',
        // common.general-vaccine-validity-expired 는 seaPermitOverrides factory 가 자동으로 붙인다.
      ],
    },
    flight: {
      description:
        '계류장(AQC) 예약 날짜에 맞춰 항공권을 구매하세요.\n\n광견병 항체 검사 채혈일로부터 90일이 지난 후에 입국할 수 있어요.\n창이 공항 검역소(CAPQ) 운영시간에 맞춰 도착해야 합니다.',
      order: 90,
      validationIds: [
        'sg.departure-min-90days-after-titer',
        // 출국일 ↔ 계류장 예약일 정합(당일/하루 전) — 예약일을 나중에 바꿔 어긋나면 주의.
        'sg.departure-matches-quarantine-reservation',
      ],
      // 도착 시각을 CAPQ 운영시간(주말·공휴일 휴무)에 맞춰 항공권을 정해야 해서 이 카드에 링크.
      links: [
        {
          url: 'https://avs.nparks.gov.sg/about-us/our-centres/changi-animal-plant-quarantine-station/',
          label: '창이 검역소(CAPQ) 운영시간',
        },
      ],
    },
    // 수입 허가(Licence to Import Non-Food Animals) — 보호자가 GoBusiness 온라인 직접 신청.
    importPermit: {
      description:
        '도착일 기준 90일 이내에 GoBusiness 포털에서 개인용 수입 허가(Licence to Import)를 신청하세요.\n\n강아지 라이선스를 먼저 받아야 신청할 수 있어요.\n외국인은 GoBusiness 이용이 어려워 현지 에이전트를 이용하는 경우가 많아요.',
      doneSummary: '싱가포르 수입 허가를 받았어요.',
      cardLine: '싱가포르 수입 허가를 신청하세요.',
      attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
      attachmentLabel: '싱가포르 수입 허가증',
      // 마감 배지 제거(2026-07-26) — base 의 '출국 30일 전'을 물려받고 있었는데, GoBusiness
      //   수입 허가는 '도착 90일 이내 신청·발급 90일 유효'라 확정 마감일이 없다. 같은 근거로
      //   마감 알림은 진작 만들지 않았는데(reminders.ts 싱가포르 주석) 배지만 남아 없는 기한을
      //   말하고 있었다. 말레이시아·인도네시아·아랍에미리트와 같은 정리.
      // ⚠️ 카드 모델은 그대로(신청→발급 2단계) — 보호자가 직접 신청해 신청일을 알고, 90일
      //   유효·강아지 라이선스 선행 등 실제로 걸리는 검증 3종이 신청일을 기준으로 돈다.
      deadline: undefined,
      validationIds: [
        'sg.import-permit-not-after-departure',
        // 허가 90일 유효 — 너무 이른 신청(도착 전 만료) 주의. 입력 차단과 같은 함수.
        'sg.import-permit-within-90days',
        // 강아지 라이선스 선행 — 두 신청일이 모두 입력된 경우에만 순서 비교.
        'sg.dog-licence-before-import-permit',
      ],
      links: [{ url: 'https://www.gobusiness.gov.sg/', label: '수입 허가 신청 (GoBusiness)' }],
    },
    // ⭐ 도착 후 AQC 30일 의무 격리 + 도착 시 광견병 재접종 (NParks Schedule III).
    importQuarantine: {
      fieldKey: 'sg_import_quarantine_date',
      description:
        '싱가포르 도착 후 창이 공항 검역소(CAPQ)에서 도착 검사를 받아요.\n검사 후 검역소(AQC)로 이동해 최소 30일간 격리돼요.\n도착 후 광견병 예방접종을 다시 받아요.',
      helpText: '싱가포르 도착 후 수입 검역을 시작한 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '싱가포르 수입 검역 서류',
      validationIds: ['sg.import-quarantine-date-valid'],
    },
    extra: {
      // 입국 항체 배선 override — 팩토리 기본 RETURN_ONLY(귀국용)를 싱가포르 입국 항체 룰로 교체.
      //   싱가포르는 광견병 비발생국이라 귀국 항체 면제 → 귀국용 룰 불필요.
      'rabies-titer': {
        description:
          'WOAH 표준검사실 또는 Schedule I·II 국가의 승인 검사기관에서 광견병 항체 검사(RNATT)를 받으세요.\n\n국내에 검사기관이 없어서 일반적인 동물병원에서는 이 검사를 진행하지 않아요. 병원 방문 전 검사 가능 여부를 확인하세요.\n광견병 접종 28일 후에 채혈해야 해요.\n0.5 IU/mL 이상이면 합격이에요.\n검사 결과는 채혈일로부터 1년간 유효해요.',
        order: 55,
        validationIds: [
          'sg.titer-min-28days-after-vaccine',
          'sg.departure-within-12months-of-titer',
        ],
      },
      // 구충은 출국 2~7일 전(출국 직전)이라 임상검사(vet-visit, order 110) 바로 위로 옮긴다
      //   (기본 order 80/90 → 106/108). 싱가포르 전용 order override.
      // 문구는 펫무브앱 확립 형태(멕시코·브라질·필리핀 — 행동 한 줄 + 그 나라 기한 한 줄)로.
      //   base 문구('호주·뉴질랜드 등에서 요구돼요')는 펫무브워크용 일반 안내라 그대로 노출되면
      //   싱가포르 카드에 다른 나라 이야기가 샌다(2026-07-25 사용자 지적).
      'external-parasite': {
        description: '외부 기생충 치료를 하세요.\n출국일 기준 2~7일 전에 해야 해요.',
        order: 106,
        validationIds: ['sg.external-parasite-2to7days-before-departure'],
      },
      'internal-parasite': {
        description: '내부 기생충 치료를 하세요.\n출국일 기준 2~7일 전에 해야 해요.',
        order: 108,
        validationIds: ['sg.internal-parasite-2to7days-before-departure'],
      },
      // 임상검사 — 싱가포르 창은 7일(프로파일 vetVisitWindowDays: 7, Schedule III). base 문구
      //   (10일)가 그대로 노출돼 차단(7일)과 어긋났다(2026-07-25 사용자 발견). 일본(FormAC)·
      //   대만(Form 002)과 같은 자리·문형으로 Schedule III 서식 병기. deadline(권장 표시일)도
      //   base 9(10일 창)에서 6(7일 창)으로.
      'vet-visit': {
        description:
          '출국일 기준 7일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)와 싱가포르 건강증명서(Schedule III)를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
        deadline: { anchor: 'departure', daysBefore: 6, window: true },
      },
      // 한국 수출 검역도 같은 7일 창(차단 validateKrExportDate 가 getVetVisitWindowDays 공유)
      // — base 문구(10일)와 어긋나던 것 정정(2026-07-25, 임상검사와 동일 사유).
      'certificate-issue': {
        description:
          '출국일 기준 7일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.',
        deadline: { anchor: 'departure', daysBefore: 6, window: true },
      },
    },
  }),

  // ── 인도네시아 — 태국 골격 복제(2026-07-22) 후 규정 문구 교체 완료:
  //   광견병 불활화·생후 3개월, 항체 입국 요건, 자카르타 한정 입국, 수입허가 현지 신청,
  //   도착 격리 1~2주. 수출 검역 카드·서류 서식명은 KH-11/KH-14 로 정정(2026-07-23, catalog.ts·
  //   required-docs.ts). 태국식 R.6/R.7/R.9·21일 대기 잔재는 모두 제거됨.
  indonesia: seaPermitOverrides({
    key: 'indonesia',
    label: '인도네시아',
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n생후 3개월이 지난 후에 접종해야 해요.\n불활화 백신으로 접종해야 해요.\n광견병 예방접종 유효기간은 1년이에요.',
    rabiesValidationIds: [
      'id.rabies-prime-after-3months-old',
      'id.microchip-before-rabies',
      'id.rabies-booster-within-prime-validity',
    ],
    // ✅ 항체검사가 **입국 요건**(2026-07-22 조사 확정) — '한국 귀국용' 문형을 쓰지 않는다.
    //   입국 요건국(일본·중국·EU·대만) 관례대로 '입국에 필요해요' 문장을 빼고 검사 방법만
    //   안내한다(2026-07-23 사용자 결정 A) — 카드가 인도네시아 여정에 뜬다는 사실 자체가
    //   '필요하다'는 뜻이라 귀국용 나라처럼 이유를 밝히지 않는다. 접종~채혈 대기는 두지 않음
    //   (Barantin 원문에 일수 근거 없음).
    titerDescription:
      '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n0.5 IU/mL 이상이면 합격이에요.',
    // 종합백신 — 인도네시아 입국 요건이 아니라 카드를 두지 않는다(2026-07-23 사용자 결정).
    //   가이드가 '필수 아님·격리 대비 권장'으로만 다뤄, catalog 종합백신 명단에서도 뺐다.
    //   generalVaccine override 를 넘기지 않으면 seaPermitOverrides 가 카드 override 를 만들지 않는다.
    flight: {
      // 가이드: "본 가이드는 자카르타 입국을 전제로 작성되었습니다" + "발리 등은 공식적으로는
      // 반려동물 수입이 금지되어 있습니다." 조사도 같은 결론(발리·NTB·NTT·중부/동부자바·
      // 족자·마두라 반입 불가). 고객 일정에 결정적이라 항공권 카드에 명시한다.
      description:
        '인도네시아 입국 일정에 맞춰 항공권을 구매하세요.\n\n자카르타로 입국해야 해요.\n발리·롬복·플로레스와 중부·동부 자바는 반려동물 반입이 금지돼 있어요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      // ✅ 수입 허가(100) **뒤**로 옮김(2026-07-23 사용자 지정) — 인도네시아는 현지 에이전시가
      //   지정 입국지(자카르타)를 명시해 허가를 받은 뒤 그에 맞춰 항공권을 사는 흐름이라,
      //   '수입 허가 신청 → 항공권 구매' 순이 맞다. import-permit(100)·vet-visit(110) 사이 105.
      //   (태국·말레이시아·필리핀은 종전대로 항공권이 먼저 — 인도네시아만 바꾼다.)
      order: 105,
      validationIds: [],
    },
    // 인도네시아 반입은 실제로 ① 농업부 반입 추천서(Rekomendasi Pemasukan) → ② 검역청 도착 전
    //   검역 신청(PTK·사전 통보)의 2단계이고 **모두 인도네시아 수입자/현지 대행업체가 신청**한다
    //   (현지 계정·인니어 서류 필요 — 한국 보호자가 직접 못 함). 자세한 구조는 서류탭(id-import-
    //   permit-doc)에 두고, 카드 문구는 사용자 지정으로 2줄만 남긴다(2026-07-23).
    //   ⛔ 링크 없음(2026-07-23 사용자 지정) — PTK·검역청 홈은 보호자가 직접 쓰는 곳이 아니고
    //     (현지 신청자용 시스템·인니어 기관 포털), IPATA 대행업체 디렉터리도 사용자 지정으로 뺐다.
    //   ⚠️ 유효기간은 발급 서류의 berlaku sejak/sampai 로만 — 일률 90/60/30일 단정 금지(서류탭 참고).
    importPermit: {
      description:
        '인도네시아 수입 허가 신청을 하세요.\n\n한국에서는 신청할 수 없어요.\n수입자가 현지에서 직접, 또는 현지 에이전트를 통해 신청해야 해요.',
      doneSummary: '인도네시아 반입 추천서를 받았어요.',
      cardLine: '인도네시아 수입 허가를 신청하세요.',
      attachmentHint: '반입 추천서(Rekomendasi Pemasukan)를 사진·PDF로 보관하세요.',
      attachmentLabel: '반입 추천서',
      // 버튼 완료 카드 — 말레이시아·홍콩과 같은 이유(2026-07-26 사용자 결정). 수입자·현지
      //   에이전트만 신청할 수 있어(localApplyOnly) 보호자가 신청일을 모른다. 신청일 기반 검증
      //   (구 id.import-permit-not-after-departure)과 근거 없는 마감 배지(base 30일)도 함께 제거.
      buttonComplete: true,
      done: 'dated:import_permit_application_date',
      deadline: undefined,
      inputs: [
        {
          key: 'import_permit_application_date',
          label: '허가 취득일',
          type: 'date',
          helpText: '반입 추천서를 받은 날짜',
        },
      ],
      validationIds: [],
    },
    // 가이드: "일반적인 격리기간은 약 일주일이지만 최대 2주가 될 수 있습니다."
    importQuarantine: {
      fieldKey: 'id_import_quarantine_date',
      description:
        '인도네시아 도착 후 공항 검역소에서 검역을 받으세요.\n서류를 확인한 뒤 계류시설로 이동해요.\n격리 기간은 보통 일주일이고 최대 2주까지 걸릴 수 있어요.',
      helpText: '인도네시아 도착 후 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '인도네시아 수입 검역 서류',
      validationIds: ['id.import-quarantine-date-valid'],
    },
  }),

  // 필리핀 출처: BAI(동물산업국) MC No.49(2022)·BAI Pet Import 공식 안내 + petmove.co.kr
  // 필리핀 가이드 — 상세 수치는 procedure-checks/ph.ts 헤더 주석 참고. 태국과 같은 골격
  // (광견병 1회·종별 종합백신·수입허가 2단계·도착검역) + 필리핀 고유: 구충 7~91일,
  // 생후 120일 입국 자격, 부스터는 대기 기간 면제.
  philippines: seaPermitOverrides({
    key: 'philippines',
    label: '필리핀',
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
    rabiesValidationIds: [
      'ph.rabies-prime-after-12weeks',
      'ph.microchip-before-rabies',
      // 저장 거부(findRabiesChainBreak)의 짝. 1회 접종국이면 앱이 이미 저장을 막는데,
      // 짝 룰이 없어 펫무브워크에선 끊긴 chain 이 안 보였다(2026-07-21 lint 로 발견).
      'ph.rabies-booster-within-prime-validity',
    ],
    titerDescription:
      // 귀국용 항체 — '한국 입국에 사용 시 유효기간은 2년' 대신 베트남·태국과 같은 문형으로
      // 통일. 왜 받는지를 먼저 말하고 유효기간은 따로 둔다(사용자 지정 2026-07-20).
      '국제 공인 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n필리핀 입국에는 필요 없지만, 한국으로 돌아올 때 필요해요.\n0.5 IU/mL 이상이면 합격이에요.\n유효기간은 2년이에요.',
    generalVaccine: {
      description:
        '강아지는 DHPPL(디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라), 고양이는 FVRCP(범백혈구감소증·허피스·칼리시)가 포함된 종합백신을 접종하세요.\n\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        // ✅ **BAI 공식 페이지(bai.gov.ph/Stakeholders/PetImport) 기준** — 2026-07-22 확정:
        //   개 = canine distemper, infectious hepatitis, canine parvovirus,
        //        **canine parainfluenza**, leptospirosis
        //   고양이 = feline panleukopenia, feline viral rhino-tracheitis, feline calicivirus
        //
        // ⛔ **아데노바이러스 2형·고양이백혈병(FeLV)을 넣지 말 것. 파라인플루엔자를 빼지 말 것.**
        //   2026-07-22 그렇게 고쳤다가 되돌렸다. 원인은 **출처를 잘못 골랐기 때문**이다 —
        //   주독 필리핀대사관이 게시한 요건서 PDF(philippine-embassy.de)가 "adenovirus type 2"
        //   와 "feline leukemia"를 적고 파라인플루엔자를 빼는데, **BAI 본청 안내와 다르다**
        //   (옛 판이거나 옮겨 적으며 어긋난 것으로 보인다). 대사관·영사관 게시 자료는 1차
        //   출처가 아니다. 이 파일 헤더의 BAI 페이지·MC 49 를 먼저 볼 것.
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종해요.\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증·허피스바이러스·칼리시바이러스 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n수입 허가증(SPSIC) 신청 2주 전까지 접종해야 해요.\n입국 때 면역 유효기간이 남아있어야 해요.',
      },
      validationIds: ['ph.microchip-before-general-vaccine'],
    },
    // 항공권 — 생후 120일·21일 대기 룰만. 백신 '입국 전 만료'는 각 백신 카드 situational 담당
    // (태국과 동일 — ADVISORY_DEFERRED_CHECKS).
    flight: {
      description:
        // '지난 후 입국' → '지난 후에 입국' — 태국·베트남과 조사를 맞춘다(사용자 지정 2026-07-20).
        '필리핀 입국 일정에 맞춰 항공권을 구매하세요.\n\n4개월령 이상만 입국할 수 있어요.\n접종일로부터 3주가 지난 후에 입국할 수 있어요.\n수입 허가증(SPSIC) 신청이 필요해요. 충분한 시간을 확보하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
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
      // 제목은 전 목적지 공통('수입 허가 신청') — 신청 대상은 '허가'이고 결과물이 '허가증'
      // 이라는 구분(2026-07-23 통일). SPSIC 서류명은 카드줄·완료 문구·저장 이름에 남는다.
      title: '수입 허가 신청',
      description:
        '필리핀 수입 허가(SPSIC)를 신청하세요.\n\nIntercommerce 사이트에서 온라인으로 신청해요.\n접종일로부터 2주가 지난 후에 신청할 수 있어요.\n신청일 기준 4개월령 이상이어야 해요. 3마리까지 신청할 수 있어요.\n승인까지 수 일이 걸려요. 최소 1~2주 전까지 신청하세요.\n수입 허가증은 발급일로부터 60일간 유효해요.',
      doneSummary: '필리핀 수입 허가증(SPSIC)을 받았어요.',
      cardLine: '필리핀 수입 허가를 신청하세요.',
      deadline: undefined,
      links: [
        { url: 'https://www.intercommerce.com.ph/login.asp?home=HOME', label: '수입 허가 신청(Intercommerce)' },
      ],
      attachmentLabel: '수입 허가증(SPSIC)',
      validationIds: [
        'ph.import-permit-14days-after-vaccines',
        // SPSIC 60일 유효 — 너무 이른 신청(출국 전 만료). 입력 차단과 같은 함수(2026-07-25).
        'ph.import-permit-within-60days',
        // 출국일 이후 신청 불가 — 저장 거부(validateImportPermitNotAfterDeparture)의 짝 주의.
        //   within-60days 는 too-early 만 봐서 출국 후 신청을 놓쳤다(태국·말레이·인니·싱가포르는
        //   짝이 있는데 필리핀만 빠져 있었음, 2026-07-25 조사).
        'ph.import-permit-not-after-departure',
      ],
    },
    importQuarantine: {
      fieldKey: 'ph_import_quarantine_date',
      description:
        '필리핀 도착 후 공항 동물검역소에서 BAI 동물검역관(VQO)에게 검역을 받으세요.',
      helpText: 'BAI 동물검역관(VQO)에게 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      // 도착 검역 후 발급되는 서류가 확인되지 않았다 — 중국·대만과 같은 '{국가} 수입 검역
      // 서류'로 둔다. label 을 안 줘서 base 의 'Import Quarantine Certificate' 가 쓰였는데,
      // 있는지도 모르는 서류 이름으로 저장되고 있었다(2026-07-20 수정).
      // 서류가 확인되면 정식 이름으로 올릴 것.
      attachmentLabel: '필리핀 수입 검역 서류',
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
        // 카드가 '7일~3개월'이라 말하면서 정작 그 창을 아무도 검증하지 않던 상태를 메움
        // (2026-07-22). 입력 차단(validatePhInternalParasiteWindow)과 같은 함수를 본다.
        validationIds: ['ph.internal-parasite-7days-to-3months-before-permit'],
      },
    },
  }),

  // ── 홍콩 (AFCD — Group II) ────────────────────────────────────────────
  //   sea-permit 골격(광견병 1회 + 종합백신 + 수입허가 2단계 + 도착검역). 필리핀과 다른 점:
  //   ① **항체검사가 왕복 어느 쪽에도 없다** — titerDescription 을 넘기지 않아 카드 자체가 없다
  //      (입국 = Group II 면제 / 귀국 = 홍콩이 광견병 비발생국이라 면제).
  //   ② **반려동물이 보호자와 같은 비행기로 못 간다** — 화물(manifested cargo) 전용이라
  //      항공권 카드에 영국과 같은 운송 안내를 넣는다.
  //   ③ 수입 허가(Special Permit)는 **해외 신청 불가** — 현지 대리인이 신청비 납부와 함께 접수.
  //   ④ 도착 24시간 전 사전 통지가 별도 카드(hk-advance-notice, catalog).
  //   1차 출처 = AFCD DC-02v05 Permit Terms(Group II, Jun-2025) + 펫무브 홍콩 가이드.
  hongkong: seaPermitOverrides({
    key: 'hongkong',
    label: '홍콩',
    rabiesDescription:
      '광견병 백신을 접종하세요.\n\n생후 90일이 지난 후에 접종해야 해요.\n출국 30일 전까지 접종해야 해요.\n접종 후 1년 이내에 입국해야 합니다.',
    rabiesValidationIds: [
      'hk.rabies-prime-after-90days',
      'hk.rabies-booster-within-prime-validity',
      'hk.rabies-min-30days-before-departure',
    ],
    // titerDescription 없음 — 위 ① 참고. 넘기면 없는 절차 카드가 생긴다.
    generalVaccine: {
      description:
        '강아지는 디스템퍼·전염성간염·파보바이러스, 고양이는 범백혈구감소증·호흡기질환이 포함된 종합백신을 접종하세요.\n\n출국 14일 전까지 접종해야 해요.\n접종 후 1년 이내에 입국해야 합니다.',
      descriptionBySpecies: {
        // DC-02v05 11(d) 원문 그대로 — 개는 D·H·P 셋뿐이다(파라인플루엔자·렙토스피라 없음).
        //   "Dogs – canine distemper, infectious canine hepatitis and canine parvovirus."
        //   "Cats – feline panleucopaenia (infectious enteritis) and feline respiratory
        //    disease complex (cat flu)."
        // ⛔ 필리핀·말레이시아 문구를 베껴 파라인플루엔자·렙토스피라를 넣지 말 것 — 홍콩은
        //   요구하지 않는다(한국 DHPPL 로 접종해도 요건은 충족된다).
        dog: '종합백신(DHP)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스 예방을 포함해야 해요.\n출국 14일 전까지 접종해야 해요.\n접종 후 1년 이내에 입국해야 합니다.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증·호흡기질환 예방을 포함해야 해요.\n출국 14일 전까지 접종해야 해요.\n접종 후 1년 이내에 입국해야 합니다.',
      },
      validationIds: ['hk.general-vaccine-14days-before-departure'],
    },
    flight: {
      // 카드 이름이 '항공권 구매'가 아니라 '운송 예약'인 이유 — 홍콩은 반려동물이 보호자와
      //   같은 항공기로 갈 수 없고 화물(manifested cargo)로만 간다. 보호자가 직접 항공권을
      //   사는 절차가 아니라 운송업체를 통해 화물 운송을 예약하는 절차다(2026-07-26 사용자 지정).
      // 화물 운송 문구는 영국(uk) 카드와 같은 문형 — 기내·수하물 동반이 아예 불가한 나라끼리
      // 통일한다. 마지막 줄('항공사에 동반 가능 여부 확인')은 동반 자체가 불가라 넣지 않는다.
      title: '운송 예약',
      shortLabel: '운송',
      doneSummary: '운송 예약을 했어요.',
      attachmentHint: '운송 예약 확인서·항공권(e-티켓)을 사진·PDF로 보관하세요.',
      description:
        '홍콩 입국 일정에 맞춰 운송을 예약하세요.\n\n5개월령 이상만 입국할 수 있어요.\n광견병 접종일로부터 30일, 종합백신 접종일로부터 14일이 지난 후에 입국할 수 있어요.\n홍콩 입국 시 반려동물은 보호자와 같은 항공기로 갈 수 없어요. 화물로 보내야 하므로 동물 운송업체와 미리 협의하세요.',
      // 수입 허가(100) 다음 — AFCD: "Final travel arrangement should NOT be made until a permit
      //   has been granted." 허가 전에 운송을 확정하지 말라는 뜻이라 카드도 허가 뒤에 둔다.
      order: 102,
      validationIds: [
        'hk.min-5months-on-arrival',
        'hk.rabies-min-30days-before-departure',
        'hk.general-vaccine-14days-before-departure',
      ],
    },
    // 수입 허가(Special Permit, AF240) — 마감 배지 없음(고정 'N일 전' 규정이 없어 base
    //   deadline 을 무효화). 6개월 유효·1회 운송 한정은 description 으로 안내.
    importPermit: {
      title: '수입 허가 신청',
      description:
        '홍콩 수입 허가를 신청하세요.\n\n한국에서의 신청은 사실상 어려워요.\n현지 에이전트에 직접 의뢰하거나 연계된 동물 운송업체를 통해 진행하세요.\n수입 허가증 유효기간은 6개월이예요',
      doneSummary: '홍콩 수입 허가증(Special Permit)을 받았어요.',
      cardLine: '홍콩 수입 허가를 신청하세요.',
      deadline: undefined,
      // 버튼 완료 카드(귀국 서류 준비·CDC 신고와 같은 모델, 2026-07-26 사용자 결정).
      //   홍콩 수입 허가는 **펫무브가 대행하지 않는다** — 현지 에이전트가 신청하므로 보호자는
      //   신청일을 모르고, 아는 것은 '허가가 나왔다'는 사실뿐이다. 그래서 신청→발급 2단계 UI
      //   대신 완료 버튼만 두고, 버튼이 오늘 날짜를 아래 필드에 기록한다.
      //   ⛔ 신청일 기반 검증(구 hk.import-permit-*)을 되살리지 말 것 — 판정할 날짜 자체가 없다.
      buttonComplete: true,
      done: 'dated:import_permit_application_date',
      inputs: [
        {
          key: 'import_permit_application_date',
          label: '허가 취득일',
          type: 'date',
          helpText: '수입 허가증을 받은 날짜',
        },
      ],
      validationIds: [],
      links: [
        {
          url: 'https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/qua_ie_ipab_idc_Group_II.html',
          label: '수입 허가 안내(AFCD)',
        },
        // 신청서(AF240) 다운로드 링크 삭제(2026-07-26 사용자 지정) — 보호자가 직접 작성·제출하는
        //   서류가 아니라 현지 에이전트가 처리한다. 내려받을 이유가 없다.
      ],
      attachmentLabel: '수입 허가증(Special Permit)',
    },
    // 도착 검역 — 한국은 Group II 라 조건을 갖추면 **격리 없이** 반출된다(가이드: 그룹 II 변경
    //   전에는 4개월 격리였다). 격리 유무는 사용자 지정대로 수입검역 카드에 적는다.
    importQuarantine: {
      fieldKey: 'hk_import_quarantine_date',
      // 화물 운송이라 수령·통관은 동물 운송업체가 진행한다 — 보호자가 밟을 절차가 아니라
      //   간략히만 안내한다(2026-07-26 사용자 지정). AFCD 원문의 수령 4단계(허가증 원본·AWB
      //   지참 → 항공사 카운터에서 Shipment Release Form 수령 → 화물 supervisor 제출 →
      //   Livestock Room 에서 AFCD cargo office 인계)는 넣지 않는다.
      //   출처: AFCD 'Collection of Animals at HKIA' — "AFCD duty officer will conduct
      //   livestock clearance procedures i.e. **documentary check and health check**."
      //   ⛔ '서류와 마이크로칩을 확인해요'로 되돌리지 말 것 — 실제는 서류 + **건강** 검사다.
      // 견 등록증(Dog Licence) — DC-02v05 10항 "all dogs 5 months old or above must obtain a
      //   Hong Kong Dog Licence ON ARRIVAL at the expense of the permittee or agent"(수수료
      //   HK$80, 3년 유효). 홍콩은 5개월 미만 입국 자체가 불가라 **입국하는 모든 개가 대상**이고,
      //   시내에서 따로 받는 게 아니라 도착 당일 검역에 이어 처리된다. 비용이 발생해 보호자가
      //   알아야 하는 항목이라 한 줄 넣는다(2026-07-26 사용자 지정).
      //   ⚠️ 10항 조건 (b)'광견병 예방접종'이 **한국 접종으로 갈음되는지 홍콩에서 재접종인지는
      //   원문 미확인**(AFCD 도 1823 문의 안내). 확인 전까지 접종 관련 문장은 넣지 말 것.
      // ⛔ 사용자가 불러준 최종 원문(2026-07-26). 문장 추가·병합·어미 변경 금지.
      //   등록증 줄은 **고양이에서 삭제**(descriptionBySpecies) — 개 전용 절차라서.
      description:
        '홍콩 도착 후 공항 화물터미널에서 AFCD 검역관에게 검역을 받아요.\n\n서류와 건강 상태를 확인해요. 이상이 없으면 격리 없이 인도돼요.\n강아지는 검역을 마친 뒤 등록증(Dog Licence)을 받아야 해요. 수수료는 80홍콩달러예요.',
      descriptionBySpecies: {
        dog: '홍콩 도착 후 공항 화물터미널에서 AFCD 검역관에게 검역을 받아요.\n\n서류와 건강 상태를 확인해요. 이상이 없으면 격리 없이 인도돼요.\n강아지는 검역을 마친 뒤 등록증(Dog Licence)을 받아야 해요. 수수료는 80홍콩달러예요.',
        cat: '홍콩 도착 후 공항 화물터미널에서 AFCD 검역관에게 검역을 받아요.\n\n서류와 건강 상태를 확인해요. 이상이 없으면 격리 없이 인도돼요.',
      },
      helpText: 'AFCD 검역관에게 수입 검역을 받은 날짜',
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      // 도착 시 발급되는 서류가 확인되지 않았다 — 필리핀·중국·대만과 같은 중립 이름.
      attachmentLabel: '홍콩 수입 검역 서류',
      validationIds: ['hk.import-quarantine-date-valid'],
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
  // ── 이스라엘 ──────────────────────────────────────────────────────────────
  // archetype 'eu-family' 로 EU 카드 골격(입국 검사·귀국 서류)은 재사용하되, 광견병·항체·
  // 항공권 카드는 이스라엘 규정(procedure-checks/il.ts, gov.il)으로 갈아끼운다. EU 와 다른 핵심:
  //  · 광견병 1차 = 생후 3개월(EU 84일보다 엄격) + 출국 30일 전
  //  · 항체 검사 후 **3개월 대기 없음**(EU 와 결정적 차이) — flight-purchase 에서 3개월 문구 제거
  //  · 검사기관 = EU/WOAH 인증(EU 승인 목록보다 넓음)
  // validationIds 도 eu.* → il.* 로 교체(eu.ts 에서 이스라엘은 EU 광견병 룰 제외 = 중복 방지).
  // 입국 검사(departure)·귀국 서류(eu-export-cert)는 euFamilyOverrides 그대로 — eu.*-date-valid
  // 날짜검증은 eu.ts EU_REGIME 에 이스라엘을 남겨 뒀다.
  israel: {
    ...euFamilyOverrides({ label: '이스라엘' }),
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description:
        '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n이스라엘 입국 때 면역 유효기간이 남아있어야 해요.',
      doneSummary: '광견병 백신을 접종했어요.',
      // gov.il "12주 이상 접종" = 84일 (프로파일 rabies.minAgeDays 와 동일 값 — 우크라이나와
      // 같은 기준). 구 '보수 91일 AND 캘린더 3개월'은 규정보다 과잉이라 걷어냈다(2026-07-25 ③).
      earliest: { anchor: 'birth', daysAfter: 84 },
      done: 'has-rabies-valid',
      validationIds: [
        'il.rabies-prime-after-91days-old',
        'il.microchip-before-rabies',
        'il.rabies-min-30days-before-departure',
        'il.rabies-booster-within-prime-validity',
        // 이미 만료(오늘 기준) '주의' — 1회국 공통(만료 재구성 B). 수동 카드라 직접 지목.
        'common.rabies-validity-expired',
      ],
    },
    'rabies-titer': {
      description:
        'EU 또는 WOAH 인증 검사기관에서 광견병 항체 검사를 받으세요.\n\n광견병 접종 후 30일 이상 지나서 검사하세요.\n동물병원을 통해 의뢰할 수 있어요.\n0.5 IU/mL 이상이면 합격이에요.',
      validationIds: ['il.rnatt-min-30days-after-vaccine'],
    },
    // 항공권 — 이스라엘은 채혈 후 대기가 없다(EU 3개월 제거). 출국일 만 4개월령만 확인.
    'flight-purchase': {
      description:
        '이스라엘 입국 일정에 맞춰 항공권을 구매하세요.\n\n출국일에 반려동물이 만 4개월(약 17주) 이상이어야 해요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
      cardLine: '이스라엘에 입국할 수 있어요.',
      earliest: undefined,
      validationIds: ['il.min-4months-on-departure'],
    },
    // 수출 검역 = 이스라엘의 **공식 수출 절차(강제 O)**. 정부 수의당국(Veterinary Services)이
    // 발급·인증한 국제건강증명서가 필수 — 민간 수의사 증명서 불인정, **대체서류 없음**(EU·스위스와
    // 달리 'EU 여권/한국 검역증 갈음' 안내를 뺀다). 유효 광견병 접종 + 목적국 요건 충족이 공통
    // 필수사항이고, 마이크로칩·항체가(0.5+) 기재는 **한국 수입조건**이 정하는 내용(사용자 정정
    // 2026-07-23). eu-export-cert 슬롯(eu_export_quarantine_date·eu.export-cert-date-valid)을
    // 스위스처럼 재사용하되 문구·링크를 이스라엘 수출 절차로 교체.
    // 출처: gov.il Pet Export(pet-export 랜딩·general-info·moag-pro-126) + 수입안내 PDF 섹션 J.
    'eu-export-cert': {
      title: '이스라엘 수출 검역',
      shortLabel: '수출',
      description:
        // 첫 문장은 나라 이름으로 시작 — 수출검역 카드 전체 통일(사용자 지정 2026-07-21).
        // 문구는 사용자 최종안(2026-07-23) — 민간수의사 불인정·마이크로칩·항체 기재·보유 허가증
        // 등 상세는 뺀 간결본. 규정 상세는 위 주석·git 히스토리 참고.
        '이스라엘 수의당국(Veterinary Services)이 인증한 국제 건강증명서를 준비하세요.\n동물병원 수의사에게 국제 건강증명서 작성을 받고, 그 서류를 수의당국 정부수의사에게 인증받아요.',
      cardLine: '이스라엘 수의당국에서 수출 검역을 받으세요.',
      doneSummary: '이스라엘 수출 검역을 받았어요.',
      attachmentLabel: '이스라엘 국제건강증명서',
      attachmentHint: '이스라엘 정부 인증 국제건강증명서 사본을 사진·PDF로 보관하세요.',
      links: [
        {
          url: 'https://www.gov.il/en/departments/topics/pet-export/govil-landing-page',
          label: '반려동물 수출 안내(이스라엘 농업부)',
        },
        {
          url: 'https://www.gov.il/en/pages/pet-exports-general-information-and-recommendations',
          label: '수출 일반 정보·권고사항',
        },
      ],
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
/**
 * 광견병 1차 접종 카드 — **프로파일에서 문구를 조립**한다.
 *
 * 왜: 목적지마다 카드를 통째로 복사해 쓰던 탓에 같은 문장이 14벌 존재했고, 국가별로 다른 건
 * 사실상 아래 파라미터 몇 개뿐이었다. 복사본이 늘수록 한 곳만 고치고 나머지를 빠뜨리기 쉽다
 * (실제로 일본 카드는 '마이크로칩 삽입 후에 접종' 줄이 빠져 있는데 jp.rabies-prime-before-microchip
 * 룰은 존재한다 — 문구와 검증이 어긋난 상태). 2026-07-19 사용자 지적으로 파생화.
 *
 * 문장 순서(고정):
 *   1) 첫 줄 — 2회 접종국은 '1차 광견병 백신을', 1회국은 '광견병 백신을'
 *   2) 마이크로칩 선행
 *   3) 최소 일령 (minAgeLabel — 규정 문구 그대로)
 *   4) 접종 시점 제약 (timingLines)
 *   5) 백신 종류 제한 (vaccineTypeLine)
 *   6) 유효기간 (validityLine)
 *   7) 입국 시 유효 — '{나라} 입국 때 면역 유효기간이 남아있어야 해요.'
 *   8) 나라 고유 추가 안내 (extraLines)
 *
 * 규정값(일령·간격)은 프로파일에 있고, 검증 룰 id 만 나라별로 넘긴다.
 */

/**
 * 주격 조사 '이/가' 판정 — 최소 일령 라벨 뒤에 붙일 조사.
 *
 * 예전엔 `${minAge}이` 로 **'이'를 고정**해서 붙였다. '생후 91일이'·'생후 3개월이'는 맞지만
 * **'생후 12주(84일)이'는 틀린다** — 괄호는 부연이고 조사는 본말('12주')을 따라야 하므로
 * '생후 12주(84일)**가**'다. 같은 값을 손으로 쓴 12개 목적지(EU 패밀리·태국·싱가포르 등)는
 * 전부 '가'인데 buildRabiesCard 를 타는 이스라엘·튀르키예·우크라이나만 '이'로 나왔다
 * (2026-07-27 사용자 발견). 라벨마다 고쳐 돌면 다음 목적지에서 또 나므로 여기서 판정한다.
 */
function subjectParticle(label: string): '이' | '가' {
  // 괄호로 끝나면 괄호 앞 본말이 기준 — '생후 12주(84일)' → '주'.
  const base = label.endsWith(')') ? label.slice(0, label.lastIndexOf('(')) : label
  const ch = base.trim().slice(-1)
  const code = ch.charCodeAt(0)
  // 한글 음절 — 종성(받침) 유무로.
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '가' : '이'
  // 숫자 — 읽는 소리의 받침 유무(영·일·삼·육·칠·팔 = 받침 O / 이·사·오·구 = 받침 X).
  const digitFinal: Record<string, boolean> = {
    '0': true, '1': true, '2': false, '3': true, '4': false,
    '5': false, '6': true, '7': true, '8': true, '9': false,
  }
  if (ch in digitFinal) return digitFinal[ch] ? '이' : '가'
  return '이'
}

function buildRabiesCard(opts: {
  /** destination-config 키 — 프로파일(rabies.*) 출처. */
  destKey: string
  /** 고객 표기 나라명('대만'·'유럽연합(EU)'). 입국 유효 문장에 쓴다. */
  label: string
  /** 그 나라 procedure-check 룰 id 들. */
  validationIds: string[]
  /** 입국 유효 문장을 생략할 목적지(일본 — 별도 카드에서 다룸). */
  omitEntryValidity?: boolean
}): Partial<StepDefinition> {
  const p = DESTINATION_OVERRIDES[opts.destKey]?.rabies ?? {}
  const twoDose = p.doses === 2
  const minAge =
    p.minAgeLabel ?? (p.minAgeDays ? `생후 ${p.minAgeDays}일` : '')

  // 칩 선행 문구는 그 나라가 실제로 *.microchip-before-rabies 룰을 선언할 때만 넣는다.
  // 마이크로칩이 입국 요건이 아닌 나라(베트남 — 검역 시행규칙에 칩 조항 없음, 펫무브 가이드도
  // "필수가 아니다")까지 하드코딩으로 이 문장이 나가고 있었다(2026-07-20 사용자 지적).
  // 룰 선언을 단일 출처로 삼으면 문구·주의·저장 거부 세 층이 자동으로 같이 움직인다.
  const requiresChipFirst = opts.validationIds.some((id) => id.endsWith('.microchip-before-rabies'))
  const lines: string[] = [
    twoDose ? '1차 광견병 백신을 접종하세요.' : '광견병 백신을 접종하세요.',
  ]
  if (requiresChipFirst) lines.push('마이크로칩 삽입 후에 접종해야 해요.')
  if (minAge) lines.push(`${minAge}${subjectParticle(minAge)} 지난 후에 접종해야 해요.`)
  for (const l of p.timingLines ?? []) lines.push(l)
  if (p.vaccineTypeLine) lines.push(p.vaccineTypeLine)
  if (p.validityLine) lines.push(p.validityLine)
  if (!opts.omitEntryValidity) {
    lines.push(`${opts.label} 입국 때 면역 유효기간이 남아있어야 해요.`)
  }
  for (const l of p.extraLines ?? []) lines.push(l)

  const card: Partial<StepDefinition> = {
    // 1회 접종국은 카드가 하나뿐이라 '1차'를 떼고 '광견병 백신'으로 부른다.
    // 2회국은 2차 카드(shortLabel '백신2')와 구분해야 해서 '백신1'을 유지한다 —
    // factory 초안이 일괄 '백신'으로 덮어써 중국이 바뀌는 걸 lint:copy 가 잡았다(2026-07-19).
    title: twoDose ? '광견병 백신 1차' : '광견병 백신',
    shortLabel: twoDose ? '백신1' : '백신',
    description: lines[0] + '\n\n' + lines.slice(1).join('\n'),
    doneSummary: twoDose ? '1차 광견병 백신을 접종했어요.' : '광견병 백신을 접종했어요.',
    // 1회국은 추가 접종을 이 카드 목록으로 입력하므로 '이미 만료(오늘 기준)' 주의 배지도
    // 여기 붙는다(만료 재구성 B, 2026-07-25). 2회국(일본·중국·하와이)은 추가 백신 카드의
    // common.rabies-extra-validity-expired 가 담당.
    validationIds: twoDose
      ? opts.validationIds
      : [...opts.validationIds, 'common.rabies-validity-expired'],
  }
  // 1회국은 '유효한 백신이 있는가'로 완료 판정(2회국은 1차 입력만으로 완료).
  if (!twoDose) card.done = 'has-rabies-valid'
  // ⚠️ 게이트가 `p.minAgeDays` **하나만** 보면, 달력 개월만 선언한 목적지(괌 minAgeMonths: 3)
  //   에서 earliest 를 아예 안 만들고 **base 카드의 91일(일본 값)이 그대로 샌다** — 카드 잠금
  //   (91일 고정)과 룰(달력 3개월)이 어긋나, 2월생처럼 달력 3개월이 89일인 아이가 규정을
  //   지켰는데 저장이 거부된다(2026-07-26 괌에서 발견. 같은 부류의 사고가 2026-07-19 베트남).
  //   daysAfter 는 타입 주석대로 **표시·정렬용 근사치**라, 개월만 있으면 환산해 채운다.
  if (p.minAgeDays || p.minAgeMonths) {
    card.earliest = {
      anchor: 'birth',
      daysAfter: p.minAgeDays ?? Math.round((p.minAgeMonths ?? 0) * 30.4),
      ...(p.minAgeMonths ? { monthsAfter: p.minAgeMonths } : {}),
    }
  }
  return card
}

function importQuarantineCard(opts: {
  label: string
  /** 검역일 필드 키 — `{국가코드}_import_quarantine_date` (destination-scoped-fields 등록 필요). */
  fieldKey: string
  description: string
  /**
   * (선택) 종별 본문 교체 — 도착 절차가 개·고양이에서 갈리는 목적지(홍콩 견 등록증).
   * 마이크로칩 카드와 같은 모델. 종 미상이면 통합문(description)이 그대로 쓰인다.
   */
  descriptionBySpecies?: StepDefinition['descriptionBySpecies']
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
  if (opts.descriptionBySpecies) card.descriptionBySpecies = opts.descriptionBySpecies
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
  /** destination-config 키 — 광견병 최소 연령(earliest)을 프로파일(rabies.*)에서 파생. */
  key: string
  label: string
  rabiesDescription: string
  rabiesValidationIds: string[]
  /**
   * 항체 검사 카드 override. **선택** — 항체 검사가 입국에도 귀국에도 필요 없는 나라(홍콩)는
   * 넘기지 않는다. 넘기지 않으면 rabies-titer override 자체를 만들지 않는다(카드 노출은
   * catalog applicability 가 결정하므로, 프로파일 titer.need='none' 과 짝이 맞아야 한다).
   */
  titerDescription?: string
  /**
   * 종합백신 카드 override. **선택** — 종합백신이 입국 요건이 아닌 나라(인도네시아)는
   * 넘기지 않는다. 넘기지 않으면 general-vaccine override 자체를 만들지 않는다(카드는
   * catalog 의 하드코딩 명단이 노출을 결정하므로, 그 명단에서도 빼야 실제로 사라진다).
   */
  generalVaccine?: Pick<
    Partial<StepDefinition>,
    // 'order' 는 호주가 백신 카드 4장(광견병·종합·독감·켄넬코프)을 연달아 붙이려고 추가.
    //   미지정이면 base(50) 그대로라 기존 나라들은 무동작.
    'description' | 'descriptionBySpecies' | 'validationIds' | 'order'
  >
  flight: {
    description: string
    order: number
    validationIds: string[]
    /** (선택) 항공권 카드 하단 링크 — 도착지 검역소 운영시간 등(싱가포르 CAPQ). */
    links?: StepDefinition['links']
    /**
     * (선택) 카드 이름 교체 — 보호자가 **항공권을 직접 살 수 없는** 목적지용(홍콩).
     * 홍콩은 반려동물이 보호자와 같은 항공기로 못 가고 화물(manifested cargo)로만 가서,
     * 실제로 하는 일이 '항공권 구매'가 아니라 운송업체를 통한 '운송 예약'이다.
     * 입력칸(출국일 등)과 검증은 그대로 — 이름·안내만 바꾼다.
     */
    title?: string
    shortLabel?: string
    doneSummary?: string
    attachmentHint?: string
  }
  importPermit: Partial<StepDefinition>
  importQuarantine: {
    fieldKey: string
    description: string
    /** (선택) 종별 본문 — 도착 절차가 개·고양이에서 갈릴 때(홍콩 견 등록증). */
    descriptionBySpecies?: StepDefinition['descriptionBySpecies']
    helpText: string
    attachmentHint: string
    /**
     * 첨부 저장 이름. 안 주면 base catalog 의 기본값('수입 검역 서류')이 쓰인다.
     * 예전엔 이 필드가 없어서 태국·필리핀이 base 의 영문 'Import Quarantine Certificate'
     * 를 그대로 썼고, 태국은 실제로 받는 허가서(R.7)와 이름이 어긋났다(2026-07-20).
     */
    attachmentLabel?: string
    /** 필수 — importQuarantineCard 와 같은 이유(그 나라 룰을 반드시 지목). */
    validationIds: string[]
  }
  /** 나라 고유 추가 카드 오버라이드(필리핀 internal-parasite 등). */
  extra?: Partial<Record<string, Partial<StepDefinition>>>
}): Partial<Record<string, Partial<StepDefinition>>> {
  // ✅ 최소 연령을 프로파일에서 파생(2026-07-23) — buildRabiesCard 와 같은 규칙.
  //   말레이시아·인도네시아가 달력 3개월(minAgeMonths)이라 84일 하드코딩을 걷어냈다.
  //   태국(84일)은 값 동일, 필리핀은 프로파일 미선언(12주 룰 = ph.rabies-prime-after-12weeks)
  //   이라 fallback 84 로 종전과 같다. 프로파일에 minAge 를 새로 선언하면 여기가 자동 반영.
  const rabiesProfile = DESTINATION_OVERRIDES[opts.key]?.rabies ?? {}
  return {
    'rabies-vaccine-1': {
      title: '광견병 백신',
      shortLabel: '백신',
      description: opts.rabiesDescription,
      doneSummary: '광견병 백신을 접종했어요.',
      // ✅ 최소 연령 = 프로파일 파생(2026-07-23) — buildRabiesCard 와 같은 단일 출처.
      //   sea-permit 이 태국·필리핀(12주=84일)뿐이던 시절엔 84일이 하드코딩이었지만,
      //   말레이시아·인도네시아(달력 3개월, minAgeMonths)가 들어오며 프로파일과 어긋났다
      //   (입력불가는 프로파일 3개월, 카드 안내는 84일). 이제 rabies.minAgeDays/minAgeMonths 를
      //   읽어 earliest 를 만든다. 프로파일 미선언(필리핀)이면 fallback 84 로 종전과 동일.
      //     태국 84일: DLD AQS PDF "at least 12 weeks old" / 필리핀: ph.rabies-prime-after-12weeks
      //     말레이시아·인도네시아: 달력 3개월(DVS "above 3 months" / Barantan 87/2016 "3 bulan")
      earliest: {
        anchor: 'birth',
        daysAfter: rabiesProfile.minAgeDays ?? 84,
        ...(rabiesProfile.minAgeMonths ? { monthsAfter: rabiesProfile.minAgeMonths } : {}),
      },
      done: 'has-rabies-valid',
      // 1회국 공통 '이미 만료(오늘 기준)' 주의 배지 — buildRabiesCard 와 같은 처리
      // (만료 재구성 B, 2026-07-25).
      validationIds: [...opts.rabiesValidationIds, 'common.rabies-validity-expired'],
    },
    // 항체 카드 override 도 넘어온 나라만(홍콩처럼 항체 요건 자체가 없으면 opts.titerDescription 없음).
    ...(opts.titerDescription
      ? {
          'rabies-titer': {
            description: opts.titerDescription,
            order: 55,
            validationIds: RETURN_ONLY_TITER_CHECKS,
          },
        }
      : {}),
    // 종합백신 override 는 넘어온 나라만(인도네시아처럼 미요건이면 opts.generalVaccine 없음).
    // '이미 만료(오늘 기준)' 주의 배지(common.general-vaccine-validity-expired)를 함께 붙인다
    // — 카드가 뜨는 나라 공통(만료 재구성 B, 2026-07-25).
    ...(opts.generalVaccine
      ? {
          'general-vaccine': {
            ...opts.generalVaccine,
            validationIds: [
              ...(opts.generalVaccine.validationIds ?? []),
              'common.general-vaccine-validity-expired',
            ],
          },
        }
      : {}),
    'flight-purchase': {
      description: opts.flight.description,
      cardLine: `${opts.label}에 입국할 수 있어요.`,
      order: opts.flight.order,
      ...(opts.flight.title ? { title: opts.flight.title } : {}),
      ...(opts.flight.shortLabel ? { shortLabel: opts.flight.shortLabel } : {}),
      ...(opts.flight.doneSummary ? { doneSummary: opts.flight.doneSummary } : {}),
      ...(opts.flight.attachmentHint ? { attachmentHint: opts.flight.attachmentHint } : {}),
      // 일본의 180일 anchor(항체 검사) 미적용 — 입국 대기 룰은 입력 차단·procedure-check 담당.
      earliest: undefined,
      validationIds: opts.flight.validationIds,
      ...(opts.flight.links ? { links: opts.flight.links } : {}),
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
      validationIds: [
        'eu.rabies-prime-after-12weeks',
        'eu.microchip-before-rabies',
        // 저장 거부(findRabiesChainBreak)의 짝. 1회 접종국이면 앱이 이미 저장을 막는데,
        // 짝 룰이 없어 펫무브워크에선 끊긴 chain 이 안 보였다(2026-07-21 lint 로 발견).
        'eu.rabies-booster-within-prime-validity',
      ],
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
