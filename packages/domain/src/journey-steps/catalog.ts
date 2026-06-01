import { addYears, readRabiesEntries, readTiterEntries, resolveValidUntil } from '../procedure-checks/utils'
import { buildCaseJourneyContext } from './applicability'
import {
  deriveAdvanceNotificationStatus,
  deriveJpExportQuarantineStatus,
} from './report-status'
import type { StepDefinition } from './types'

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식이 아니면 원문 반환. */
function formatKoreanDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

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
      '보호자와 반려동물 정보가 등록되었습니다.\n\n등록하신 정보는 검역을 위한 필수 정보입니다. 매 단계마다 동일한 정보로 준비를 진행하세요. 진행 중 정보를 변경해야 하는 경우 담당 동물병원, 에이전시, 검역소와 상의하세요.\n\n펫무브 앱에 등록하신 정보는 설정에 들어가셔서 검토, 수정하실 수 있습니다.',
    doneSummary: '보호자와 반려동물 정보가 등록되었습니다.',
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
    doneSummary: '마이크로칩을 삽입했습니다.',
    // 마이크로칩 번호와 시술일은 한 쌍 — 한쪽만 채워졌으면 빠진 쪽을 desc/카드에서 직접 요청.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const implant =
        typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const number = (caseRow.microchip ?? '').trim()
      const hasNumber = number.length > 0
      const hasImplant = implant.length >= 10
      if (hasNumber === hasImplant) return undefined
      const msg = hasNumber ? '마이크로칩 삽입 날짜를 입력해주세요.' : '마이크로칩 번호를 입력해주세요.'
      return { desc: msg, cardDesc: msg }
    },
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
        required: true,
        helpText: '펫무브 등록 신청서의 달력과 동일 컴포넌트',
      },
    ],
    // common.microchip-after-birth (시술일 ≥ 출생일) 은 portal 입력 차단으로 이관 — timeline '주의' 노출 X.
  },

  // ── 3. 광견병 백신 1차 ─────────────────────────────────────────────────
  {
    id: 'rabies-vaccine-1',
    category: 'vaccination',
    title: '광견병 백신(1차)',
    shortLabel: '백신1',
    description:
      '1차 광견병 백신을 접종합니다.\n\n생후 91일이 지난 후 접종해야 합니다.\n불활화(사독) 또는 재조합(변형) 백신을 사용합니다. (국내 유통되는 거의 모든 백신 허용)',
    doneSummary: '1차 광견병 백신을 접종했습니다.',
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
    attachmentLabel: '광견병백신',
    // jp.rabies-prime-after-91days-old (생후 91일 이후 1차) 은 portal 입력 차단으로 이관.
  },

  // ── 4. 광견병 백신 2차 ─────────────────────────────────────────────────
  {
    id: 'rabies-vaccine-2',
    category: 'vaccination',
    title: '광견병 백신(2차)',
    shortLabel: '백신2',
    description:
      '2차 광견병 백신을 접종합니다.\n\n1차 접종 후 30일 이상 지나서 접종합니다.\n1차 접종 면역 유효기간 이내에 접종합니다.\n일본 입국 때 면역 유효기간이 남아있어야 합니다.',
    doneSummary: '2차 광견병 백신을 접종했습니다.',
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
    attachmentLabel: '광견병백신',
    validationIds: [
      // jp.rabies-prime-booster-interval (30일 간격), jp.rabies-booster-within-prime-validity
      // (2차가 1차 유효기간 내), jp.microchip-rabies-sequence (마이크로칩 ≤ 2차) 는
      // portal 입력 차단으로 이관 — 제거.
      // jp.rabies-valid-until-on-departure 는 입국일(entry_date) 기준이라 항공권
      // 구매 step 에서 안내 — 백신 입력 시점엔 보호자가 조치 못 함.
      'jp.rabies-prime-before-microchip',
    ],
  },

  // ── 3-1. 광견병 백신(추가) — 일본 한정, 3차 이상 있을 때만 노출 ──────
  {
    id: 'rabies-vaccine-extra',
    category: 'vaccination',
    title: '추가 백신',
    shortLabel: '백신+',
    description:
      '직전 광견병 백신의 면역 유효기간이 끝나기 전에 재접종합니다.\n\n유효기간이 끝나기 전에 재접종하지 않으면, 1, 2차 접종과 검사 후 다시 180일을 기다려야 합니다.',
    doneSummary: '광견병 백신을 추가 접종했습니다.',
    // 미래 만료 대비 reminder — 본 흐름의 다음 단계(사전 신고 등)를 다음 할 일에서 가리지 않는다.
    advisoryOnly: true,
    // 상황별 문구 분기:
    //  - 3차+ 입력됐는데 직전 백신 유효기간 만료 후 접종 → chain 깨짐. 1차부터 재시작.
    //  - 입국일 미입력 → 만료일 + '만료 전 재접종' (만료 임박 체크와 동일 문구).
    //  - 입국일 입력 & 유효기간이 입국일 전 만료 → '입국일 전 만료' 경고.
    //  - 그 외(입국일 후 만료)는 상황별 문구 없음 — 고정 description 이 노출된다.
    // departure_date 폴백 안 씀(보호자 미입력 잔여값으로 단정 X). valid_until 미입력 시 date + 1년 폴백.
    situational: (caseRow) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return undefined
      const latest = rabies[rabies.length - 1]

      // chain-broken: 추가 도즈가 직전 유효기간 이후라 부스터 미인정 — 1·2차+검사+180일 재시작.
      // (동일 룰: jp.rabies-extra-within-previous-validity blocker)
      if (rabies.length >= 3) {
        const previous = rabies[rabies.length - 2]
        const previousValidUntil = resolveValidUntil(previous.date, previous.valid_until)
        if (previousValidUntil && latest.date > previousValidUntil) {
          const msg =
            '직전 광견병 백신 유효기간 만료 전 재접종을 하지 못했습니다. 1, 2차 접종과 검사 후 다시 180일을 기다려야 합니다.'
          return { desc: msg, cardDesc: msg }
        }
      }

      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return undefined
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date : ''
      if (!entry) {
        // 입국일 미입력 — 만료일 + 재접종 안내.
        const msg = `광견병 백신 유효기간이 ${formatKoreanDate(validUntil)}에 만료됩니다. 만료 전 재접종을 하세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 입국일 전 만료 — 입국 전 재접종 필수.
      if (validUntil < entry) {
        const msg = `광견병 백신 유효기간이 일본 입국일 전에 만료됩니다. ${formatKoreanDate(validUntil)} 전에 재접종 하세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 입국일 후 만료 — 상황별 문구 없음 (고정 description 노출).
      return undefined
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    // 3차+ 입력됐거나 최근 접종 유효기간이 입국일+30일 전 만료(추가 접종 필요) 일 때 노출.
    appliesWhen: 'rabies-extra-applicable',
    order: 37,
    done: 'has-extra-rabies',
    allowAttachments: true,
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진, PDF로 보관하세요.',
    validationIds: [
      'jp.rabies-validity-expires-soon',
      'jp.rabies-extra-within-previous-validity',
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
    doneSummary: '광견병 항체가 검사를 받았습니다.',
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
    attachmentLabel: '광견병 항체가 검사 결과지',
    validationIds: [
      'jp.rabies-titer-vs-booster',
      // 출국일 ± 180일/2년 룰은 항체검사 step 에서 보호자가 조치 불가 — 항공권
      // 구매 step (flight-purchase) 에 jp.entry-* 로 매핑되어 거기서만 안내.
      'jp.microchip-rabies-sequence',
      // 마이크로칩 < 1차 사전 안내는 base 매핑이 rabies-vaccine-2 (다음 액션 step).
      // 2차 done 시점에는 scenario.ts 가 동적으로 이 step(rabies-titer)으로 옮긴다.
    ],
  },

  // ── 4-1. 광견병 항체가 검사(추가) — 일본 한정, 2회 이상 있을 때만 노출 ─────
  {
    id: 'rabies-titer-extra',
    category: 'lab',
    title: '추가 검사',
    shortLabel: '항체+',
    description:
      '일본 입국 전 재검사가 필요합니다.\n\n검사 결과가 나올 때까지 수 주가 걸릴 수 있으므로 미리 검사를 받아두길 권장합니다.',
    doneSummary: '광견병 항체가 검사를 추가로 받았습니다.',
    // 미래 만료 대비 reminder — 본 흐름의 다음 단계를 다음 할 일에서 가리지 않는다.
    advisoryOnly: true,
    // 직전 항체검사의 유효기간(채혈일 + 2년) = 재검사 마감일을 카드/일정 row 에 정확한
    // 날짜로 노출. 광견병 백신 추가 step 의 situational 과 같은 패턴.
    situational: (caseRow) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return undefined
      // 가장 최근(=date 기준 최신) 검사 — readTiterEntries 는 ascending 정렬이라 마지막.
      const latest = [...titers].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = addYears(latest.date, 2)
      if (!validUntil) return undefined
      const msg = `직전 검사의 유효기간이 일본 입국일 전에 만료됩니다. ${formatKoreanDate(validUntil)}까지 재검사 하세요.`
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    // 2회+ 입력됐거나 입국일+30일 안에 항체검사 2년 만료(재검사 필요) 일 때 노출.
    appliesWhen: 'titer-extra-applicable',
    order: 41,
    done: 'has-extra-titer',
    allowAttachments: true,
    attachmentHint: '검사결과지 사본을 사진, PDF로 보관하세요.',
    validationIds: ['jp.titer-validity-expires-soon'],
  },

  // ── 항공권 구매 (일본 전용) ──────────────────────────────────────────────
  {
    id: 'flight-purchase',
    category: 'logistics',
    title: '항공권 구매',
    shortLabel: '항공권',
    description:
      '입국 가능 시기에 맞춰 항공권을 구매하세요.\n\n채혈일로부터 180일 후 ~ 2년 사이에 입국할 수 있습니다.\n사전 신고를 위해 입국 40일 전까지 항공권을 구매해야 합니다. 여유 있게 2달 전까지 구매하는 것이 좋습니다.\n일본 입국 때 광견병 예방접종 면역 유효기간이 남아있어야 합니다.\n항공사에 반려동물 동반 가능 여부를 확인하세요.',
    doneSummary: '항공권을 구매했습니다.',
    cardLine: '일본에 입국할 수 있습니다.',
    // 왕복인데 출국 항공권만 입력되고 귀국 미입력 시 — '귀국 항공권 정보를 입력해주세요.'
    // (has-flight-date done 시그널도 동일 조건으로 미완료 처리하여 다음 단계 진행 차단.)
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const hasEntry = typeof data.entry_date === 'string' && data.entry_date.length >= 10
      const hasReturn = typeof data.return_date === 'string' && data.return_date.length >= 10
      if (!hasEntry || hasReturn) return undefined
      const ctx = buildCaseJourneyContext(caseRow)
      if (ctx.tripType !== 'round') return undefined
      const msg = '귀국 항공권 정보를 입력해주세요.'
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    order: 45,
    earliest: { anchor: 'step:rabies-titer', daysAfter: 180 },
    done: 'has-flight-date',
    // 출국 5 + 귀국 5. 귀국은 왕복 케이스에서만 노출 — 분기는 컴포넌트(FlightInputs)에서.
    inputs: [
      { key: 'entry_date', label: '날짜', type: 'date' },
      { key: 'entry_departure_airport', label: '출발 공항', type: 'text' },
      { key: 'entry_airport', label: '도착 공항', type: 'text' },
      { key: 'entry_flight_number', label: '편명', type: 'text' },
      { key: 'entry_transport', label: '운송 방법', type: 'select' },
      { key: 'return_date', label: '날짜', type: 'date' },
      { key: 'return_departure_airport', label: '출발 공항', type: 'text' },
      { key: 'return_arrival_airport', label: '도착 공항', type: 'text' },
      { key: 'return_flight_number', label: '편명', type: 'text' },
      { key: 'return_transport', label: '운송 방법', type: 'select' },
    ],
    allowAttachments: true,
    attachmentHint: '구매한 항공권(e-티켓)을 사진, PDF로 보관하세요.',
    attachmentLabel: '항공권',
    validationIds: [
      'jp.entry-180days-after-titer',
      // jp.entry-within-2years-of-titer / jp.rabies-valid-until-on-departure 는 항공권 자체가
      // 잘못된 게 아니라 추가 접종·검사가 필요한 신호 — 추가 백신·추가 검사 step 의 situational
      // 안내가 더 정확한 맥락에서 전달. 항공권 step 에서는 중복 노출 안 함.
    ],
  },

  // ── 사전 신고 (일본 전용) ───────────────────────────────────────────
  {
    id: 'advance-notification',
    category: 'permit',
    title: '사전 신고',
    shortLabel: '신고',
    description:
      '일본 입국 40일 전까지 신고해야 합니다.\n\nNACCS로 신청한 후 일본 동물검역소 이메일 지시에 적절한 답변 및 대응을 합니다.\n수 주 후 허가증(Approval)을 받을 수 있습니다.\n왕복 일정인 경우 일본 수출 동물검역 신청도 함께 하는 것이 좋습니다.',
    doneSummary: '일본 동물검역소에 사전 신고를 했습니다.',
    cardLine: '일본 동물검역소에 사전 신고를 하세요.',
    // 진행 상태는 [[deriveAdvanceNotificationStatus]] 가 단일 출처 — admin 신고탭과 동일.
    // 두 분기:
    //  - skip O (명시적 첨부 없이 완료 처리): '첨부 없이 완료 처리됨' — done 이라 timeline 은
    //    doneSummary 로 가리고 detail 헤더에서만 보임. 보호자가 되돌릴 수 있도록 안내.
    //  - status 'in_progress' (신청일 입력 OR admin demote OR legacy stored 'in_progress'):
    //    '신청 완료, 허가증 대기' — done 아니라 timeline·detail 동시 노출.
    // 첨부가 올라오면 두 경우 모두 doneSummary 로 자연스럽게 전환.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.advance_notification_approval_skipped === true) {
        const docs = Array.isArray(data.documents) ? data.documents : []
        const hasAttachment = docs.some(
          (d) =>
            !!d &&
            typeof d === 'object' &&
            (d as Record<string, unknown>).stepId === 'advance-notification',
        )
        if (!hasAttachment) {
          const msg = '첨부 없이 완료 처리됐어요. 허가증(Approval)을 받으시면 파일을 첨부할 수 있습니다.'
          return { desc: msg, cardDesc: msg }
        }
      }
      if (deriveAdvanceNotificationStatus(caseRow) !== 'in_progress') return undefined
      const msg = '신청이 완료되었습니다. 허가증이 나온 후 파일을 첨부하시면 완료 처리됩니다.'
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'entry', daysBefore: 40 },
    done: 'has-advance-notification',
    inputs: [{ key: 'advance_notification_date', label: '신청일', type: 'date' }],
    allowAttachments: true,
    attachmentHint: '수입허가증을 사진, PDF로 보관하세요.',
    attachmentLabel: '허가증(Approval)',
    links: [
      { url: 'https://webaps-prod.nac.naccs.jp/anau/anipas/AOWZ01/OWZ01W02O', label: 'NACCS 신청 페이지' },
      { url: '/guide/jp-quarantine-contacts', label: '일본 동물검역소 연락처' },
    ],
    validationIds: ['jp.advance-notification-40days-before-entry'],
  },

  // ── 사전 신고 다음 — 일본 수출 동물검역 (왕복 케이스 한정) ──────────────
  {
    id: 'jp-export-quarantine',
    category: 'permit',
    title: '일본 수출 동물검역 신청',
    shortLabel: '수출',
    description:
      '일본 동물검역소에 수출 동물검역 신청과 예약을 합니다.\n\n수출 동물검역은 일본에서 한국으로 돌아오기 위한 필수 절차입니다.\n수출 동물검역 신청은 NACCS를 통해서 할 수 있습니다.\n예약은 NACCS를 통해 할 수 없습니다. 방문하려는 동물검역소에 이메일로 문의합니다.',
    doneSummary: '일본 수출 동물검역 예약을 확정했습니다.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'round' },
    order: 48,
    // 마감 없음 — 예약 기준일이 검역소 방문일(= 예약일, 사용자 입력)이라 고정 앵커가 없다.
    // 귀국편 절차라 후속(출국 전 임상검사 등)을 막지 않는다 — 동시에 '다음 할 일' 노출.
    nonBlocking: true,
    done: 'has-jp-export-quarantine',
    // 진행 상태는 [[deriveJpExportQuarantineStatus]] 가 단일 출처 — admin 신고탭과 동일.
    // 두 분기:
    //  - skip O (예약 입력 없이 완료 처리): '입력 없이 완료 처리됨' — done 이라 timeline 은
    //    doneSummary 로 가리고 detail 헤더에서만 보임. 보호자가 되돌릴 수 있도록 안내.
    //  - status 'in_progress' (신청일 입력 OR admin demote OR legacy stored 'in_progress'):
    //    '신청 완료, 예약 확정 대기' — done 아니라 timeline·detail 동시 노출.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.jp_export_quarantine_reservation_skipped === true) {
        const msg = '입력 없이 완료 처리됐어요. 예약이 확정되면 날짜와 시간을 입력할 수 있습니다.'
        return { desc: msg, cardDesc: msg }
      }
      if (deriveJpExportQuarantineStatus(caseRow) !== 'in_progress') return undefined
      const hasReservationDate =
        typeof data.jp_export_quarantine_date === 'string' &&
        data.jp_export_quarantine_date.length >= 10
      const hasReservationTime =
        typeof data.jp_export_quarantine_time === 'string' &&
        /^\d{1,2}:\d{2}$/.test(data.jp_export_quarantine_time)
      // 예약 날짜·시간은 있는데 미확정 = 운영자(대행)가 입력한 '고객 희망' → 예약 진행 중.
      if (hasReservationDate && hasReservationTime) {
        const msg = '신청이 완료되었습니다. 예약 진행중입니다.'
        return { desc: msg, cardDesc: msg }
      }
      const msg = '신청이 완료되었습니다. 예약이 확정되면 예약날짜와 시간을 입력해주세요.'
      return { desc: msg, cardDesc: msg }
    },
    inputs: [
      { key: 'jp_export_quarantine_application_date', label: '신청일', type: 'date' },
      { key: 'jp_export_quarantine_date', label: '예약일', type: 'date' },
      { key: 'jp_export_quarantine_time', label: '예약시간', type: 'text', helpText: 'HH:mm 형식 (예: 14:30)' },
    ],
    links: [
      { url: 'https://webaps-prod.nac.naccs.jp/anau/anipas/AOWZ01/OWZ01W02O', label: 'NACCS 신청 페이지' },
      { url: '/guide/jp-quarantine-contacts', label: '일본 동물검역소 연락처' },
    ],
    // 입력 조건(신청일·예약일 vs 항공편)은 server action(updateJpExportQuarantineFields)이
    // 거부 — 절차 검증 배지가 아니라 저장 자체를 차단.
  },

  // ── 5. 종합백신 (DHPP·FVRCP) ────────────────────────────────────────────
  {
    id: 'general-vaccine',
    category: 'vaccination',
    title: '종합백신 접종',
    shortLabel: '종합',
    description:
      '강아지는 DHPP(C), 고양이는 FVRCP. 출국 시점에 유효기간이 남아있어야 합니다.',
    doneSummary: '종합백신을 접종했습니다.',
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
    doneSummary: '독감(CIV) 백신을 접종했습니다.',
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
    doneSummary: '전염병 검사를 받았습니다.',
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
    doneSummary: '외부구충 처치를 받았습니다.',
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
    doneSummary: '내부구충 투약을 받았습니다.',
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
    doneSummary: '수입 허가를 받았습니다.',
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
    title: '출국 전 임상검사',
    shortLabel: '내원',
    description:
      '출국일 기준 10일 이내에 임상 수의사의 검진을 받으세요.\n검역소에 제출할 서류를 준비하세요.',
    doneSummary: '출국 전 임상검사를 받았습니다.',
    cardLine: '임상 수의사의 검진을 받고 검역소에 제출할 서류를 준비하세요.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 110,
    deadline: { anchor: 'departure', daysBefore: 9, window: true },
    done: 'has-vet-visit',
    inputs: [
      { key: 'vet_visit_date', label: '검진일', type: 'date' },
    ],
  },

  // ── 12. 한국 수출 동물검역 ────────────────────────────────────────────
  {
    id: 'certificate-issue',
    category: 'document',
    title: '한국 수출 동물검역',
    shortLabel: '검역소',
    description:
      '출국일 기준 10일 이내에 동물검역소를 방문해 검역을 받습니다.\n반려동물을 데리고 방문해야 합니다.\n필수 서류를 빠짐없이 구비해야 합니다.',
    doneSummary: '한국 수출 동물검역을 받았습니다.',
    cardLine: '동물검역소를 방문해 검역을 받으세요.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 120,
    // 출국 전 검역소 방문 가능 구간 — 임상검사(vet-visit)와 동일한 '출국 10일 이내' 윈도우.
    deadline: { anchor: 'departure', daysBefore: 9, window: true },
    done: 'has-kr-export-quarantine',
    inputs: [
      { key: 'kr_export_quarantine_date', label: '검역일', type: 'date' },
    ],
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진, PDF로 저장하세요.',
    attachmentLabel: '동물검역증',
    links: [
      { url: '/guide/quarantine-stations', label: '동물검역소 위치' },
      { url: 'https://eminwon.qia.go.kr/eminwon/reservation/login/login.do?ref=petmove.co.kr', label: '동물검역 예약' },
    ],
  },

  // ── 13. 출국·도착 ──────────────────────────────────────────────────────
  {
    id: 'departure',
    category: 'travel',
    title: '출국 · 도착',
    shortLabel: '출국',
    description:
      '공항 검역대 → 항공 탑승 → 도착지 검역소 입국 심사. 도착 후 일부 국가는 7~10일 자가 격리 또는 검역소 격리가 적용됩니다.',
    doneSummary: '출국했습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 140,
    deadline: { anchor: 'departure', daysBefore: 0 },
    done: 'departure-past',
    // base departure 는 첨부 불가 — 일본 override(일본 수입 동물검역)만 allowAttachments.
    // 첨부 명명은 base catalog 의 attachmentLabel 을 읽으므로 여기 둔다 (일본에서만 효과).
    attachmentLabel: 'Import Quarantine Certificate',
  },

  // ── 14. 일본 수출 동물검역 (왕복 케이스 한정 — 귀국편) ──────────────────
  {
    id: 'jp-export-quarantine-visit',
    category: 'document',
    title: '일본 수출 동물검역',
    shortLabel: '검역',
    description:
      '일본 출국 전 일본 동물검역소를 방문해 수출 동물검역을 받습니다.\n반려동물을 데리고 예약한 일정에 방문하세요.\n일본 수출 동물검역증(Export Quarantine Certificate)은 향후 일본에 재입국을 하게 되면 필요할 수 있습니다. 잘 보관해두세요.',
    doneSummary: '일본 수출 동물검역을 받았습니다.',
    cardLine: '일본 동물검역소를 방문해 수출 검역을 받으세요.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'round' },
    order: 150,
    done: 'has-jp-export-quarantine-visit',
    inputs: [
      { key: 'jp_export_quarantine_visit_date', label: '검역일', type: 'date' },
    ],
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진, PDF로 저장하세요.',
    attachmentLabel: 'Export Quarantine Certificate',
  },

  // ── 15. 한국 수입 동물검역 (왕복 케이스 한정 — 귀국 후) ─────────────────
  {
    id: 'kr-import-quarantine',
    category: 'document',
    title: '한국 수입 동물검역',
    shortLabel: '수입',
    description:
      '한국 도착 후 공항 동물검역소에서 수입 동물검역을 받습니다.\n반려동물을 데리고 검역소를 방문하세요.',
    doneSummary: '한국 수입 동물검역을 받았습니다.',
    cardLine: '한국 공항 동물검역소에서 수입 검역을 받으세요.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'round' },
    order: 160,
    done: 'has-kr-import-quarantine',
    inputs: [
      { key: 'kr_import_quarantine_date', label: '검역일', type: 'date' },
    ],
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진, PDF로 저장하세요.',
  },

  // ── 16. 도착 완료 — 여정 마무리 마일스톤 ───────────────────────────────
  // 입력 없는 마커 step. 마지막 검역(편도=일본 수입 / 왕복=한국 수입)이
  // 완료되면 자동 완료 — done-resolver 의 'has-arrived' 가 trip-type 으로 분기.
  {
    id: 'journey-complete',
    category: 'travel',
    title: '여정 완료',
    shortLabel: '도착',
    description:
      '여정이 완료되었습니다.\n\n펫무브와 함께 즐거운 여행 되셨나요?',
    doneSummary: '여정이 완료되었습니다!',
    cardLine: '반려동물과 무사히 도착했어요.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 200,
    done: 'has-arrived',
  },
]
