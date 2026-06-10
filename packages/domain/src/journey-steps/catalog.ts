import { addYears, readRabiesEntries, readTiterEntries, resolveValidUntil, todayKst } from '../procedure-checks/utils'
import { areAllRequiredDocsVerified, resolveRequiredDocs } from '../required-docs'
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

/** 'HH:mm'(24시간) → '오후 2시 30분'(한국식 12시간). 분이 0이면 '오후 2시'. 형식 외엔 원문. */
function formatKoreanTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1])
  const min = Number(m[2])
  const period = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return min === 0 ? `${period} ${h12}시` : `${period} ${h12}시 ${min}분`
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
      '보호자와 반려동물 정보가 등록되었습니다.\n\n등록하신 정보는 검역 준비의 여러 단계에 사용됩니다. 준비 중 정보가 변경되는 경우, 담당 동물병원, 운송업체, 검역소와 상의하세요.\n\n내 정보에서 확인, 수정할 수 있습니다.',
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
      '국제 표준 규격(15자리 번호)의 내장형 마이크로칩을 삽입하세요.\n강아지는 동물등록도 함께 진행하세요.',
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
      const msg = hasNumber ? '마이크로칩 삽입 날짜를 입력하세요.' : '마이크로칩 번호를 입력하세요.'
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
      '1차 광견병 백신을 접종하세요.\n\n생후 91일이 지난 후에 접종해야 합니다.',
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
    // 1차 입력 시 client 입력 불가, 출생일·1차 수정 후 주의(jp.rabies-prime-after-91days-old).
    validationIds: ['jp.rabies-prime-after-91days-old'],
  },

  // ── 4. 광견병 백신 2차 ─────────────────────────────────────────────────
  {
    id: 'rabies-vaccine-2',
    category: 'vaccination',
    title: '광견병 백신(2차)',
    shortLabel: '백신2',
    description:
      '2차 광견병 백신을 접종하세요.\n\n1차 접종 후 30일 이상 지나서 접종하세요.\n1차 접종 면역 유효기간 이내에 접종하세요.\n일본 입국 때 면역 유효기간이 남아있어야 합니다.',
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
      // 1차 입력 차단(client)이 막는 1·2차 관계를, 1차를 나중에 수정해 깨진 경우엔 2차 step
      // 에 '주의'로 재검증한다 — 입력 차단은 1차 수정 경로를 못 잡으므로 procedure-check 가
      // 같은 조건을 매 렌더 재실행한다(검증 단일 출처).
      'jp.rabies-prime-booster-interval', // 1·2차 간격 30일 이상
      'jp.rabies-booster-within-prime-validity', // 2차가 1차 면역 유효기간 이내
      // jp.microchip-rabies-sequence (마이크로칩 ≤ 2차) 는 rabies-titer step 에서 안내.
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
      '직전 광견병 백신의 면역 유효기간이 끝나기 전에 추가 접종을 하세요.\n\n유효기간 만료 전에 추가 접종을 하지 않으면, 1차 접종부터 다시 준비를 시작해야 합니다.',
    doneSummary: '광견병 백신을 추가 접종했습니다.',
    // 미래 만료 대비 reminder — 본 흐름의 다음 단계(사전 신고 등)를 다음 할 일에서 가리지 않는다.
    advisoryOnly: true,
    // 카드가 떴을 때(유효기간 만료·임박)의 안내 — 만료 여부로 두 문구를 분기한다.
    //  - 만료 전(validUntil ≥ 오늘): 만료일 + '만료 전에 추가 접종을 하세요' (마감 안내).
    //  - 만료 후(validUntil < 오늘): 만료일 + '추가 접종 기록을 입력하세요' (입력 요청).
    // 입력 시점은 무관하다(유효기간 내에 받은 접종을 늦게 입력하는 경우 포함). 만료 후 날짜의
    // 접종 입력 자체는 chain 검증(findRabiesChainBreak, client+server)이 입력 불가로 거부하고,
    // 이미 잘못 입력된 3차+ 기록은 procedure-check(jp.rabies-extra-within-previous-validity)가
    // '안내'로 표면화한다. valid_until 미입력 시 date + 1년 폴백(resolveValidUntil).
    situational: (caseRow) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return undefined
      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      // 유효기간 산출 불가 — 만료일을 단정하지 않고 입력만 요청.
      if (!validUntil) {
        const msg = '추가 접종 기록을 입력하세요.'
        return { desc: msg, cardDesc: msg }
      }
      // 입국일은 entry_date 우선, 없으면 출국일(departure_date) 폴백 — done 룰과 동일.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      const today = todayKst()
      // 예정(미래) 추가 접종 — 도래 후 '저장' 확인으로 완료. 입국일을 덮는(또는 입국일 미정)
      // 예약이면 예약 안내문을 띄운다. advisory step 이라 일정·상세가 모두 이 situational 을
      // 안내문으로 쓰므로, undefined 를 반환하면 일정은 정적 요약으로 fallback 되고 상세엔
      // 안내 박스가 사라져 둘이 어긋난다(예정 상태에서 안내문 불일치 버그).
      if (latest.date > today && (!entry || validUntil >= entry)) {
        const msg = `${formatKoreanDate(latest.date)} 추가 접종 예정입니다. 접종 후 완료 버튼을 눌러주세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 이미 만료 — 추가 접종 기록 입력 요청. (만료 전 임박은 jp.rabies-validity-expires-soon 담당.)
      if (validUntil < today) {
        const msg = `광견병 백신 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었습니다. 추가 접종 기록을 입력하세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 오늘은 아직 유효하지만 입국일 전에 만료 — 이 step 이 미완료로 남는 실제 사유.
      // (has-extra-rabies done 룰이 "최신 유효기간 < 입국일" 이면 미완료로 잡는 것과 짝.)
      if (entry && validUntil < entry) {
        const msg = `광견병 백신 유효기간이 일본 입국 전에 만료됩니다. ${formatKoreanDate(validUntil)}까지 추가 접종을 하세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 예정일이 도래(≤오늘)했고 입국일도 덮지만 아직 '저장'으로 확인 전 — 저장으로 완료 안내.
      if (latest.date <= today && data.rabies_extra_confirmed === false) {
        const msg = '추가 접종 예정일이 지났습니다. 완료 버튼을 눌러주세요.'
        return { desc: msg, cardDesc: msg }
      }
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

  // ── 4. 광견병 항체 검사 ──────────────────────────────────────────────────
  {
    id: 'rabies-titer',
    category: 'lab',
    title: '광견병 항체 검사',
    shortLabel: '항체',
    description:
      '일본 지정 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있습니다.\n0.5 IU/mL 이상이면 합격입니다.\n2차 접종 면역 유효기간 이내에 검사하세요.',
    doneSummary: '광견병 항체 검사를 받았습니다.',
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
    // 검사 → 결과 2단계 (사전 신고·일본 수출검역 신청과 동일 모델). 채혈일이 입력됐고
    // (오늘 이하) 아직 결과(value)·완료 플래그가 없으면 '검사 진행 중' 안내. 미래 채혈일
    // (=예정)·완료 상태에선 숨김.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const arr = Array.isArray(data.rabies_titer_records)
        ? (data.rabies_titer_records as Array<Record<string, unknown>>)
        : []
      const primary = arr[0]
      const date = primary && typeof primary.date === 'string' ? primary.date : ''
      if (date.length < 10 || date > todayKst()) return undefined
      if (data.rabies_titer_result_confirmed === true) return undefined
      if (typeof primary?.value === 'string' && primary.value.trim().length > 0) return undefined
      const msg = '광견병 항체 검사를 진행 중입니다. 결과가 나오면 결과를 입력하거나 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    inputs: [
      { key: 'rabies_titer_date', label: '채혈일', type: 'date' },
      { key: 'rabies_titer_lab', label: '검사기관', type: 'select' },
      { key: 'rabies_titer_value', label: '검사결과', type: 'text' },
    ],
    allowAttachments: true,
    attachmentHint: '검사결과지 사본을 사진, PDF로 보관하세요.',
    attachmentLabel: '광견병 항체 검사 결과지',
    validationIds: [
      'jp.rabies-titer-vs-booster',
      // 출국일 ± 180일/2년 룰은 항체 검사 step 에서 보호자가 조치 불가 — 항공권
      // 구매 step (flight-purchase) 에 jp.entry-* 로 매핑되어 거기서만 안내.
      'jp.microchip-rabies-sequence',
      // 마이크로칩 < 1차 사전 안내는 base 매핑이 rabies-vaccine-2 (다음 액션 step).
      // 2차 done 시점에는 scenario.ts 가 동적으로 이 step(rabies-titer)으로 옮긴다.
      // 광견병 백신 체인 누락·역순 (1차/2차 < 항체). common 제거 이관 잔재로 id 가
      // 'common.' 이던 것을 'jp.' 로 정정 — 매핑 누락(findStepForCheck null) 으로 이 주의가
      // 항체 step 배지 대신 caseAlert(상단)로 새던 버그 수정.
      'jp.rabies-titer-chain-consistent',
    ],
  },

  // ── 4-1. 광견병 항체 검사(추가) — 일본 한정, 2회 이상 있을 때만 노출 ─────
  {
    id: 'rabies-titer-extra',
    category: 'lab',
    title: '추가 검사',
    shortLabel: '항체+',
    description:
      '일본 입국 전에 재검사를 받으세요.\n\n검사 결과가 나올 때까지 수 주가 걸릴 수 있으니 미리 검사를 받아두세요.',
    doneSummary: '광견병 항체 검사를 추가로 받았습니다.',
    // 미래 만료 대비 reminder — 본 흐름의 다음 단계를 다음 할 일에서 가리지 않는다.
    advisoryOnly: true,
    // 직전 항체 검사의 유효기간(채혈일 + 2년) = 재검사 마감일을 카드/일정 row 에 정확한
    // 날짜로 노출. 광견병 백신 추가 step 의 situational 과 같은 패턴.
    situational: (caseRow) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return undefined
      // 입국일 = entry_date 우선, 없으면 출국일 폴백 (일본 등).
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      const today = todayKst()
      // 현재 유효기간 = 입국일 이전에 한 채혈 중 가장 최근 것 + 2년. 입국 후 채혈은 그 입국을
      // 보증 못 하므로 제외. readTiterEntries 는 입력 순서라 명시 정렬.
      const prior = entry ? titers.filter((t) => t.date <= entry) : titers
      if (prior.length === 0) {
        // 입국 전 유효 채혈이 없음(입국 후 채혈만 있는 경우 포함) — 재검사 안내.
        const msg = '일본 입국 전에 재검사를 받으세요.'
        return { desc: msg, cardDesc: msg }
      }
      const latest = [...prior].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = addYears(latest.date, 2)
      if (!validUntil) return undefined
      // 예정(미래) 추가 검사 — 도래 후 '저장' 확인으로 완료. 입국일을 덮는(또는 입국일 미정)
      // 예약이면 예약 안내. advisory step 이라 일정·상세가 모두 이 situational 을 안내문으로
      // 쓰므로, undefined 면 일정은 정적 요약으로 fallback 되고 상세엔 안내 박스가 사라져 어긋난다.
      // (추가 백신 situational 과 동일 패턴.)
      if (latest.date > today && (!entry || validUntil >= entry)) {
        const msg = `${formatKoreanDate(latest.date)} 추가 검사 예정입니다. 검사 후 완료 버튼을 눌러주세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 유효기간이 입국일을 덮으면(아직 유효) — 도래·미확인이면 저장 안내, 아니면 안내 불필요.
      if (entry && validUntil >= entry) {
        if (latest.date <= today && data.titer_extra_confirmed === false) {
          const msg = '추가 검사 예정일이 지났습니다. 완료 버튼을 눌러주세요.'
          return { desc: msg, cardDesc: msg }
        }
        return undefined
      }
      // 입국일 전 만료 — 재검사 필요.
      const msg = `직전 검사의 유효기간이 일본 입국일 전에 만료됩니다. ${formatKoreanDate(validUntil)}까지 재검사 하세요.`
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    // 2회+ 입력됐거나 입국일+30일 안에 항체 검사 2년 만료(재검사 필요) 일 때 노출.
    appliesWhen: 'titer-extra-applicable',
    order: 41,
    done: 'has-extra-titer',
    allowAttachments: true,
    attachmentHint: '검사결과지 사본을 사진, PDF로 보관하세요.',
    validationIds: ['jp.titer-validity-expires-soon', 'jp.titer-extra-within-rabies-validity'],
  },

  // ── 항공권 구매 (일본 전용) ──────────────────────────────────────────────
  {
    id: 'flight-purchase',
    category: 'logistics',
    title: '항공권 구매',
    shortLabel: '항공권',
    description:
      '입국 가능 시기에 맞춰 항공권을 구매하세요.\n\n채혈일로부터 180일 후 ~ 2년 사이에 입국할 수 있습니다.\n사전 신고를 위해 입국 40일 전까지 항공권을 구매해야 합니다. 여유 있게 두 달 전까지 구매하세요.\n일본 입국 때 광견병 예방접종 면역 유효기간이 남아있어야 합니다.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
    doneSummary: '항공권을 구매했습니다.',
    cardLine: '일본에 입국할 수 있습니다.',
    // 왕복인데 출국 항공권만 입력되고 귀국 미입력 시 — '귀국 항공권 정보를 입력하세요.'
    // (has-flight-date done 시그널도 동일 조건으로 미완료 처리하여 다음 단계 진행 차단.)
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const hasEntry = typeof data.entry_date === 'string' && data.entry_date.length >= 10
      const hasReturn = typeof data.return_date === 'string' && data.return_date.length >= 10
      if (!hasEntry || hasReturn) return undefined
      const ctx = buildCaseJourneyContext(caseRow)
      if (ctx.tripType !== 'round') return undefined
      const msg = '귀국 항공권 정보를 입력하세요.'
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
      '일본 입국 40일 전까지 신고하세요.\n\nNACCS로 신청한 후 일본 동물검역소의 이메일 지시에 맞춰 답변·대응하세요.\n수 주 후 허가증(Approval)을 받을 수 있습니다.\n왕복 일정이라면 일본 수출 동물검역 신청도 함께 하는 것이 좋습니다.',
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
      // 신청일이 미래(=예정)이면 안내 노출 안 함 — derive 가 'in_progress' 로 보더라도
      // 보호자에겐 '신청 완료' 톤이 부적절. stored/admin_demoted_at 별도 시그널은 별개.
      const filed =
        typeof data.advance_notification_date === 'string' ? data.advance_notification_date : ''
      if (filed.length >= 10 && filed > todayKst()) return undefined
      // 완료(skip) 상태에선 안내 노출 안 함 — '완료' 자체가 명시적 보호자 액션이라 추가 설명 불필요.
      // 첨부는 언제든 documents 탭에서 올릴 수 있음.
      if (deriveAdvanceNotificationStatus(caseRow) !== 'in_progress') return undefined
      const msg = '사전 신고를 진행 중입니다. 허가증이 나오면 파일을 첨부하거나 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'entry', daysBefore: 40 },
    done: 'has-advance-notification',
    // 신청일만 입력된 in_progress 상태도 '입력됨'으로 본다 — 항공편 수정 시 어긋날 수 있어
    // 확인창에서 잡아야 한다. (done 시그널은 'done' 만 잡음 — 신청·예약은 in_progress 단계 존재.)
    hasInputData: (caseRow) => deriveAdvanceNotificationStatus(caseRow) !== 'not_started',
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
      '일본 동물검역소에 수출 동물검역을 신청하고 예약하세요.\n\n수출 동물검역은 일본에서 한국으로 돌아오기 전에 받아야 하는 필수 절차로, 최소 10일 전까지 신청·예약해야 합니다.\n수출 동물검역 신청은 NACCS를 통해 할 수 있습니다.\n예약은 NACCS로 할 수 없으니, 방문하려는 동물검역소에 이메일로 문의하세요.',
    doneSummary: '일본 수출 동물검역 신청·예약을 완료했습니다.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'round' },
    order: 48,
    // 마감 없음 — 예약 기준일이 검역소 방문일(= 예약일, 사용자 입력)이라 고정 앵커가 없다.
    // 귀국편 절차라 후속(출국 전 임상검사 등)을 막지 않는다 — 동시에 '다음 할 일' 노출.
    nonBlocking: true,
    done: 'has-jp-export-quarantine',
    // 신청·예약이 in_progress 인 상태도 '입력됨'으로 본다 (사전 신고와 동일 패턴).
    hasInputData: (caseRow) => deriveJpExportQuarantineStatus(caseRow) !== 'not_started',
    // 진행 상태는 [[deriveJpExportQuarantineStatus]] 가 단일 출처 — admin 신고탭과 동일.
    // 두 분기:
    //  - skip O (예약 입력 없이 완료 처리): '입력 없이 완료 처리됨' — done 이라 timeline 은
    //    doneSummary 로 가리고 detail 헤더에서만 보임. 보호자가 되돌릴 수 있도록 안내.
    //  - status 'in_progress' (신청일 입력 OR admin demote OR legacy stored 'in_progress'):
    //    '신청 완료, 예약 확정 대기' — done 아니라 timeline·detail 동시 노출.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 신청일이 미래(=예정)이면 안내 노출 안 함 — 사전 신고와 동일 패턴.
      const applied =
        typeof data.jp_export_quarantine_application_date === 'string'
          ? data.jp_export_quarantine_application_date
          : ''
      if (applied.length >= 10 && applied > todayKst()) return undefined
      // 완료(skip) 상태에선 안내 노출 안 함 — '완료' 자체가 명시적 보호자 액션이라 추가 설명 불필요.
      // 예약일·시간은 언제든 input 으로 수정 가능.
      if (deriveJpExportQuarantineStatus(caseRow) !== 'in_progress') return undefined
      // 예약일·시간은 '희망' 데이터일 뿐 완료 판정에 영향 없음 — 보호자가 '완료' 버튼을 직접
      // 눌러야 step 이 done. 사전 신고와 동일 모델.
      // 예약 일정 안내는 방문 step([[jp-export-quarantine-visit]])이 맡고, 여기는 진행 중 안내만.
      const msg = '일본 수출 동물검역 신청·예약이 진행 중입니다. 예약이 확정되면 완료 버튼을 누르세요.'
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
    // 입력 시 server action(updateJpExportQuarantineFields)이 차단하고,
    // 같은 함수를 매 렌더 재실행하는 jp.export-quarantine-reservation-date-valid 가
    // 앞 단계(항공편 등) 수정 후 어긋난 케이스를 '주의'로 표면화.
    validationIds: ['jp.export-quarantine-reservation-date-valid'],
  },

  // ── 5. 종합백신 (DHPP·FVRCP) ────────────────────────────────────────────
  {
    id: 'general-vaccine',
    category: 'vaccination',
    title: '종합백신 접종',
    shortLabel: '종합',
    description:
      '강아지는 DHPP(C), 고양이는 FVRCP를 접종하세요. 출국 시점에 유효기간이 남아있어야 합니다.',
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
    description: '강아지 인플루엔자(CIV) 백신을 접종하세요. 호주·뉴질랜드·인도 등 일부 국가에서 요구됩니다.',
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
      '인증 실험실에서 전염병 검사를 받아 음성을 확인하세요. 호주(Brucella/Leptospira/Leishmania 등)·뉴질랜드·남아프리카공화국에서 요구됩니다.',
    doneSummary: '전염병 검사를 받았습니다.',
    applicability: {
      destinations: ['australia', 'new_zealand', 'south_africa'],
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
      '출국 직전에 진드기·벼룩 처치를 받으세요. EU 6국·호주·뉴질랜드 등에서 요구됩니다.',
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
      'EU 6국(영국·아일랜드·몰타·노르웨이·핀란드 + 북아일랜드)은 출국 24~120시간 전에 praziquantel 류 촌충약을 투약하세요. 투약 시각(분 단위)까지 기록해야 합니다.',
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
      '도착 전에 수입허가를 신청하세요. 호주(DAFF)·뉴질랜드(MPI)·대만(APHIA)·말레이시아(DVS) 등에서 필요하며, 허가번호가 검역증에 명시되어야 합니다.',
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
      '출국일 기준 10일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받고 검역에 필요한 서류를 준비하세요.',
    doneSummary: '출국 전 임상검사를 받았습니다.',
    cardLine: '임상 수의사의 검진을 받고 검역에 필요한 서류를 준비하세요.',
    // 검진일 ≤ 오늘 + 미완료 상태에서 안내. 완료는 큐레이션된 필수 서류가 모두 ✓ 일 때
    // done-resolver 가 자동 판정. 옛 데이터 호환을 위해 vet_visit_confirmed 플래그도 done.
    // spec 없는 destination 은 검진일 입력만으로 완료라 안내 자체가 등장하지 않음.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const dt = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (dt.length < 10 || dt > todayKst()) return undefined
      if (data.vet_visit_confirmed === true) return undefined
      if (resolveRequiredDocs(caseRow.destination, caseRow) === null) return undefined
      // done-resolver(has-vet-visit)와 동일 범위 — vet-visit 시점까지의 서류만 본다.
      if (areAllRequiredDocsVerified(caseRow, 'vet-visit')) return undefined
      const msg = '출국 전 임상검사를 받았습니다. 서류 체크리스트를 확인하세요.'
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 110,
    deadline: { anchor: 'departure', daysBefore: 9, window: true },
    done: 'has-vet-visit',
    inputs: [
      { key: 'vet_visit_date', label: '검진일', type: 'date' },
    ],
    validationIds: ['common.vet-visit-date-valid'],
  },

  // ── 12. 한국 수출 동물검역 ────────────────────────────────────────────
  {
    id: 'certificate-issue',
    category: 'document',
    title: '한국 수출 동물검역',
    shortLabel: '검역소',
    description:
      '출국일 기준 10일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n필수 서류를 빠짐없이 챙기세요.',
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
    validationIds: ['common.kr-export-quarantine-date-valid'],
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
      '공항 검역대 → 항공 탑승 → 도착지 검역소 입국 심사 순서로 진행하세요. 도착 후 일부 국가는 7~10일 자가 격리 또는 검역소 격리가 적용됩니다.',
    doneSummary: '출국했습니다.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 140,
    deadline: { anchor: 'departure', daysBefore: 0 },
    done: 'departure-past',
    // base departure 는 첨부 불가 — 일본 override(일본 수입 동물검역)만 allowAttachments.
    // 첨부 명명은 base catalog 의 attachmentLabel 을 읽으므로 여기 둔다 (일본에서만 효과).
    attachmentLabel: 'Import Quarantine Certificate',
    // 일본 override 가 jp_import_quarantine_date 입력으로 사용 — 이 룰은 non-JP 케이스에선
    // country: 'japan' 필터로 자동 비활성.
    validationIds: ['jp.import-quarantine-date-valid'],
  },

  // ── 14. 일본 수출 동물검역 (왕복 케이스 한정 — 귀국편) ──────────────────
  {
    id: 'jp-export-quarantine-visit',
    category: 'document',
    title: '일본 수출 동물검역',
    shortLabel: '검역',
    description:
      '일본 출국 전 동물검역소를 방문해 수출 동물검역을 받으세요.\n반려동물을 데리고 예약한 일정에 방문하세요.\n일본 수출 동물검역증(Export Quarantine Certificate)은 향후 일본에 재입국하게 되면 필요할 수 있으니 잘 보관해두세요.',
    doneSummary: '일본 수출 동물검역을 받았습니다.',
    cardLine: '일본 동물검역소를 방문해 수출 검역을 받으세요.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'round' },
    order: 150,
    done: 'has-jp-export-quarantine-visit',
    // 신청 step([[jp-export-quarantine]])에서 입력한 예약 날짜·시간을 방문 step 의 '안내'로
    // 노출한다 — step 상세 화면의 안내 박스(situational.desc) + '다음 할 일' 카드 인라인 안내
    // (scenario 가 방문이 current 일 때만 infoMessage 로 승격). 예약일이 비어 있으면 기본 설명.
    // '예약 날짜'·'예약 시간' 라벨 줄로 분리(줄바꿈은 렌더 측 white-space:pre-line 으로 표시).
    // 시간은 한국식 12시간제(오전/오후)로 표기하고, 비어 있으면 날짜 줄만 노출한다.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const resDate =
        typeof data.jp_export_quarantine_date === 'string' &&
        data.jp_export_quarantine_date.length >= 10
          ? data.jp_export_quarantine_date.slice(0, 10)
          : ''
      if (!resDate) return undefined
      const resTime =
        typeof data.jp_export_quarantine_time === 'string' &&
        /^\d{1,2}:\d{2}$/.test(data.jp_export_quarantine_time)
          ? data.jp_export_quarantine_time
          : ''
      const lines = [`예약 날짜: ${formatKoreanDate(resDate)}`]
      if (resTime) lines.push(`예약 시간: ${formatKoreanTime(resTime)}`)
      return { desc: lines.join('\n') }
    },
    inputs: [
      { key: 'jp_export_quarantine_visit_date', label: '검역일', type: 'date' },
    ],
    validationIds: ['jp.export-quarantine-visit-date-valid'],
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
      '한국 도착 후 공항 동물검역소에서 수입 동물검역을 받으세요.',
    doneSummary: '한국 수입 동물검역을 받았습니다.',
    cardLine: '한국 공항 동물검역소에서 수입 검역을 받으세요.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'round' },
    order: 160,
    done: 'has-kr-import-quarantine',
    inputs: [
      { key: 'kr_import_quarantine_date', label: '검역일', type: 'date' },
    ],
    validationIds: ['jp.kr-import-quarantine-date-valid'],
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진, PDF로 저장하세요.',
  },

  // ── 16. 도착 완료 — 여정 마무리 마일스톤 ───────────────────────────────
  // 옛 'journey-complete' 마커 step 은 제거됨 — 여정 완료는 타임라인의 별도 행이 아니라
  // 마지막 절차(편도=일본 수입 / 왕복=한국 수입)가 끝나면 일정 화면 '다음 할 일' 위치에
  // 완료 배너로 노출한다 (scenario.ts journeyComplete + timeline-calm). 완료 시그널은
  // done-resolver 의 'has-arrived' (trip-type 으로 분기) 를 그대로 사용.
]
