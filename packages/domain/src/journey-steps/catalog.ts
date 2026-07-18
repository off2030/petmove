import {
  addDays,
  addYears,
  readGeneralVaccineEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  todayKst,
} from '../procedure-checks/utils'
import { matchesDestinationKey } from '../destination-config'
import {
  buildCaseJourneyContext,
  isSingleDoseRabiesCase,
  SINGLE_DOSE_RABIES_DESTINATIONS,
} from './applicability'
import {
  deriveAdvanceNotificationStatus,
  deriveImportPermitStatus,
  deriveJpExportQuarantineStatus,
} from './report-status'
import type { StepDefinition } from './types'
import type { CaseRow } from '../types'

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
      '보호자와 반려동물 정보가 등록되었어요.\n\n등록하신 정보는 검역 준비의 여러 단계에 사용돼요. 준비 중 정보가 변경되는 경우, 담당 동물병원, 운송업체, 검역소와 상의하세요.\n\n내 정보에서 확인, 수정할 수 있어요.',
    doneSummary: '보호자와 반려동물 정보가 등록되었어요.',
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
    doneSummary: '마이크로칩을 삽입했어요.',
    // 마이크로칩 번호와 시술일은 한 쌍 — 한쪽만 채워졌으면 빠진 쪽을 desc/카드에서 직접 요청.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const implant =
        typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const number = (caseRow.microchip ?? '').trim()
      const hasNumber = number.length > 0
      const hasImplant = implant.length >= 10
      // 번호·시술일 한 쌍 — 한쪽만 채워졌으면 빠진 쪽 요청.
      if (hasNumber !== hasImplant) {
        const msg = hasNumber ? '마이크로칩 삽입 날짜를 입력하세요.' : '마이크로칩 번호를 입력하세요.'
        return { desc: msg, cardDesc: msg }
      }
      // 둘 다 있음 — 안내 없음. 미래(예정) 시술일은 저장 시 별도 자리
      // (microchip_implant_date_scheduled)로 분리되므로 여기엔 실제(≤오늘) 기록만 온다.
      return undefined
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
    title: '광견병 백신 1차',
    shortLabel: '백신1',
    description:
      '1차 광견병 백신을 접종하세요.\n\n생후 91일이 지난 후에 접종해야 해요.',
    doneSummary: '1차 광견병 백신을 접종했어요.',
    // 1회 접종국(태국·필리핀·EU)은 이 카드 하나에서 1·2·3차를 목록으로 입력 + 만료 시 추가 접종
    // 안내(종합백신과 동일 모델). 일본·하와이(2회국)는 이 situational 이 미적용(undefined) — 기존
    // 1차/2차/추가 분리 카드 유지. done 은 destination-override 가 1회국에서 has-rabies-valid 로 교체.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const r = readRabiesEntries(caseRow)
      // 2회국(일본·하와이) — 상황별 안내 없음(1·2차 분리 카드는 정적 안내만).
      if (!isSingleDoseRabiesCase(caseRow)) return undefined
      // 1회 접종국 단일카드 — 유효기간 만료·임박 안내만.
      if (r.length === 0) return undefined
      const latest = [...r].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      const today = todayKst()
      if (latest.date > today) return undefined // 미래(예정) — 기본 안내
      // 만료/입국전 만료는 advisory(별도 안내 카드) — 도래 완료확인은 '다음 할 일' 유지.
      if (validUntil && validUntil < today) {
        const msg = `직전 광견병 백신의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 접종 기록을 입력하세요.`
        return { desc: msg, cardDesc: msg, advisory: true }
      }
      if (entry && validUntil && validUntil < entry) {
        const token = buildCaseJourneyContext(caseRow).destinationToken
        const msg = `광견병 백신 면역 유효기간이 ${token ? `${token} ` : ''}입국 전에 만료돼요. ${formatKoreanDate(validUntil)}까지 추가 접종을 하세요.`
        return { desc: msg, cardDesc: msg, advisory: true }
      }
      // 만료 임박(오늘 기준 30일 이내) — 아직 유효하지만 곧 만료. 여행 미예약(!entry)일 때만
      // 추가 접종 준비를 알린다(done-resolver has-rabies-valid 의 임박 미완료 조건과 동일 —
      // 이미 예약된 여행이 유효기간 내면 오경보가 되지 않게). 일본은 '추가 백신' 카드가 같은
      // 역할(rabies-extra-applicable)을 하지만, 1회 접종국(태국·필리핀·EU)은 그 카드가 없다.
      if (!entry && validUntil && validUntil >= today && validUntil < addDays(today, 30)) {
        const msg = `직전 광견병 백신의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료돼요. 유효기간이 끝나기 전에 추가 접종을 하세요.`
        return { desc: msg, cardDesc: msg, advisory: true }
      }
      // 만료·임박 아님 — 안내 없음. 미래(예정) 회차는 rabies_dates_scheduled 별도 자리라
      // 여기엔 실제(≤오늘) 기록만 오고, 도래한 실제 기록은 done 으로 완료 처리된다.
      return undefined
    },
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
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진·PDF로 보관하세요.',
    attachmentLabel: '광견병백신',
    // 1차 입력 시 client 입력 불가, 출생일·1차 수정 후 주의(jp.rabies-prime-after-91days-old).
    validationIds: ['jp.rabies-prime-after-91days-old'],
  },

  // ── 4. 광견병 백신 2차 ─────────────────────────────────────────────────
  {
    id: 'rabies-vaccine-2',
    category: 'vaccination',
    title: '광견병 백신 2차',
    shortLabel: '백신2',
    description:
      '2차 광견병 백신을 접종하세요.\n\n1차 접종 후 30일 이상 지나서 접종하세요.\n1차 접종 면역 유효기간 이내에 접종하세요.\n입국 때 면역 유효기간이 남아있어야 해요.',
    doneSummary: '2차 광견병 백신을 접종했어요.',
    // 1회면 충분한 나라는 2차 미노출(태국·필리핀·EU 패밀리 등 — 가이드·procedure-check 에
    // 2회 강제 없음. EU 는 1회 접종 + 항체 검사 모델 — 추가 접종은 유효기간 유지용).
    // 목록 단일 출처: SINGLE_DOSE_RABIES_DESTINATIONS (추가 백신 카드 노출·완료 판정과 공유).
    applicability: {
      destinations: 'all',
      excludeDestinations: [...SINGLE_DOSE_RABIES_DESTINATIONS],
      species: 'all',
      tripType: 'all',
    },
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
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진·PDF로 보관하세요.',
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
    title: '광견병 추가 백신',
    shortLabel: '추가 백신',
    description:
      '직전 광견병 백신의 면역 유효기간이 끝나기 전에 추가 접종을 하세요.\n\n유효기간 만료 전에 추가 접종을 하지 않으면, 1차 접종부터 다시 준비를 시작해야 해요.',
    doneSummary: '광견병 추가 백신을 접종했어요.',
    // 미래 만료 대비 reminder — 본 흐름의 다음 단계(사전 신고 등)를 다음 할 일에서 가리지 않는다.
    advisoryOnly: true,
    // 카드가 떴을 때(유효기간 만료·임박)의 안내 — 만료 여부로 두 문구를 분기한다.
    //  - 만료 전(validUntil ≥ 오늘): 만료일 + '만료 전에 추가 접종을 하세요' (마감 안내).
    //  - 만료 후(validUntil < 오늘): 만료일 + '추가 접종 기록을 입력하세요' (입력 요청).
    // 입력 시점은 무관하다(유효기간 내에 받은 접종을 늦게 입력하는 경우 포함). 만료 후 날짜의
    // 접종 입력 자체는 chain 검증(findRabiesChainBreak, client+server)이 입력 불가로 거부하고,
    // 이미 잘못 입력된 3차+ 기록은 procedure-check(jp.rabies-extra-within-previous-validity)가
    // '안내'로 표면화한다. valid_until 미입력 시 date + 1년 폴백(resolveValidUntil).
    // 미래(예정) 추가 접종은 저장 시 rabies_dates_scheduled 별도 자리로 분리 — 여기(실제 기록)엔
    // 오지 않고, 도래하면 예정 배지만 내려가 기본 상태로 돌아간다(재입력으로 완료. 예정→도래→재입력).
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
      // 이미 만료 — 추가 접종 기록 입력 요청. (만료 전 임박은 jp.rabies-validity-expires-soon 담당.)
      if (validUntil < today) {
        const msg = `직전 광견병 백신의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 접종 기록을 입력하세요. 추가 접종을 하지 못한 경우, 1차 접종부터 다시 준비하세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 오늘은 아직 유효하지만 입국일 전에 만료 — 이 step 이 미완료로 남는 실제 사유.
      // (has-extra-rabies done 룰이 "최신 유효기간 < 입국일" 이면 미완료로 잡는 것과 짝.)
      if (entry && validUntil < entry) {
        // 목적지 표기 — 일본·태국·EU 등 카드가 뜨는 모든 나라에서 그 나라 이름으로 안내.
        const token = buildCaseJourneyContext(caseRow).destinationToken
        const msg = `광견병 백신 면역 유효기간이 ${token ? `${token} ` : ''}입국 전에 만료돼요. ${formatKoreanDate(validUntil)}까지 추가 접종을 하세요.`
        return { desc: msg, cardDesc: msg }
      }
      return undefined
    },
    // 일본(2회 프라임 + 3차+) 전용 별도 카드. 1회 접종국은 광견병 백신 카드 하나에서
    // 추가 접종을 목록으로 입력하므로 이 카드를 쓰지 않는다(rabies-vaccine-1 단일 카드로 통합).
    applicability: {
      destinations: ['japan'],
      species: 'all',
      tripType: 'all',
    },
    // 추가 접종(일본 3차+/1회국 2차+) 입력됐거나 최근 접종 유효기간이 만료 임박·입국 전
    // 만료(추가 접종 필요)일 때 노출.
    appliesWhen: 'rabies-extra-applicable',
    order: 37,
    done: 'has-extra-rabies',
    allowAttachments: true,
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진·PDF로 보관하세요.',
    // 1·2차와 같은 라벨 — 보관함에서 광견병백신_3, _4 … 로 번호가 이어진다.
    attachmentLabel: '광견병백신',
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
      '일본 지정 검사기관에서 광견병 항체 검사를 받으세요.\n\n동물병원을 통해 의뢰할 수 있어요.\n0.5 IU/mL 이상이면 합격이에요.\n2차 접종 면역 유효기간 이내에 검사하세요.\n유효기간은 2년이에요.',
    doneSummary: '광견병 항체 검사를 받았어요.',
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
        'cyprus',
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
      // 입국엔 항체검사 불필요하나 한국 귀국 시 필수인 나라 — 왕복에만 노출(태국·필리핀 등).
      roundOnlyDestinations: ['thailand', 'philippines'],
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
      // 진행 중(채혈일 도래 + 결과 미입력) — 우측 '진행 중' 칩(scenario inProgress) + 이 문구.
      const msg = '광견병 항체 검사를 진행 중이에요. 결과가 나오면 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    inputs: [
      { key: 'rabies_titer_date', label: '채혈일', type: 'date' },
      { key: 'rabies_titer_lab', label: '검사기관', type: 'select' },
      { key: 'rabies_titer_value', label: '검사결과', type: 'text' },
    ],
    allowAttachments: true,
    attachmentHint: '검사결과지 사본을 사진·PDF로 보관하세요.',
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
      // 한국 귀국 항체검사 2년(왕복·비발생국 외) — 전 목적지 공통, 체크가 자체 게이트.
      'common.kr-return-titer-within-2years',
    ],
  },

  // ── 4-1. 광견병 항체 검사(추가) — 일본 한정, 2회 이상 있을 때만 노출 ─────
  {
    id: 'rabies-titer-extra',
    category: 'lab',
    title: '추가 검사',
    shortLabel: '항체+',
    description:
      '일본 입국 전에 추가 검사를 받으세요.\n\n검사 결과가 나올 때까지 수 주가 걸리는 점을 고려해 여유 있게 검사를 진행하세요.',
    doneSummary: '추가 광견병 항체 검사를 받았어요.',
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
        const msg = '일본 입국 전에 추가 검사를 받으세요.'
        return { desc: msg, cardDesc: msg }
      }
      const latest = [...prior].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = addYears(latest.date, 2)
      if (!validUntil) return undefined
      // 미래(예정) 채혈은 저장 시 rabies_titer_extra_scheduled 별도 자리로 분리 — 실제 기록에
      // 미래가 남은 옛 데이터만 이 가드에 걸린다(예정 배지는 scenario 가 표시).
      if (latest.date > today) return undefined
      // 유효기간이 입국일을 덮으면(아직 유효) — 안내 불필요.
      if (entry && validUntil >= entry) return undefined
      // 입국일 전 만료 — 재검사 필요.
      const msg = '직전 검사의 유효기간이 일본 입국 전에 만료돼요. 일본 입국 전에 추가 검사를 진행하세요.'
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    // 2회+ 입력됐거나 입국일+30일 안에 항체 검사 2년 만료(재검사 필요) 일 때 노출.
    appliesWhen: 'titer-extra-applicable',
    order: 41,
    done: 'has-extra-titer',
    allowAttachments: true,
    attachmentHint: '검사결과지 사본을 사진·PDF로 보관하세요.',
    // 본 항체검사와 같은 라벨 — 보관함에서 '광견병 항체 검사 결과지_2, _3 …' 으로 번호가 이어진다.
    attachmentLabel: '광견병 항체 검사 결과지',
    validationIds: ['jp.titer-validity-expires-soon', 'jp.titer-extra-within-rabies-validity'],
  },

  // ── 항공권 구매 (일본 전용) ──────────────────────────────────────────────
  {
    id: 'flight-purchase',
    category: 'logistics',
    title: '항공권 구매',
    shortLabel: '항공권',
    description:
      '입국 가능 시기에 맞춰 항공권을 구매하세요.\n\n채혈일로부터 180일 후 ~ 2년 사이에 입국할 수 있어요.\n사전 신고를 위해 입국 40일 전까지 항공권을 구매해야 해요. 여유 있게 두 달 전까지 구매하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
    doneSummary: '항공권을 구매했어요.',
    cardLine: '일본에 입국할 수 있어요.',
    // 왕복인데 출국 항공권만 입력되고 귀국 미입력 시 — '귀국 항공권 정보를 입력하세요.'
    // (has-flight-date done 시그널도 동일 조건으로 미완료 처리하여 다음 단계 진행 차단.)
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 출국편 입력 여부 — 도착일(entry_date) 또는 출발일(departure_date, 태국 등 별도 입력) 중 하나라도.
      const hasEntry =
        (typeof data.entry_date === 'string' && data.entry_date.length >= 10) ||
        (typeof caseRow.departure_date === 'string' && caseRow.departure_date.length >= 10)
      const hasReturn = typeof data.return_date === 'string' && data.return_date.length >= 10
      // '미정' 체크 시 안내를 숨긴다(체크 풀면 다시 노출) — 출국편만으로 완료 인정과 일치.
      const returnUndecided = data.return_undecided === '1'
      if (!hasEntry || hasReturn || returnUndecided) return undefined
      const ctx = buildCaseJourneyContext(caseRow)
      if (ctx.tripType !== 'round') return undefined
      const msg = '귀국 항공권 정보를 입력하세요.'
      return { desc: msg, cardDesc: msg }
    },
    // 일본 외 나라는 destination override 로 설명·검증을 그 나라 규정에 맞춰 교체(태국·필리핀·EU 등).
    applicability: {
      destinations: [
        'japan',
        'thailand',
        'philippines',
        'eu',
        'uk',
        'ireland',
        'malta',
        'norway',
        'finland',
        'switzerland',
        'cyprus',
      ],
      species: 'all',
      tripType: 'all',
    },
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
    attachmentHint: '구매한 항공권(e-티켓)을 사진·PDF로 보관하세요.',
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
      '일본 입국 40일 전까지 신고하세요.\n\nNACCS에서 신청하고 일본 동물검역소의 이메일 안내에 따르세요.\n절차가 완료되면 허가서(Approval)가 발급돼요.\n왕복 일정이면 일본 수출 검역 신청도 함께 하세요.',
    doneSummary: '일본 동물검역소에 사전 신고를 했어요.',
    cardLine: '일본 동물검역소에 사전 신고를 하세요.',
    // 진행 상태는 [[deriveAdvanceNotificationStatus]] 가 단일 출처 — admin 신고탭과 동일.
    // 두 분기:
    //  - skip O (명시적 첨부 없이 완료 처리): '첨부 없이 완료 처리됨' — done 이라 timeline 은
    //    doneSummary 로 가리고 detail 헤더에서만 보임. 보호자가 되돌릴 수 있도록 안내.
    //  - status 'in_progress' (신청일 입력 OR admin demote OR legacy stored 'in_progress'):
    //    '신청 완료, 허가서 대기' — done 아니라 timeline·detail 동시 노출.
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
      // titer 방식 — '진행 중' ack 버튼 게이트 없이 신청일 도래(in_progress)만으로 진행 중 안내.
      const msg = '사전 신고를 진행 중이에요. 허가서가 나오면 파일을 첨부하거나 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    applicability: { destinations: ['japan'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'entry', daysBefore: 40 },
    done: 'has-advance-notification',
    // 신청일만 입력된 in_progress 상태도 '입력됨'으로 본다 — 항공편 수정 시 어긋날 수 있어
    // 확인창에서 잡아야 한다. (done 시그널은 'done' 만 잡음 — 신청·예약은 in_progress 단계 존재.)
    hasInputData: (caseRow) => {
      const status = deriveAdvanceNotificationStatus(caseRow)
      if (status === 'done') return true
      if (status !== 'in_progress') return false
      // 미래(예정) 신청일은 '입력된 일정'으로 보지 않는다 — 앞 단계 수정 시 '이후 일정이 입력돼
      // 있어요' 확인창이 예정만으로 뜨지 않게. 도래(≤오늘)했을 때만 입력으로 인정.
      const d = (caseRow.data as Record<string, unknown> | undefined)?.advance_notification_date
      return typeof d === 'string' && d.length >= 10 && d.slice(0, 10) <= todayKst()
    },
    inputs: [{ key: 'advance_notification_date', label: '신청일', type: 'date' }],
    allowAttachments: true,
    attachmentHint: '허가서를 사진·PDF로 보관하세요.',
    attachmentLabel: '허가서(Approval)',
    links: [
      { url: 'https://webaps-prod.nac.naccs.jp/anau/anipas/AOWZ01/OWZ01W02O', label: 'NACCS 신청 페이지' },
      { url: '/guide/jp-quarantine-contacts', label: '일본 동물검역소 연락처' },
    ],
    validationIds: ['jp.advance-notification-40days-before-entry'],
  },

  // ── 사전 통지 (아일랜드 전용) ──────────────────────────────────────────
  // 비EU 국가에서 아일랜드 입국 시 도착 24시간 전까지 Advance Notice Portal 로 통지 +
  // 도착 시 검사(Compliance Check) 예약. 완료신호 'quarantine:<필드>' confirm 메커니즘 재사용
  // (통지일 입력 + 도래 + 저장 확인 = 완료).
  {
    id: 'ie-advance-notice',
    category: 'permit',
    title: '사전 통지',
    shortLabel: '통지',
    description:
      '아일랜드 입국 24시간 전까지 사전 통지를 하세요.\n\n아일랜드 농식품해양부의 사전 통지 포털(Advance Notice Portal)에서 양식을 제출해요.\n여행 1주일 전쯤 여유 있게 제출하는 것을 권장해요.',
    doneSummary: '아일랜드에 사전 통지를 했어요.',
    cardLine: '아일랜드에 사전 통지를 하세요.',
    applicability: { destinations: ['ireland'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'entry', daysBefore: 1 },
    done: 'quarantine:ie_advance_notice_date',
    inputs: [
      {
        key: 'ie_advance_notice_date',
        label: '통지일',
        type: 'date',
        helpText: '사전 통지 포털에 양식을 제출한 날짜',
      },
    ],
    links: [
      {
        url: 'http://www.pettravel.gov.ie/pets/dogscatsferrets/outsideeu/',
        label: '아일랜드 사전 통지 안내(공식)',
      },
    ],
    validationIds: ['eu.ie-advance-notice-24h-before-entry'],
  },

  // ── 사전 통지 (노르웨이 전용) ────────────────────────────────────────
  // 제3국(한국)에서 노르웨이 입국 시 도착 48시간 전까지 Mattilsynet(노르웨이 식품안전청)에
  // 이메일로 통지 + 지정 입국지점(오슬로 공항 또는 Storskog 국경)으로만 입국 가능.
  // 완료신호는 아일랜드와 동일한 confirm 메커니즘 재사용(통지일 입력 + 도래 + 저장 확인 = 완료).
  {
    id: 'no-advance-notice',
    category: 'permit',
    title: '사전 통지',
    shortLabel: '통지',
    description:
      '노르웨이 입국 48시간 전까지 사전 통지를 하세요.\n\n노르웨이 식품안전청(Mattilsynet)에 이메일로 도착 일정(날짜·시간·항공편명)을 알려요.\n반려동물은 오슬로 공항 또는 스토르스코그(Storskog) 국경으로만 입국할 수 있어요.\n여유 있게 며칠 전에 미리 통지하는 것을 권장해요.',
    doneSummary: '노르웨이에 사전 통지를 했어요.',
    cardLine: '노르웨이에 사전 통지를 하세요.',
    applicability: { destinations: ['norway'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'entry', daysBefore: 2 },
    done: 'quarantine:no_advance_notice_date',
    inputs: [
      {
        key: 'no_advance_notice_date',
        label: '통지일',
        type: 'date',
        helpText: 'Mattilsynet에 이메일로 통지한 날짜',
      },
    ],
    links: [
      {
        url: 'https://www.mattilsynet.no/en/animals/travelling-with-dogs-cats-and-ferrets-from-third-countries-and-territories-to-norway',
        label: '노르웨이 사전 통지 안내(공식)',
      },
    ],
    validationIds: ['eu.no-advance-notice-48h-before-entry'],
  },

  // ── 사전 통지 (키프로스 전용) ────────────────────────────────────────
  // 제3국에서 키프로스 입국 시 도착 48시간 전까지 관할 지구 수의검역국(라르나카/파포스)에
  // 이메일로 통지 — 별도 승인서 없이 통지만 하면 되는 단순형(아일랜드·노르웨이와 동일 모델).
  {
    id: 'cy-advance-notice',
    category: 'permit',
    title: '사전 통지',
    shortLabel: '통지',
    description:
      '키프로스 입국 48시간 전까지 사전 통지를 하세요.\n\n도착 공항의 관할 지구 수의검역국에 이메일로 도착 날짜·시간·항공편명을 알려요.\n라르나카(dvs.larnaca@vs.moa.gov.cy) 또는 파포스(dvs.paphos@vs.moa.gov.cy)로 보내세요.\n여유 있게 며칠 전에 미리 통지하는 것을 권장해요.',
    doneSummary: '키프로스에 사전 통지를 했어요.',
    cardLine: '키프로스에 사전 통지를 하세요.',
    applicability: { destinations: ['cyprus'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'entry', daysBefore: 2 },
    done: 'quarantine:cy_advance_notice_date',
    inputs: [
      {
        key: 'cy_advance_notice_date',
        label: '통지일',
        type: 'date',
        helpText: '지구 수의검역국에 이메일로 통지한 날짜',
      },
    ],
    links: [
      {
        url: 'https://www.moa.gov.cy/moa/vs/vs.nsf/vs07_en/vs07_en?OpenDocument=',
        label: '키프로스 사전 통지 안내(공식)',
      },
    ],
    validationIds: ['eu.cy-advance-notice-48h-before-entry'],
  },

  // ── 사전 통지 (몰타 전용) ──────────────────────────────────────────
  // 제3국에서 몰타 입국 시 도착 3영업일 전까지 온라인 포털(nldmalta.gov.mt)에 도착 정보를
  // 등록 + 별도로 담당 수의사에게 이메일로 항공편 정보를 알려 도착 시 검사관 대기.
  {
    id: 'mt-advance-notice',
    category: 'permit',
    title: '사전 통지',
    shortLabel: '통지',
    description:
      '몰타 입국 3영업일 전까지 사전 통지를 하세요.\n\n몰타 사전 통지 포털을 이용합니다.\n웹사이트 이용이 어려운 경우, 이메일(petstravel.msdec@gov.mt)로 문의를 할 수 있습니다.',
    doneSummary: '몰타에 사전 통지를 했어요.',
    cardLine: '몰타에 사전 통지를 하세요.',
    applicability: { destinations: ['malta'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'entry', daysBefore: 3 },
    done: 'quarantine:mt_advance_notice_date',
    inputs: [
      {
        key: 'mt_advance_notice_date',
        label: '통지일',
        type: 'date',
        helpText: '온라인 포털에 등록한 날짜',
      },
    ],
    links: [
      { url: 'https://nldmalta.gov.mt/MaltaPetArrivals/', label: '몰타 사전 통지 포털(공식)' },
    ],
    validationIds: ['eu.mt-advance-notice-3days-before-entry'],
  },

  // ── 사전 신고 다음 — 일본 수출 검역 (왕복 케이스 한정) ──────────────
  {
    id: 'jp-export-quarantine',
    category: 'permit',
    title: '일본 수출 검역 신청',
    shortLabel: '수출',
    description:
      '일본 동물검역소에 수출 검역 신청과 예약을 하세요.\n\n수출 검역은 일본에서 한국으로 돌아오기 전에 받아야 하는 필수 절차로, 최소 10일 전까지 신청·예약해야 해요.\nNACCS에서 신청하고 일본 동물검역소의 이메일 안내에 따르세요.\n예약은 이메일로만 가능해요. 방문 예정 동물검역소에 이메일로 문의하세요.',
    doneSummary: '일본 수출 검역 신청·예약을 완료했어요.',
    applicability: { destinations: ['japan'], species: 'all', tripType: 'round' },
    order: 48,
    // 마감 없음 — 예약 기준일이 검역소 방문일(= 예약일, 사용자 입력)이라 고정 앵커가 없다.
    // 귀국편 절차라 후속(출국 전 임상검사 등)을 막지 않는다 — 동시에 '다음 할 일' 노출.
    nonBlocking: true,
    done: 'has-jp-export-quarantine',
    // 신청·예약이 in_progress 인 상태도 '입력됨'으로 본다 (사전 신고와 동일 패턴).
    hasInputData: (caseRow) => {
      const status = deriveJpExportQuarantineStatus(caseRow)
      if (status === 'done') return true
      if (status !== 'in_progress') return false
      // 미래(예정) 신청일은 '입력된 일정'으로 보지 않는다 (사전 신고와 동일).
      const d = (caseRow.data as Record<string, unknown> | undefined)?.jp_export_quarantine_application_date
      return typeof d === 'string' && d.length >= 10 && d.slice(0, 10) <= todayKst()
    },
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
      // titer 방식 — '진행 중' ack 버튼 게이트 없이 신청일 도래(in_progress)만으로 진행 중 안내.
      // 예약일·시간은 '희망' 데이터일 뿐 완료 판정에 영향 없음 — 보호자가 '완료' 버튼을 직접
      // 눌러야 step 이 done. 사전 신고와 동일 모델.
      // 예약 일정 안내는 방문 step([[jp-export-quarantine-visit]])이 맡고, 여기는 진행 중 안내만.
      const msg = '일본 수출 검역 신청·예약이 진행 중이에요. 예약이 확정되면 완료 버튼을 누르세요.'
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
    title: '종합백신',
    shortLabel: '종합',
    description:
      '강아지는 DHPP(C), 고양이는 FVRCP를 접종하세요. 출국 시점에 유효기간이 남아있어야 해요.',
    doneSummary: '종합백신을 접종했어요.',
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
    // 광견병 백신과 순서 의존 없음 — 마이크로칩 이후 둘 다 동시에 '다음 할 일'.
    concurrent: true,
    // 광견병 추가 백신과 동일 — 최근 접종 유효기간이 입국 전 만료되면 추가 접종 안내.
    // (만료 여부로 문구 분기. 종합백신은 한 카드 안 목록이라 별도 추가 카드 없이 같은 카드에서
    // 추가 입력 — done(has-general-vaccine)이 만료 시 미완료로 잡는 것과 짝.)
    situational: (caseRow) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) return undefined
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const latest = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      const today = todayKst()
      // 미래(예정) 접종만 있으면 기본 안내로 둔다(날짜는 일정 칩에만).
      if (latest.date > today) return undefined
      // 만료/입국전 만료는 advisory(별도 안내 카드) — 도래 완료확인은 '다음 할 일' 유지.
      if (validUntil && validUntil < today) {
        const msg = `직전 종합백신의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 접종 기록을 입력하세요.`
        return { desc: msg, cardDesc: msg, advisory: true }
      }
      if (entry && validUntil && validUntil < entry) {
        const token = buildCaseJourneyContext(caseRow).destinationToken
        const msg = `종합백신 면역 유효기간이 ${token ? `${token} ` : ''}입국 전에 만료돼요. ${formatKoreanDate(validUntil)}까지 추가 접종을 하세요.`
        return { desc: msg, cardDesc: msg, advisory: true }
      }
      // 만료 임박(오늘 기준 30일 이내) — 여행 미예약(!entry)일 때만 추가 접종 준비를 알린다.
      // 광견병 카드와 동일 모델(has-general-vaccine 의 임박 미완료 조건과 짝, 예약된 여행이
      // 유효기간 내면 오경보 방지).
      if (!entry && validUntil && validUntil >= today && validUntil < addDays(today, 30)) {
        const msg = `직전 종합백신의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료돼요. 유효기간이 끝나기 전에 추가 접종을 하세요.`
        return { desc: msg, cardDesc: msg, advisory: true }
      }
      // 만료·임박 아님 — 안내 없음. 미래(예정) 회차는 general_vaccine_dates_scheduled 별도
      // 자리라 여기엔 실제(≤오늘) 기록만 오고, 도래한 실제 기록은 done 으로 완료 처리된다.
      return undefined
    },
    inputs: [
      { key: 'general_vaccine_dates', label: '접종일', type: 'date_array', hasValidUntil: true },
    ],
    allowAttachments: true,
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진·PDF로 보관하세요.',
    attachmentLabel: '종합백신',
  },

  // ── 6. 독감(CIV) — 강아지만 ─────────────────────────────────────────────
  {
    id: 'civ-vaccine',
    category: 'vaccination',
    title: '독감(CIV) 백신',
    shortLabel: '독감',
    description: '강아지 인플루엔자(CIV) 백신을 접종하세요. 호주·뉴질랜드·인도 등 일부 국가에서 요구돼요.',
    doneSummary: '독감(CIV) 백신을 접종했어요.',
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
      '인증 실험실에서 전염병 검사를 받아 음성을 확인하세요. 호주(Brucella/Leptospira/Leishmania 등)·뉴질랜드·남아프리카공화국에서 요구돼요.',
    doneSummary: '전염병 검사를 받았어요.',
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
      '출국 직전에 진드기·벼룩 처치를 받으세요. 호주·뉴질랜드 등에서 요구돼요.',
    doneSummary: '외부구충 처치를 받았어요.',
    // EU 패밀리(영국·아일랜드·몰타·노르웨이·핀란드)는 외부구충 요건이 없어 제외 —
    // EU 요건은 촌충(에키노코쿠스, echinococcus-treatment 카드)뿐.
    // 필리핀도 제외 — 발급 SPSIC import terms 7항상 외부구충은 "recommended but optional"
    // (내부구충만 필수). 내부구충 카드만 유지. (확인: 2026-06-16 실제 SPSIC 원본)
    applicability: {
      destinations: [
        'australia',
        'new_zealand',
        'turkey',
        'mexico',
        'brazil',
        'uae',
        'hawaii',
        'guam',
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
    attachmentHint: '증명서, 수첩 등을 사진·PDF로 보관하세요.',
    attachmentLabel: '기생충 치료',
  },

  // ── 9. 내부구충 ────────────────────────────────────────────────────────
  {
    id: 'internal-parasite',
    category: 'preparation',
    title: '내부 기생충 치료',
    shortLabel: '내부',
    description:
      '내부 기생충 치료를 하세요. 호주·뉴질랜드·필리핀 등에서 요구돼요.',
    doneSummary: '내부 기생충 치료를 했어요.',
    // EU 촌충 5국(영국·아일랜드·몰타·노르웨이·핀란드)은 강아지 한정·시점(24~120시간)이 달라
    // 별도 카드(echinococcus-treatment)로 분리 — 같은 데이터 키(internal_parasite_dates) 공유.
    applicability: {
      destinations: [
        'australia',
        'new_zealand',
        'turkey',
        'philippines',
      ],
      species: 'all',
      tripType: 'all',
    },
    order: 90,
    done: 'has-internal-parasite',
    inputs: [
      { key: 'internal_parasite_dates', label: '투약일', type: 'date_array' },
    ],
    allowAttachments: true,
    attachmentHint: '증명서, 수첩 등을 사진·PDF로 보관하세요.',
    // 외부구충과 같은 라벨 — 보관함에서 '기생충 치료_2, _3 …' 으로 번호가 이어진다.
    attachmentLabel: '기생충 치료',
  },

  // ── 촌충 치료 (에키노코쿠스) — 영국·아일랜드·몰타·노르웨이·핀란드, 강아지 한정 ─────
  // EU Reg 2018/772. 입국 24~120시간(1~5일) 전 프라지콴텔 투여 — 검증은 보수적으로 1~3일
  // (eu.tapeworm-1to3days-before-entry). 데이터 키는 internal_parasite_dates 공유(admin 정합).
  // 출국 전 임상검사(vet-visit, order 110) 앞에 배치 — 치료 사실이 임상검사 때 확인·기록된다.
  // 마감 기준일은 목적지 입국일(entry_date) — 규정 자체가 "입국 전" 기준이라 한국 출국일과는
  // 다른 날일 수 있다(2026-07-16 출국일/입국일 분리 이후).
  {
    id: 'echinococcus-treatment',
    category: 'preparation',
    title: '촌충 치료',
    shortLabel: '촌충',
    description:
      '촌충(에키노코쿠스) 치료를 받으세요.\n\n입국 전 24~120시간(1~5일) 사이에 수의사에게 프라지콴텔 성분의 구충제를 투여받으세요.\n항공 이동 시간을 고려해 출국 1~3일 전 사이를 권장해요.\n건강증명서에 치료 내용과 일시를 기록해야 해요.',
    doneSummary: '촌충 치료를 받았어요.',
    cardLine: '촌충(에키노코쿠스) 치료를 받으세요.',
    applicability: {
      destinations: ['uk', 'ireland', 'malta', 'norway', 'finland'],
      species: 'dog',
      tripType: 'all',
    },
    order: 105,
    deadline: { anchor: 'entry', daysBefore: 3, window: true },
    done: 'has-internal-parasite',
    inputs: [
      { key: 'internal_parasite_dates', label: '치료일', type: 'date_array' },
    ],
    allowAttachments: true,
    attachmentHint: '치료 기록(증명서·수첩)을 사진·PDF로 보관하세요.',
    // 내부·외부구충과 같은 라벨 — 보관함에서 '기생충 치료_N' 으로 번호가 이어진다.
    attachmentLabel: '기생충 치료',
    validationIds: ['eu.tapeworm-1to3days-before-entry'],
  },

  // ── 10. 수입허가 ───────────────────────────────────────────────────────
  // 신청 → 허가증 2단계 (사전 신고와 동일 모델). 진행 상태는 [[deriveImportPermitStatus]]
  // 가 단일 출처 — 신청일 입력 = in_progress, 허가번호·첨부·'완료' = done.
  // 옛 manual-flag(journey_flags['import-permit-issued'])도 derive 가 done 으로 인정(하위 호환).
  {
    id: 'import-permit',
    category: 'permit',
    title: '수입 허가 신청',
    shortLabel: '허가',
    description:
      '도착 전에 수입허가를 신청하세요. 호주(DAFF)·뉴질랜드(MPI)·대만(APHIA)·말레이시아(DVS) 등에서 필요하며, 허가번호가 검역증에 명시되어야 해요.',
    doneSummary: '수입 허가를 받았어요.',
    cardLine: '수입 허가를 신청하세요.',
    applicability: {
      destinations: ['australia', 'new_zealand', 'taiwan', 'malaysia', 'thailand', 'philippines', 'switzerland'],
      species: 'all',
      tripType: 'all',
    },
    order: 100,
    deadline: { anchor: 'departure', daysBefore: 30 },
    done: 'has-import-permit',
    // 신청일만 입력된 in_progress 상태도 '입력됨'으로 본다 (사전 신고와 동일 패턴).
    hasInputData: (caseRow) => deriveImportPermitStatus(caseRow) !== 'not_started',
    // 신청 완료(in_progress) → '허가증 대기' 안내. 미래 신청일(예정)·완료 상태에선 숨김.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 신청일이 미래(=예정)이면 안내 노출 안 함 — 사전 신고와 동일 패턴.
      const filed =
        typeof data.import_permit_application_date === 'string'
          ? data.import_permit_application_date
          : ''
      if (filed.length >= 10 && filed > todayKst()) return undefined
      if (deriveImportPermitStatus(caseRow) !== 'in_progress') return undefined
      // titer 방식 — '진행 중' ack 버튼 게이트 없이 신청일 도래(in_progress)만으로 진행 중 안내(사전 신고와 동일).
      const msg =
        '수입 허가 신청을 진행 중이에요. 허가증이 나오면 파일을 첨부하거나 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    inputs: [
      { key: 'import_permit_application_date', label: '신청일', type: 'date' },
      { key: 'permit_no', label: '허가 번호', type: 'text' },
    ],
    allowAttachments: true,
    attachmentHint: '수입 허가증을 사진·PDF로 보관하세요.',
    attachmentLabel: '수입 허가증',
  },

  // ── 11. 내원 — 수의사 검진 ──────────────────────────────────────────────
  {
    id: 'vet-visit',
    category: 'document',
    title: '출국 전 임상검사',
    shortLabel: '내원',
    description:
      '출국일 기준 10일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
    doneSummary: '출국 전 임상검사를 받았어요.',
    cardLine: '임상 수의사의 검진을 받으세요.',
    // 다른 백신·검사·구충과 동일한 dated-confirm 모델 — situational 안내 없이 검진일만으로
    // 완료 판정(done-resolver has-vet-visit). 미래=예정 배지, 도래 후 완료. 서류 준비 현황은
    // 별도 단계(document-checklist)로 분리됐다.
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 110,
    deadline: { anchor: 'departure', daysBefore: 9, window: true },
    done: 'has-vet-visit',
    inputs: [
      { key: 'vet_visit_date', label: '검진일', type: 'date' },
    ],
    validationIds: ['common.vet-visit-date-valid'],
  },

  // ── 11-1. 서류 체크리스트 ────────────────────────────────────────────────
  // 출국 전 임상검사에서 분리. 타임라인 행을 누르면 서류 페이지(/docs)로 이동해 거기서
  // 큐레이션된 필수 서류를 검토·완료하고, 모두 ✓(보유/해당없음)되면 자동 완료된다.
  // 완료 신호 all-required-docs 의 cutoff 가 이 단계(order 115)라, 한국 수출 동물검역증
  // (검역소 방문 때 발급, order 120)은 게이트에서 제외된다. 모든 목적지는 최소 별지25호를
  // 갖는다(required-docs DEFAULT_SPECS) — '서류 목록 없음' 케이스는 없다.
  {
    id: 'document-checklist',
    category: 'document',
    title: '서류 체크리스트',
    shortLabel: '서류',
    description:
      '검역에 필요한 서류가 모두 준비됐는지 확인하세요.\n\n각 서류를 눌러 보유 여부를 확인하고, 발급받은 서류는 사본을 저장해두세요.\n\n필수 서류가 모두 준비되어야 동물검역소를 방문할 수 있어요.',
    doneSummary: '검역에 필요한 서류를 모두 준비했어요.',
    cardLine: '검역에 필요한 서류가 모두 준비됐는지 확인하세요.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 115,
    done: 'all-required-docs',
  },

  // ── 12. 한국 수출 검역 ────────────────────────────────────────────
  {
    id: 'certificate-issue',
    category: 'document',
    title: '한국 수출 검역',
    shortLabel: '검역소',
    description:
      '출국일 기준 10일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.',
    doneSummary: '한국 수출 검역을 받았어요.',
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
    attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
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
      '공항 검역대 → 항공 탑승 → 도착지 검역소 입국 심사 순서로 진행하세요. 도착 후 일부 국가는 7~10일 자가 격리 또는 검역소 격리가 적용돼요.',
    doneSummary: '출국했어요.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 140,
    deadline: { anchor: 'departure', daysBefore: 0 },
    done: 'departure-past',
    // base departure 는 첨부 불가 — 일본 override(일본 수입 검역)만 allowAttachments.
    // 첨부 명명은 base catalog 의 attachmentLabel 을 읽으므로 여기 둔다 (일본에서만 효과).
    attachmentLabel: 'Import Quarantine Certificate',
    // 일본 override 가 jp_import_quarantine_date 입력으로 사용 — 이 룰은 non-JP 케이스에선
    // country: 'japan' 필터로 자동 비활성.
    validationIds: ['jp.import-quarantine-date-valid'],
  },

  // ── 14. 일본 수출 검역 (왕복 케이스 한정 — 귀국편) ──────────────────
  {
    id: 'jp-export-quarantine-visit',
    category: 'document',
    title: '일본 수출 검역',
    shortLabel: '검역',
    description:
      '일본 출국 전 동물검역소를 방문해 수출 검역을 받으세요.\n반려동물을 데리고 예약한 일정에 방문하세요.\n일본 수출 동물검역증(Export Quarantine Certificate)은 향후 일본에 재입국하게 되면 필요할 수 있으니 잘 보관해두세요.',
    doneSummary: '일본 수출 검역을 받았어요.',
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
    attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: 'Export Quarantine Certificate',
  },

  // ── 태국 수출 검역 (왕복 — 귀국 출국 시, 태국 전용) ───────────────────
  // 태국 축산국(DLD) 출국 검역. 일본의 수출검역(검역소 방문)에 대응하는 태국판 — 나라별 단계.
  // 완료신호 'quarantine:<필드>' 로 도착 수입검역과 같은 confirm 메커니즘 재사용(검역일+완료).
  {
    id: 'th-export-quarantine',
    category: 'document',
    title: '태국 수출 검역',
    shortLabel: '수출',
    description:
      '출국 전 공항 동물검역소에서 수출 검역을 받으세요.\n출국 직전(1~3일 전 권장)에 방문하세요. 주말·공휴일·야간에는 검역을 받을 수 없어요.\n접종 증명서를 꼭 챙기세요.\n검사를 통과하면 수출허가서(R.9)와 건강증명서가 발급돼요. 한국 입국 때 이 서류가 반드시 필요해요.',
    doneSummary: '태국 수출 검역을 받았어요.',
    cardLine: '태국 동물검역소에서 수출 검역을 받으세요.',
    applicability: { destinations: ['thailand'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'quarantine:th_export_quarantine_date',
    // 입력 후 항공편 수정으로 어긋난 검역일(태국 입국일 이전·귀국일 이후)을 '주의'로 표면화.
    validationIds: ['th.export-quarantine-date-valid'],
    inputs: [
      {
        key: 'th_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '태국 동물검역소에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '수출허가서(R.9)·건강증명서 사본을 사진·PDF로 보관하세요.',
  },

  // ── 귀국 서류 준비 (왕복 — 귀국 전, EU 패밀리 전용) ─────────────
  // EU 는 일본·태국 같은 '수출검역소 방문(검역)' 제도가 없다 — 한국 재입국엔 출발국 정부가
  // 인증한 한국 입국용 '건강증명서'가 필요(기본). 예외로 ① EU 반려동물 여권(EU 거주자 한정)
  // ② 한국 출국 시 받은 대한민국 수출 검역증명서(마이크로칩 + 광견병 항체 24개월 이내)로 대체
  // 가능. (검역 절차가 없어 '검역증명서'가 아닌 '건강증명서'가 정확.) 완료신호 quarantine: 재사용.
  // 필드는 패밀리 공용(eu_export_quarantine_date) — by_dest 스코핑이 목적지별 분리 보장.
  {
    id: 'eu-export-cert',
    category: 'document',
    title: '귀국 서류 준비',
    shortLabel: '귀국서류',
    description:
      '한국에 다시 입국하려면 출발하는 나라의 정부가 인증한 한국 입국용 건강증명서가 필요해요.\n현지 동물병원에서 작성한 뒤, 그 나라 관할 당국(공무 수의사)의 인증을 받으세요. 발급 기관·절차는 나라마다 다르니 미리 확인하세요.\n마이크로칩 번호와 광견병 항체 검사 결과(0.5 IU/㎖ 이상, 채혈 24개월 이내)가 기재돼야 해요.\n\n다음 경우엔 새로 발급받지 않아도 돼요.\nEU 반려동물 여권으로 대신할 수 있어요. (단, EU 여권은 EU 거주자만 발급 가능)\n한국 출국 때 받은 대한민국 수출 검역증명서로 대신할 수 있어요. (마이크로칩 번호가 있고, 광견병 항체 채혈일로부터 24개월 이내여야 해요.)',
    doneSummary: '귀국 서류를 준비했어요.',
    cardLine: '귀국 서류를 준비하세요.',
    applicability: {
      destinations: ['eu', 'uk', 'ireland', 'malta', 'norway', 'finland', 'switzerland', 'cyprus'],
      species: 'all',
      tripType: 'round',
    },
    order: 155,
    done: 'quarantine:eu_export_quarantine_date',
    validationIds: ['eu.export-cert-date-valid'],
    inputs: [
      {
        key: 'eu_export_quarantine_date',
        label: '준비 완료일',
        type: 'date',
        helpText: '한국 입국용 서류를 모두 준비한 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '건강증명서·EU 반려동물 여권 등 서류 사본을 사진·PDF로 보관하세요.',
  },

  // ── 필리핀 현지 동물병원 방문 (왕복 — 귀국 출국 전, BAI 수출검역 신청용 건강증명서 발급) ──
  // 태국과 달리 BAI 수출검역을 바로 받지 못하고, 먼저 현지 수의사 임상검진·건강증명서가 필요.
  // dated-confirm(quarantine:<필드>) 모델 재사용 — 방문일 입력 + 보호자 완료 확인.
  {
    id: 'ph-local-vet-visit',
    category: 'document',
    title: '현지 동물병원 방문',
    shortLabel: '현지검진',
    description:
      '필리핀 출국 전 현지 동물병원을 방문해 임상 검진을 받고 건강증명서를 발급받으세요.\n이 건강증명서가 있어야 BAI 동물검역소에서 수출 검역을 받을 수 있어요.\nBAI 동물검역 방문 직전에 받아야 해요. (3일 이내 권장)',
    doneSummary: '현지 동물병원에서 검진·건강증명서를 받았어요.',
    cardLine: '필리핀 현지 동물병원에서 검진·건강증명서를 받으세요.',
    applicability: { destinations: ['philippines'], species: 'all', tripType: 'round' },
    order: 150,
    done: 'quarantine:ph_local_vet_visit_date',
    inputs: [
      {
        key: 'ph_local_vet_visit_date',
        label: '방문일',
        type: 'date',
        helpText: '현지 동물병원에서 검진받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '건강증명서 사본을 사진·PDF로 보관하세요.',
  },

  // ── 필리핀 수출 검역 (왕복 — 귀국 출국 시, 필리핀 전용) ───────────────
  // 태국 수출검역과 동일 모델 — 완료신호 'quarantine:<필드>' confirm 메커니즘 재사용.
  // 현지 건강증명서는 직전 단계(ph-local-vet-visit)에서 발급 — 여기선 그 서류로 BAI 검역.
  {
    id: 'ph-export-quarantine',
    category: 'document',
    title: '필리핀 수출 검역',
    shortLabel: '수출',
    description:
      '필리핀 출국 전 BAI 동물검역소에서 수출 검역을 받으세요.\n현지 동물병원에서 받은 건강증명서가 있어야 해요.\n수출 허가증·국제 수의건강증명서가 발급돼요.',
    doneSummary: '필리핀 수출 검역을 받았어요.',
    cardLine: '필리핀 BAI 동물검역소에서 수출 검역을 받으세요.',
    applicability: { destinations: ['philippines'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'quarantine:ph_export_quarantine_date',
    validationIds: ['ph.export-quarantine-date-valid'],
    inputs: [
      {
        key: 'ph_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '필리핀 BAI 동물검역소에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '수출 허가증·국제 수의건강증명서 사본을 사진·PDF로 보관하세요.',
  },

  // ── 15. 한국 수입 검역 (왕복 케이스 한정 — 귀국 후) ─────────────────
  {
    id: 'kr-import-quarantine',
    category: 'document',
    title: '한국 수입 검역',
    shortLabel: '수입',
    description:
      '한국 도착 후 공항 동물검역소에서 수입 검역을 받으세요.',
    doneSummary: '한국 수입 검역을 받았어요.',
    cardLine: '한국 공항 동물검역소에서 수입 검역을 받으세요.',
    // 모든 나라 왕복의 공통 마지막 — 귀국 후 한국 공항 검역. (일본 전용 → 전 목적지 왕복 공통)
    applicability: { destinations: 'all', species: 'all', tripType: 'round' },
    order: 160,
    done: 'has-kr-import-quarantine',
    inputs: [
      { key: 'kr_import_quarantine_date', label: '검역일', type: 'date' },
    ],
    validationIds: ['common.kr-import-quarantine-date-valid'],
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
  },

  // ── 16. 도착 완료 — 여정 마무리 마일스톤 ───────────────────────────────
  // 옛 'journey-complete' 마커 step 은 제거됨 — 여정 완료는 타임라인의 별도 행이 아니라
  // 마지막 절차(편도=일본 수입 / 왕복=한국 수입)가 끝나면 일정 화면 '다음 할 일' 위치에
  // 완료 배너로 노출한다 (scenario.ts journeyComplete + timeline-calm). 완료 시그널은
  // done-resolver 의 'has-arrived' (trip-type 으로 분기) 를 그대로 사용.
]

/**
 * 운영자→고객 전달 서류(허가 서류) 목록 — 활성 목적지 기준.
 * catalog 에서 category='permit' + 첨부 허용(attachmentLabel 있음) 스텝을 파생한다.
 * 단일 출처(catalog)라 새 목적지·허가 서류가 catalog 에 추가되면 자동으로 따라온다.
 * 반환: { stepId(고객앱 여정 스텝과 연결되는 통로), label(첨부 행·파일명 라벨) }.
 */
export function permitDeliverablesForDestination(
  destination: string | null | undefined,
): Array<{ stepId: string; label: string }> {
  if (!destination) return []
  const out: Array<{ stepId: string; label: string }> = []
  for (const s of JOURNEY_STEP_CATALOG) {
    if (s.category !== 'permit') continue
    if (!s.allowAttachments || !s.attachmentLabel) continue
    const dests = s.applicability?.destinations
    if (!Array.isArray(dests)) continue
    if (dests.some((k) => matchesDestinationKey(destination, k))) {
      out.push({ stepId: s.id, label: s.attachmentLabel })
    }
  }
  return out
}
