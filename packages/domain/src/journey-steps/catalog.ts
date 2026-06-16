import {
  addDays,
  addYears,
  readCivEntries,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readInfectiousDiseaseEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  todayKst,
} from '../procedure-checks/utils'
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

/**
 * 백신·검사·구충 카드(예정→도래→완료확인 모델)의 당일/지남 안내 문구.
 *  - 미입력·미래(예정): undefined → 기본 cardLine 유지(날짜는 일정 칩에만, "X일 예정" 텍스트 없음).
 *  - 당일(latest == 오늘): "오늘은 {항목} 예정일입니다. {동사} 후 완료 버튼을 눌러주세요."
 *  - 지남(latest < 오늘): "{항목} 예정일이 지났습니다. 완료 버튼을 누르시거나 예정일을 변경해주세요."
 * confirm 플래그가 true(=완료)면 호출 측에서 미리 걸러 done 으로 처리하므로 여기선 날짜만 본다.
 * variant 'titer' = 결과 입력 단계라 "결과를 입력하거나 완료 버튼을…" 변형.
 */
function datedCardSituational(
  latestDate: string | null,
  item: string,
  verb: string,
  variant?: 'titer',
): { desc: string; cardDesc: string } | undefined {
  if (!latestDate || latestDate.length < 10) return undefined
  const today = todayKst()
  if (latestDate > today) return undefined // 미래(예정) — 기본 안내 유지
  // 일반 단계는 예정일이 도래/지나도 안내 문구를 띄우지 않는다 — 미래는 예정 배지뿐,
  // 도래·지남은 무문구(원래 상태). 완료는 보호자가 실제 날짜로 저장할 때만 일어난다.
  // titer(검사→결과 2단계)만 '결과를 입력하거나 완료' 안내를 유지한다(특수 단계).
  if (variant !== 'titer') return undefined
  const completeClause =
    variant === 'titer' ? '결과를 입력하거나 완료 버튼을 눌러주세요' : `${verb} 후 완료 버튼을 눌러주세요`
  const passedClause =
    variant === 'titer'
      ? '결과를 입력하거나 완료 버튼을 누르시거나 예정일을 변경해주세요'
      : '완료 버튼을 누르시거나 예정일을 변경해주세요'
  const msg =
    latestDate === today
      ? `오늘은 ${item} 예정일이에요. ${completeClause}.`
      : `${item} 예정일이 지났어요. ${passedClause}.`
  return { desc: msg, cardDesc: msg }
}

