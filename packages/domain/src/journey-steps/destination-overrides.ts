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
      // 중국은 도착 검역 후 발급되는 증서가 없다(해관 확인만) — '검역 서류'로 통일.
      attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
      attachmentLabel: '중국 수입 검역 서류',
      validationIds: ['cn.import-quarantine-date-valid'],
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
      validationIds: ['ae.general-vaccine-required', 'ae.general-vaccine-21days-before-departure'],
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
      validationIds: ['ae.import-permit-within-90days'],
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
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n출국 30일 전까지 접종해야 해요.\n입국할 때 면역 유효기간이 남아있어야 해요.'
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
        '강아지는 DHPPL, 고양이는 범백혈구감소증(FPV)이 포함된 종합백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n입국할 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        // 질병명 순서를 D·H·P·Pi·L 로 맞춤(2026-07-23) — 태국·아랍에미리트와 통일.
        // ⚠️ **파라인플루엔자는 유지**(태국·필리핀과 달리 말레이시아는 실제 요건). 펫무브
        //   말레이시아 가이드: '개 디스템퍼, 전염성 간염, 렙토스피라증, 개 파보바이러스,
        //   개 파라인플루엔자'. 항목은 그대로, 순서만 라벨 순으로 정렬했다.
        dog: '종합백신(DHPPL)을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스·파라인플루엔자·렙토스피라 예방을 포함해야 해요.\n한국 백신은 렙토스피라(L) 예방을 포함하지 않는 경우가 대부분이므로 주의하세요.\n마이크로칩 삽입 후 접종해요.\n입국할 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신(FVRCP)을 접종하세요.\n\n범백혈구감소증 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n입국할 때 면역 유효기간이 남아있어야 해요.',
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
      //   입국엔 현지 에이전트가 현실적(원문 안내). 그래서 '현지 에이전시' 문형을 유지한다.
      // ⛔ 사용자가 불러준 최종 원문(2026-07-23). 세 문단 그대로 — 문장 추가·병합 금지.
      //   함께 빠진 것(근거는 위 주석·아래 링크에 보존): 계류장 14일 전 예약, SPEED→ePermit
      //   2단계, '허가 ≠ 검역소 예약'. 되살리려면 사용자 확인부터.
      description:
        '말레이시아 현지 에이전시를 통해 수입 허가를 신청하세요.\n\n현지 등록 에이전시만 신청이 가능해서 한국에서는 신청할 수 없어요.\n\n말레이시아 검역기관(MAQIS)에 문의하면 등록 에이전시 리스트를 받을 수 있어요.\n\n계류장 예약을 함께 진행해요.',
      doneSummary: '말레이시아 수입 허가증을 받았어요.',
      cardLine: '말레이시아 수입 허가를 신청하세요.',
      attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
      attachmentLabel: '수입 허가증',
      validationIds: ['my.import-permit-not-after-departure'],
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
      '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후 접종해요.\n생후 12주(84일)가 지난 후에 접종해야 해요.\n입국할 때 면역 유효기간이 남아있어야 해요.',
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
        '종합백신을 접종하세요.\n\n강아지는 디스템퍼·전염성간염·파보바이러스, 고양이는 범백혈구감소증·허피스바이러스·칼리시바이러스 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n출국 14일 전까지 접종해야 해요.\n입국할 때 면역 유효기간이 남아있어야 해요.',
      descriptionBySpecies: {
        dog: '종합백신을 접종하세요.\n\n디스템퍼·전염성간염·파보바이러스 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n출국 14일 전까지 접종해야 해요.\n입국할 때 면역 유효기간이 남아있어야 해요.',
        cat: '종합백신을 접종하세요.\n\n범백혈구감소증·허피스바이러스·칼리시바이러스 예방을 포함해야 해요.\n마이크로칩 삽입 후 접종해요.\n출국 14일 전까지 접종해야 해요.\n입국할 때 면역 유효기간이 남아있어야 해요.',
      },
      validationIds: [
        'sg.microchip-before-general-vaccine',
        'sg.comprehensive-vaccine-14days-before-departure',
        'sg.comprehensive-vaccine-valid-on-departure',
      ],
    },
    flight: {
      description:
        '계류장(AQC) 예약이 확정된 계류 시작일에 맞춰 항공권을 구매하세요.\n\n계류공간 수요가 많으니 항공권을 먼저 확정하지 말고, 예약 가능한 계류 시작일을 확인한 뒤 항공편을 맞추세요.\n광견병 항체 검사 채혈일로부터 90일이 지난 후에 입국할 수 있어요.\n창이 공항 검역소(CAPQ) 운영시간에 맞는 도착 시간인지, 환승국의 동물 환승 요건, IATA 하드 켄넬 규격을 확인하세요.\n항공사에 반려동물 동반 방식(동반수하물·초과수하물·화물)을 꼭 확인하세요.',
      order: 90,
      validationIds: ['sg.departure-min-90days-after-titer'],
    },
    // 수입 허가(Licence to Import Non-Food Animals) — 보호자가 GoBusiness 온라인 직접 신청.
    importPermit: {
      description:
        '도착일 기준 90일 이내에 GoBusiness 포털에서 개인용 수입 허가(Licence to Import)를 신청하세요.\n\n강아지 면허를 먼저 받아야 신청할 수 있어요. 완비 서류 제출 후 약 2영업일이 걸리고, 허가는 발급일로부터 90일간 유효해요.\n계류장 예약번호·항공편·동물 정보가 신청 내용과 일치해야 해요. 혼종견은 얼굴과 전신 컬러 사진이 필요해요.',
      doneSummary: '싱가포르 수입 허가를 받았어요.',
      cardLine: '싱가포르 수입 허가를 신청하세요.',
      attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
      attachmentLabel: '싱가포르 수입 허가증',
      validationIds: ['sg.import-permit-not-after-departure'],
      links: [{ url: 'https://www.gobusiness.gov.sg/', label: '수입 허가 신청 (GoBusiness)' }],
    },
    // ⭐ 도착 후 AQC 30일 의무 격리 + 도착 시 광견병 재접종 (NParks Schedule III).
    importQuarantine: {
      fieldKey: 'sg_import_quarantine_date',
      description:
        '싱가포르 도착 후 창이 공항 검역소(CAPQ)에서 도착 검사를 받아요.\n검사 후 검역소(AQC)로 이동해 최소 30일간 격리돼요.\n도착 후 광견병 예방접종을 다시 받아요.\nCAPQ→AQC 운송료는 마리당 S$75, 도착 광견병 접종료는 S$68이에요. 일일 계류비는 팬룸 S$26·에어컨룸 S$35예요(2026년 12월부터 각각 S$36·S$44).',
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
      'external-parasite': {
        order: 106,
        validationIds: ['sg.external-parasite-2to7days-before-departure'],
      },
      'internal-parasite': {
        order: 108,
        validationIds: ['sg.internal-parasite-2to7days-before-departure'],
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
        '인도네시아 수입 허가 신청을 하세요.\n\n한국에서는 신청할 수 없어요.\n수입자가 현지에서 직접, 또는 현지 에이전시를 통해 신청해야 해요.',
      doneSummary: '인도네시아 반입 추천서를 받았어요.',
      cardLine: '인도네시아 수입 허가를 신청하세요.',
      attachmentHint: '반입 추천서(Rekomendasi Pemasukan)를 사진·PDF로 보관하세요.',
      attachmentLabel: '반입 추천서',
      validationIds: ['id.import-permit-not-after-departure'],
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
      validationIds: ['ph.import-permit-14days-after-vaccines'],
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
        '광견병 백신을 접종하세요.\n\n마이크로칩 삽입 후에 접종해야 해요.\n생후 3개월이 지난 후에 접종해야 해요.\n이스라엘 입국 때 면역 유효기간이 남아있어야 해요.',
      doneSummary: '광견병 백신을 접종했어요.',
      // 91일 AND 캘린더 3개월(il.ts evaluateRabiesAgeConservative). client 입력차단은
      // monthsAfter(캘린더 3개월)로 판정 — 91일과의 ≤1일 차이는 il.ts 주의가 잡는다(오차단 없음).
      earliest: { anchor: 'birth', daysAfter: 91, monthsAfter: 3 },
      done: 'has-rabies-valid',
      validationIds: [
        'il.rabies-prime-after-91days-old',
        'il.microchip-before-rabies',
        'il.rabies-min-30days-before-departure',
        'il.rabies-booster-within-prime-validity',
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
  if (minAge) lines.push(`${minAge}이 지난 후에 접종해야 해요.`)
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
    validationIds: opts.validationIds,
  }
  // 1회국은 '유효한 백신이 있는가'로 완료 판정(2회국은 1차 입력만으로 완료).
  if (!twoDose) card.done = 'has-rabies-valid'
  if (p.minAgeDays) {
    card.earliest = {
      anchor: 'birth',
      daysAfter: p.minAgeDays,
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
  /** destination-config 키 — 광견병 최소 연령(earliest)을 프로파일(rabies.*)에서 파생. */
  key: string
  label: string
  rabiesDescription: string
  rabiesValidationIds: string[]
  titerDescription: string
  /**
   * 종합백신 카드 override. **선택** — 종합백신이 입국 요건이 아닌 나라(인도네시아)는
   * 넘기지 않는다. 넘기지 않으면 general-vaccine override 자체를 만들지 않는다(카드는
   * catalog 의 하드코딩 명단이 노출을 결정하므로, 그 명단에서도 빼야 실제로 사라진다).
   */
  generalVaccine?: Pick<
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
      validationIds: opts.rabiesValidationIds,
    },
    'rabies-titer': {
      description: opts.titerDescription,
      order: 55,
      validationIds: RETURN_ONLY_TITER_CHECKS,
    },
    // 종합백신 override 는 넘어온 나라만(인도네시아처럼 미요건이면 opts.generalVaccine 없음).
    ...(opts.generalVaccine ? { 'general-vaccine': opts.generalVaccine } : {}),
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