/** date_array 카드의 가장 늦은 입력일(없으면 null) — situational/표시용. */
function latestDateOfData(caseRow: CaseRow, reader: (c: CaseRow) => Array<{ date: string }>): string | null {
  const ds = reader(caseRow)
    .map((e) => e.date)
    .filter((d) => typeof d === 'string' && d.length >= 10)
  return ds.length ? ds.slice().sort().slice(-1)[0] : null
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
      // 둘 다 있음 — 도래 완료확인(당일/지남). 미래(예정)·확인됨이면 기본 안내.
      if (data.microchip_confirmed === true) return undefined
      return datedCardSituational(implant, '마이크로칩 삽입', '삽입')
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
      // 2회국(일본·하와이) — 1차(r[0]) 도래/지남 완료확인 안내.
      if (!isSingleDoseRabiesCase(caseRow)) {
        if (data.rabies_1_confirmed === true) return undefined
        return datedCardSituational(r[0]?.date ?? null, '1차 광견병 백신', '접종')
      }
      // 1회 접종국 단일카드 — 유효기간 만료 분기 먼저, 아니면 도래 완료확인.
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
      // 1회국 단일카드 완료확인 — 별도 키(rabies_single_confirmed). 2회국 1차(rabies_1_confirmed)와 분리.
      if (data.rabies_single_confirmed === true) return undefined
      return datedCardSituational(latest.date, '광견병 백신', '접종')
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
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진, PDF로 보관하세요.',
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
    // 2차(r[1]) 도래/지남 완료확인 안내(예정→도래→완료 모델).
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.rabies_2_confirmed === true) return undefined
      const r = readRabiesEntries(caseRow)
      return datedCardSituational(r[1]?.date ?? null, '2차 광견병 백신', '접종')
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
      // 당일 — 도래, 완료 버튼 안내. (미래 예정은 기본 안내 + 일정 '예정' 칩 — "X일 예정" 텍스트 제거.)
      if (latest.date === today && (!entry || validUntil >= entry)) {
        const msg = '오늘은 광견병 추가 백신 예정일이에요. 접종 후 완료 버튼을 눌러주세요.'
        return { desc: msg, cardDesc: msg }
      }
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
      // 예정일이 지났는데(다음날부터 — 당일 제외) 아직 '저장'으로 확인 전 — 저장으로 완료 안내.
      // 당일(예정일 == 오늘)엔 '지났다'가 부정확하므로 기본 안내문으로 둔다(검역 5단계와 동일).
      if (latest.date < today && data.rabies_extra_confirmed === false) {
        const msg = '광견병 추가 백신 예정일이 지났어요. 완료 버튼을 누르시거나 예정일을 변경해주세요. 접종하지 못한 경우 1차 접종부터 다시 준비하세요.'
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
      // 예정(미래) 추가 검사 — 도래 후 '저장' 확인으로 완료. 입국일을 덮는(또는 입국일 미정)
      // 예약이면 예약 안내. advisory step 이라 일정·상세가 모두 이 situational 을 안내문으로
      // 쓰므로, undefined 면 일정은 정적 요약으로 fallback 되고 상세엔 안내 박스가 사라져 어긋난다.
      // (추가 백신 situational 과 동일 패턴.)
      // 당일 — 도래, 완료 버튼 안내.
      if (latest.date === today && (!entry || validUntil >= entry)) {
        const msg = '오늘은 추가 검사 예정일이에요. 검사 후 완료 버튼을 눌러주세요.'
        return { desc: msg, cardDesc: msg }
      }
      // 미래(예정) — 기본 안내 + 일정 '예정' 칩 ("X일 예정" 텍스트 제거).
      if (latest.date > today) return undefined
      // 유효기간이 입국일을 덮으면(아직 유효) — 도래·미확인이면 저장 안내, 아니면 안내 불필요.
      if (entry && validUntil >= entry) {
        // 예정일 다음날부터(당일 제외) — 당일엔 '지났다'가 부정확하므로 기본 안내문으로 둔다.
        if (latest.date < today && data.titer_extra_confirmed === false) {
          const msg = '추가 검사 예정일이 지났어요. 추가 검사를 하셨다면 완료 버튼을 눌러주세요.'
          return { desc: msg, cardDesc: msg }
        }
        return undefined
      }
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
      '일본 입국 40일 전까지 신고하세요.\n\nNACCS에서 신청하고 일본 동물검역소의 이메일 안내에 따르세요.\n절차가 완료되면 허가서(Approval)가 발급돼요.\n왕복 일정이면 일본 수출 동물검역 신청도 함께 하세요.',
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
    attachmentHint: '허가서를 사진, PDF로 보관하세요.',
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
      '아일랜드 입국 24시간 전까지 사전 통지를 하세요.\n\n아일랜드 농식품해양부의 사전 통지 포털(Advance Notice Portal)에서 양식을 제출해요.\n제출 후 이메일 안내에 따라 도착 시 검사(Compliance Check) 안내를 확인하세요.\n여행 1주일 전쯤 여유 있게 제출하는 것을 권장해요.',
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
    allowAttachments: true,
    attachmentHint: '제출 확인·안내 이메일을 사진, PDF로 보관하세요.',
    links: [
      {
        url: 'http://www.pettravel.gov.ie/pets/dogscatsferrets/outsideeu/',
        label: '아일랜드 사전 통지 안내(공식)',
      },
    ],
    validationIds: ['eu.ie-advance-notice-24h-before-entry'],
  },

  // ── 사전 신고 다음 — 일본 수출 동물검역 (왕복 케이스 한정) ──────────────
  {
    id: 'jp-export-quarantine',
    category: 'permit',
    title: '일본 수출 동물검역 신청',
    shortLabel: '수출',
    description:
      '일본 동물검역소에 수출 동물검역 신청과 예약을 하세요.\n\n수출 동물검역은 일본에서 한국으로 돌아오기 전에 받아야 하는 필수 절차로, 최소 10일 전까지 신청·예약해야 해요.\nNACCS에서 신청하고 일본 동물검역소의 이메일 안내에 따르세요.\n예약은 이메일로만 가능해요. 방문 예정 동물검역소에 이메일로 문의하세요.',
    doneSummary: '일본 수출 동물검역 신청·예약을 완료했어요.',
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
      const msg = '일본 수출 동물검역 신청·예약이 진행 중이에요. 예약이 확정되면 완료 버튼을 누르세요.'
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
      // 만료 아님 + 도래 + 미확인 → 당일/지남 완료확인 안내.
      if (data.general_vaccine_confirmed === true) return undefined
      return datedCardSituational(latest.date, '종합백신', '접종')
    },
    inputs: [
      { key: 'general_vaccine_dates', label: '접종일', type: 'date_array', hasValidUntil: true },
    ],
    allowAttachments: true,
    attachmentHint: '백신 라벨, 증명서, 수첩 등을 사진, PDF로 보관하세요.',
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
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.civ_confirmed === true) return undefined
      return datedCardSituational(latestDateOfData(caseRow, readCivEntries), '독감(CIV) 백신', '접종')
    },
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
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.infectious_disease_confirmed === true) return undefined
      return datedCardSituational(latestDateOfData(caseRow, readInfectiousDiseaseEntries), '전염병 검사', '검사')
    },
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
        'philippines',
      ],
      species: 'all',
      tripType: 'all',
    },
    order: 80,
    done: 'has-external-parasite',
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.external_parasite_confirmed === true) return undefined
      return datedCardSituational(latestDateOfData(caseRow, readExternalParasiteEntries), '외부구충', '구충')
    },
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
      '내부 기생충 구충을 받으세요. 호주·뉴질랜드·필리핀 등에서 요구돼요.',
    doneSummary: '내부구충 투약을 받았어요.',
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
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.internal_parasite_confirmed === true) return undefined
      return datedCardSituational(latestDateOfData(caseRow, readInternalParasiteEntries), '내부구충', '구충')
    },
    inputs: [
      { key: 'internal_parasite_dates', label: '투약일', type: 'date_array' },
    ],
    allowAttachments: true,
  },

  // ── 촌충 구충 (에키노코쿠스) — 영국·아일랜드·몰타·노르웨이·핀란드, 강아지 한정 ─────
  // EU Reg 2018/772. 입국 24~120시간(1~5일) 전 프라지콴텔 투여 — 검증은 보수적으로 1~3일
  // (eu.tapeworm-1to3days-before-departure). 데이터 키는 internal_parasite_dates 공유(admin 정합).
  {
    id: 'echinococcus-treatment',
    category: 'preparation',
    title: '촌충 구충',
    shortLabel: '촌충',
    description:
      '촌충(에키노코쿠스) 구충을 받으세요.\n\n입국 24~120시간(1~5일) 전에 수의사에게 프라지콴텔 성분의 구충제를 투여받아야 해요.\n시간 계산이 어긋나지 않도록 입국 1~3일 전 사이를 권장해요.\n구충 내용과 일시가 건강증명서에 기록되어야 해요.',
    doneSummary: '촌충 구충을 받았어요.',
    cardLine: '촌충(에키노코쿠스) 구충을 받으세요.',
    applicability: {
      destinations: ['uk', 'ireland', 'malta', 'norway', 'finland'],
      species: 'dog',
      tripType: 'all',
    },
    order: 130,
    deadline: { anchor: 'departure', daysBefore: 3, window: true },
    done: 'has-internal-parasite',
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.internal_parasite_confirmed === true) return undefined
      return datedCardSituational(latestDateOfData(caseRow, readInternalParasiteEntries), '촌충 구충', '구충')
    },
    inputs: [
      { key: 'internal_parasite_dates', label: '구충일', type: 'date_array' },
    ],
    allowAttachments: true,
    attachmentHint: '구충 기록(증명서·수첩)을 사진, PDF로 보관하세요.',
    validationIds: ['eu.tapeworm-1to3days-before-departure'],
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
    attachmentHint: '수입허가증을 사진, PDF로 보관하세요.',
    attachmentLabel: '수입허가증',
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

  // ── 12. 한국 수출 동물검역 ────────────────────────────────────────────
  {
    id: 'certificate-issue',
    category: 'document',
    title: '한국 수출 동물검역',
    shortLabel: '검역소',
    description:
      '출국일 기준 10일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.',
    doneSummary: '한국 수출 동물검역을 받았어요.',
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
      '공항 검역대 → 항공 탑승 → 도착지 검역소 입국 심사 순서로 진행하세요. 도착 후 일부 국가는 7~10일 자가 격리 또는 검역소 격리가 적용돼요.',
    doneSummary: '출국했어요.',
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
    doneSummary: '일본 수출 동물검역을 받았어요.',
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

  // ── 태국 수출 동물검역 (왕복 — 귀국 출국 시, 태국 전용) ───────────────────
  // 태국 축산국(DLD) 출국 검역. 일본의 수출검역(검역소 방문)에 대응하는 태국판 — 나라별 단계.
  // 완료신호 'quarantine:<필드>' 로 도착 수입검역과 같은 confirm 메커니즘 재사용(검역일+완료).
  {
    id: 'th-export-quarantine',
    category: 'document',
    title: '태국 수출 동물검역',
    shortLabel: '수출',
    description:
      '태국 출국 전 공항 동물검역소에서 수출 동물검역을 받으세요.\n출국 직전(1~3일 전 권장)에 검사받아요. 주말·야간에는 검역을 받을 수 없어요.\n접종 증명서를 챙기세요.\n검사를 통과하면 수출허가서(R.9)와 태국 건강증명서가 발급돼요.',
    doneSummary: '태국 수출 동물검역을 받았어요.',
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
    attachmentHint: '수출허가서(R.9)·건강증명서 사본을 사진, PDF로 저장하세요.',
  },

  // ── 현지 검역증명서 발급 (왕복 — 귀국 출국 시, EU 패밀리 전용) ─────────────
  // EU 는 일본·태국 같은 '수출검역소 방문' 제도가 아니라 현지 수의사·정부 기관의 한국
  // 입국용 증명서 발급이 귀국 준비의 핵심. 완료신호 quarantine: confirm 모델 재사용(발급일).
  // 필드는 패밀리 공용(eu_export_quarantine_date) — by_dest 스코핑이 목적지별 분리 보장.
  {
    id: 'eu-export-cert',
    category: 'document',
    title: '현지 검역증명서 발급',
    shortLabel: '증명서',
    description:
      '한국으로 돌아오기 전, 현지 동물병원 또는 정부 기관에서 한국 입국용 건강증명서(검역증명서)를 발급받으세요.\n마이크로칩 번호와 광견병 백신 접종 내용이 기재되어야 해요.\n광견병 항체 검사 결과지 원본을 함께 준비하세요.\n발급받은 서류는 한국 수입 동물검역 때 제출해요.',
    doneSummary: '현지 검역증명서를 발급받았어요.',
    cardLine: '한국 입국용 검역증명서를 발급받으세요.',
    applicability: {
      destinations: ['eu', 'uk', 'ireland', 'malta', 'norway', 'finland', 'switzerland'],
      species: 'all',
      tripType: 'round',
    },
    order: 155,
    done: 'quarantine:eu_export_quarantine_date',
    validationIds: ['eu.export-cert-date-valid'],
    inputs: [
      {
        key: 'eu_export_quarantine_date',
        label: '발급일',
        type: 'date',
        helpText: '한국 입국용 건강증명서(검역증명서)를 발급받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '건강증명서·검역증명서 사본을 사진, PDF로 저장하세요.',
  },

  // ── 필리핀 수출 동물검역 (왕복 — 귀국 출국 시, 필리핀 전용) ───────────────
  // 태국 수출검역과 동일 모델 — 완료신호 'quarantine:<필드>' confirm 메커니즘 재사용.
  {
    id: 'ph-export-quarantine',
    category: 'document',
    title: '필리핀 수출 동물검역',
    shortLabel: '수출',
    description:
      '필리핀 출국 전 BAI 동물검역소에서 수출 동물검역을 받으세요.\n출국 전에 현지 수의사의 건강증명서를 받고, BAI에서 수출 허가와 검역 확인을 받아요.\n발급받은 서류는 한국 수입 동물검역 때 제출해요.\n광견병 항체 검사 결과지(한국 입국용) 원본을 함께 준비하세요.',
    doneSummary: '필리핀 수출 동물검역을 받았어요.',
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
    attachmentHint: '수출 허가·건강증명서 사본을 사진, PDF로 저장하세요.',
  },

  // ── 15. 한국 수입 동물검역 (왕복 케이스 한정 — 귀국 후) ─────────────────
  {
    id: 'kr-import-quarantine',
    category: 'document',
    title: '한국 수입 동물검역',
    shortLabel: '수입',
    description:
      '한국 도착 후 공항 동물검역소에서 수입 동물검역을 받으세요.',
    doneSummary: '한국 수입 동물검역을 받았어요.',
    cardLine: '한국 공항 동물검역소에서 수입 검역을 받으세요.',
    // 모든 나라 왕복의 공통 마지막 — 귀국 후 한국 공항 검역. (일본 전용 → 전 목적지 왕복 공통)
    applicability: { destinations: 'all', species: 'all', tripType: 'round' },
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
