import {
  addDays,
  addYears,
  isExtraTiterResultConfirmed,
  latestExtraTiterEntry,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readInfectiousDiseaseEntries,
  readInternalParasiteEntries,
  readKennelCoughEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  todayKst,
} from '../procedure-checks/utils'
import {
  TITER_RETURN_ONLY_DESTINATIONS,
  destinationsWithVaccine,
  matchesDestinationKey,
  APP_SUPPORTED_DESTINATION_KEYS,
  IMPORT_PERMIT_DESTINATIONS,
  TAPEWORM_DESTINATIONS,
} from '../destination-config'
import {
  buildCaseJourneyContext,
  isSingleDoseRabiesCase,
  GENERAL_VACCINE_CARD_DESTINATIONS,
  SINGLE_DOSE_RABIES_DESTINATIONS,
  TWO_DOSE_RABIES_DESTINATIONS,
} from './applicability'
import { EU_ENTRY_FAMILY, requiredParasiteDoses } from './date-rules'
import {
  deriveAdvanceNotificationStatus,
  deriveApplicationStatus,
  deriveImportPermitStatus,
  deriveJpExportQuarantineStatus,
  SG_DOG_LICENCE_APP_SPEC,
  SG_QUARANTINE_RESERVATION_APP_SPEC,
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
import { titerEntryValidUntil, TITER_EXTRA_CARD_DESTINATIONS } from './titer-validity'

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

  // (미국 '입국 경로 확인'·'도착 주 규정 확인' 카드는 2026-07-26 사용자 결정으로 삭제 —
  //  단일값 카드 기반·검증·알림·필드 등록까지 함께 제거. 한국 출발 저위험국 경로만 다룬다.)

  // ── 2. 마이크로칩 ─────────────────────────────────────────────────────
  {
    id: 'microchip',
    category: 'preparation',
    title: '마이크로칩 삽입',
    shortLabel: '칩',
    description:
      '국제 표준 규격(15자리 번호)의 내장형 마이크로칩을 삽입하세요.\n강아지는 동물등록도 함께 진행하세요.',
    // 동물등록 줄은 강아지에게만 해당 — 고양이 케이스는 첫 줄만(2026-07-26 사용자 지정, 전 목적지 공통).
    descriptionBySpecies: {
      cat: '국제 표준 규격(15자리 번호)의 내장형 마이크로칩을 삽입하세요.',
    },
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

  // ── 2-1. 호주 마이크로칩 인증 (Identity Declaration) ───────────────────────
  // DAFF 기준으로는 **선택 절차**지만, 이걸 받아두면 도착 후 계류가 최소 30일 → 최소 10일로
  // 줄어든다(Group 3 개 가이드 3.2 / 6.1). 순서가 치명적이라 별도 카드로 세운다:
  //   · 반드시 **항체(RNATT) 채혈 전**에 받아야 하고, 채혈과 **같은 방문에서 할 수 없다**
  //     ("cannot be done at the same **vet visit**" — '같은 날'이 아니다. 오전 검역본부 →
  //      오후 동물병원처럼 하루에 나눠 받는 건 규정 위반이 아니다. 2026-07-27 정정)
  //   · 채혈이 끝난 뒤엔 소급 적용이 안 된다 → 그 케이스는 계류 30일 확정
  //   · 마이크로칩 증명서·예방접종 수첩·펫 여권은 대체 불가(검역관만 발급)
  //   · **예외 하나** — 호주에서 수출 검역을 받고 온 동물은 이미 신원 근거가 있어 면제된다
  //     (6.1 "your dog originated in Australia and has evidence of their identity on their
  //      Australian-issued export certification" / rabies 페이지 "you can use the identity
  //      check on your Australian issued export certification"). 이 경우도 계류 최소 10일.
  // 서류는 검역본부(검역관)가 **DAFF 로 직접 보낸다** — 보호자가 사본을 받지 못하므로
  //   첨부 없이 날짜 + '완료' 버튼으로만 끝낸다(괌 검역시설 예약과 같은 모델).
  //
  // 라벨 = '마이크로칩 인증'(2026-07-27 사용자 확정). 구 '신원확인'에서 교체한 이유:
  //   · 신원·신분은 **사람 용어**다(검역 용어는 개체). 동물에 쓰면 어색하고, www 가이드는
  //     '신분확인'이라 앱과 말이 갈려 있었다.
  //   · DAFF 는 마이크로칩을 **매 방문 스캔**하라고 요구한다 → '확인'이면 그 일상 스캔과
  //     구별되지 않는다. **'인증'**은 관이 공식 문서로 보증하는 1회성 행위를 가른다.
  //     이 카드에서 가장 위험한 오해가 "단골 병원에서 스캔받으면 되는 줄 알았다"인데,
  //     라벨이 그 오해를 직접 막는다.
  //   · '인증'은 앱이 이미 같은 뜻으로 쓰는 말이다(싱가포르 'AVS 인증 건강증명서').
  // 행위자 = **검역관**. 구 '정부 공식수의사'는 DAFF 의 두 역할(government *approved* vet =
  //   준비를 맡는 동네 병원 / official *government* vet = 검역본부 소속)을 한국어에서 뒤섞어
  //   "정부가 공인한 동네 수의사"로 읽힐 수 있었다. DAFF 는 둘이 **다른 사람**이라고 못박는다.
  //   앱 전체(도착 카드·홍콩·필리핀)가 쓰는 '검역관'으로 통일한다.
  {
    id: 'au-identity-check',
    category: 'preparation',
    title: '마이크로칩 인증',
    // '칩'은 마이크로칩 삽입 카드(order 20)가 쓰고 있어 '인증'으로. 두 카드가 20 → 25 로
    //   붙어 있어 타임라인에서 '칩 → 인증' 순서로 읽힌다.
    shortLabel: '인증',
    description:
      '동물검역소에서 검역관에게 마이크로칩 인증(Identity Declaration)을 받으세요.\n\n검역관이 마이크로칩을 확인하고 확인서를 호주 검역당국에 직접 보내요.\n광견병 항체 검사 전에 받아야 해요.\n마이크로칩 인증을 하지 않으면 계류기간이 최소 10일에서 30일로 크게 늘어나요.\n호주에서 수출 검역을 받고 한국으로 온 경우에는 받지 않아도 돼요.',
    doneSummary: '마이크로칩 인증을 받았어요.',
    cardLine: '마이크로칩 인증을 받으세요.',
    applicability: { destinations: ['australia'], species: 'all', tripType: 'all' },
    order: 25,
    // 필드는 **기존 `id_date` 를 그대로 쓴다** — 펫무브워크 호주 추가정보(구 'ID 날짜')와 같은
    //   사실이고, destination-scoped 등록·legacy(australia_extra.id_date) fallback 이 이미 있다.
    //   새 키를 파면 같은 사실이 두 곳에 저장돼 검증이 갈린다.
    done: 'dated:id_date',
    // ⛔ buttonComplete 로 되돌리지 말 것 — 인증일이 **광견병 항체 채혈일보다 앞서야** 하고
    //   (DAFF 3.2 "Do this before having blood taken for the RNATT"), 그 순서를 검증하려면
    //   실제 인증일이 필요하다. 버튼 완료였을 때는 저장값이 '버튼 누른 날'이라 순서 판정을
    //   붙일 수 없었다(2026-07-28 전수 점검에서 드러남 — 문구는 순서를 말하는데 검증이 없었다).
    inputs: [
      {
        key: 'id_date',
        label: '인증일',
        type: 'date',
        helpText: '검역관이 마이크로칩을 확인한 날짜',
      },
    ],
    // '같은 날' 검증은 두지 않는다(2026-07-27 사용자 결정). 규정이 금지하는 건 '같은 **방문**'
    //   인데 앱은 날짜만 저장해 방문 분리를 판정할 수 없다. 같은 날을 위반으로 단정하면 정상
    //   케이스(오전 검역본부 → 오후 동물병원)를 잘못 잡는다.
    // 인증↔채혈 순서 주의(au.identity-check-before-titer)는 **항체 검사 카드로 옮겼다**
    //   (2026-07-29, 뉴질랜드와 함께). 조치가 재채혈이라 뒤 카드가 자리다.
    //   저장 거부는 여기 입력 시점에 그대로 있다.
    // 칩 선행 주의는 여기 남긴다 — 칩 시술일은 되돌릴 수 없고 고칠 수 있는 건 인증일이다.
    validationIds: ['au.microchip-before-identity-check'],
  },

  // ── 2-2. 뉴질랜드 마이크로칩 인증 (Pre-export identification check) ─────────
  // IHS 1.11(4) — category 3 는 **필수**다(호주의 같은 이름 절차가 계류를 줄이는 선택
  //   절차인 것과 다르다. 여기 빠지면 수입 허가 자체가 나오지 않는다: 1.13 + 지원문서
  //   "a pre-export identification check form must have been entered into our online system
  //    by an official veterinarian before we can issue an import permit").
  // 횟수가 **항체 채혈 시점에 따라 갈린다**:
  //   · 채혈이 출국 6~12개월 전  → 검역관 스캔 **1회**, 채혈 전에.
  //   · 채혈이 출국 3~6개월 전   → 검역관 스캔 **2회**. 1회차는 출국 6개월 전까지,
  //                               2회차는 채혈 전에.
  // ⚠️ 호주와 헷갈리지 말 것 — 뉴질랜드는 "The blood sample for the RNATT can be taken on
  //   the same day as the microchip scan"(1.11 guidance)로 **같은 날을 명시 허용**한다.
  //   호주는 반대로 같은 방문에서 못 한다. 두 나라 문구를 서로 복사하지 말 것.
  // 서류는 수출국 competent authority(검역본부)가 **MPI 로 직접 보낸다** — 보호자가 사본을
  //   받지 못하므로 첨부 없이 인증일만 받는다.
  // ⛔ buttonComplete 로 되돌리지 말 것 — 호주와 같은 이유다(2026-07-28 사용자 '호주 방식으로
  //   통일' 결정). 인증일이 **항체 채혈일보다 앞서야** 하는데, 버튼 완료는 저장값이 '버튼 누른
  //   날'이라 지난달 받은 인증을 오늘 체크하면 순서가 뒤집혀 보인다 → 순서 판정 자체가 불가능.
  //   뉴질랜드는 이 절차가 **필수**(빠지면 수입 허가가 안 나옴)라 호주보다 더 지켜야 한다.
  {
    id: 'nz-identity-check',
    category: 'preparation',
    title: '마이크로칩 인증',
    shortLabel: '인증',
    description:
      '동물검역소에서 검역관에게 마이크로칩 인증(Pre-export identification check)을 받으세요.\n\n검역관이 마이크로칩을 확인하고 뉴질랜드 검역당국(MPI) 온라인 시스템에 직접 등록해요.\n광견병 항체 검사 채혈 전에 받아야 해요.\n출국일이 광견병 항체 검사 후 6개월 이후일 때는 1회만 받아요.\n3~6개월 사이일 때는 2회를 받아요(출국 6개월 이전, 검사 직전).',
    doneSummary: '마이크로칩 인증을 받았어요.',
    cardLine: '마이크로칩 인증을 받으세요.',
    applicability: { destinations: ['new_zealand'], species: 'all', tripType: 'all' },
    order: 25,
    // 필드는 호주와 같은 `id_date` — 같은 사실(검역관이 칩을 확인한 날)이고 destination-scoped
    //   등록도 이미 돼 있다. 2회 인증 케이스는 **첫 인증일**을 적는다(helpText 로 안내).
    // 완료 판정은 **1차 인증일** 기준 — 2차는 채혈이 출국 3~6개월 전인 케이스에만 생긴다.
    //   앱은 어느 갈래인지 모르므로 2차를 완료 조건에 넣지 않는다(넣으면 1회 케이스가 영영
    //   미완료로 남는다). 2차가 필요한지는 카드 문구가 알린다.
    done: 'dated:id_date',
    inputs: [
      {
        key: 'id_date',
        label: '1차 인증일',
        type: 'date',
        helpText: '검역관이 마이크로칩을 확인한 날짜',
      },
      {
        key: 'id_date_2',
        label: '2차 인증일',
        type: 'date',
        helpText: '2회 받는 경우에만 입력해요',
      },
    ],
    // 주의는 **이 카드에 두지 않는다**(2026-07-29 사용자 확정). 둘 다 조치가 뒤 카드에 있다:
    //   · 인증↔채혈 순서(nz.identity-check-before-titer) → 항체 검사 카드. 조치는 재채혈이다.
    //   · 출국 6개월 하한(nz.identity-check-6months-before-departure) → 항공권 카드. 이미 받은
    //     인증을 되돌릴 수 없으니 바꿀 수 있는 건 출국일뿐이다(생후 9개월 하한과 같은 자리).
    //   저장 거부(인증일 > 채혈일)는 **여기 입력 시점**에 그대로 있다 — 잘못된 값이 들어오는
    //   걸 막는 장치는 입력하는 자리에 있어야 한다.
    // 칩 선행·회차 순서 주의는 여기 남긴다 — 둘 다 조치가 인증일이다(칩 시술일은 되돌릴 수
    //   없고, 회차가 뒤집힌 건 인증일 자체가 잘못 들어간 것).
    validationIds: ['nz.microchip-before-identity-check', 'nz.identity-check-order'],
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
      // 이미 만료 — 카드 문구는 정적 기본으로 두고(advisory 배치만 유지), 만료일·조치는
      // common.rabies-validity-expired '주의' 배지가 알린다(만료 재구성 B, 2026-07-25 —
      // 카드 설명문까지 "만료되었어요"로 바꾸면 주의 배지와 중복).
      if (validUntil && validUntil < today) {
        return { advisory: true }
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
    // ⚠️ base 목록은 사실상 일본용(다른 목적지는 override 가 대체) — 1회국 공통
    // common.rabies-validity-expired(이미 만료 '주의')는 buildRabiesCard 가 자동으로 붙인다.
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
      // 이미 만료 — 카드 문구는 정적 기본으로. 만료일·조치(1차부터 재시작 포함)는
      // common.rabies-extra-validity-expired '주의' 배지가 담당(만료 재구성 B, 2026-07-25).
      // undefined 로 흘려보내면 아래 '입국 전 만료' 분기가 미래형 문구를 띄우므로 명시적으로 끊는다.
      if (validUntil < today) return undefined
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
    // 2회 프라임국(일본·중국 — rabies.doses=2 파생) 전용 별도 카드. 1회 접종국은 광견병 백신
    // 카드 하나에서 추가 접종을 목록으로 입력하므로 이 카드를 쓰지 않는다(rabies-vaccine-1 통합).
    applicability: {
      destinations: [...TWO_DOSE_RABIES_DESTINATIONS],
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
      // 이미 만료(오늘 기준) '주의' — 2회국(일본·중국·하와이) 공통(만료 재구성 B).
      'common.rabies-extra-validity-expired',
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
        // 말레이시아 — **한국 귀국용**(rabiesTiterForReturnOnly) 국가라 main 목록에서 빼고
        // roundOnlyDestinations 로만 왕복에 노출. (말레이시아가 귀국용인데 main 에 있던 기존
        // 불일치도 이걸로 해소 — docs/destination-architecture-design.md §발견 버그.)
        // ⚠️ **인도네시아는 여기 남긴다** — 항체검사가 **입국 요건**(titer.need='entry')이라
        //   말레이시아와 함께 빼면 안 된다(모로코와 같은 부류). 2026-07-22 복제 정리 때 둘을
        //   싸잡아 뺐다가 인도네시아 항체 카드가 통째로 사라져 있었다(2026-07-23 lint:dest 로 발견).
        'indonesia',
        'china',
        'taiwan',
        'singapore',
        // 하와이 — FAVN 항체가 입국 요건(titer.need='entry'). 일본 복제(2026-07-24).
        'hawaii',
        // 괌 — 하와이와 같은 FAVN 요건(titer.need='entry'). 다만 대기 성격이 다르다:
        //   하와이는 30일을 못 채우면 격리인데, 괌은 120일 중 **남은 일수만큼 계류**다
        //   (CQA Calculated Quarantine). 카드 문구가 그 트레이드오프를 설명한다(2026-07-26).
        'guam',
        'india',
        'turkey',
        'ukraine',
        'israel',
        // 모로코 — ONSSA 수입 양식 5항의 항체검사를 **입국 요건**(titer.need='entry')으로
        // 다루기로 해서 2026-07-20 추가. 그전엔 rabiesTiterForReturnOnly 로만 걸려 있어
        // roundOnlyDestinations 경유로 왕복에만 떴고, 이 목록엔 없었다 — 플래그를 떼자
        // 카드가 통째로 사라지는 걸 lint:dest 스냅샷이 잡았다.
        'morocco',
      ],
      // 입국엔 항체검사 불필요하나 한국 귀국 시 필수인 나라 — 왕복에만 노출.
      // 프로파일(rabiesTiterForReturnOnly / titer.need==='return-only')에서 파생한다.
      // 손으로 적던 시절 태국·필리핀만 있어서, 프로파일에 선언한 나라를 앱에 올려도
      // 왕복 항체 카드가 안 떴다(베트남 — 2026-07-19).
      roundOnlyDestinations: [...TITER_RETURN_ONLY_DESTINATIONS],
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
      // 검사 → 결과 2단계 (1회차 rabies-titer 와 동일 모델). 추가 채혈일이 도래했는데 아직
      // 결과값·완료 플래그가 없으면 '검사 진행 중' — 우측 '진행 중' 칩(scenario inProgress)과 짝.
      const latestExtra = latestExtraTiterEntry(caseRow)
      if (
        latestExtra &&
        latestExtra.date <= today &&
        !isExtraTiterResultConfirmed(caseRow)
      ) {
        const msg = '추가 광견병 항체 검사를 진행 중이에요. 결과가 나오면 완료 버튼을 누르세요.'
        return { desc: msg, cardDesc: msg }
      }
      // 현재 유효기간 = 입국일 이전에 한 채혈 중 가장 최근 것 + 2년. 입국 후 채혈은 그 입국을
      // 보증 못 하므로 제외. readTiterEntries 는 입력 순서라 명시 정렬.
      const prior = entry ? titers.filter((t) => t.date <= entry) : titers
      if (prior.length === 0) {
        // 입국 전 유효 채혈이 없음(입국 후 채혈만 있는 경우 포함) — 재검사 안내.
        const msg = `${buildCaseJourneyContext(caseRow).destinationToken || ''} 입국 전에 추가 검사를 받으세요.`.trim()
        return { desc: msg, cardDesc: msg }
      }
      const token = buildCaseJourneyContext(caseRow).destinationToken || '목적지'
      // 대만은 만료의 의미가 다르다 — 만료 **전** 재검사면 체인이 유지돼 대기 없이 가지만,
      // 만료 후 재검사는 체인이 끊겨 채혈일로부터 180일을 다시 기다려야 한다
      // (APHIA 문답집 情形 2: 該次抽血日為前次檢測合格報告之抽血日起 180 日至 1 년 內).
      // 일본은 접종 체인만 유지되면 언제 검사하든 대기가 없어 만료가 마감이 아니다.
      const isTw = matchesDestinationKey(caseRow.destination ?? '', 'taiwan')
      const latest = [...prior].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      // 유효기간은 목적지별 선언에서 파생(일본 24개월·대만 12개월). 2년 하드코딩이었다.
      const validUntil = titerEntryValidUntil(caseRow.destination ?? '', latest.date)
      if (!validUntil) return undefined
      // 미래(예정) 채혈은 저장 시 rabies_titer_extra_scheduled 별도 자리로 분리 — 실제 기록에
      // 미래가 남은 옛 데이터만 이 가드에 걸린다(예정 배지는 scenario 가 표시).
      if (latest.date > today) return undefined
      // 이미 만료 — 카드 문구는 정적 기본으로. 만료일·조치(대만 '만료 후 재검사 = 180일
      // 재대기' 포함)는 common.titer-extra-validity-expired '주의' 배지가 담당
      // (만료 재구성 B, 2026-07-25). undefined 로 흘려보내면 아래 분기들이 "만료돼요"
      // 미래형 문구를 띄우므로 명시적으로 끊는다.
      if (validUntil < today) return undefined
      // 유효기간이 입국일을 덮으면(아직 유효) — 안내 불필요.
      if (entry && validUntil >= entry) return undefined
      // 입국일(항공권)이 아직 없으면 '입국 전 만료'를 단정할 수 없다 — 만료일만 알린다.
      // (옛 코드는 이 가드가 없어 항공권 미입력 케이스에 "일본 입국 전에 만료돼요"라는
      //  근거 없는 문구가 떴다.)
      // 조치는 '만료 전에'가 아니라 '입국 전에'다 — 일본은 접종 체인이 유지되면 만료 후에
      // 재검사해도 대기 없이 입국할 수 있어서, 만료일은 마감이 아니다. '만료 전에'로 쓰면
      // 없는 마감을 만든다. (만료가 곧 반년 재대기인 대만과 다른 지점 — 대만 확장 시 주의.)
      if (!entry) {
        const msg = isTw
          ? `직전 검사의 유효기간이 ${formatKoreanDate(validUntil)}에 만료돼요. 만료 전에 추가 검사를 받으면 대기 없이 입국할 수 있어요.`
          : `직전 검사의 유효기간이 ${formatKoreanDate(validUntil)}에 만료돼요. ${token} 입국 전에 추가 검사를 받으세요.`
        return { desc: msg, cardDesc: msg }
      }
      // 입국일 전 만료 — 재검사 필요.
      const msg = isTw
        ? `직전 검사의 유효기간이 ${token} 입국 전에 만료돼요. 만료 전에 추가 검사를 받으면 대기 없이 입국할 수 있어요.`
        : `직전 검사의 유효기간이 ${token} 입국 전에 만료돼요. ${token} 입국 전에 추가 검사를 진행하세요.`
      return { desc: msg, cardDesc: msg }
    },
    // 이 카드가 필요한 조건은 **유효기간이 아니라 '대기기간 + 연장 개념'이 있는가**다.
    // 즉 재검사를 언제 받느냐가 출국 가능 시점을 바꾸는 목적지에만 둔다.
    //
    //  - 일본: 채혈 후 180일 대기. 접종 체인이 유지되면 재검사로 대기가 없다.
    //  - 대만: 채혈 후 180일 대기 + 만료 **전** 재검사여야 체인 유지(놓치면 180일 재대기).
    //          → 언제 받느냐가 결정적이라 카드로 관리한다(2026-07-19 추가).
    //
    // 중국은 유효기간이 12개월로 대만과 같지만 **대기기간이 없다**. 만료돼도 아무 때나 다시
    // 받아서 그 검사로 나가면 되고 연장이라는 개념 자체가 없다 — 관리할 타이밍이 없으니
    // 이 카드도 필요 없다(2026-07-19 사용자 확인). 유효기간 숫자만 보고 넣지 말 것.
    // 태국·필리핀·베트남은 입국에 항체가 불필요(귀국용만), EU 패밀리는 체인 유지 시 무기한.
    applicability: {
      destinations: [...TITER_EXTRA_CARD_DESTINATIONS],
      species: 'all',
      tripType: 'all',
    },
    // 2회+ 입력됐거나 입국일+30일 안에 항체 유효기간 만료(재검사 필요) 일 때 노출.
    appliesWhen: 'titer-extra-applicable',
    order: 41,
    done: 'has-extra-titer',
    allowAttachments: true,
    attachmentHint: '검사결과지 사본을 사진·PDF로 보관하세요.',
    // 본 항체검사와 같은 라벨 — 보관함에서 '광견병 항체 검사 결과지_2, _3 …' 으로 번호가 이어진다.
    attachmentLabel: '광견병 항체 검사 결과지',
    validationIds: [
      'jp.titer-validity-expires-soon',
      'jp.titer-extra-within-rabies-validity',
      // 이미 만료(오늘 기준) '주의' — 추가 검사 카드국(일본·대만·하와이) 공통(만료 재구성 B).
      'common.titer-extra-validity-expired',
    ],
  },

  // ── 항공권 구매 (일본 전용) ──────────────────────────────────────────────
  {
    id: 'flight-purchase',
    category: 'logistics',
    title: '항공권 구매',
    shortLabel: '항공권',
    description:
      '입국 일정에 맞춰 항공권을 구매하세요.\n\n채혈일로부터 180일~2년 사이에 입국할 수 있어요.\n사전 신고를 위해 입국 40일 전까지 항공권을 구매해야 해요. 여유 있게 두 달 전까지 구매하세요.\n항공사에 반려동물 동반 가능 여부를 꼭 확인하세요.',
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
    // 전 여정 구성이 끝난 나라(appSupported 파생)에만 노출 — 포털 화이트리스트와 같은 목록.
    applicability: {
      destinations: [...APP_SUPPORTED_DESTINATION_KEYS],
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

  // ── CDC Dog Import Form (개 전용) ────────────────────────────────────
  {
    id: 'us-cdc-dog-import-form',
    category: 'permit',
    // 제목은 'CDC 신고'(2026-07-26 사용자 지정 — 절차 성격이 드러나는 한글 제목). 공식 서식명
    // (CDC Dog Import Form)은 설명문·링크·첨부 라벨에 그대로 남긴다. usa·hawaii 공유 카드.
    title: 'CDC 신고',
    shortLabel: 'CDC',
    description:
      '미국 입국 전에 CDC Dog Import Form을 온라인으로 제출하세요.\n\n한 마리당 한 장씩 제출하고, 발급되는 접수증을 휴대전화에 저장하거나 인쇄해 가져가세요.',
    doneSummary: 'CDC Dog Import Form을 제출했어요.',
    cardLine: 'CDC Dog Import Form을 제출하세요.',
    // 하와이 — 미국의 주(州)라 CDC 개 수입 규칙(연방)이 그대로 적용된다. 카드·문구·검증을
    // 본토와 공유(단일 출처)하고, 순서만 하와이 override 로 조정(출국 전 임상검사 직전 —
    // 2026-07-26 사용자 지정). 룰 country·저장 게이트도 hawaii 포함으로 확장했다.
    // 괌 — 미국령이라 CDC 연방 규칙(2024-08-01 시행)이 그대로 적용된다. DOAG 브로슈어
    //   INTERNATIONAL ARRIVALS 항목에 CDC Dog Import Form 이 개 전용으로 명시돼 있다.
    //   고양이는 CDC 서류 요건 자체가 없어 species: 'dog' 그대로(2026-07-26).
    applicability: { destinations: ['usa', 'hawaii', 'guam'], species: 'dog', tripType: 'all' },
    order: 47,
    done: 'dated:us_cdc_form_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'us_cdc_form_date',
        label: '제출일',
        type: 'date',
        helpText: '온라인 양식을 제출하고 접수증을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: 'CDC Dog Import Form 접수증을 사진·PDF로 보관하세요.',
    attachmentLabel: 'CDC Dog Import Form 접수증',
    links: [
      {
        url: 'https://survey.1cdp.cdc.gov/?form=556bcb90-1bca-4b01-8094-ad22a7169c32',
        label: 'CDC Dog Import Form 제출',
      },
      {
        url: 'https://www.cdc.gov/importation/dogs/dog-import-form-instructions.html',
        label: 'CDC Dog Import Form 안내',
      },
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
      { url: 'https://webaps-prod.nac.naccs.jp/anau/anipas/AOWZ01/OWZ01W02O', label: '사전 신고 신청(NACCS)' },
      { url: '/guide/jp-quarantine-contacts', label: '동물검역소 연락처' },
    ],
    validationIds: ['jp.advance-notification-40days-before-entry'],
  },

  // ── 하와이 입국 신청 (하와이 전용) ──────────────────────────────────────
  // 하와이는 반려동물 도착 10일 이상 전에 동물검역소(AQS)에 입국 신청 서류(AQS-279 +
  // 광견병 접종증명서 + 건강증명서 + 수수료)를 제출해야 5-Day-Or-Less/공항 인계(DAR) 자격이 된다.
  // 온라인 포털(HIPOP)·우편 둘 다 가능하며 온라인을 우선 안내한다. 일본 NACCS 사전신고와 같은
  // 자리의 절차지만, 하와이는 전자시스템이 HIPOP 이고 우편 제출도 병행된다(일본 복제 시 'NACCS
  // 사전신고 없음'으로 빼면서 하와이 고유의 이 제출 절차를 누락했던 것 — 2026-07-25 추가).
  // 완료신호 = 아일랜드·노르웨이 사전통지와 동일한 confirm 모델(신고일 입력 + 도래 + 저장 확인).
  // 출처: dab.hawaii.gov (HIPOP 안내 + Checklist 1 Step 1·7 '도착 10일 전 접수').
  {
    id: 'hi-import-declaration',
    category: 'permit',
    title: '하와이 입국 신청',
    shortLabel: '입국 신청',
    description:
      '하와이 도착 10일 전까지 동물검역 입국 신청을 하세요.\n\n하와이 반려동물 포털(HIPOP)에서 온라인으로 신청하거나 우편으로 신청해요.',
    doneSummary: '하와이 입국 신청을 했어요.',
    cardLine: '하와이 입국 신청을 하세요.',
    applicability: { destinations: ['hawaii'], species: 'all', tripType: 'all' },
    order: 46,
    deadline: { anchor: 'entry', daysBefore: 10 },
    // 버튼 완료 카드(2026-07-26 사용자 결정) — 신청하고 결과를 기다리는 절차가 아니라
    //   HIPOP 에 접수하면 그걸로 끝이다. 날짜를 받아 검증하는 대신 '확인'만 받고, 마감은
    //   알림 2회(reminders.ts 하와이 — 마감 일주일 전 D-17 · 마감일 D-10)가 담당한다.
    //   ⛔ 신청일 기반 검증(구 hi.import-declaration-10days-before-arrival)을 되살리지 말 것 —
    //      기록되는 날짜가 '버튼 누른 날'이라 실제 신청일과 달라 거짓 주의가 난다.
    buttonComplete: true,
    done: 'dated:hi_import_declaration_date',
    inputs: [
      {
        key: 'hi_import_declaration_date',
        label: '신청일',
        type: 'date',
        helpText: 'HIPOP에서 신청하거나 동물검역소에 입국 신청 서류를 제출한 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '입국 신청 접수 확인·서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '하와이 입국 신청 서류',
    links: [{ url: 'https://hipop.ais.hawaii.gov/', label: '하와이 반려동물 포털(HIPOP)' }],
    validationIds: [],
  },

  // ── 귀국 서류 준비 (왕복 — 하와이 전용, USDA 승인 건강증명서) ────────────────
  // 하와이→한국 귀국은 '수출검역소 방문' 제도가 없다(AQS 는 수출 업무를 하지 않고 국제 이동은
  // USDA APHIS 관할 — dab.hawaii.gov FAQ). 미국 본토(us-export-health-cert)와 같은 구조:
  // USDA 공인 수의사가 한국 전용 건강증명서를 작성하고 VEHCS 로 APHIS 승인(출국 전 30일 이내).
  // EU·캐나다 '귀국 서류 준비'와 같은 dated-confirm 모델. 검증은 본토와 같은 함수
  // (validateUsExportHealthCertDate).
  // 카드명은 처음 '한국 입국용 건강증명서·USDA 승인'이었다가 EU·대만·캐나다의 '귀국 서류 준비'
  // 가족으로 통일(2026-07-26 사용자 결정 — 캐나다 2026-07-25 개명과 같은 이유: 25개 귀국 카드
  // 중 혼자 낯선 이름 + 17자로 혼자 김). 완료·일정 문구도 캐나다 전례대로 가족 문형.
  // 설명문도 캐나다 문형('… 또는 대체 서류를 준비하세요' 문두 + '- ' 대체서류 체크 목록)으로
  // 재정렬 + 대체서류 안내 추가(2026-07-26 사용자 지시). 절차 사실관계(30일·VEHCS·원본·
  // AQS/HIPOP 무관)는 사용자 확정 조사문 그대로 유지.
  // ⚠️ 광견병 항체가 — 한국 검역본부는 하와이를 비발생 지역으로 분류(항체 면제·당일 개방)하나
  //   USDA 한국 전용 서식은 항체가 기재란이 필수라 충돌한다. 면제를 확정 안내하지 않고
  //   hi.return-titer-within-24months '주의'로 보수 안내(사용자 결정 2026-07-26).
  {
    id: 'hi-export-health-cert',
    category: 'document',
    title: '귀국 서류 준비',
    shortLabel: '귀국서류',
    description:
      'USDA 승인 국제 건강증명서 또는 대체 서류를 준비하세요.\n\n출국 전 30일 이내에 USDA 공인 수의사의 진료를 받아요. 수의사가 국제 건강증명서를 작성하고 VEHCS로 USDA APHIS 승인을 신청해요.\n\n다음 서류가 있다면 USDA 승인을 새로 받지 않아도 돼요\n- 한국 출국 시 받은 동물검역증',
    doneSummary: '귀국 서류를 준비했어요.',
    cardLine: '귀국 서류를 준비하세요.',
    applicability: { destinations: ['hawaii'], species: 'all', tripType: 'round' },
    order: 150,
    done: 'dated:hi_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'hi_export_quarantine_date',
        label: '발급·승인일',
        type: 'date',
        helpText: '수의사 발급과 USDA 승인을 완료한 날짜',
      },
    ],
    allowAttachments: true,
    // 명칭은 'USDA 승인 국제 건강증명서'로 통일(2026-07-26 사용자 결정) — 서류탭 이름·
    // 첨부 라벨과 동일. 문형은 앱 표준('사본을 사진·PDF로').
    attachmentHint: 'USDA 승인 국제 건강증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: 'USDA 승인 국제 건강증명서',
    // 서식 PDF 링크는 카드에서 빼고 서류탭 '서식 받기'로 이동(2026-07-26 사용자 결정) —
    // 외부 직링크 대신 앱 호스팅(/forms/usda-korea-dog-cat.pdf, required-docs templates).
    links: [
      {
        url: 'https://direct.aphis.usda.gov/pet-travel/us-to-another-country-export/pet-travel-us-korea',
        label: '미국에서 한국으로 반려동물 데려오기(USDA)',
      },
    ],
    validationIds: [
      'hi.return-titer-within-24months',
      'hi.airline-health-cert-note',
    ],
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
        label: '사전 통지 안내',
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
        label: '사전 통지 안내(Mattilsynet)',
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
        label: '사전 통지 안내',
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
      '몰타 입국 3영업일 전까지 사전 통지를 하세요.\n\n몰타 사전 통지 포털을 이용해요.\n웹사이트 이용이 어려운 경우, 이메일(petstravel.msdec@gov.mt)로 문의할 수 있어요.',
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
      { url: 'https://nldmalta.gov.mt/MaltaPetArrivals/', label: '사전 통지 신청' },
    ],
    validationIds: ['eu.mt-advance-notice-3days-before-entry'],
  },

  // ── 사전 통보 (이스라엘 전용) ──────────────────────────────────────
  // 1차 출처(이스라엘 수의국 공식 안내 「Importing Dogs and Cats」 26/11/2023) 섹션 P·Q:
  //   **적재(출국) 최소 2영업일 전** 통보. 벤구리온 도착은 govforms 온라인 폼, 그 외 항/포는 이메일.
  //   → 앵커를 출국(departure)으로 잡는다(EU 형제 카드의 entry 기준과 다름 — 이스라엘은 '적재 전').
  //   2영업일은 캘린더 계산이 복잡해 근사: 마감 알림 D-11·D-4(reminders.ts), 입력불가 D-2(date-rules).
  //   3마리 이상은 면제(≤2마리)가 안 돼 사전 통보 대신 수입 허가(Import License) 신청 대상(섹션 E).
  {
    id: 'il-advance-notice',
    category: 'permit',
    title: '사전 통보',
    shortLabel: '통보',
    description:
      '이스라엘은 출국 2영업일 전까지 사전 통보를 해야 해요.\n\n벤구리온 공항으로 도착하는 경우 아래 온라인 폼에서 도착 정보와 건강증명서·광견병 항체검사 결과지를 제출해요.\n반려동물이 3마리 이상이면 사전 통보 대신 수입 허가(Import License)를 미리 신청해야 해요.',
    doneSummary: '이스라엘에 사전 통보를 했어요.',
    cardLine: '이스라엘에 사전 통보를 하세요.',
    applicability: { destinations: ['israel'], species: 'all', tripType: 'all' },
    order: 47,
    deadline: { anchor: 'departure', daysBefore: 2 },
    done: 'quarantine:il_advance_notice_date',
    inputs: [
      {
        key: 'il_advance_notice_date',
        label: '통보일',
        type: 'date',
        helpText: '온라인 폼(또는 이메일)으로 사전 통보한 날짜',
      },
    ],
    links: [
      {
        url: 'https://govforms.gov.il/mw/forms/PetPersonalImportation@moag.gov.il',
        label: '사전 통보 온라인 폼(벤구리온)',
      },
      {
        url: 'https://www.gov.il/en/service/import_pets_cats_dogs',
        label: '수입 허가 신청 안내(이스라엘 농업부)',
      },
    ],
    validationIds: ['il.advance-notice-2days-before-departure'],
  },

  // ── 사전 통지 (홍콩 전용) ────────────────────────────────────────────
  // AFCD DC-02v05 1항: "The permittee must notify the Duty Officer of the Import & Export
  //   Section during office hours … at least 24 hours in advance of the anticipated time of
  //   arrival." 펫무브 홍콩 가이드도 같은 내용(서류 사본 사전 제출 + 도착일·시간 통지).
  // **업무시간 조건**(2026-07-26 추가) — 24시간만 지키면 되는 게 아니라 그 통지가 업무시간
  //   안에 들어가야 한다. AFCD 확인값: 월~금 08:30–12:30 · 13:30–17:15, 토·일·공휴일 휴무.
  //   항공 화물은 Airport Office (852) 2182 1001 / foii_airport@afcd.gov.hk.
  //   그래서 도착 24시간 전이 주말·공휴일이면 그 전 평일에 미리 통지해야 한다 — 카드 문구도
  //   시각을 나열하는 대신 이 실무 결론만 적는다(몰타 3영업일·이스라엘 2영업일과 같은 성격).
  //   ⚠️ 수령(공항 화물터미널 AFCD 사무소)은 24시간 운영이라 별개다 — 헷갈리지 말 것.
  // 화물 운송이라 실무에서는 현지 운송 에이전트가 대신 통지하는 경우가 많다 — 그래도 카드는
  //   둔다(마감이 있는 절차이고, 안 하면 도착 시 반송·계류 위험).
  // 완료신호 'quarantine:<필드>' confirm 재사용 — 아일랜드·이스라엘 사전 통지와 같은 모델.
  {
    id: 'hk-advance-notice',
    category: 'permit',
    title: '사전 통지',
    shortLabel: '통지',
    description:
      '홍콩 도착 24시간 전까지 사전 통지를 하세요.\n\n홍콩 공항 검역사무소(AFCD)에 예상 도착일·도착 시간과 서류 사본을 보내요.\n검역사무소는 평일에만 열어요. 도착 24시간 전이 주말·공휴일이면 그 전 평일에 통지하세요.\n화물로 운송하므로 보통 동물 운송업체가 대신 통지해요.',
    doneSummary: '홍콩에 사전 통지를 했어요.',
    cardLine: '홍콩에 사전 통지를 하세요.',
    applicability: { destinations: ['hongkong'], species: 'all', tripType: 'all' },
    // 수입 허가(100) → 운송 예약(102) → 사전 통지(105) 순. 통지에 도착 예정일·시간을 적어야
    //   하므로 운송 예약 뒤여야 한다. ⛔ 47(유럽 사전 통지 관례)로 되돌리지 말 것 — 유럽은
    //   항공권이 45라 47이 '항공권 직후'지만, 홍콩은 sea-permit 골격이라 운송 예약이 102다.
    //   47로 두면 사전 통지가 광견병 백신 바로 뒤·운송 예약보다 앞에 떠서, 아직 존재하지도
    //   않는 도착 시간을 통지하라고 안내하게 된다(2026-07-26 사용자 지적).
    order: 105,
    deadline: { anchor: 'entry', daysBefore: 1 },
    // 버튼 완료 카드(2026-07-26 사용자 결정) — 화물 운송이라 실제 통지는 동물 운송업체가 대신
    //   한다. 보호자가 통지 시각을 특정하기 어려워 날짜 입력 대신 '확인'만 받는다. 버튼이 오늘
    //   날짜를 아래 필드에 기록하고, **마감 알림은 그대로 유지**된다(reminders.ts 의 사전 통지
    //   테이블은 완료 플래그가 아니라 이 필드가 채워졌는지로 판단한다).
    //   ⛔ 통지일 기반 24시간 검증(구 hk.advance-notice-24h-before-entry)은 되살리지 말 것 —
    //      기록되는 날짜가 '버튼 누른 날'이라 실제 통지일과 달라 거짓 주의가 난다.
    buttonComplete: true,
    done: 'dated:hk_advance_notice_date',
    inputs: [
      {
        key: 'hk_advance_notice_date',
        label: '통지일',
        type: 'date',
        helpText: '홍콩 공항 검역사무소에 도착 정보를 통지한 날짜',
      },
    ],
    links: [
      {
        url: 'https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/qua_ie_ipab_idc_Group_II.html',
        label: '수입 절차·연락처 안내(AFCD)',
      },
    ],
    validationIds: [],
  },

  // ── 검역시설 예약 (괌 전용) ─────────────────────────────────────────
  // DOAG 브로슈어 REQUIRED DOCUMENTS 6항 "Quarantine Facility Reservation" — 수입 허가
  //   신청 서류에 **예약확인서가 포함**되므로 허가 신청보다 먼저 해야 한다(order 95 < 100).
  // 승인 시설(브로슈어 FAQ "How do I make a quarantine reservation?"):
  //   · Harper Valley Kennels — (671) 797-0393 / petshippersguam@gmail.com
  //   · Animal Medical Clinic — (671) 637-8387 / amcpetlodge@outlook.com
  //   · Andersen AFB Pet Lodge — **군 관계자 전용**이라 카드에 쓰지 않는다.
  // 계류비·공항 인수비는 $65 허가 수수료와 **별도**이고 시설마다 다르다(브로슈어).
  // 버튼 완료 카드 — 예약을 잡으면 끝나는 절차고, 보호자가 아는 건 '됐다/안 됐다'다
  //   (홍콩 수입 허가·하와이 입국 신청과 같은 모델, 2026-07-26).
  {
    id: 'gu-quarantine-reservation',
    category: 'permit',
    title: '검역시설 예약',
    shortLabel: '예약',
    description:
      '괌 지정 검역시설에 계류 예약을 하세요.\n\n수입 허가를 신청할 때 예약확인서를 함께 내야 해요.\nHarper Valley Kennels 또는 Animal Medical Clinic에 연락해 예약해요.\n계류 비용은 시설마다 다르고, 수입 허가 수수료와 별도예요.',
    doneSummary: '괌 검역시설을 예약했어요.',
    cardLine: '괌 검역시설을 예약하세요.',
    applicability: { destinations: ['guam'], species: 'all', tripType: 'all' },
    order: 95,
    done: 'dated:gu_quarantine_reservation_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'gu_quarantine_reservation_date',
        label: '예약일',
        type: 'date',
        helpText: '검역시설 예약을 확정한 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역시설 예약확인서를 사진·PDF로 보관하세요.',
    attachmentLabel: '괌 검역시설 예약확인서',
    links: [
      { url: 'https://www.petshippersguam.com/', label: 'Harper Valley Kennels' },
      { url: 'https://amcguam.com/moving-to-guam-with-pets/', label: 'Animal Medical Clinic' },
    ],
    validationIds: [],
  },

  // ── 호주 RNATT 선언서 — 항체 결과가 나온 뒤, 수입 허가 신청 전 ───────────
  // Group 3 가이드 4.4 "Get the RNATT declaration". 검사기관이 주는 **결과지와 별개**로,
  //   검역본부(competent authority)의 정부 수의사가 작성·서명·날인하는 호주 전용 선언서다.
  //   광견병 접종증명서 + 항체 결과지를 내면 발급된다.
  // 왜 별도 카드인가 — DAFF 는 이 선언서를 **수입 허가 신청의 필수 제출물**로 못박는다
  //   ("You must provide a copy of the RNATT laboratory report and declaration when you
  //   apply for an import permit"). 카드가 없으면 보호자는 항체 결과지만 들고 BICON 에
  //   가서 신청이 막힌다(2026-07-27 사용자 지적으로 신설).
  // 결과지와 선언서의 마이크로칩 번호·채혈일·결과가 한 글자라도 다르면 심사가 지연된다.
  {
    id: 'au-rnatt-declaration',
    category: 'document',
    title: 'RNATT 선언서',
    shortLabel: '선언서',
    description:
      '동물검역소에서 RNATT 선언서를 발급받으세요.\n\n광견병 접종증명서와 항체 검사 결과지를 제출하면 검역관이 작성·서명·날인해요.\n수입 허가를 신청할 때 항체 검사 결과지와 함께 제출해요.',
    doneSummary: 'RNATT 선언서를 받았어요.',
    cardLine: 'RNATT 선언서를 발급받으세요.',
    applicability: { destinations: ['australia'], species: 'all', tripType: 'all' },
    // 항체 검사(40) 뒤, 수입 허가 신청(42) 앞.
    order: 41,
    done: 'dated:au_rnatt_declaration_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'au_rnatt_declaration_date',
        label: '발급일',
        type: 'date',
        helpText: 'RNATT 선언서를 발급받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: 'RNATT 선언서를 사진·PDF로 보관하세요.',
    attachmentLabel: 'RNATT 선언서',
    validationIds: ['au.rnatt-declaration-order'],
  },

  // ── 뉴질랜드 광견병 증명서(RCF) — 항체 결과가 나온 뒤, 수입 허가 신청 전 ────
  // 호주 RNATT 선언서와 **같은 자리·같은 이유**의 카드다(2026-07-29 사용자 지적으로 신설).
  //   지원문서 Documentation: "Your veterinarian must prepare and sign the Rabies Certification
  //   Form (RCF), then an official government veterinarian must sign and stamp the RCF" +
  //   "You will need to upload the completed, signed, and stamped RCF when applying online
  //   for the import permit". 즉 **수입 허가 신청의 필수 제출물**이고, 발급에 두 단계(동물병원
  //   수의사 작성·서명 → 검역관 서명·날인)가 걸린다.
  // 카드가 없으면 보호자는 항체 결과지만 들고 신청하러 갔다가 막힌다(호주에서 겪은 그대로).
  // ⚠️ 구 IHS(2021) 시절의 같은 서류 이름은 **OVD(Official Veterinarian Declaration)** 다.
  //   담는 항목·서명 구조가 같고 신 IHS 에서 RCF 로 대체됐다. 전환기(~2027-04-01)에는 구
  //   서식이 통할 수 있으나 앱은 신 IHS 하나로만 판정한다(nz.ts 헤더 주석).
  // 완료 방식·검증까지 **호주와 똑같이** 맞춘다(2026-07-29 사용자 확정). 버튼 완료라 저장값은
  //   '버튼 누른 날'이고, 날짜 크기 비교에 기대는 검증은 두지 않는다. 수입 허가와의 순서는
  //   허가 카드의 저장 거부가 **완료 여부**로 보장한다(importPermitPrerequisiteError).
  {
    id: 'nz-rcf',
    category: 'document',
    title: '광견병 증명서(RCF)',
    shortLabel: 'RCF',
    description:
      '광견병 증명서(RCF)를 발급받으세요.\n\n동물병원 수의사가 작성·서명한 뒤, 동물검역소에서 검역관의 서명·날인을 받아요.\n수입 허가를 신청할 때 함께 제출해요.',
    doneSummary: '광견병 증명서(RCF)를 받았어요.',
    cardLine: '광견병 증명서(RCF)를 발급받으세요.',
    applicability: { destinations: ['new_zealand'], species: 'all', tripType: 'all' },
    // 항체 검사(40) 뒤, 계류시설 예약(42)·수입 허가(44) 앞.
    order: 41,
    done: 'dated:nz_rcf_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'nz_rcf_date',
        label: '발급일',
        type: 'date',
        helpText: '검역관의 서명·날인을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '광견병 증명서(RCF)를 사진·PDF로 보관하세요.',
    attachmentLabel: '광견병 증명서(RCF)',
    // 호주 선언서와 같은 단일 룰 — **채혈 이후** 갈래만 본다. '허가 신청 이전' 갈래는
    //   수입 허가 카드가 신청일을 받지 않게 되면서 판정할 값이 없어져 삭제했다(2026-07-29).
    validationIds: ['nz.rcf-order'],
  },

  // ── 호주 계류시설(Mickleham) 예약 — 수입 허가를 받은 뒤 ────────────────────
  // Group 3 개 가이드 6.1: "Book your dog's post-entry quarantine stay — do this after you
  //   receive your import permit." 호주에 오는 모든 개·고양이가 멜버른 Mickleham 정부
  //   계류시설(135 Donnybrook Road, Mickleham VIC)에 들어가고, 예약 시 계류비 일부를
  //   선납해야 자리가 유지된다. 계류 일수는 마이크로칩 인증 여부로 갈린다(최소 10일 / 최소 30일).
  // 예약 확인 자료가 보호자에게 남으므로 첨부를 허용한다(괌 예약확인서와 같은 취급).
  {
    id: 'au-quarantine-reservation',
    category: 'permit',
    title: '계류시설 예약',
    shortLabel: '계류장',
    description:
      '멜버른 Mickleham 계류시설에 계류를 예약하세요.\n\n수입 허가를 받은 뒤에 예약할 수 있어요.\n예약할 때 계류 비용의 일부를 미리 내야 자리가 유지돼요.\n항체 검사 검체가 검사기관에 접수된 날부터 180일이 지나야 출국할 수 있어요.',
    doneSummary: '계류시설을 예약했어요.',
    cardLine: '계류시설을 예약하세요.',
    applicability: { destinations: ['australia'], species: 'all', tripType: 'all' },
    order: 44,
    // 날짜 입력 카드(2026-07-27 사용자 지정) — 운송 예약과 같은 모델. 버튼 완료였을 때는
    //   저장값이 '완료한 날'이라 계류 시작일을 아무 데서도 알 수 없었다.
    // 예약을 했다는 사실이 완료 — 계류 시작일이 미래여도 카드는 완료다(2026-07-28 사용자 지적).
    //   dated 였을 때는 예약을 마쳐도 계류가 시작될 때까지 미완료로 남았다. 항공권 구매
    //   카드(has-flight-date)와 같은 성격이라 판정을 맞췄다.
    done: 'booked:au_quarantine_reservation_date',
    inputs: [
      {
        key: 'au_quarantine_reservation_date',
        label: '계류 시작일',
        type: 'date',
        helpText: '예약한 계류 시작 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '계류시설 예약확인서를 사진·PDF로 보관하세요.',
    attachmentLabel: '호주 계류시설 예약확인서',
    links: [
      {
        url: 'https://www.agriculture.gov.au/biosecurity-trade/cats-dogs/quarantine-facilities-and-fees',
        label: '계류시설 예약·비용 (DAFF)',
      },
    ],
    // 계류 시작일을 받게 되면서 180일 판정을 이 카드에도 붙인다(저장 거부 + 짝 주의).
    // 출국일 ≤ 계류 시작일 주의는 **운송 예약 카드**에 둔다(2026-07-30) — 저장 거부는 이 카드에도.
    validationIds: ['au.quarantine-reservation-min-180days'],
  },

  // ── 뉴질랜드 계류시설 예약 — 수입 허가 신청 **전** ──────────────────────────
  // IHS 1.13.2(1)(d) — 수입 허가 신청 서류에 "Signed quarantine booking form"이 들어간다.
  //   그래서 호주(허가 → 예약)와 **순서가 반대**다: 예약(42) → 허가(44).
  // 계류는 마이크로칩 인증 여부와 무관하게 **최소 10일**이다(1.15(3)(a)). 호주처럼 10일/30일로
  //   갈리지 않으니 그 문장을 복사해 오지 말 것.
  // 시설이 공항 인수·MPI 도착 통보를 대신한다(지원문서 Notify MPI — "You are not required to
  //   give notification of arrival of your dog. The quarantine facility will do this for you").
  // ⛔ buttonComplete 로 되돌리지 말 것(2026-07-28) — `nz_quarantine_reservation_date` 를
  //   **실제 계류 시작일로 읽는 소비처가 셋**이다: 주의 룰(nz.quarantine-start-not-before-departure),
  //   도착 검역 카드의 '예정' 배지(QUARANTINE_START_FIELD_BY_DESTINATION), 이 카드의 완료 판정.
  //   버튼 완료면 저장값이 '버튼 누른 날'이라 도착일과 늘 어긋나 정상 케이스에 경고가 뜨고
  //   예정 배지도 엉뚱한 날짜가 된다. 호주 계류 예약 카드도 같은 이유로 날짜 입력이다.
  {
    id: 'nz-quarantine-reservation',
    category: 'permit',
    title: '계류시설 예약',
    shortLabel: '계류장',
    description:
      '뉴질랜드 검역당국(MPI)이 승인한 계류시설을 예약하세요.\n\n예약 확인서가 있어야 수입 허가를 신청할 수 있어요.',
    doneSummary: '계류시설을 예약했어요.',
    cardLine: '계류시설을 예약하세요.',
    applicability: { destinations: ['new_zealand'], species: 'all', tripType: 'all' },
    order: 42,
    // 예약을 했다는 사실이 완료 — 계류 시작일이 미래여도 카드는 완료다. 호주가 2026-07-28 에
    //   같은 이유로 booked 로 바꿨는데 뉴질랜드만 dated 로 남아 있었다(2026-07-29 사용자 발견).
    //   dated 는 날짜가 도래해야 완료라, 예약을 마쳐도 계류 시작일까지 미완료로 남았다.
    done: 'booked:nz_quarantine_reservation_date',
    inputs: [
      {
        key: 'nz_quarantine_reservation_date',
        label: '계류 시작일',
        type: 'date',
        helpText: '예약 확인서에 적힌 계류 시작 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '계류시설 예약확인서를 사진·PDF로 보관하세요.',
    attachmentLabel: '뉴질랜드 계류시설 예약확인서',
    links: [
      {
        url: 'https://www.mpi.govt.nz/news-and-resources/resources/registers-and-lists/registered-quarantine-facilities/',
        label: 'MPI 승인 계류시설 목록',
      },
    ],
    validationIds: [
      // ⛔ 구 'nz.quarantine-reservation-matches-entry'(계류 시작일 = 도착일)는 삭제했다
      //   (2026-07-30). 항공권 카드가 단순형이 되며 도착일 칸이 사라져 판정이 영영 SKIP 이었다.
      //   대체 룰(nz.quarantine-start-not-before-departure)은 **운송 예약 카드**에 있다 —
      //   출국일 칸이 있는 쪽이 조치 자리다(싱가포르와 같은 배치). 저장 거부는 이 카드에도 있다.
      // 채혈 창·인증 횟수 짝 주의 — 예약을 저장한 뒤 채혈일을 늦추거나 2차 인증일을 지우면
      //   저장 거부는 이미 지나갔으므로 여기서 표면화한다(2026-07-29).
      'nz.quarantine-start-after-titer',
    ],
  },

  // ── 남아공 AIA 수입 허가 (개 전용) — 수의검역 수입 허가 **전** ────────────────
  // ✅ 1차 출처(2026-07-30 원문 확인) — DALRRD 보도자료 2024-04-10 "THE DEPARTMENT OF
  //   AGRICULTURE INTRODUCES NEW DIRECTIVES FOR THE IMPORTATION AND EXPORTATION OF LIVE ANIMALS".
  //   허가가 **두 장**인 이유는 근거법이 다르기 때문이다:
  //     · AIA 허가 = Animal Improvement Act, 1998 (Act 62/1998) **제16조** — 가축 개량·유전자원
  //     · 수의검역 수입 허가 = Animal Diseases Act, 1984 (Act 35/1984) — 질병 방역
  //   순서는 규정이 못박는다 — "the Animal Improvement Permit/authorisation must be applied for
  //   **first**, and the AIA Permit/authorisation must be **attached to** the application for the
  //   Veterinary Import Permit". 그래서 order 38(AIA) → 44(수의검역)다.
  //   고양이 면제도 명문이다 — "animals such as **cats**, birds and fish **do not require** an AIA
  //   Permit/authorisation for importation". ⛔ species: 'dog' 를 'all' 로 넓히지 말 것.
  //   ⚠️ 개가 대상인 근거는 '개는 필요' 명시가 아니라 **제외 목록에 없다**는 방식이다(살아있는
  //     동물 전체 대상, 야생동물·고양이·조류·어류만 제외).
  //   ⚠️ 2024-04-01 **이전** 발급된 수의검역 수입허가에도 소급 적용된다(유효한 AIA 허가 사본 첨부).
  // 광견병 접종(30) 바로 뒤(38) — 수입 허가(40)·검역시설 예약(42)·운송 예약(46)보다 앞.
  //   ⚠️ 구 주석의 근거('처리에 최대 30영업일')는 **오류였다**(2026-07-30 원문 대조). 신청서에
  //     심사 소요기간은 없다. 그래도 38 이 맞는 자리인 이유는 규정이 정한 **순서** 자체다 —
  //     AIA 허가서가 수의검역 허가 신청의 첨부물이고(DALRRD 2024-04-10), 그 수의검역 허가도
  //     '출국 최소 4주 전 신청'이라 AIA 는 그보다 더 앞이어야 한다.
  {
    id: 'za-aia-permit',
    category: 'permit',
    title: 'AIA 수입 허가 신청',
    shortLabel: 'AIA',
    // ✅ 1차 출처 확보(2026-07-30) — AIA 신청서 원문 "APPLICATION FOR PERMANENT IMPORTATION OF
    //   DOGS AND RELATED GENETIC MATERIAL", (AIA) Version I of 2026/2027, Directorate Animal
    //   Production / Sub-directorate Animal Improvement. 확인된 사실:
    //     · 4항 "Application to be submitted **30 days prior to importation**."
    //       ⛔ 구 문구 '심사에 최대 30영업일이 걸리니'는 **틀렸다**(2026-07-30 정정). 서식에
    //         심사 소요기간은 없고, 30일은 **신청 마감**(수입 30일 전)이며 영업일도 아니다.
    //         초안의 '처리기간 30영업일'을 그대로 옮긴 것이었다.
    //     · 6항 "Import permits are valid for a period of **six months** and apply to **one
    //       consignment only**." → 6개월 유효 ✅ + '1회 운송'도 사실이었다(사용자가 완화한 표현
    //       그대로 두되, 되살리려면 이 근거를 쓸 것).
    //     · 1항 "where the intended stay **exceeds three months**" → 3개월 초과 체류가
    //       영구수입 신청서 대상 ✅ (사용자 지시로 문구에서만 뺐다 — 사실은 맞다).
    //     · 5(g) "Sterilization Certificate (**all companion/unregistered dogs**)" → 중성화
    //       증명서 ✅ (같이 뺀 줄이지만 사실은 맞다. 서류 탭 za-desexing-certificate 는 유지).
    //     · 5(c) 수수료 R420.00 (non-refundable, 2026/2027) · 제출처 The Registrar of Animal
    //       Improvement, Animalimp@nda.gov.za → 카드의 'Animal Improvement Registrar' 표기 ✅
    // 사용자 확정본 4줄(2026-07-30 직접 지정) — 3번째 줄만 위 정정으로 사실을 바로잡았다.
    //   ⛔ 나머지를 다듬지 말 것. 일부러 뺀 줄: 개 전용 안내(카드가 개 전용이라 자명) · 순서 안내
    //   (수입 허가 카드가 담당) · 영구수입 신청서 · 중성화 증명서 · 대행업체 확인.
    description:
      '남아프리카공화국 농업부 Animal Improvement Registrar에 AIA 수입 허가를 신청하세요.\n\n수의검역 수입 허가와는 별개의 서류예요.\n수입 30일 전까지 신청해야 해요.\n허가는 발급일부터 6개월간 유효해요.',
    doneSummary: 'AIA 수입 허가를 받았어요.',
    cardLine: 'AIA 수입 허가를 신청하세요.',
    applicability: { destinations: ['south_africa'], species: 'dog', tripType: 'all' },
    order: 38,
    // 버튼 완료 카드(2026-07-30 사용자 확정) — **호주 수입 허가와 같은 모델**.
    //   이 절차에서 앱이 알아야 하는 건 '허가를 받았는가' 하나뿐이다. 규정이 요구하는 것도
    //   수의검역 허가 신청에 **AIA 허가서를 첨부**하는 것이라, 신청일을 받아 둘 이유가 없다.
    //   버튼이 오늘 날짜를 아래 필드에 기록한다(화면에 입력칸은 뜨지 않는다).
    //   ⛔ 신청일 기반 검증(구 za.aia-permit-not-after-departure)을 되살리지 말 것 —
    //     저장되는 값이 신청일이 아니라 **허가 취득일**이라 판정 근거가 달라진다(호주와 동일).
    //     수입 허가와의 순서는 허가 카드의 게이트(importPermitPrerequisiteError)가 담당하고,
    //     그 게이트는 이제 '날짜가 있는가'가 아니라 **완료됐는가**를 본다.
    buttonComplete: true,
    done: 'dated:za_aia_permit_application_date',
    inputs: [
      {
        key: 'za_aia_permit_application_date',
        label: '허가 취득일',
        type: 'date',
        helpText: 'AIA 수입 허가를 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: 'AIA 수입 허가서를 사진·PDF로 보관하세요.',
    attachmentLabel: '남아프리카공화국 AIA 수입 허가증',
  },

  // ── 남아공 검역시설 예약 (개 전용) — 수의검역 수입 허가 **발급 전** ───────────────
  // 한국은 남아공의 개 검역 면제국 목록에 없다 → 한국 출발 개는 도착 후 약 14일 국가
  //   검역시설에 들어간다.
  // ⛔ 순서를 '예약(42) → 허가(44)'로 되돌리지 말 것(2026-07-30 사용자 확정으로 정정) —
  //   뉴질랜드(IHS 1.13.2 가 예약 확인서를 신청 제출물로 명시)와 **근거가 다르다**. 남아공은
  //   검역 대상 여부가 **허가서에 명시되고** 그걸 보고 예약한다(주신 자료: "수입허가서에 검역이
  //   명시되면 → State Vet 연락 → 자리 예약 → 예약 확인을 수입허가 신청서에 반영"). 초안의
  //   "검역 자리가 확보되어야 수입허가 절차를 **마칠** 수 있으므로"도 신청이 아니라 발급을
  //   가리킨다. 그래서 허가(40) → 예약(42) 이고, 예약은 허가 **발급** 전에 끝나면 된다.
  //   ⚠️ 그래서 이 카드에는 선행 게이트를 걸지 않는다 — 허가 카드의 게이트는 AIA 하나뿐이다.
  // 운송 예약(46)보다 **앞**이다(2026-07-30 사용자 확정 — 최종). 검역 자리가 귀한 자원이라
  //   그걸 먼저 잡고 거기 맞춰 운송을 예약하는 게 실무다. 둘은 '다음 할 일'에 함께 뜨고,
  //   concurrent 는 쌍의 **뒤쪽**인 운송 예약 카드에 붙어 있다(destination-overrides).
  // ⛔ buttonComplete 로 바꾸지 말 것 — 이 날짜를 **실제 계류 시작일로 읽는 소비처가 셋**이다
  //   (za.quarantine-start-not-before-departure 주의 / 도착 검역 카드의 '예정' 배지
  //   QUARANTINE_START_FIELD_BY_DESTINATION / 이 카드의 완료 판정). 호주·뉴질랜드와 같은 이유.
  {
    id: 'za-quarantine-reservation',
    category: 'permit',
    // 용어는 **호주·뉴질랜드와 통일**한다(2026-07-31 사용자 지정) — 같은 메커니즘(도착 후 지정
    //   시설에 머무름)이라 '계류'로 부른다. 공용 저장 거부 문구도 '계류 시작일'이라, 카드가
    //   '검역'이면 화면과 오류가 어긋난다. ⛔ '검역시설/검역 시작일'로 되돌리지 말 것.
    title: '계류시설 예약',
    shortLabel: '계류장',
    // 사용자 확정본 4줄(2026-07-30 직접 지정). ⛔ 다듬지 말 것 — 뺀 줄이 다섯이다:
    //   · '한국은 남아공의 개 검역 면제국이 아니라서 강아지는 도착 후 검역을 받아요.'
    //   · '수입 허가에 검역이 명시되면 예약해요.'
    //   · '검역 면책동의서(Indemnity Declaration)도 함께 작성해요.'
    //     → 서류 탭 za-indemnity-declaration 이 그 맥락에서 계속 설명한다(첨부 안내에도 남아 있다).
    //   · '검역·검사·운송 비용은 보호자가 부담해요.'
    //   · '예약 확인서와 면책동의서는 수입 허가가 나오기 전에 반영해요.'(그 전에 삭제 —
    //     원문이 순환이라 '반영'이라는 모호한 동사로 뭉뚱그린 문장이었다)
    //   ⚠️ '희망 입국일을 정한 뒤 일찍 문의하세요'는 **남았다** — 운송 정보가 필요하다는 사실을
    //     말하는 유일한 줄이다. 다만 순서는 검역 예약(42) → 운송(46)으로 확정됐다(자리가 먼저).
    description:
      '남아프리카공화국 국가 계류시설에 계류를 예약하세요.\n\n입국 공항의 국가 수의사(State Veterinarian)에게 연락해 자리를 확인해요.\n요하네스버그는 Kempton Park, 케이프타운은 Milnerton 계류시설을 이용해요.\n희망 입국일을 정한 뒤 일찍 문의하세요. 자리가 없는 경우가 많아요.',
    doneSummary: '계류시설을 예약했어요.',
    cardLine: '계류시설을 예약하세요.',
    applicability: { destinations: ['south_africa'], species: 'dog', tripType: 'all' },
    order: 42,
    // 예약을 했다는 사실이 완료 — 검역 시작일이 미래여도 카드는 완료다(호주·뉴질랜드와 동일).
    done: 'booked:za_quarantine_reservation_date',
    inputs: [
      {
        key: 'za_quarantine_reservation_date',
        label: '계류 시작일',
        type: 'date',
        helpText: '예약한 계류 시작 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '계류시설 예약확인서·면책동의서를 사진·PDF로 보관하세요.',
    attachmentLabel: '남아프리카공화국 계류시설 예약확인서',
    // 출국일 ≤ 검역 시작일 주의는 **운송 예약 카드**에 둔다(출국일 칸이 있는 쪽) —
    //   호주·뉴질랜드·싱가포르와 같은 배치. 저장 거부는 이 카드에도 걸린다.
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
      { url: 'https://webaps-prod.nac.naccs.jp/anau/anipas/AOWZ01/OWZ01W02O', label: '사전 신고 신청(NACCS)' },
      { url: '/guide/jp-quarantine-contacts', label: '동물검역소 연락처' },
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
    // 명단 단일 출처: GENERAL_VACCINE_CARD_DESTINATIONS (applicability.ts — 포함/제외 판단
    // 근거 주석도 그쪽에). common.general-vaccine-validity-expired '주의' 룰과 공유.
    applicability: {
      destinations: [...GENERAL_VACCINE_CARD_DESTINATIONS],
      species: 'all',
      // 호주 고양이도 이 카드를 띄운다(2026-07-28 사용자 지시). DAFF 고양이 가이드 7.2 는
      //   종합백신(FVRCP)을 "not mandatory" 로 두지만, 계류시설이 접종 증명을 요구해
      //   실무상 필요하다 — 켄넬코프 카드(개)와 같은 이유다. 문구가 '입국 요건이 아니라
      //   계류시설 예약용'임을 밝히므로 없는 요건을 요구하는 문제는 없다.
      //   ⚠️ 검증(au.general-vaccine-14days-before-departure·within-12months)은 개 전용
      //   그대로다 — 고양이는 DAFF 가 시점·유효기간을 규정하지 않는다.
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
      // 이미 만료 — 카드 문구는 정적 기본으로 두고(advisory 배치만 유지), 만료일·조치는
      // common.general-vaccine-validity-expired '주의' 배지가 알린다(만료 재구성 B, 2026-07-25).
      if (validUntil && validUntil < today) {
        return { advisory: true }
      }
      // 출국(입국) 전 만료 — 문구는 **주의 룰**(common.general-vaccine-validity-expired)이
      //   담당하고 여기서는 배치(advisory)만 남긴다. 2026-07-30 사용자 확정("카드가 있으면
      //   모두 주의가 맞아")으로 이 상태가 안내 → 주의로 올라갔다. 문구를 여기 남기면
      //   같은 사실이 카드 본문과 주의 배지에 두 벌로 나간다.
      if (entry && validUntil && validUntil < entry) {
        return { advisory: true }
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
    // 이미 만료(오늘 기준) '주의' — 종합백신 카드국 전체 공통(만료 재구성 B).
    validationIds: ['common.general-vaccine-validity-expired'],
  },

  // ── 6. 독감(CIV) — 강아지만 ─────────────────────────────────────────────
  {
    // ── 켄넬코프(Bordetella) ─────────────────────────────────────────────
    // **종합백신과 별개 백신**이라 카드를 나눈다(2026-07-27 사용자 지정). 한동안 괌 종합백신
    //   카드에 '켄넬코프도 함께 접종해야 해요' 한 줄로 얹혀 있었는데, 다른 백신을 한 카드에서
    //   말하면 접종 기록도 종합백신 배열에 섞여 들어간다.
    // 모델은 종합백신과 동일 — 연 1회 백신 + 유효기간이 입국일을 커버해야 완료
    //   (done: has-kennel-cough 는 has-general-vaccine 과 같은 판정, 읽는 배열만 다르다).
    // 명단은 프로파일 vaccines 의 'kennel' 선언에서 파생 — 새 목적지가 선언하면 자동으로 뜬다.
    id: 'kennel-cough-vaccine',
    category: 'vaccination',
    title: '켄넬코프 백신',
    shortLabel: '켄넬',
    description: '켄넬코프(Bordetella) 백신을 접종하세요.',
    doneSummary: '켄넬코프 백신을 접종했어요.',
    applicability: {
      destinations: destinationsWithVaccine('kennel'),
      species: 'dog',
      tripType: 'all',
    },
    order: 39,
    done: 'has-kennel-cough',
    // 광견병·종합백신과 순서 의존 없음 — 마이크로칩 이후 함께 진행할 수 있다.
    concurrent: true,
    /**
     * 만료 안내 — 종합백신 situational 과 **같은 모델**(2026-07-30 사용자 지적으로 신설).
     *
     * 왜 필요했나: 완료 판정(has-kennel-cough)은 종합백신과 같은 함수라 **유효기간이 입국일을
     * 커버해야 완료**인데, 켄넬코프 카드에만 그 사실을 알리는 문구가 없었다. 그래서
     * 접종일을 넣어도 카드가 미완료로 남고, concurrent 라 '다음 할 일'로 올라가서
     * 붙일 날짜도 안내도 없는 상태 → 타임라인 마지막 폴백인 **'예정'** 칩이 찍혔다.
     * 이미 접종한 카드에 '예정'이 뜨니 읽는 사람은 이유를 알 수 없다.
     * 안내를 붙이면 칩이 '안내'로 바뀌고(렌더 순서상 안내가 예정보다 앞) 이유도 드러난다.
     *
     * ⚠️ 문구는 '입국 요건'이 아니라 **계류시설 제출용** 맥락이다 — 켄넬코프는 DAFF 입국
     *   요건이 아니고(호주 override 주석), 계류시설 예약이 접종 증명을 요구해서 넣은 카드다.
     */
    situational: (caseRow) => {
      const entries = readKennelCoughEntries(caseRow)
      if (entries.length === 0) return undefined
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const latest = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      const today = todayKst()
      // 미래(예정) 접종만 있으면 기본 안내로 둔다(날짜는 일정 칩에만) — 종합백신과 동일.
      if (latest.date > today) return undefined
      // 문구는 **주의 룰**(common.kennel-cough-validity-expired)이 담당 — 여기서는 배치만.
      //   2026-07-30 사용자 확정으로 만료는 안내가 아니라 주의다(종합백신과 같은 처리).
      if (validUntil && validUntil < today) return { advisory: true }
      if (entry && validUntil && validUntil < entry) return { advisory: true }
      return undefined
    },
    inputs: [{ key: 'kennel_cough_dates', label: '접종일', type: 'date_array', hasValidUntil: true }],
    allowAttachments: true,
    attachmentLabel: '켄넬코프백신',
    // 만료 '주의' — 켄넬코프 카드국 전체 공통(2026-07-30). 종합백신과 같은 자리.
    validationIds: ['common.kennel-cough-validity-expired'],
  },
  // ── 심장사상충 검사 ────────────────────────────────────────────────
  // 구충과 **별개 절차**라 카드를 나눈다(2026-07-27 사용자 지정). 예전엔 괌 내부 기생충
  //   카드가 '심장사상충 예방도 함께' 로 겸했는데, 치료 기록이 구충 배열에 섞였다.
  // 모델은 구충과 동일(date_array, 유효기간 개념 없음 — 최근 기록 도래로 완료).
  // 명단은 프로파일 vaccines 의 'heartworm' 선언에서 파생.
  {
    id: 'heartworm-test',
    category: 'lab',
    title: '심장사상충 검사',
    shortLabel: '심장',
    description: '심장사상충 검사·예방을 하세요.',
    doneSummary: '심장사상충 검사를 했어요.',
    applicability: {
      destinations: destinationsWithVaccine('heartworm'),
      species: 'all',
      // 뉴질랜드는 **강아지 전용** — IHS 2.11 조항 제목이 "Heartworm (Dirofilaria immitis)
      //   **(dogs)**" 다(2026-07-27 원문 확인). 괌은 종전대로 두 종 모두.
      // 남아공도 **강아지 전용** — 심장사상충 예방 조항이 개 건강증명서에만 있다.
      speciesByDestination: { new_zealand: 'dog', south_africa: 'dog' },
      tripType: 'all',
    },
    order: 108,
    done: 'has-heartworm',
    concurrent: true,
    inputs: [{ key: 'heartworm_dates', label: '검사일', type: 'date_array' }],
    allowAttachments: true,
    attachmentLabel: '심장사상충 검사',
  },
  // ── 폐충(Angiostrongylus vasorum) 치료 ──────────────────────────────
  // 신 IHS 2026 에서 새로 들어온 항목(뉴질랜드 2.4). 내부구충과 **시점만 같고 약이 다르다** —
  //   구충약이 폐충까지 커버하지 않는 경우가 많아 별도 처치가 필요하다. 구충 카드에 한 줄로
  //   얹어 두면 '구충약 하나로 끝'으로 읽혀 카드를 뗀다(2026-07-29 사용자 지정 — 심장사상충을
  //   구충에서 뗀 것과 같은 처리).
  // 모델은 구충·심장사상충과 동일(date_array, 유효기간 개념 없음 — 최근 기록 도래로 완료).
  // 명단은 프로파일 vaccines 의 'lungworm' 선언에서 파생 — 현재 뉴질랜드뿐이다.
  {
    id: 'lungworm-treatment',
    category: 'lab',
    title: '폐충 치료',
    shortLabel: '폐충',
    description: '폐충 치료를 하세요.',
    doneSummary: '폐충 치료를 했어요.',
    applicability: {
      destinations: destinationsWithVaccine('lungworm'),
      species: 'all',
      // 뉴질랜드는 **강아지 전용** — IHS 2026 조항 제목이 "2.4 Angiostrongylus vasorum
      //   **(dogs)**" 이고 본문도 "The dog must be treated ..." 다(2026-07-30 원문 확인).
      //   심장사상충(2.11 (dogs))과 같은 처리.
      speciesByDestination: { new_zealand: 'dog' },
      tripType: 'all',
    },
    // 내부구충(100) 뒤, 심장사상충(108) 앞 — 같은 날 끝나는 처치라 나란히 둔다.
    order: 104,
    done: 'has-lungworm',
    concurrent: true,
    inputs: [{ key: 'lungworm_dates', label: '치료일', type: 'date_array' }],
    allowAttachments: true,
    attachmentLabel: '폐충 치료',
  },
  {
    id: 'civ-vaccine',
    category: 'vaccination',
    title: '독감(CIV) 백신',
    shortLabel: '독감',
    description: '강아지 인플루엔자(CIV) 백신을 접종하세요. 호주·뉴질랜드·인도 등 일부 국가에서 요구돼요.',
    doneSummary: '독감(CIV) 백신을 접종했어요.',
    // vaccines 선언('civ' 포함국 — 호주·뉴질랜드·인도) 파생.
    applicability: {
      destinations: destinationsWithVaccine('civ'),
      species: 'dog',
      tripType: 'all',
    },
    order: 60,
    done: 'has-civ-vaccine',
    inputs: [
      { key: 'civ_dates', label: '접종일', type: 'date_array', hasValidUntil: true },
    ],
    allowAttachments: true,
    attachmentLabel: 'CIV백신',
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
    // vaccines 선언('infectious_disease' 포함국 — 호주·뉴질랜드·남아공) 파생.
    applicability: {
      destinations: destinationsWithVaccine('infectious_disease'),
      species: 'all',
      // 호주는 **강아지 전용** — Group 3 고양이 가이드에 리슈만편모충·브루셀라·렙토 검사가
      //   아예 없다(2026-07-27 원문 확인).
      // 뉴질랜드도 **강아지 전용** — IHS 2026 Part 2 에서 바베시아(2.5~2.7)·브루셀라(2.8)·
      //   리슈만편모충(2.12)·렙토스피라(2.13) 조항 제목이 전부 "(dogs)" 다(2026-07-27 원문 확인).
      // 남아공도 **강아지 전용**으로 바꿨다(2026-07-30) — 5종 검사(Brucella canis ·
      //   Trypanosoma evansi · Babesia gibsoni · Dirofilaria immitis · Leishmania)는 개
      //   건강증명서에만 있고, 고양이는 서류만 맞으면 검사·격리 없이 통관된다.
      //   구 'all' 은 앱 카드가 없던 시절의 기본값이었을 뿐 근거가 아니었다.
      speciesByDestination: { australia: 'dog', new_zealand: 'dog', south_africa: 'dog' },
      tripType: 'all',
    },
    order: 70,
    done: 'has-infectious-disease-test',
    // 검사 → 결과 2단계(2026-07-30). 검사일이 도래했는데 아직 결과 확인 전이면 다음 행동을
    //   지시한다 — 항체 검사·사전 신고와 같은 문형. 우측 '진행 중' 칩과 짝.
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (data.infectious_disease_confirmed === true) return undefined
      const arrived = readInfectiousDiseaseEntries(caseRow).some(
        (e) => e.date.length >= 10 && e.date <= todayKst(),
      )
      if (!arrived) return undefined
      const msg = '전염병 검사를 진행 중이에요. 결과가 나오면 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    inputs: [
      { key: 'infectious_disease_records', label: '검사일', type: 'date_array' },
    ],
    allowAttachments: true,
    attachmentLabel: '전염병 검사 결과지',
  },

  // ── 8. 외부구충 ────────────────────────────────────────────────────────
  {
    id: 'external-parasite',
    category: 'preparation',
    title: '외부 기생충 치료',
    shortLabel: '외부',
    description:
      '출국 직전에 진드기·벼룩 치료를 하세요. 호주·뉴질랜드 등에서 요구돼요.',
    doneSummary: '외부 기생충 치료를 했어요.',
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
        'singapore',
        // 남아공 — 살진드기제(acaricide)와 흡혈곤충 기피제(repellent) 처치. **개 전용**이다
        //   (바베시아·리슈만편모충 매개체 차단이 목적이고, 두 검사가 개에게만 붙는다).
        'south_africa',
      ],
      species: 'all',
      speciesByDestination: { south_africa: 'dog' },
      tripType: 'all',
    },
    order: 80,
    done: 'has-external-parasite',
    // 2회 요건국(호주)에서 1회만 마친 상태 → '2차 외부 기생충 치료를 하세요.'
    situational: (caseRow) => parasiteNextDoseSituational(caseRow, 'external', '외부 기생충 치료'),
    inputs: [
      { key: 'external_parasite_dates', label: '치료일', type: 'date_array' },
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
        // 괌 — 내·외부 기생충과 심장사상충을 '도착 14일 이내'에 함께 처치한다
        //   (www 괌 가이드 9항). 외부(external-parasite)에는 이미 있었는데 내부만 빠져 있었다.
        'guam',
        'australia',
        'new_zealand',
        'turkey',
        'philippines',
        // 멕시코·브라질 — 위 외부구충과 같은 근거.
        'mexico',
        'brazil',
        // 아랍에미리트 — 외부 카드에는 있는데 내부만 빠져 있었다(2026-07-22 발견).
        // MOCCAE 는 내·외부를 함께 요구한다("preventive doses for internal and external
        // parasites during the 14 days prior to shipment") — 룰(ae.internal-parasite-
        // within-14days)도 이미 있었는데 카드가 안 떠서 죽어 있었다.
        'uae',
        // 싱가포르 — NParks Schedule III IV(a)(vi): 출국 2~7일 내 내·외부 구충.
        'singapore',
      ],
      species: 'all',
      tripType: 'all',
    },
    order: 90,
    done: 'has-internal-parasite',
    // 2회 요건국(호주·뉴질랜드)에서 1회만 마친 상태 → '2차 내부 기생충 치료를 하세요.'
    situational: (caseRow) => parasiteNextDoseSituational(caseRow, 'internal', '내부 기생충 치료'),
    // 내·외부 구충은 **보통 같은 날 한 방문에서** 한다(2026-07-29 사용자 지정). 순차로 띄우면
    //   하나 끝내야 다음이 올라와 실제 병원 방문 흐름과 어긋난다. 바로 앞 외부구충(order 80)이
    //   '다음 할 일'일 때 이 카드도 함께 올라오도록 concurrent 로 둔다.
    // ⛔ 이 플래그는 **뒤쪽 카드**에 다는 것이다 — 승격 로직이 mainIdx **직후**로 이어지는
    //   concurrent 들을 올리기 때문. 외부구충에 달면 짝이 안 만들어진다.
    // 예외 3곳은 destination-overrides 에서 concurrent: false 로 끈다(필리핀·호주·뉴질랜드) —
    //   각 사유는 그쪽 주석 참고.
    concurrent: true,
    inputs: [
      { key: 'internal_parasite_dates', label: '치료일', type: 'date_array' },
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
    // 촌충 의무국(EU Reg 2018/772) — 개 전용 내부구충 vaccines 선언에서 파생.
    applicability: {
      destinations: [...TAPEWORM_DESTINATIONS],
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
    // importPermit 프로파일 선언국(호주·뉴질랜드·대만·말레이시아·태국·필리핀·스위스) 파생.
    applicability: {
      destinations: [...IMPORT_PERMIT_DESTINATIONS],
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
      '출국 전 10일 이내에 동물병원을 방문해서 임상 수의사의 검진을 받으세요.\n\n접종 및 건강증명서(별지 제 25호 서식)를 발급받아요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.',
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
      '출국 전 10일 이내에 동물검역소를 방문해 검역을 받으세요.\n반려동물을 데리고 방문하세요.\n신분증과 필수 서류를 빠짐없이 챙기세요.',
    doneSummary: '한국 수출 검역을 받았어요.',
    cardLine: '동물검역소를 방문해 검역을 받으세요.',
    applicability: { destinations: 'all', species: 'all', tripType: 'all' },
    order: 120,
    // 출국 전 검역소 방문 가능 구간 — 임상검사(vet-visit)와 동일한 '출국 전 10일 이내' 윈도우.
    deadline: { anchor: 'departure', daysBefore: 9, window: true },
    done: 'has-kr-export-quarantine',
    inputs: [
      { key: 'kr_export_quarantine_date', label: '검역일', type: 'date' },
    ],
    validationIds: ['common.kr-export-quarantine-date-valid'],
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
    // '동물검역증'만으로는 한국 수입검역증·현지 수출검역증과 구분되지 않는다(보관함에서
    // 이름으로 못 찾음). 서류탭 표기와 같은 '한국 수출 동물검역증'으로 통일.
    attachmentLabel: '한국 수출 동물검역증',
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
    // 첨부는 **전 목적지에서 가능**하다. 예전 주석은 "base 는 첨부 불가 — 일본에서만
    // 효과"라고 적혀 있었지만 사실이 아니었고, 그래서 일본용 영문 이름이 태국·필리핀과
    // 큐레이션 없는 24개국까지 그대로 샜다(2026-07-20 발견).
    // 여기 기본값은 **어느 나라에도 맞는 중립 이름**이어야 한다 — 발급 서류가 확인된
    // 나라는 각자 override 에서 정식 이름을 준다(일본·베트남·태국·중국 등).
    attachmentLabel: '수입 검역 서류',
    // 일본 override 가 jp_import_quarantine_date 입력으로 사용 — 이 룰은 non-JP 케이스에선
    // country: 'japan' 필터로 자동 비활성.
    validationIds: ['jp.import-quarantine-date-valid'],
  },

  // ── 귀국 서류 준비 (왕복 — 미국 본토, USDA 승인 건강증명서) ────────────────
  // 미국 → 한국 귀국: 한국 입국용 건강증명서를 미국 공인 수의사에게 받고 USDA 승인을 받는다.
  // ⚠️ **하와이(hi-export-health-cert)와 같은 카드여야 한다** — 같은 연방 절차(USDA APHIS
  //   VEHCS 배서·출국 전 30일 이내)라 지명 말고는 다를 이유가 없다. 2026-07-26 하와이만 '귀국
  //   서류 준비' 가족(EU·대만·캐나다)으로 개명·재정렬되면서 본토가 혼자 옛 이름('미국 수출
  //   건강증명서')·옛 문형으로 남아 있던 것을 사용자 지적으로 맞췄다.
  //   설명문은 하와이 것을 **그대로** 쓴다(지명이 들어 있지 않아 본토에도 그대로 맞는다).
  //   문구를 고칠 땐 두 카드를 함께 고칠 것.
  {
    id: 'us-export-health-cert',
    category: 'document',
    title: '귀국 서류 준비',
    shortLabel: '귀국서류',
    description:
      'USDA 승인 국제 건강증명서 또는 대체 서류를 준비하세요.\n\n출국 전 30일 이내에 USDA 공인 수의사의 진료를 받아요. 수의사가 국제 건강증명서를 작성하고 VEHCS로 USDA APHIS 승인을 신청해요.\n\n다음 서류가 있다면 USDA 승인을 새로 받지 않아도 돼요\n- 한국 출국 시 받은 동물검역증',
    doneSummary: '귀국 서류를 준비했어요.',
    cardLine: '귀국 서류를 준비하세요.',
    // 괌 — 미국령이라 **같은 연방 절차**(USDA 공인 수의사 → VEHCS → APHIS 승인)를 탄다.
    //   하와이는 카드 구성이 달라 전용 카드(hi-export-health-cert)를 뒀지만, 괌은 본토와
    //   차이가 없어 이 카드를 그대로 공유한다(2026-07-26). 저장 필드는 by_dest 분리라 안전.
    applicability: { destinations: ['usa', 'guam'], species: 'all', tripType: 'round' },
    order: 150,
    done: 'dated:us_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'us_export_quarantine_date',
        label: '발급·승인일',
        type: 'date',
        helpText: '수의사 발급과 USDA 승인을 완료한 날짜',
      },
    ],
    allowAttachments: true,
    // '원본과 사본을 보관' 혼합문 교정 — 하와이와 함께 앱 표준 문형으로(2026-07-26).
    // 원본 실물 안내는 설명문("승인본을 한국 입국 때 제출")이 담당.
    attachmentHint: 'USDA 승인 국제 건강증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: 'USDA 승인 국제 건강증명서',
    links: [
      {
        url: 'https://direct.aphis.usda.gov/pet-travel/us-to-another-country-export/pet-travel-us-korea',
        label: '미국에서 한국으로 반려동물 데려오기(USDA)',
      },
    ],
  },

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
    done: 'dated:jp_export_quarantine_visit_date',
    buttonComplete: true,
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
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
    // 저장 이름 = 서류탭 이름. 일반명 검역증은 '{국가} 수출/수입 동물검역증'으로 통일
    // (2026-07-20 사용자 지정). 정식 영문명(Export Quarantine Certificate)은 설명문과
    // required-docs 쪽에 남아 있다.
    attachmentLabel: '일본 수출 동물검역증',
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
      // 첫 문장은 나라 이름으로 시작한다 — 수출검역 카드 전체 통일(사용자 지정 2026-07-21).
      '태국 출국 전 공항 동물검역소에서 수출 검역을 받으세요.\n출국 직전(1~3일 전 권장)에 방문하세요. 주말·공휴일·야간에는 검역을 받을 수 없어요.\n접종 증명서를 꼭 챙기세요.\n검사를 통과하면 수출허가서(R.9)와 건강증명서가 발급돼요. 한국 입국 때 이 서류가 반드시 필요해요.',
    doneSummary: '태국 수출 검역을 받았어요.',
    cardLine: '태국 동물검역소에서 수출 검역을 받으세요.',
    applicability: { destinations: ['thailand'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:th_export_quarantine_date',
    buttonComplete: true,
    // 입력 후 항공편 수정으로 어긋난 검역일(태국 입국일 이전·귀국일 이후)을 '주의'로 표면화.
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
    attachmentLabel: '수출 허가서(R.9)',
  },

  // ── 말레이시아 수출 검역 (왕복 — 귀국 출국 시, 말레이시아 전용) ───────
  // ⚠️ 태국 수출 검역 카드 복제(2026-07-22) — 문구·서식명(R.9)은 아직 태국 것. 규정 확정 후 수정.
  {
    id: 'my-export-quarantine',
    category: 'document',
    title: '말레이시아 수출 검역',
    shortLabel: '수출',
    // ✅ 2026-07-23 DVS·MAQIS 원문 조사로 전면 교체(사용자 제공). 태국 복제 잔재를 걷어냈다:
    //   ⛔ '공항 동물검역소에서 검역' — 틀렸다. 검사·VHC 발급은 **주(州) DVS 지청**이다.
    //      공항 MAQIS 는 출국 당일 최종 확인만 한다(별개 단계).
    //   ⛔ 'R.9' — 근거 없음. DVS 원문은 Export Permit(MAQIS)·VHC(DVS)만 쓰고 서식 번호가 없다.
    //   ⛔ '1~3일 전·주말 불가' — 근거 없음. 발급 기한은 **목적국 규정 우선**이라 숫자를 안 쓴다.
    //   구조: 신청=E-permit(수출허가+VHC) → 주 DVS 지청에서 동물 검사·VHC 발급 → 출국일
    //         공항 MAQIS 최종 검사. 두 기관(MAQIS 허가 / DVS 증명서)으로 나뉜다.
    description:
      '말레이시아 출국 전 수출 검역을 받고 수출 허가와 수의 건강증명서(VHC)를 받으세요.\n\n반려동물을 데리고 거주 지역의 주(州) DVS 지청에 방문해 검사를 받고 VHC를 발급받아요. 수출 허가는 MAQIS에서 받아요.\n\n두 서류 모두 E-permit 시스템으로 신청해요. 현지 계정 등록이 필요해서 보통 현지 에이전트에 의뢰해요.\n\n출국일에는 공항 MAQIS 검역소에서 서류와 반려동물을 최종 확인해요.',
    doneSummary: '말레이시아 수출 검역을 받았어요.',
    cardLine: '말레이시아 수출 검역을 받으세요.',
    applicability: { destinations: ['malaysia'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:my_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'my_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '주 DVS 지청에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '수출 허가와 건강증명서(VHC) 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '수출 허가·건강증명서(VHC)',
    // ① 반려동물 수출 안내(DVS) ② 신청 절차(MAQIS). 둘 다 200 확인.
    links: [
      { url: 'https://www.dvs.gov.my/index.php/pages/view/1941', label: '반려동물 수출 안내·문의처 (DVS)' },
      { url: 'https://www.maqis.gov.my/index.php/permohonan-permit/', label: '수출 허가 신청 절차 (MAQIS)' },
    ],
  },

  // ── 싱가포르 전용 절차 카드 (NParks 11단계 조사, 2026-07-24) ────────────
  //   계류장 예약(QMS)·강아지 라이선스(PALS)·관부가세(GST)·국경검사 예약. 모두 싱가포르 한정.
  //   각 카드는 완료일(≤오늘) 입력 + 첨부. 날짜 순서 검증은 불필요(절차 완료 추적용) →
  //   lint UNVALIDATED_OK 등록, 스코핑 키는 destination-scoped-fields 등록.
  {
    id: 'sg-quarantine-reservation',
    category: 'permit',
    title: '계류장(AQC) 예약',
    shortLabel: '계류장',
    description:
      '광견병 항체 검사 완료 후 계류장(AQC)을 예약하세요.\n\n자리가 없는 경우가 많아서 일찍 해두는 게 좋아요.\n싱가포르 검역관리시스템(QMS)에서 예약해요.\n팬룸 또는 에어컨룸을 선택할 수 있어요.\n격리 기간은 30일이에요.',
    doneSummary: '계류장(AQC)을 예약했어요.',
    cardLine: '계류장(AQC)을 예약하세요.',
    applicability: { destinations: ['singapore'], species: 'all', tripType: 'all' },
    order: 62,
    // 수입 허가와 동일 신청 → 발급 2단계 모델. 신청일 입력 = 진행 중, 확인서 첨부·완료 버튼 = 완료.
    done: 'has-sg-quarantine-reservation',
    // 신청일(채혈 이후) + 예약 날짜(항체 창 90일~12개월, 선택 입력) 두 룰이 이 카드에 붙는다.
    validationIds: [
      'sg.quarantine-reservation-after-titer',
      'sg.quarantine-reservation-date-within-titer-window',
    ],
    hasInputData: (caseRow) =>
      deriveApplicationStatus(caseRow, SG_QUARANTINE_RESERVATION_APP_SPEC) !== 'not_started',
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed =
        typeof data.sg_quarantine_reservation_application_date === 'string'
          ? data.sg_quarantine_reservation_application_date
          : ''
      if (filed.length >= 10 && filed > todayKst()) return undefined
      if (deriveApplicationStatus(caseRow, SG_QUARANTINE_RESERVATION_APP_SPEC) !== 'in_progress')
        return undefined
      const msg = '계류장(AQC) 예약을 진행 중이에요. 예약이 확정되면 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    inputs: [
      { key: 'sg_quarantine_reservation_application_date', label: '신청일', type: 'date', helpText: '계류장 예약을 신청한 날짜' },
      // 신청일과 함께 입력하는 계류장 격리 예약 날짜(정보성 — 일본 수출검역 예약일 패턴).
      { key: 'sg_quarantine_reservation_date', label: '예약일', type: 'date', helpText: '계류를 시작하는 날짜' },
    ],
    // 첨부 없음(사용자 결정 2026-07-24) — 다운로드할 확정 확인서가 없어 완료는 '완료' 버튼으로만.
    links: [
      { url: 'https://avs.nparks.gov.sg/pets/importing-exporting-a-pet/import/quarantine-management-system/', label: '계류장 예약 (QMS)' },
    ],
  },
  {
    id: 'sg-dog-licence',
    category: 'permit',
    title: '강아지 라이선스',
    shortLabel: '라이선스',
    description:
      '싱가포르 반려동물 라이선스 시스템(PALS)에서 강아지 라이선스를 발급받으세요.\n\n수입 허가 신청 전에 먼저 받아야 해요.\n외국인은 PALS 이용이 어려워 현지 에이전트를 이용하는 경우가 많아요.',
    doneSummary: '강아지 라이선스를 받았어요.',
    cardLine: '강아지 라이선스를 받으세요.',
    // species: 'dog' — 강아지 전용(고양이는 라이선스 불요). order 92 = 항공권(90) 바로 뒤(사용자
    //   지정 2026-07-24: 항공권과 순서 교체). 계류장 예약(62) → 항공권(90) → 강아지 라이선스(92) → 수입허가.
    applicability: { destinations: ['singapore'], species: 'dog', tripType: 'all' },
    order: 92,
    // 수입 허가와 동일 신청 → 발급 2단계 모델. 신청일 입력 = 진행 중, 라이선스 첨부·완료 버튼 = 완료.
    // 버튼 완료 — 대행으로 처리되는 절차라 보호자가 날짜를 알 수 없다(2026-07-28 사용자 결정).
    //   호주 수입 허가 신청과 같은 모델. 신청일 필드는 그대로 쓰되 버튼이 누른 날을 기록한다.
    done: 'dated:sg_dog_licence_application_date',
    buttonComplete: true,
    hasInputData: (caseRow) =>
      deriveApplicationStatus(caseRow, SG_DOG_LICENCE_APP_SPEC) !== 'not_started',
    situational: (caseRow) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed =
        typeof data.sg_dog_licence_application_date === 'string'
          ? data.sg_dog_licence_application_date
          : ''
      if (filed.length >= 10 && filed > todayKst()) return undefined
      if (deriveApplicationStatus(caseRow, SG_DOG_LICENCE_APP_SPEC) !== 'in_progress')
        return undefined
      const msg =
        '강아지 라이선스를 신청 중이에요. 라이선스가 나오면 파일을 첨부하거나 완료 버튼을 누르세요.'
      return { desc: msg, cardDesc: msg }
    },
    inputs: [
      { key: 'sg_dog_licence_application_date', label: '신청일', type: 'date', helpText: '강아지 라이선스를 신청한 날짜' },
    ],
    allowAttachments: true,
    attachmentHint: '라이선스를 사진·PDF로 보관하세요.',
    attachmentLabel: '강아지 라이선스',
    links: [
      { url: 'https://avs.nparks.gov.sg/pets/licensing-a-pet/applying-for-dog-and-cat-licences/applying/', label: '강아지 라이선스 신청 (PALS)' },
    ],
  },
  {
    id: 'sg-gst-permit',
    category: 'permit',
    title: '관세·GST 납부 허가',
    shortLabel: '관부가세',
    description:
      // 주 경로 = GST 납부 허가(사용자 확정 2026-07-25 — 30일 계류 특성상 고객 대부분이
      // 이주·장기 체류). GST 면제(Relief)는 심사제 참고 정보로만 한 줄.
      '싱가포르 도착 전에 관세청 GST 납부 허가(Customs In-Payment permit)를 받으세요.\n\n도착일 기준 14일 이내에 지정 통관대행사(forwarding agent)를 통해 준비해요.\n이 허가는 AVS 수입 허가와 별개예요. 두 가지가 모두 필요해요(수입 허가=동물 수입 / GST permit=세관·GST).\n이주 등 조건에 따라 GST 면제(GST Relief)를 신청할 수 있어요.',
    doneSummary: '관세·GST 납부 허가를 받았어요.',
    cardLine: '관세·GST 납부 허가를 받으세요.',
    applicability: { destinations: ['singapore'], species: 'all', tripType: 'all' },
    order: 102,
    done: 'dated:sg_gst_permit_date',
    // 버튼 완료 — 대행 절차(2026-07-28 사용자 결정). 저장값이 '버튼 누른 날'이라 도착
    //   14일 창 판정이 실제 발급일과 어긋나므로 검증을 뗀다(sg.gst-permit-within-14days 삭제).
    buttonComplete: true,
    // 버튼이 오늘 날짜를 여기에 기록한다 — 화면에는 입력칸이 뜨지 않는다.
    inputs: [{ key: 'sg_gst_permit_date', label: '발급일', type: 'date', helpText: 'GST 납부 허가를 받은 날짜' }],
    allowAttachments: true,
    attachmentHint: 'GST 허가서를 사진·PDF로 보관하세요.',
    attachmentLabel: 'GST 납부 허가',
    // 관세청 이주 반려동물 통관 페이지(2026-07-23 개편판) + AVS 공인 에이전트 목록 —
    // 둘 다 2026-07-25 브라우저로 유효 확인(구 forwarding agents 링크는 개편으로 404).
    links: [
      { url: 'https://www.customs.gov.sg/personal-shipment/moving-to-singapore/importing-personal-pets-as-part-of-a-change-of-residence/', label: '반려동물 수입 통관·GST 안내 (Singapore Customs)' },
      { url: 'https://avs.nparks.gov.sg/outreach/resources/avs-recognised-pet-agents/', label: 'AVS 공인 에이전트 목록' },
    ],
  },
  {
    id: 'sg-border-inspection',
    category: 'permit',
    title: '국경 검사 예약',
    shortLabel: '검사예약',
    description:
      // 사용자 최종안 2줄(2026-07-25) — 신청 항목 나열·QMS/투아스 설명 삭제.
      '도착 최소 5일 전에 AVS 온라인 시스템에서 창이 공항 검역소(CAPQ) 도착 검사를 예약하세요.\n\n예약 없이 도착하면 시간당 S$133의 검사비가 붙어요.',
    doneSummary: '국경 검사를 예약했어요.',
    cardLine: '국경 검사를 예약하세요.',
    applicability: { destinations: ['singapore'], species: 'all', tripType: 'all' },
    order: 104,
    // 예약일 자체가 완료 증거 — 확인 게이트 없이 날짜(≤오늘) 입력만으로 완료(dated 모델).
    // 예약형 — 검사 예약일이 미래여도 '예약했다'가 완료다(호주 계류시설 예약과 같은 판단,
    //   2026-07-28). ⛔ 같은 싱가포르라도 sg-gst-permit 은 **발급일**(이미 받은 것)이라
    //   dated 그대로 둔다.
    // 버튼 완료 — 대행 절차(2026-07-28 사용자 결정). booked(예약일 입력) 모델에서 되돌렸다.
    done: 'dated:sg_border_inspection_date',
    buttonComplete: true,
    // 저장값이 '버튼 누른 날'이라 도착 5일 전 판정이 실제 예약일과 어긋난다 — 검증 삭제.

    // 버튼이 오늘 날짜를 여기에 기록한다 — 화면에는 입력칸이 뜨지 않는다.
    inputs: [{ key: 'sg_border_inspection_date', label: '예약일', type: 'date', helpText: '국경 검사를 예약한 날짜' }],
    allowAttachments: true,
    attachmentHint: '예약 확인서를 사진·PDF로 보관하세요.',
    attachmentLabel: '국경 검사 예약 확인서',
    // NParks 수입 절차가 안내하는 예약 시스템(2026-07-25 브라우저 유효 확인).
    links: [
      { url: 'https://avs-eservices.nparks.gov.sg/eservices', label: '도착 검사 예약 (AVS eServices)' },
    ],
  },

  // ── 호주 수출 검역 (왕복 — 귀국 출국 시, 호주 전용) ─────────────────
  // 출처: DAFF "Exporting companion animals and other live animals"(2026-07-27 확인).
  //   호주는 출국 절차를 **정부가 강제**한다(강제 O — 한국 수출검역증으로 갈음 불가):
  //   ① NOI(Notice of Intention to Export Live Animals) 를 출발 주(州) 지역사무소에 이메일
  //      제출 — **출발 10영업일 전까지**. NOI 자체에 심사 수수료가 있고, 승인이 곧 허가는 아니다.
  //   ② 등록 수의사의 최종 건강·복지 검진 — **출발 72시간 이내**(+ 신고서 서명)
  //   ③ DAFF 인증 수의관과의 사전 출국 예약(pre-export appointment) — ②보다 뒤여야 한다
  //   ④ DAFF 가 **수출허가(export permit) + 건강증명서** 발급 → 발급 후 **72시간 이내 출국**
  // 버튼 완료 카드 — 보호자가 아는 것은 '증명서를 받았다'는 사실이라, 발급일 하나로 끝낸다
  //   (싱가포르 수출 검역과 같은 모델).
  {
    id: 'au-export-quarantine',
    category: 'document',
    title: '호주 수출 검역',
    shortLabel: '수출',
    description:
      '호주 검역당국(DAFF)에서 수출 허가와 건강증명서를 받으세요.\n\n출발 10영업일 전까지 수출 신고서(NOI)를 출발하는 주의 지역사무소에 이메일로 제출해요.\n\n출발 72시간 이내에 등록 수의사에게 최종 검진을 받고 신고서에 함께 서명해요.\n\n최종 검진을 마친 뒤 DAFF 수의관과의 사전 출국 예약에서 서류를 확인받아요.\n\n수출 허가와 건강증명서가 나오면 72시간 이내에 출국해야 해요.\n\n운송업체가 대신 제출하고 예약에 참석할 수 있어요.',
    doneSummary: '호주 수출 검역을 받았어요.',
    cardLine: '호주 수출 검역을 받으세요.',
    applicability: { destinations: ['australia'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:au_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'au_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '수출 허가와 건강증명서를 발급받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '수출 허가와 건강증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '호주 수출 허가·건강증명서',
    links: [
      {
        url: 'https://www.agriculture.gov.au/biosecurity-trade/export/controlled-goods/live-animals/companion-and-other-live-animals',
        label: '수출 절차·신고서(NOI) 안내 (DAFF)',
      },
    ],
    validationIds: ['au.export-quarantine-before-return'],
  },

  // ── 뉴질랜드 수출 증명 (왕복 케이스 한정) ─────────────────────────────────
  // 뉴질랜드는 출국 절차를 **정부가 강제한다**(강제 O) — MPI "Requirement documents for pets
  //   leaving NZ": "If you're exporting live animals, you're legally required to get an Animal
  //   Welfare Export Certificate (AWEC)." 한국 입국용 수출 건강증명서는 MPI 보안용지 서식으로
  //   발급되고, 서명 권한이 있는 수의사가 따로 정해져 있다.
  // ⚠️ **확정 일정(며칠 전 신청 등)은 아직 1차 출처로 확인하지 못했다.** MPI 는 목적국별
  //   OMAR 를 따로 두는데 한국 OMAR 존재 여부가 확인되지 않아, 문구에 숫자를 넣지 않았다.
  //   확인되면 이 카드에 '출국 N일 전까지' 를 넣을 것(호주 NOI 10영업일과 같은 자리).
  // 버튼 완료 카드 — 보호자가 아는 것은 '증명서를 받았다'는 사실이라 발급일 하나로 끝낸다.
  {
    id: 'nz-export-quarantine',
    category: 'document',
    title: '뉴질랜드 수출 증명',
    shortLabel: '수출',
    description:
      '뉴질랜드에서 출국하기 전에 수출 증명 서류를 받으세요.\n\n살아 있는 동물을 뉴질랜드 밖으로 보내려면 동물복지 수출증명서(AWEC)가 반드시 필요해요.\n\n한국 입국에 필요한 수출 건강증명서도 함께 받아요. MPI 보안용지에 인쇄된 서식으로 발급돼요.\n\n어느 동물병원에서 발급받을 수 있는지, 언제까지 신청해야 하는지는 MPI나 운송업체에 미리 확인하세요.',
    doneSummary: '뉴질랜드 수출 증명을 받았어요.',
    cardLine: '뉴질랜드 수출 증명을 받으세요.',
    applicability: { destinations: ['new_zealand'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:nz_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'nz_export_quarantine_date',
        label: '발급일',
        type: 'date',
        helpText: '수출 증명 서류를 발급받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '수출증명서·건강증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '뉴질랜드 수출증명서·건강증명서',
    links: [
      {
        url: 'https://www.mpi.govt.nz/take-or-send-from-nz/pets-leaving-nz/',
        label: '반려동물 수출 절차 안내 (MPI)',
      },
    ],
    validationIds: ['nz.export-quarantine-before-return'],
  },

  // ── 싱가포르 수출 검역 (왕복 — 귀국 출국 시, 싱가포르 전용) ───────
  // NParks/AVS 수출 절차(2026-07-24 조사, 2026-07-25 재확인): ① 수출 라이선스(GoBusiness, 출국
  //   90일 이내·유효 90일) ② 건강증명서를 면허 민간 수의사(일반 동물병원)가 작성 → 원본을 AVS
  //   서류함(보타닉 가든 Raffles Building 1층, 24h)에 실물 제출 → **AVS 관용 수의사(정부 수의사)
  //   최종 인증(endorse), 2영업일**. EU식 자가 갈음이 아니라 정부 인증이라 한국 귀국에 강제(강제 O).
  {
    id: 'sg-export-quarantine',
    category: 'document',
    title: '싱가포르 수출 검역',
    shortLabel: '수출',
    description:
      '싱가포르 출국 전 수출 라이선스와 AVS 정부 수의사가 인증한 수의 건강증명서를 준비하세요.\n\n동물병원에서 검진을 받고 건강증명서를 발급받은 후 GoBusiness 포털로 수출 라이선스와 건강증명서 인증을 신청해요.\n\n건강증명서 원본은 AVS 서류 제출함(싱가포르 보타닉 가든 Raffles Building 1층, 24시간 이용)에 실물로 제출해요.\n\n2영업일 이내에 수출 라이선스와 AVS 정부 수의사가 인증한 수의 건강증명서가 발급돼요.\n\n수출 라이선스는 출국 전 90일 이내에 신청하고, 발급일로부터 90일간 유효해요.',
    doneSummary: '싱가포르 수출 검역을 받았어요.',
    cardLine: '싱가포르 수출 검역을 받으세요.',
    applicability: { destinations: ['singapore'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:sg_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'sg_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: 'AVS 인증 건강증명서를 발급받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '수출 라이선스와 AVS 인증 건강증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '싱가포르 수출 라이선스·건강증명서(AVS 인증)',
    links: [
      { url: 'https://www.gobusiness.gov.sg/', label: '수출 라이선스·건강증명서 인증 신청 (GoBusiness)' },
      {
        url: 'https://avs.nparks.gov.sg/pets/importing-exporting-a-pet/export/dogs-and-cats/',
        label: '수출 절차·서류 제출처 안내 (AVS)',
      },
    ],
  },

  // ── 인도네시아 수출 검역 (왕복 — 귀국 출국 시, 인도네시아 전용) ───────
  // ✅ 2026-07-23 검역청(Barantin) 공식 안내 상세 조사로 재정리(사용자 제공). 수출 증명은 **2단계**다:
  //   ① 거주 지역 수의당국(Dinas Peternakan / Otoritas Veteriner) **수의증명서(Veterinary
  //      Certificate)** — 사설 동물병원의 접종·검사·칩 기록을 근거로 지역 수의당국이 발급.
  //   ② 검역청(Barantin) **동물 건강증명서(Animal Health Certificate)** — 최종 정부 수출검역증명서.
  //   신청 = PTK 온라인(ptk.karantinaindonesia.go.id) → 검역관에게 동물·서류 실물 제출 → 발급.
  //   ⚠️ 공항 당일 첫 신청 불가(관할 검역소 사전 예약·검사). 말레이시아(주 DVS VHC+MAQIS) 2기관
  //     구조와 같은 형식으로 문구를 맞췄다. ⛔ 태국식 'KH-11 만 언급/공항 동물검역소' 단순화 금지.
  {
    id: 'id-export-quarantine',
    category: 'document',
    title: '인도네시아 수출 검역',
    shortLabel: '수출',
    description:
      '인도네시아 출국 전 검역청(Barantin)에서 수출 검역을 받으세요.\n\nPTK 온라인으로 신청 후 지정된 장소를 찾아가야 해요.\n수출 검역을 받기 위해서는 거주 지역 수의당국(Dinas)으로부터 수의증명서(Veterinary Certificate)를 발급받아야 해요. 동물병원에서 준비한 접종·항체 검사·마이크로칩 기록이 필요해요.\n검역을 통과하면 동물 건강증명서(Animal Health Certificate)가 발급돼요.',
    doneSummary: '인도네시아 수출 검역을 받았어요.',
    cardLine: '인도네시아 검역청에서 수출 검역을 받으세요.',
    applicability: { destinations: ['indonesia'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:id_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'id_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '인도네시아 검역청에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '동물 건강증명서(Animal Health Certificate) 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '동물 건강증명서(Animal Health Certificate)',
    // PTK 온라인 — 수출 검역 신청(수출은 보호자/송하인이 직접 신고, 수입과 달리 현지 수하인 불요). 200 확인.
    links: [
      { url: 'https://ptk.karantinaindonesia.go.id/', label: '검역 신청 (PTK 온라인)' },
    ],
  },

  // ── 아르헨티나 수출 검역 (왕복 — 귀국 출국 시, 아르헨티나 전용) ───────
  // ✅ 2026-07-23 SENASA 공식 안내 상세 조사(사용자 제공). 아르헨티나 출국엔 **SENASA가 발급한
  //   국제수의증명서(CVI)**가 필수다(사설 병원 진단서·백신수첩만으론 불가). 대만식(강제 X·대체서류)이
  //   아니라 인도네시아·일본식 **필수 수출 검역** — 대체서류('한국 검역증으로 갈음') 문구를 넣지 않는다.
  //   흐름: 등록 수의사(veterinario matriculado) 확인 → SENASA 자가신청(Autogestión) 온라인 입력·예약
  //         → **사무소에 원본 제출**(한국행은 완전 디지털 CVI 대상국 아님) → CVI 발급.
  //   ⚠️ CVI 유효기간은 발급 문서 기재값이 최종(국가별 상이) — '10일' 자동적용 금지. 공항 당일 첫
  //     신청은 피할 것. 처리 일반 72영업시간.
  {
    id: 'ar-export-quarantine',
    category: 'document',
    title: '아르헨티나 수출 검역',
    shortLabel: '수출',
    description:
      '아르헨티나 출국 전 SENASA에서 수출 검역을 받으세요.\n\n등록 수의사(veterinario matriculado)에게 마이크로칩·접종·광견병 항체 검사·건강 상태를 확인받아요.\n\nSENASA 자가신청 시스템으로 온라인 신청·예약한 뒤, 사무소에 원본 서류를 제출해요. 한국행은 완전 온라인 발급 대상이 아니라 사무소 방문이 필요해요.\n\n심사를 통과하면 국제수의증명서(CVI)가 발급돼요.',
    doneSummary: '아르헨티나 수출 검역을 받았어요.',
    cardLine: '아르헨티나 SENASA에서 수출 검역을 받으세요.',
    applicability: { destinations: ['argentina'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:ar_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'ar_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: 'SENASA에서 수출 검역(CVI 발급)을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '국제수의증명서(CVI) 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '국제수의증명서(CVI)',
    // ① 출국 절차 안내(SENASA) ② 자가신청 시스템(Autogestión). 둘 다 브라우저 200 확인.
    links: [
      { url: 'https://www.argentina.gob.ar/senasa/procedimiento-para-viajar-al-exterior-con-perros-y-gatos', label: '출국 절차 안내 (SENASA)' },
      { url: 'https://mascotas.senasa.gob.ar/', label: '자가신청 시스템 (SENASA Autogestión)' },
    ],
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
    // EU 패밀리(archetype 'eu-family' 파생 — date-rules EU_ENTRY_FAMILY) 공통 귀국 서류.
    applicability: {
      destinations: [...EU_ENTRY_FAMILY],
      species: 'all',
      tripType: 'round',
    },
    order: 155,
    done: 'dated:eu_export_quarantine_date',
    buttonComplete: true,
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
    // attachmentLabel 은 여기 두지 않는다 — 나라명이 들어가야 해서(예: '프랑스 정부 인증
    // 건강증명서') euFamilyOverrides(label) 가 런타임에 만든다. 영국은 고유 명칭(EHC 3908)
    // 이라 uk 오버라이드에서 따로 지정.

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
    done: 'dated:ph_local_vet_visit_date',
    buttonComplete: true,
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
    attachmentLabel: '필리핀 국제 건강증명서',
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
    done: 'dated:ph_export_quarantine_date',
    buttonComplete: true,
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
    attachmentLabel: '필리핀 수출 허가증',
  },

  // ── 귀국 서류 준비 (왕복 — 홍콩에서 한국으로 돌아오기 전) ───────────────
  // ⚠️ **홍콩은 자국 출국을 강제하지 않는다 → '수출 검역' 카드가 아니다**(2026-07-26 조사).
  //   AFCD FAQ 원문: "Hong Kong has no restriction on the exportation of dogs and cats and
  //   you do not need to apply for an export permit from this Department."
  //   한국이 요구하는 '수출국 정부 검역증명서'는 한국 출국 때 받은 대한민국 수출 동물검역증
  //   으로 갈음되므로, 대만·캐나다와 같은 **대체서류 안내 형식**으로 쓴다.
  //   판단 규칙 상세는 메모리 project_return_export_quarantine_rule.
  // 필요한 경우(대체서류가 없을 때) 받을 수 있는 서류는 AFCD 의 공식 동물건강증명서다 —
  //   방문 신청·발급 2영업일·발급일로부터 10일 유효(AFCD 「Issue of Official Animal Health
  //   Certificate」). 홍콩은 광견병 비발생국이라 귀국 시 항체 검사는 면제된다.
  // 방문 신청 상세(2026-07-26 원문 재확인 — 온라인 제출 경로 없음, "Present the form
  //   'Application for Animal Health Certificate' **in person**"):
  //   · 창구 = Certification Desk (Counter No. 9), 5/F Cheung Sha Wan Government Offices,
  //     303 Cheung Sha Wan Road, Kowloon / 월~금 08:30–12:30 · 13:30–17:15
  //   · 지참 = 개인 수의사 건강증명서(출국 전 10일 이내 발급) + 백신 기록 + (개)홍콩 견 등록증
  //     + 수입 허가 등 원본 서류, 수수료
  //   · 오전 접수 → 다음날 오전 / 오후 접수 → 다음날 오후 수령
  // ⚠️ 미확인 — **공식 수의검사가 필요한 증명서는 검사일 최소 10영업일 전 예약**(2150 7062).
  //   한국행에 그 검사가 붙는지는 AFCD 확인이 필요해 카드에 넣지 않았다. 붙는다면 2영업일만
  //   보고 일정을 잡는 보호자가 놓칠 수 있어(증명서 유효기간은 10일) 우선순위 높은 확인 항목.
  {
    id: 'hk-export-quarantine',
    category: 'document',
    title: '귀국 서류 준비',
    shortLabel: '귀국서류',
    description:
      '홍콩 정부가 발급한 건강증명서 또는 대체 서류를 준비하세요.\n\n동물병원에서 건강증명서를 받은 뒤, 홍콩 검역당국(AFCD)에 방문 신청해요.\n발급까지 2영업일이 걸리고, 발급일로부터 10일간 유효해요.\n\n다음 서류가 있다면 홍콩 건강증명서를 새로 받지 않아도 돼요\n- 한국 출국 시 받은 동물검역증',
    doneSummary: '귀국 서류를 준비했어요.',
    cardLine: '귀국 서류를 준비하세요.',
    applicability: { destinations: ['hongkong'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:hk_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'hk_export_quarantine_date',
        label: '준비 완료일',
        type: 'date',
        helpText: '한국 입국용 서류를 모두 준비한 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '건강증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '홍콩 정부 발급 건강증명서',
    links: [
      {
        url: 'https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_eapao/qua_ie_eapao_ioahc/qua_ie_eapao_ioahc.html',
        label: '건강증명서 발급 안내(AFCD)',
      },
    ],
  },

  // ── 중국 수출 검역 (왕복 케이스 한정 — 귀국 전) ─────────────────
  // 한국 재입국엔 중국 해관이 발급한 동물위생증명서(动物卫生证书)가 필요(한국 QIA 요건).
  // 발급 방법·장소는 도시별로 달라(해관 온라인 신청 互联网+海关 + 현장검역) 문구는 단순화 —
  // 베이징·상하이는 지정 동물병원(베이징 观赏动物医院·상하이 申浦动物医院) 경유. 병원 링크는 확정 후.
  // cn.export 검증 룰 미작성(추후).
  // ── 대만 수출 검역 (왕복 — 귀국 전) ────────────────────────────────────
  // 카드 제목(절차)은 대만 용어를 따른다 — 輸出檢疫 = 수출 검역. EU 처럼 '귀국 서류 준비'로
  // 부르지 않는 이유: EU 는 검역 자체가 없고 서류에 고정 명칭도 없어 그렇게 부른 것이고,
  // 대만은 둘 다 있다.
  // 반면 **서류명은 앱 공통 표기**를 따른다 — '대만 수출 동물검역증'(한국·일본과 같은 성격,
  // 영문명도 같은 Export(ed) Animal Quarantine Certificate). 대만 원어 직역 '수출검역증명서'는
  // 앱 안에서 이 서류만 다른 이름이 돼 쓰지 않는다.
  //
  // 단 **필수는 아니다**. 한국은 입국 시 수출국 정부 검역증명서를 요구하지만 한국 출국 때 받은
  // 대한민국 수출 검역증명서로 갈음되고, 대만은 자국 출국에 검역을 강제하지 않는다
  // (APHIA: 「輸入國要求檢附我國動物檢疫證明書」— 수입국이 요구할 때만).
  // 그래서 설명문은 EU(eu-export-cert)와 같은 **대체서류 안내** 형식으로 쓴다.
  // 판단 규칙 상세는 메모리 project_return_export_quarantine_rule.
  {
    id: 'tw-export-quarantine',
    category: 'document',
    title: '대만 수출 검역',
    shortLabel: '수출',
    description:
      // 문구는 화면에 실제로 뜨는 EU 문형(euFamilyOverrides 의 'eu-export-cert')을 따른다.
      // 3줄 + 대체서류 목록('- ' 항목이 체크 목록으로 렌더). 대체서류가 한국 검역증 하나뿐인
      // 점까지 노르웨이(EU 여권 대체 불가)와 같은 형태다.
      // ⚠️ catalog base 의 eu-export-cert description(더 긴 버전)은 영국 등 일부만 쓰는 값이라
      //    베끼지 말 것 — 처음에 그걸 베껴 EU 화면과 전혀 다른 문구가 됐다(2026-07-19).
      // '인증'이 아니라 '발급' — EU 는 동물병원이 작성한 건강증명서를 정부가 인증(endorse)
      // 하지만, 대만 검역증명서는 방검서가 직접 발급한다. EU 문구를 그대로 옮기면 틀린다.
      // 동물병원 선행 방문도 없다(일본과 동일) — APHIA: 「攜帶犬貓及下列文件辦理輸出檢疫」,
      // 제출 서류는 광견병 예방주사증명서·신분증·항공권 등이고 건강검진 요구가 없다.
      '대만 정부가 발급한 동물검역증 또는 대체 서류를 준비하세요.\n대만 검역청(APHIA) 분서·검역참을 방문해 수출 검역을 받으세요.\n반려동물을 데리고 방문하고, 미리 예약하세요.\n출국 1주일 이내에 받으세요.\n타오위안 공항 검역참은 제2터미널 1층 입국장 남측에 있고 연중무휴 24시간 운영해요.\n다음 서류가 있다면 대만 수출 동물검역증을 새로 발급받지 않아도 돼요\n- 한국 출국 시 받은 동물검역증',
    doneSummary: '귀국 서류를 준비했어요.',
    cardLine: '귀국 서류를 준비하세요.',
    applicability: { destinations: ['taiwan'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:tw_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'tw_export_quarantine_date',
        label: '준비 완료일',
        type: 'date',
        helpText: '한국 입국용 서류를 모두 준비한 날짜',
      },
    ],
    allowAttachments: true,
    // 서류명은 앱 공통 표기 '{국가} 수출 동물검역증'을 따른다(한국·일본과 같은 성격·같은
    // 영문명 Export(ed) Animal Quarantine Certificate). 대만만 '수출검역증명서'로 달랐다.
    attachmentHint: '대만 수출 동물검역증 사본을 사진·PDF로 보관하세요.',
    // 업로드 파일명을 서류명으로 통일(원본 파일명 무시, 2장부터 '_2'). 일본 수출검역
    // (Export Quarantine Certificate)과 같은 처리.
    attachmentLabel: '대만 수출 동물검역증',
    // 지역별 관할 분서(지룽·타오위안·타이중·가오슝) 전화번호가 있는 공식 페이지.
    // 자체 안내 페이지(/guide/…)는 만들지 않았다 — 일본과 달리 분서 4곳뿐이고 대부분
    // 타오위안 공항에서 처리하며, 필수 절차도 아니라 유지 비용이 값어치를 넘는다.
    links: [{ url: 'https://www.aphia.gov.tw/ws.php?id=18077', label: '검역참 연락처' }],
  },

  {
    id: 'cn-export-quarantine',
    category: 'document',
    title: '중국 수출 검역',
    shortLabel: '수출',
    description:
      '중국 해관에서 동물위생증명서(动物卫生证书)를 발급받으세요.\n\n발급 방법 및 장소는 도시마다 달라요. 해관 콜센터(12360)에 문의하세요.\n베이징, 상하이는 지정 동물병원을 방문해서 검사를 받아요.',
    doneSummary: '중국 수출 검역을 받았어요.',
    cardLine: '중국 해관에서 동물위생증명서를 발급받으세요.',
    applicability: { destinations: ['china'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:cn_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'cn_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '중국 해관에서 동물위생증명서를 발급받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '동물위생증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '동물위생증명서',
  },

  // 베트남 수출 검역 — **강제형**(사용자 지정 2026-07-20).
  //
  // 대만·EU 처럼 '한국 수출검역증으로 갈음'되는 선택 절차가 아니다. 대만이 근거로 삼은
  // "수입국이 요구할 때만" 같은 단서가 베트남 규정엔 없다.
  //
  // 근거 = Thông tư 01/2026/TT-BNNMT (2026-01-01 시행. 구 25/2016 을 대체) 정부 원문:
  //   제7조  수출 검역 신청서류 — 신청서 Mẫu 2a
  //   제8조 제1항 "chủ hàng gửi 01 bộ hồ sơ đăng ký kiểm dịch … đến **Chi cục Chăn nuôi và
  //          Thú y vùng**" (화주가 지역 축산·수의 지청에 신청서를 낸다)
  //          제출 방법: 국가단일창구·공공서비스포털·우편·이메일·팩스·직접방문
  //          (이메일·팩스로 내면 이후 원본 제출)
  //   제8조 제2항 "Trong thời hạn 01 ngày làm việc … thông báo cho chủ hàng **thời gian, địa
  //          điểm tiến hành kiểm dịch**" (1영업일 내 검사 일시·장소 통보)
  //   부록 V  수출 동물검역증명서 = **Mẫu 13a** (13b 는 축산물용)
  // → 카드 문구("신청하고 검사 일시와 장소, 필요 서류를 안내받으세요")가 제8조 그대로다.
  //
  // 예전 주석에 있던 '유효기간 15일·출국 10일 전 방문'은 뺐다 — 현지 서비스 사이트에서만
  // 나오고 규칙 원문엔 없다. 현지 동물병원 선행도 원문엔 없어 카드에서 '필요할 수 있어요'로
  // 둔다(단기 체류 시 실제로 요구되는지 미확인 — 사용자 판단).
  {
    id: 'vn-export-quarantine',
    category: 'document',
    title: '베트남 수출 검역',
    shortLabel: '수출',
    // 문구는 사용자가 직접 쓴 것(2026-07-20). 확실한 사실(수출 검역을 받아야 한다)만 남기고
    // 서식 번호·신청 마감일·유효기간처럼 출처가 엇갈리는 값은 넣지 않는다.
    // 어투는 앱 전체 통일선(해요체)에 맞췄다 — 원안은 '안내받습니다/필요할 수 있습니다'.
    // 지청 전화번호는 넣지 않는다 — 아래 links 의 공식 목록이 7개 지청 연락처를 다 담고 있어
    // 중복이다(사용자 지정). 일부만 적으면 그 도시 밖에서 출국하는 사람이 자기 담당을
    // 못 찾는 문제도 있었다(나트랑=다낭 Vùng IV 관할인데 목록에 없었음).
    description:
      '베트남 출국 전 수출 검역을 받으세요.\n\n출국하는 공항을 관할하는 지역 축산·수의 지청에 신청하고 검사 일시와 장소, 필요 서류를 안내받으세요.\n수출 검역을 위해 현지 동물병원 건강증명서가 필요할 수 있어요.',
    doneSummary: '베트남 수출 검역을 받았어요.',
    cardLine: '베트남 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['vietnam'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:vn_export_quarantine_date',
    buttonComplete: true,
    // 입력 후 항공편 수정으로 어긋난 검역일(베트남 입국일 이전·귀국일 이후)을 '주의'로 표면화.
    inputs: [
      {
        key: 'vn_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '베트남 수의지국에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역증 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '베트남 수출 동물검역증',
    // 연락처는 이 공식 목록 하나로 갈음한다 — 지역 지청 7곳 + 국경 검역지청 3곳의 전화·팩스·
    // 이메일이 다 실려 있다. 카드 문구에 몇 개만 적으면 그 도시 밖에서 출국하는 사람이 자기
    // 담당을 못 찾는다(2026-07-20).
    //
    // 우리 카드가 안내하는 입국 공항 4곳의 관할(조사 결과 — 참고용):
    //   HAN 하노이 → Vùng I / DAD 다낭·CXR 나트랑 → Vùng IV / SGN 호치민 → Vùng VI
    //   Vùng IV 관할 = 다낭·Quảng Nam·Quảng Ngãi·Bình Định·Phú Yên·**Khánh Hòa(나트랑)**
    //   Vùng VI 관할 11개 성에 Khánh Hòa 는 없다 — 검색 요약이 포함된다고 잘못 답한 적이 있어
    //   각 지청의 실제 관할 성 목록으로 대조했다.
    links: [
      { url: 'https://cucthuy.gov.vn/cac-don-vi-thuoc-cuc', label: '지역 축산·수의 지청 목록' },
    ],
  },

  // ── 몽골·우즈베키스탄·캐나다 수출 검역 (2026-07-20 조사 후 신설) ───────
  //
  // 세 나라 모두 **한국 APQA 가 사실상 강제**한다. APQA 「개·고양이 검역절차 — 입·출국시」:
  //   "외국에서 반려동물(개·고양이)을 데리고 우리나라로 들어올 경우 **수출국 정부기관이
  //    증명한 검역증명서**를 준비하여야 합니다(EU 회원국에서 발행한 경우 EU PET PASSPORT
  //    로 대체 가능)." / "**검역증명서를 구비하지 않을 시에는 반송조치 대상**이 됩니다."
  //   https://www.qia.go.kr/livestock/qua/livestock_outforeign_hygiene_inf.jsp
  // 이 요구는 국가 화이트리스트가 아니라 **전 세계 공통**이고 EU 만 예외다. 세 나라 다
  // EU 가 아니므로, 그 나라가 자국법으로 강제하는지와 무관하게 받아야 한다.
  //
  // ⚠️ 네 나라 모두 **신청 기한(출국 D-N)의 정부 원문 근거를 찾지 못했다.** 상업 사이트의
  //   "출발 10일 이내"류만 있어 카드에 쓰지 않았다. '미리 신청하세요' 수준으로만 안내한다.
  //
  // 캄보디아 — **1차 출처를 뒤늦게 찾았다**(2026-07-20 재조사). GDAHP 사이트는 여전히 죽어
  //   있지만, 캄보디아 정부 공식 무역정보 포털 National Trade Repository 에 절차와 근거
  //   조치가 등재돼 있다. "캄보디아는 1차 출처가 없는 나라"라는 기존 판단의 예외다.
  //   절차 「Application for Veterinary Certificate」 — cambodiantr.gov.kh
  //     소관 MAFF / DAHP. "All certificates are issued by the DAHP office in **Phnom Penh**
  //     but inspection must be carried out by a Veterinary Inspector at the actual border
  //     and the results relayed back to DAHP Headquarters."
  //     흐름 4단계: 신청 → DAHP 허가·검사수수료 **선납** → 국경(공항)에서 수의검사관 검사
  //     → 증명서 수령. 수수료는 마리수·종류에 따라 다르다.
  //     상업서류는 불요 — "Commercial documents (e.g. Bill of Lading, Commercial Invoice)
  //     are not necessary." (개인 이동에도 길이 열려 있다는 근거)
  //   근거 조치: "Animals and animal products exported from and transported inside Cambodia
  //     must have **sanitary certificate from MAFF**…" (Technical Code A83 제2조 B,
  //     시행 2009-05-18 = Prakas 178 Pr.K/MAFF)
  //   WOAH 발표자료(2023-12) p.12 수출 요건에도 "Sanitary certificate of animals or animal
  //     products"가 들어 있다.
  // ⚠️ 다만 **개인 동반 반려동물을 상업 화물과 구분하는 조항을 찾지 못했다.** NTR 절차
  //   페이지에도 pet/companion animal 언급이 없고, WOAH 수출 요건은 business certificate·
  //   patent 등 명백히 상업 무역 전제다. 발급 서류 정식 명칭·양식 번호·신청 기한도 확인 실패.
  //   → 카드는 '프놈펜 DAHP 에서 정부 수의증명서를 받아야 한다'와 '없으면 한국 입국이
  //     거부된다'까지만 쓰고, 서류 목록·소요 기간은 **현지 문의**로 넘긴다. 근거 없는 수치를
  //     넣지 말 것. 의무 강도도 출처끼리 갈린다(조치는 "must", 절차는 "if requested by the
  //     importing country") — 어느 쪽이든 **한국이 요구하는 나라**라 실무 결론은 같다.
  {
    id: 'kh-export-quarantine',
    category: 'document',
    title: '캄보디아 수출 검역',
    shortLabel: '수출',
    // 근거 보강(2026-07-20) — 수출 자체가 MAFF 허가·위생증명 대상이다.
    //   NTR 조치 「동물·동물성 제품의 수출·수입·통과·운송 허가 취득 요건」
    //   https://cambodiantr.gov.kh/en/measure/page/13/?title=requirement-to-obtain-permission-to-export-import-transit-and-transport-of-animals-and-animal-products
    //   → 수입국이 요구해서가 아니라 **캄보디아가 감염병 확산 방지로 자체 적용**하는 수출관리다.
    //   WOAH GDAHP 발표자료 p.12 수출 요건에도 "Sanitary certificate of animals or animal
    //   products"가 들어 있고, 프놈펜·시엠립·시아누크빌 국제공항에 동물검역 체크포인트가 있다.
    //   같은 자료의 "동물검역 계류시설은 없고 체크포인트가 있다"는 **검역절차가 없다는 뜻이
    //   아니라** 장기 계류 대신 출국장 검사 중심이라는 뜻이다(도착 카드 주석과 짝).
    //
    // ⚠️ **개인 반려견용 공개 SOP 가 없다** — 공식 자료는 상업용 가축 수출 절차 위주다.
    //   신청 경로·소요 기간·민간 동물병원 선행 여부가 지역·공항마다 다를 수 있어, 카드는
    //   '미리 연락해 확인하라'로 열어 둔다. 출국 당일 처리로 전제하게 만들면 안 된다.
    //   '출국 7~10일 전' 같은 수치는 정부 출처가 없어 넣지 않는다.
    //
    // 팩트체크(2026-07-21) — NTR 수의증명서 절차 페이지 원문 대조 완료:
    //   "All certificates are issued by the DAHP office in Phnom Penh" / "pay a fee for the
    //   inspection in advance" / "inspection ... by a Veterinary Inspector at the border" /
    //   소요 기간 미기재 / 상업·반려동물 구분 없음 → 아래 문구는 전부 이 원문 범위 안이다.
    //   2단계 구조(본부 신청 → 공항 검역관 검사 → 본부 증명서 발급)도 같은 페이지 근거.
    //   기관명은 **GDAHP 로 통일**(2016 Sub-Decree 224 로 부서 DAHP→총국 승격. 구 페이지·
    //   무역포털은 아직 'DAHP office'로 부르지만 같은 MAFF 산하 기관 — 서류탭도 GDAHP 로 맞춤).
    //   연락처는 카드에 직접 안 쓴다 — 공식 전화(2022 ASEAN 통보문 (855)12 901 106)가 현재
    //   반려동물 담당 직통인지 미확인이라, 틀리면 헛걸음이다. GDAHP 는 MAFF 산하 총국이라
    //   MAFF 대표 사이트가 정식 입구다. link 는 **수의증명서 절차(무역포털) + MAFF 홈 2개**
    //   (사용자 지정 2026-07-21). /contactus 같은 세부 경로는 자주 바뀌므로 MAFF 는 홈만 건다.
    //   (MAFF 연락처 현행값 참고: (855)23 726128/129, 핫라인 1289, info@maff.gov.kh, 08:30–16:30.
    //    GDAHP 자체 사무소 주소는 MAFF 본부(노로돔대로)와 다를 수 있어 방문 전 전화로 확인.)
    // ⚠️ 아래 본문은 **사용자가 직접 불러준 문구 그대로**다(2026-07-21). 안전문장 추가·동사
    //   변경('받아요'→'검사받아요')·문단 병합 금지 — 임의로 손대다 되돌린 적 있다.
    description:
      // 첫머리 '캄보디아 출국 전'은 수출검역 카드 전체 통일 결정으로 뒤에 붙였다(사용자 지정
      // 2026-07-21). 나머지 문장은 사용자가 직접 불러준 원문 그대로다 — 손대지 말 것.
      '캄보디아 출국 전 수출 검역을 받고 수의증명서(Veterinary Certificate)를 발급받으세요.\n\n프놈펜의 농림수산부 동물보건생산국(GDAHP)에 미리 신청하고 출국 공항 검역소에서 받아요.\n\n검역소는 프놈펜·시엠립·시아누크빌 국제공항에 있어요.',
    doneSummary: '캄보디아 수출 검역을 받았어요.',
    cardLine: '캄보디아 출국 전 정부 수출 검역을 받으세요.',
    applicability: { destinations: ['cambodia'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:kh_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'kh_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '캄보디아에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '캄보디아 수출 검역 서류',
    links: [
      // 원래 두려던 절차 링크 1개 + 담당 부처 MAFF 홈(사용자 지정 2026-07-21).
      // MAFF 는 세부 경로가 자주 바뀌므로 홈만 건다. GDAHP 는 MAFF 산하 총국.
      {
        url: 'https://cambodiantr.gov.kh/en/procedure/?title=application-for-veterinary-certificate',
        label: '수의증명서 신청 절차 (정부 무역포털)',
      },
      {
        url: 'https://maff.gov.kh/',
        label: '캄보디아 농림수산부(MAFF) — GDAHP 상위 부처',
      },
    ],
  },
  {
    id: 'mn-export-quarantine',
    category: 'document',
    title: '몽골 수출 검역',
    shortLabel: '수출',
    // 몽골은 '정부 기관이 검사하고 증명서를 발급'하는 모델이다(캐나다의 배서 모델과 다름).
    // 근거: 국경 검역 감독·검사법(2018-11-15 개정, legalinfo.mn/en/edtl/16959948545251)이
    //   수출 시 권한 기관 발급 수출증명서를 요구하고, 증명서·동반서류 불일치 시 통과 불허.
    // 개인 반려동물 전용 절차 문서가 실재한다 — 전문검사청 「개인 목적 개·고양이 반출 시
    //   구비서류」: 신청서(국경통과지점·시기·운송수단·경로 명시), 반려동물 여권·건강기록부
    //   사본, 소유자 해외여권 사본. **수수료 10,000 투그릭, 증명서 유효기간 발급일로부터 30일.**
    //   (sbb.inspection.gov.mn — TLS 인증서 만료로 원문 열람 실패, 검색 인덱스로 확인)
    // ⚠️ 소관이 2원화돼 있다 — 법률 텍스트는 GAVS(수의 주무)를 지목하나 실제 개인 반려동물
    //   발급 창구는 GASI 계열 전문검사청 국경검역과로 보인다. 카드엔 '검역 기관'으로만 쓰고
    //   특정 기관명을 단정하지 않는다(둘 중 어디로 가라고 잘못 안내하면 헛걸음이 된다).
    // 담당 기관 = **GAVS(Мал эмнэлгийн ерөнхий газр, 수의총국)** — 2026-07-21 확정.
    //   구 주석은 'GAVS vs 전문검사청 2원화'로 단정을 피했으나, GAVS 공식 사이트가 살아 있고
    //   연락처가 현행이다(실측): vet.gov.mn — Bayanzurkh, 16a Peace Avenue, IX Government
    //   Building / vet@vet.gov.mn / 976-51-26-16-35 / 08:30–17:30(점심 12:30–13:30).
    //   국제수의증명서 신청 시스템 ivc.mahis.gov.mn 도 운영하나 외국인 직접 신청 가능 여부는
    //   미확인이라 카드에 넣지 않는다(담당자가 대신 입력해 주는 경로가 실제일 수 있음).
    //
    // ⚠️ **발급 시점 — 공식 자료가 서로 충돌한다. 어느 쪽도 단정하지 말 것** (2026-07-21).
    //   두 규정이 동시에 존재하고, 반려동물용으로 둘의 관계를 정리한 시행지침은 없다:
    //     ① 국경검역법 제25.4조(2023-12 개정): "олон улсын мал эмнэлгийн гэрчилгээ ...
    //        ачуулахын өмнө 24 цагийн дотор олгосон байна" (선적 전 24시간 이내 발급)
    //        https://legalinfo.mn/mn/detail?lawId=38
    //     ② 수의증명서 지침(lawId=16207130862051)·가축동물건강법 영문판(edtl/16959980434171):
    //        살아 있는 동물의 국제수의증명서는 발급일부터 **최대 30일(1개월)** 유효
    //   양쪽 다 위험하다: '1개월'만 쓰면 2주 전에 받아도 된다고 읽혀 무효 증명서를 들고 가고,
    //   '24시간'만 쓰면 확정 안내가 되는데 그 근거가 부족하다. **공항 즉석 발급 근거도 없다** —
    //   ①은 발급기관을 특정하지 않으므로 시내 GAVS 가 전날 발급해도 충족된다.
    //   월요일 오전·연휴 직후 출발은 24시간을 문자 그대로 적용하면 성립조차 안 된다(일반
    //   사무실만 운영한다면). 이 자체가 사전발급 인정 등 별도 운영방식의 존재를 시사하지만
    //   공개 자료로는 확인되지 않는다.
    //   → **카드에서 발급 시점을 아예 다루지 않는다**(사용자 지정 2026-07-21). 24시간·30일
    //     어느 숫자도 쓰지 않고, '언제 받는지 확인하라'는 헤지 문장도 넣지 않는다 —
    //     바로 위 '신청 방법과 일정을 확인하세요'에 이미 포함되고, 확인하라는 말만 겹치면
    //     정보가 없는 문장이 된다. 숫자든 헤지든 이 자리에 다시 넣지 말 것.
    //
    // ⚠️ **현지 동물병원 선행은 단정하지 않는다** (2026-07-21 수정).
    //   구 문구는 '먼저 공인 수의서비스기관에서 기초 수의증명서를 받으세요'로 단정했으나,
    //   지침 원문은 신청 서류에 수의증명서가 포함된다고만 하고 **그것이 몽골 사설 병원에서
    //   새로 발급된 것이어야 한다고는 명시하지 않는다**(4.1조 열거, 순서 규정 없음).
    //   한국 APQA 수출검역증명서를 들고 단기 체류한 케이스라면 그것을 기초 증빙으로 GAVS 가
    //   바로 발급할 여지가 있다. 반대로 GAVS 가 현지 확인서를 요구할 여지도 남아 있다.
    //   → 어느 쪽도 단정하지 말고 **GAVS 에 먼저 확인**하게 한다. 잘못 단정하면 불필요한
    //     병원 방문을 시키거나, 반대로 필요한 단계를 빠뜨리게 만든다.
    //   ('입국 10일 이내 재출국이면 면제' 같은 공식 예외조항은 확인되지 않았다 — 쓰지 말 것.)
    //
    // 그 밖에 확인된 것(카드엔 안 씀 — 부가정보): 별도 협정 없으면 몽골어·영어로 작성되고
    //   여행객에겐 2부 출력(지침 4.5·4.6조). 공항에서 국가검사관에게 제시·세관 신고 의무
    //   (국경검역법 8.1.1·29.1.3조).
    // 현지 동물병원 줄은 **베트남과 같은 문형**을 쓴다 — '필요할 수 있어요'(사용자 지정
    //   2026-07-21). 두 나라 다 원문에 선행 방문 명시가 없어 상황이 같다(vn-export-quarantine
    //   주석 참고). 한국 APQA 증명서로 바로 발급될 수 있다는 사정은 이 헤지에 이미 담겨 있어
    //   카드에 따로 쓰지 않는다(위 ⚠️ 주석에 근거 보존).
    description:
      '몽골 출국 전 수출 검역을 받고 국제수의증명서를 발급받으세요.\n\n몽골 수의총국(GAVS)에 미리 연락해 신청 방법과 일정을 확인하세요.\n수출 검역을 위해 현지 동물병원 건강증명서가 필요할 수 있어요.',
    doneSummary: '몽골 수출 검역을 받았어요.',
    cardLine: '몽골 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['mongolia'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:mn_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'mn_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '몽골에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    // 발급 서류의 정식 명칭·양식 번호를 확인하지 못했다(베트남 Mẫu 13a 에 해당하는 것).
    // 확인되면 정식 이름으로 올릴 것 — 그때까지 '검역 서류'로 뭉뚱그린다.
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '몽골 수출 검역 서류',
    // 링크는 GAVS 공식 연락처 페이지 1개. 법 25.2 가 발급 주체를 GAVS 로 지목하므로 여기가
    //   정식 입구다. 이 페이지 하나에 주소(바양주르흐구 평화대로 16a 정부청사 9동)·산하 8개
    //   조직 직통번호(수의 검사·인증국 261644, 수도 수의청 70144007)·업무시간(08:30–17:30,
    //   점심 12:30–13:30)이 다 있어 본문에 연락처를 중복해 쓰지 않는다.
    // ⚠️ 링크로 걸면 안 되는 것들(2026-07-22 전수 확인) — 되살리려거든 상태부터 재확인:
    //   · inspection.gov.mn/new/ulaanbaatar/?page_id=46860 (옛 링크) → HTTP 200 인데
    //     **본문 0바이트**. МХЕГ CMS 전체(/new/, /0.home/)가 빈 응답이고 루트는 Apache
    //     디렉터리 인덱스가 노출돼 있다. 검색엔진에만 옛 스냅샷이 남아 살아 보인다.
    //   · sbb.inspection.gov.mn 절차 페이지 → 내용은 정확하지만 인증서 만료(위 주석).
    //   · vet.ub.gov.mn(수도 수의청) → 살아 있으나 '수의증명서 인증' 메뉴에 href 가 없다.
    //     울란바토르 한정이기도 해서 GAVS 본청 쪽을 택했다.
    links: [
      // 담당 기관 GAVS(수의총국) 공식 사이트 — 2026-07-21 실측 확인(정상 로드, 연락처 현행).
      //   폐기한 후보 둘: ①inspection.gov.mn/new/ulaanbaatar/?page_id=46860 → 본문 0의 빈
      //   페이지이고 메인조차 'Index of /' 노출(사이트 깨짐) ②mongolia.gov.mn/m/inspection →
      //   열리지만 전문검사청 페이지이고 게시물이 2020년. 수출 검역 담당은 GAVS 라 이쪽이 맞다.
      //   둘 다 되살리지 말 것.
      {
        url: 'https://vet.gov.mn/',
        label: '몽골 수의총국(GAVS) — 연락처·업무시간',
      },
    ],
  },
  {
    id: 'uz-export-quarantine',
    category: 'document',
    title: '우즈베키스탄 수출 검역',
    shortLabel: '수출',
    // ⚠️ **구 근거 2건이 둘 다 폐지됐다** (2026-07-21 재조사에서 발견). 되살리지 말 것:
    //   · 1302-сон (lex.uz/acts/686904) — **2018-02-09 폐지**(페이지에 "Акт утратил силу")
    //   · 139-сон  (lex.uz/uz/docs/3138116) — **2023-04-11 폐지**(148-сон 4-ИЛОВА 폐지목록 1번)
    //   여기서 온 'форма №1·2·3 / №5 계열', '국경 도착 후 4시간 이내' 문언은 전부 무효다.
    //   특히 **форма №5а 는 러시아 로스셀호즈나드조르 서식**이고 우즈베키스탄 것이 아니다.
    //
    // 현행 = 각료회의 결정 **148-сон**(2023-04-10, 2024-11-01 727-сон 개정) 부칙 1-ИЛОВА
    //   https://lex.uz/ru/docs/6427764
    //   §13: 개·고양이 **2두 이하**는 "ваколатли орган рухсатисиз"(수출허가 면제)이지만,
    //        증명서는 **주/타슈켄트시 수의·축산개발국의 хулоса(소견서)를 근거로 ЧТВП
    //        (국경·운송 수의검문소)에서 발급**된다 → 2단계 구조는 현행법에서도 유지된다.
    //        ⚠️ '허가 면제'와 '증명서 면제'를 혼동하지 말 것. 입국 쪽 면제와도 다른 조항이다.
    //        (카드엔 면제를 안 쓴다 — '나는 면제'로 오독될 수 있고 실행이 달라지지 않는다.)
    //   §48: 개·고양이용 서식 = **부칙 9**(«тирик ҳайвон» 생체동물 수출 수의증명서).
    //        서식 안에 "Уй ҳайвонлари / Pets ☐" 체크박스가 있다. 번호는 카드에 쓰지 않는다.
    //   §42·44: ЧТВП 7영업일 / 지역 수의국 6영업일(검역·추가검사 시 최대 3주 연장).
    //        ⚠️ 이건 **법정 처리 상한**이지 반려동물 실제 소요가 아니다. '심사에 7영업일이
    //        걸린다'고 쓰면 과잉 단정이다(2026-07-21 사용자 지적으로 철회). 실무 동선은
    //        '출국 며칠 전 시내 → 출국 당일 공항'이라 카드엔 일수를 쓰지 않는다.
    //   §50: 증명서는 "최종 목적지 도착 시까지 유효" — **발급 후 N일 규정이 없다**(몽골과 다름).
    //   §43~45: 주/시 수의국이 **소유자 입회 하에 직접 심사**한다.
    //        ⚠️ **베트남식 '현지 동물병원 건강증명서가 필요할 수 있어요' 헤지를 쓰면 안 된다.**
    //        우즈베키스탄은 정반대다 — 발급 주체가 국가수의검사관이고 **사설 동물병원 서류는
    //        인정되지 않는다**(CIS 이중서류 체계). 헤지를 쓰면 고객을 사설 병원으로 헛걸음시킨다.
    //        '사설 동물병원 서류로는 대신할 수 없어요'라는 명시 문장도 뺐다(사용자 지정
    //        2026-07-21) — 2단계 동선을 그대로 따르면 사설 병원이 낄 자리가 없어 불필요하다.
    //        공항 체크인 관련 문장도 뺐다. 둘 다 다시 넣지 말 것.
    //   §33: 수입국(한국) 요건이 국내 규정과 다르면 **한국 요건이 우선**.
    //
    // ⚠️ 확인 실패 — 카드에 쓰지 말 것: 수수료 금액(공식 요율표 미발견) / 타슈켄트시 수의국
    //   주소·전화(원 출처 vetgov.uz 가 HTTP 500 으로 죽어 검증 불가) / 타슈켄트 외 공항의
    //   수출검역 가능 여부 / 한국 APQA 검역증으로 갈음 가능한지(인정 조문 자체가 없다).
    // ⚠️ 기관명을 단정하지 않는다 — 2026-05 개편으로 축산·목초지개발청이 신설됐는데 수의검역
    //   권한의 최종 귀속이 미확정이다. 카드엔 '수의·축산개발국'까지만 쓰고 나머지는 links 로.
    description:
      '우즈베키스탄 출국 전 수출 검역을 받고 수의증명서를 발급받으세요.\n\n거주 지역 국가수의기관에 신청해 기초 수의증명서를 받고, 출국 당일 공항 국경수의검역소에서 최종 증명서로 바꿔 받아요.',
    doneSummary: '우즈베키스탄 수출 검역을 받았어요.',
    cardLine: '우즈베키스탄 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['uzbekistan'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:uz_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'uz_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '우즈베키스탄에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '우즈베키스탄 수출 검역 서류',
    links: [
      // 10개국 중 우즈베키스탄만 링크가 없었다(2026-07-21 추가).
      // 자체 도메인 vetgov.uz 는 **HTTP 500 으로 죽어 있다** — 쓰지 말 것. 정부 포털의
      // 위원회 페이지는 살아 있고 연락처도 있다(실측): ☎ +998 71 202-12-00 /
      // info@vetgov.uz / 100123 Toshkent, Kichik halqa yo'li 21-a / 월–금 09:00–18:00.
      {
        url: 'https://gov.uz/en/vetgov',
        label: '우즈베키스탄 수의·축산개발위원회 — 연락처',
      },
      // '거주 지역 국가수의기관에 신청'의 짝 — 어느 사무소로 가는지에 대한 유일한 공식 답이다.
      // 명단이 엑셀 다운로드라 제한적이지만(실측), 본문에 없는 정보라 링크로 둔다.
      {
        url: 'https://gov.uz/en/vetgov/sections/view/99245',
        label: '지역 수의증명서 발급 담당자 명단',
      },
    ],
  },
  {
    id: 'ca-export-quarantine',
    category: 'document',
    // ⚠️ **캐나다는 다른 3국과 성격이 다르다 — 자체 출국검역이 없다**(2026-07-20 별도 조사).
    //   그래서 제목을 '수출 검역'이 아니라 '수출 증명서 배서'로 둔다. 없는 절차를 만들어
    //   부르면 고객이 캐나다 정부의 검역 관문을 찾아 헤매게 된다.
    //   (step id·필드명은 4국 공통 구조를 유지하려고 그대로 둔다 — 저장된 데이터가 걸려 있다.)
    //
    // 근거:
    //  - Health of Animals Regulations s.69 는 대상을 "animal germplasm, **livestock** or
    //    poultry"로 한정하고, s.2 의 livestock 정의는 "bovine, caprine, equine, ovine and
    //    porcine species" — **개·고양이가 없다.**
    //    https://laws-lois.justice.gc.ca/eng/regulations/C.R.C.,_c._296/section-69.html
    //  - 그 s.69 조차 판단 기준이 "meets the **sanitary requirements of the importing
    //    country**" 이고, 미국행엔 "if certification is not requested by the United States"
    //    면제 조항이 있다 → 수입국이 요구하지 않으면 증명 자체가 면제되는 구조.
    //  - CFIA Canadian International Health Certificate 페이지도 "**may be** used" /
    //    "you **do not need** … if you are travelling to countries providing their own
    //    health certificates" — 임의 서식 문언이다.
    //  - CBSA 「Travelling with animals」는 전면이 **반입** 내용이고 출국 시 반려동물 서류
    //    검사 언급이 없다 → 몽골·우즈베키스탄 같은 **출국장 수의검역 관문이 없다.**
    //  - CFIA 안내문의 "It is mandatory to obtain CFIA endorsement … before the animal(s)
    //    leave Canada"는 **시점 규범**이다(이유절이 "출국 후엔 배서할 수 없기 때문"). 배서가
    //    필요한 경우 그 시점이 출국 전이라는 뜻이지, 캐나다가 반출을 통제한다는 뜻이 아니다.
    //
    // 그럼에도 카드를 두는 이유: **한국이 수출국 정부 증명을 요구**하므로(APQA, EU 만 예외)
    //   한국행 보호자에겐 배서가 실질적으로 필수다. 그리고 예약제·결제 3일 전 마감·비환불·
    //   출국 후 불가라는 일정 제약이 있어 일정 관리상 반드시 노출해야 한다.
    // 2026-07-25 사용자 결정: 카드명을 EU·대만처럼 '귀국 서류 준비' 가족으로 — '수출 증명서
    //   배서'는 절차명으로는 정확했지만 25개 귀국 카드 중 혼자 낯선 이름이었다. 내용(배서
    //   절차 + 대체서류 안내)은 그대로다.
    title: '귀국 서류 준비',
    shortLabel: '귀국서류',
    // ⚠️ 캐나다는 **모델이 다르다** — 정부가 검사·발급하는 게 아니라, 개인 수의사가 작성한
    //   증명서를 CFIA 공식 수의사가 **배서(endorse)** 한다. 그래서 핵심 액션이 '기관 방문
    //   신청'이 아니라 **'예약 + 사전 결제'** 다. 몽골·우즈베키스탄 카드와 문형을 달리한다.
    // 근거 = CFIA 「Pets: Export certificates」
    //   https://inspection.canada.ca/en/animal-health/terrestrial-animals/exports/pets
    //   "Most pets travelling from Canada to another country will need an export certificate
    //    **issued by a licensed veterinarian and endorsed by an official CFIA veterinarian**."
    //   "**It is mandatory to obtain CFIA endorsement of an export certificate before the
    //    animal(s) leave Canada**, as the CFIA cannot endorse or issue a certificate if the
    //    animal(s) is/are no longer in Canada." ← 출국 후엔 방법이 없다. 카드에 반드시 남길 것.
    // 한국 전용 페이지·서식이 실재한다 — 「Export of Dogs and Cats to the Republic of Korea」
    //   https://inspection.canada.ca/en/animal-health/terrestrial-animals/exports/pets/korea
    //   지정 서식 "Veterinary Health Certificate for Dogs and Cats to Korea"(한-캐 협상 완료).
    // 예약 = https://inspection.canada.ca/en/animal-health/terrestrial-animals/exports/pets/appointments
    //   "An appointment is required…" / "the online payment must be completed **at least 3 days
    //    before your appointment**" / "Please provide as much advance notice as possible."
    // ⚠️ CFIA 한국 페이지가 "December 1, 2012" 기준이라 오래돼 보인다 — 실무 적용 전 재확인 권장.
    description:
      // 베트남·캄보디아 3문단 틀 + **EU·대만식 대체서류 안내**(2026-07-21 사용자 지정).
      //   캐나다는 자체 출국검역이 없어(위 근거) 대만과 같은 '강제 X' 부류다 —
      //   한국 출국 때 받은 대한민국 수출 검역증명서로 갈음되면 배서를 새로 받을 필요가 없다.
      //   그런데 대체서류 안내만 빠져 있어 배서가 무조건 필수인 것처럼 읽혔다.
      //   문형은 tw-export-quarantine·eu-export-cert 를 따른다('- ' 항목이 체크 목록 렌더).
      //   '캐나다는 자체 검역을 하지 않아요…' 설명 줄은 뺐다 — 대체서류 안내가 같은 뜻을
      //   담고, 대만 카드에도 그런 줄이 없다.
      '캐나다 정부가 배서한 수출 증명서 또는 대체 서류를 준비하세요.\n\n현지 동물병원에서 한국행 수출 증명서를 작성받은 뒤, 검역기관(CFIA) 공식 수의사의 배서를 받아요.\n배서는 예약제예요. 온라인 결제를 예약일 3일 전까지 마쳐야 하고, 캐나다를 떠난 뒤에는 받을 수 없어요.\n\n다음 서류가 있다면 캐나다 배서를 새로 받지 않아도 돼요\n- 한국 출국 시 받은 동물검역증',
    // 완료·일정 문구는 EU(eu-export-cert)·대만과 같은 '귀국 서류'로 — 배서가 무조건
    // 필수인 게 아니라 대체서류로 갈음될 수 있는 부류라 '배서를 받으세요'로 단정하지 않는다.
    doneSummary: '귀국 서류를 준비했어요.',
    cardLine: '귀국 서류를 준비하세요.',
    applicability: { destinations: ['canada'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:ca_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'ca_export_quarantine_date',
        label: '배서일',
        type: 'date',
        helpText: '캐나다 검역기관(CFIA)에서 배서를 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '배서받은 증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '캐나다 수출 증명서',
    links: [
      {
        // ⚠️ 이 페이지는 **date modified 2015-11-17** 로 10년 넘게 갱신되지 않았다(다른 CFIA
        //   반려동물 수출 페이지는 2025년에 갱신됨). 게시된 서식의 발효일도 2012-12-01 이고,
        //   본문이 참조하는 "National Veterinary Research and Quarantine Service"는 이미
        //   APQA(농림축산검역본부)로 개편된 옛 기관명이다.
        //   → 서식이 CFIA 공식 게시본인 건 맞지만 **최신성은 신뢰할 수 없다.** 실제 발급 전
        //     APQA 현행 요구와 대조할 것. (인계 문서 §6 에도 남겨 둠)
        url: 'https://inspection.canada.ca/en/animal-health/terrestrial-animals/exports/pets/korea',
        label: '한국행 수출 안내·서식 (CFIA)',
      },
      {
        // 예약 페이지(.../exports/pets/appointments)는 **연락처 없이 다시 다음 페이지로 넘긴다**
        // (실측 2026-07-21). 이 연락처 페이지엔 주별 사무소 전화·이메일·운영시간과 일반 문의
        // 1-800-442-2342 가 실제로 있다 — 한 단계 줄여 여기로 바로 보낸다.
        url: 'https://inspection.canada.ca/en/about-cfia/contact-cfia/contact-cfia-office-telephone',
        label: 'CFIA 사무소 연락처 — 배서 예약 문의',
      },
    ],
  },

  {
    id: 'ma-export-quarantine',
    category: 'document',
    title: '모로코 수출 검역',
    shortLabel: '수출',
    // ✅ **ONSSA 공식 서식 원본을 직접 판독해 확정**(2026-07-21 조사). 4국 중 근거가 가장 구체적.
    //   서식: 「CERTIFICAT SANITAIRE POUR L'EXPORTATION DE CHIENS ET DE CHATS … VERS LA COREE
    //   DU SUD」 각주 `(E.CARNI.CoréeSud.Juin.2015)` — 불어·영어 병기 2쪽, ONSSA 직인 모델본.
    //   ONSSA 수출 페이지(links)에서 PDF 다운로드 가능. **2015년 6월판이고 업로드 경로가
    //   /2021/11/ 이라 최소 2021-11 이후 교체된 적이 없다** — '최신 정보'라고 쓰지 말 것.
    //
    //   서식 V항 원문에서 확인된 것(구 주석의 값들이 전부 이 서식 조항이었다):
    //     1) "Were examined in the last 24 hours … the day of loading" → **출발 24시간 이내
    //        임상검사 + 탑재 당일**. 다른 나라 10일·5일과 달리 이례적으로 짧은 게 맞다.
    //     2) "identified with a permanent mark, prior to their vaccination" → 칩 선행
    //     3) "at least 21 days before loading using inactivated vaccine" → **21일 + 불활화**
    //        ⚠️ 이 21일·칩 규칙은 모로코 **입국**만이 아니라 **출국(귀국편)에도 적용**된다 —
    //           같은 서식 조항이다. 프로파일의 entryWaitDaysAfterVaccine 21 은 입국 방향만
    //           커버하므로, 귀국 방향 검증이 필요해지면 여기 근거를 쓸 것.
    //     5) "within 24 months prior to shipment … titer ≥ 0.5 IU/ml" → 채혈 24개월·0.5
    //        (한국 APQA 요건과 같은 값이지만 **모로코 서식 자체의 조항**이다 — 못 맞추면
    //         애초에 모로코 증명서 발급이 안 된다. '한국 요건을 옮긴 것'이 아니다.)
    //     6) "laboratory analysis reports … are attached" → 결과지 원본 첨부 필수
    //   ※ 조항 번호가 3 다음 5 로 건너뛴다(4번 없음) — 서식 자체의 오타다.
    //
    //   수수료: 농업부 DECISION 부속 「Liste des prestations payantes」(2019-07-19 개정) 7/26쪽
    //     **SA-E-1 "Certificat sanitaire vétérinaire à l'exportation des animaux vivants"
    //     — Certificat — 150 Dh TTC**. 마리당이 아니라 **증명서 1건당**이고, Article 3 에 따라
    //     **신청 접수 시 납부**한다.
    //
    // ⚠️ 확인 실패 — 카드에 쓰지 말 것: 증명서 유효기간(서식에 조항 자체가 없다) / 소요 기간
    //   ('2~3영업일'은 상업 출처 단독) / 온라인 신청 시스템 유무(ONSSA 전자서비스는 조사 시점
    //   접속 불가) / 출국 공항의 별도 확인 절차 / 민간 동물병원 선행 필요 여부(서식이 요구하는
    //   첨부는 항체 결과지 하나뿐이고 서명자는 관용 수의사 단독이다 — 그렇다고 '불필요'로
    //   단정할 근거도 없다).
    description:
      // 베트남·캄보디아 3문단 틀. 마이크로칩 기재는 칩 카드가, 채혈 24개월은 항체 카드가
      // 이미 다룬다 — 여기선 수출 절차 고유만 남긴다.
      //
      // ⚠️ **'출발 24시간 이내에 임상검사를 받아야 해요'로 쓰지 말 것**(2026-07-21 정정).
      //   서식 V항 1)의 24시간은 **관용 수의사가 서명하며 하는 확인**이지 보호자가 따로
      //   병원에 가서 받는 검사가 아니다. 서식 전체가 관용 수의사 한 사람의 서약이고
      //   첨부 요구는 항체 성적서 하나뿐이다. 그렇게 쓰면 없는 병원 방문을 만들어낸다.
      //   또 ONSSA 는 '출국 N일 전 신청/발급' 같은 **처리기한을 공개하지 않는다** — 숫자를
      //   쓰면 법정 기한처럼 읽힌다. → '증명서는 출발 직전에 발급받아요'로 행동만 옮긴다.
      // ⚠️ **2단계 구조로 쓰지 말 것** — 몽골·우즈베키스탄과 달리 '시내 기초증명서 → 공항
      //   최종증명서' 구조라는 근거가 없다. 출국 전에 관할 ONSSA 에서 완성본을 받아 공항에
      //   가는 구조다. 공항은 항공사·필요 시 국경검역이 원본을 확인할 뿐이다.
      // ⚠️ **한국 검역증명서로 갈음되지 않는다** — 캐나다와 다르다. ONSSA 가 한국행 전용
      //   서식을 따로 운영하므로 대체서류 안내를 넣으면 안 된다.
      // 현지 동물병원은 '필요할 수 있어요'(베트남 문형) — ONSSA 가 최근 건강확인서를 요구할
      //   수 있고, 요구하지 않으면 관용 수의사가 직접 확인한다. 우즈베키스탄('사설 서류 인정
      //   안 됨')과 반대 방향으로 헷갈리지 말 것.
      '모로코 출국 전 수출 증명서를 발급받으세요.\n\n거주지 관할 검역기관(ONSSA) 수의서비스에 미리 연락하세요. 한국행 전용 서식이 있고, 관용 수의사가 반려동물을 확인한 뒤 항체 검사 결과지를 첨부해 발급해요.\n수출 검역을 위해 현지 동물병원 건강증명서가 필요할 수 있어요.\n\n증명서는 출발 직전에 발급받아요. 수수료는 증명서 한 건당 150디르함이에요.',
    doneSummary: '모로코 수출 검역을 받았어요.',
    cardLine: '모로코 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['morocco'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:ma_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'ma_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '모로코에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '모로코 수출 증명서',
    links: [{ url: 'https://www.onssa.gov.ma/import-and-export-controls/export-certification/export-of-live-animals/dogs-and-cats/?lang=en', label: '개·고양이 수출 안내 (ONSSA)' }],
  },
  {
    id: 'ua-export-quarantine',
    category: 'document',
    title: '우크라이나 수출 검역',
    shortLabel: '수출',
    // DPSS 국경검사부서(ВПІК) 발급. 근거는 procedure-checks/ua.ts 헤더와 destination-config 프로파일 주석 참고.
    //
    // ── 2026-07-22 재조사로 문구 교체 ──────────────────────────────────────
    // ✅ **2단계 구조는 확정**(DPSS 「비상업적 동물 이동 요건」 원문). 거주지 **국가 수의기관**
    //   (державна лікарня ветеринарної медицини — 시·군 단위 정부 수의기관)이 임상검사·칩·접종
    //   확인 후 국내용 수의증서 **Ф-1**(제1호 서식)을 발급하고, 그것을 **국경검사부서(ВПІК —
    //   Відділ прикордонного інспекційного контролю)**에서 국제수의증명서로 **교환**한다.
    //   Ф-1 자체는 최종 서류가 아니다.
    //   ⚠️ 우즈베키스탄('사설 서류 인정 안 됨')과 문형이 비슷하지만 취지가 다르다 — 여기선
    //     사설 병원 **진료가 무효라는 게 아니라** 행정서류 발급 주체가 국가기관이라는 뜻이다.
    //     검사·접종·구충은 사설 병원에서 받아도 되고, 서류만 국가기관을 거친다. (법 조문은
    //     발급 주체를 '국가수의검사관 및 관용 수의사'로 두어 권한 위임 민간 수의사도 포함될
    //     여지가 있으나, 어느 병원이 그 권한을 갖는지 확인 불가 → DPSS 안내대로 국가기관만 쓴다.)
    //   ⚠️ 카드 표현은 **'국가수의기관'**(우즈베키스탄 카드와 동일 용어)을 쓴다. '국가 동물병원'은
    //     한국 고객에게 '일반 동물병원과 뭐가 다른가'라는 오해를 만든다(2026-07-22 사용자 지적).
    //
    // ✅ **ВПІК 은 국경에만 있지 않다 — 도시 사무소가 정상 경로다.** 국경통제국 소속 부서로
    //   ①국경·공항·항만 ②도시 사무소(키이우 프로스펙트 포비트랴니흐 실 92-B 등) ③시립 소동물
    //   병원 내 전용 창구(DPSS 가 반려동물 발급용으로 별도 개설)에 배치된다. 그래서 '출국 전
    //   미리 받아 두라'가 실행 가능한 안내가 된다. 지점 목록은 전시 상황이라 자주 바뀌므로
    //   **주소를 카드에 박지 않고 링크로만** 안내한다(공식 PDF 는 2024-01-26 기준).
    //
    // ✅ **유효기간 5일** — 명령 1366호(2025-02-28, 2026-03-01 시행) 제2장 15항 "국제수의증명서와
    //   수의증서는 **발송 전 제시용으로 5일간 유효**"(가금류 1일). https://zakon.rada.gov.ua/laws/show/z0510-25
    //
    // ✅ **모든 국경 통과지점에 검사관이 있는 건 아니다 + 출발 전에 미리 받아라** — DPSS 원문
    //   명시. 민간 안내 중엔 "공항·철도·모든 통과지점에 근무한다"는 정반대 서술도 있는데,
    //   **DPSS 공식 안내를 따른다**(2026-07-22 대조). 이 줄을 '어디서나 받을 수 있다'로
    //   바꾸지 말 것 — 출발 당일 국경 즉석 발급을 기대하게 만들면 출국이 막힌다.
    //
    // ⛔ **뺀 것 — 되살리지 말 것**:
    //   · '출발 5일~72시간 전에 임상검사와 구충' — **72시간의 근거를 못 찾았다.** 명령 1366호는
    //     임상검사·구충의 **시점 규정 자체가 없다**(제2장 4항 '필요한 수의 처치', 9항 '서류 제출
    //     후 1영업일 내 발급'). 구충 시점도 마찬가지다.
    //   · '출발 5일 전에 발급받으세요' — **방향이 반대로 읽힌다.** 출처 표현이 "5일 전보다 늦지
    //     않게"(DPSS)와 "5일 전보다 이르지 않게"(민간)로 갈리는데, 명령의 '5일 유효'와 합치면
    //     실질은 **출발 5일 이내 발급**이다. '5일 전에 받으라'로 쓰면 만료된 서류를 들고 가게 된다.
    //     → 숫자를 지시로 쓰지 않고 **유효기간 사실 + 출국일 기준으로 날짜를 잡으라**로 옮겼다.
    //
    // ⚠️ 확인 실패 — 카드에 쓰지 말 것: 발급 수수료 / 예약 필요 여부(통합 예약 시스템 없음) /
    //   ВПІК 지점 목록(공식 목록이 2023년 작성본이라 현재 운영 여부 미검증 — 링크로만 안내).
    //   Ф-1 발급 조건 중 'FAVN 채혈 90일' 관련 문구는 원문이 중의적이라 **숫자를 넣지 않았다**
    //   (입국 쪽 '채혈 후 3개월'과 충돌 가능 — 확정 전엔 쓰지 말 것).
    // ⚠️ dpss.gov.ua 는 한국·미국 IP 에서 접속이 차단된다(2026-07-22 재확인, connect refused).
    //   위 근거는 사용자가 원문을 열어 전달해 준 것이다. 다음 조사자도 직접 열지 못할 수 있다.
    description:
      // ⛔ 사용자가 불러준 최종 원문(2026-07-22). 세 문단 그대로 — 문장 추가·병합 금지.
      //   뺀 두 줄의 근거는 아래 주석에 남긴다(되살리려면 사용자 확인부터):
      //   · '출국일에 맞춰 발급 날짜를 정하세요.' — 유효기간 5일이 이미 그 행동을 지시한다.
      //   · '모든 국경 통과지점에 검사관이 있는 건 아니에요…' — DPSS 명시 사실이지만, 지점
      //     안내는 links 의 발급처 페이지(국가수의기관 주소 + ВПІК 목록 + 사전 예약)가 담당한다.
      '우크라이나 출국 전 수출 검역을 받고 국제수의증명서를 발급받으세요.\n\n거주 지역 국가수의기관에서 임상검사를 받고 수의증서(Ф-1)를 받은 뒤, 검역기관(DPSS) 국경검사부서에서 국제수의증명서로 바꿔 받아요.\n\n증명서는 5일간만 유효해요.',
    doneSummary: '우크라이나 수출 검역을 받았어요.',
    cardLine: '우크라이나 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['ukraine'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:ua_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'ua_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '우크라이나에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '우크라이나 국제수의증명서',
    // ⛔ **dpss.gov.ua 링크를 걸지 말 것** — 한국 IP 에서 접속이 막힌다(2026-07-22 실측 2회
    //   connect refused, 사용자도 안 열린다고 확인). 고객이 눌러도 안 열리는 링크다.
    //   근거 인용은 주석에 남기되, 카드 링크는 **한국에서 열리는 것만** 건다.
    // 이 페이지가 카드의 2단계와 정확히 대응한다: ①국가수의기관 주소 ②국제수의증명서를
    //   발급하는 국경검사부서(ВПІК) 목록 ③사전 예약. 지점은 전시 상황에 바뀌므로 주소를
    //   카드에 박지 않고 이 링크로 넘긴다.
    links: [
      { url: 'https://nir.gov.ua/misczya-oformlennya-domashnih-tvaryn/', label: '반려동물 서류 발급처·예약 (우크라이나 검역당국)' },
    ],
  },
  {
    id: 'mx-export-quarantine',
    category: 'document',
    title: '멕시코 수출 검역',
    shortLabel: '수출',
    // SENASICA 발급 · 무료. 근거는 procedure-checks/mx.ts 헤더와 destination-config 프로파일 주석 참고.
    description:
      // ✅ 2026-07-22 SENASICA 원문 재확인 — 카드의 숫자·사실이 전부 원문과 일치한다
      //   (「Solicita el Certificado Zoosanitario para Exportación para mascotas」):
      //   · 민간 수의사 건강증명서 "de no más de cinco días de expedido" → 5일 이내
      //   · "en un plazo de tres días hábiles" → 3영업일
      //   · 비용 "Gratuito" → 무료
      //   · 유효기간 "8 días naturales (puede variar en caso de que el país destino
      //     establezca una vigencia diferente)" → 8일. 괄호(목적지국이 달리 정하면 변동)는
      //     한국이 따로 정한 바가 확인되지 않아 카드에 쓰지 않는다.
      //   · 출국일 출국지점에서 실물 검사 → '출국 당일 공항에서 실물 검사'
      //   · 신청처 = 전국 SENASICA 인가 사무소
      // ⚠️ 확인 실패 — 쓰지 말 것: 사전 예약 필요 여부(원문에 언급 없음. 브라질처럼 예약제라고
      //   쓰면 근거 없는 안내가 된다).
      // 첫 줄은 형제 카드 문형에 맞춤(캄보디아·몽골·우즈베키스탄·우크라이나·브라질).
      // 형제 수출 카드(우즈베키스탄·우크라이나·캄보디아·몽골)와 같은 3문단 틀로 축약
      // (2026-07-22). 숫자는 위 SENASICA 대조 결과 그대로 유지 — 줄만 묶었다.
      // ⛔ 뺀 줄: '이 증명서가 없으면 한국 입국이 거부돼요.' — 다른 나라 수출 카드에 없는
      //   경고 문형이고, 카드가 이미 '발급받으세요'로 필수임을 말한다. 되살리려면 사용자 확인.
      '멕시코 출국 전 수출 검역을 받고 수출 증명서(CZE)를 발급받으세요.\n\n먼저 민간 수의사에게 건강증명서를 받으세요. 발급 후 5일 이내여야 해요.\n\n그 서류로 검역기관(SENASICA) 사무소에 신청하면 3영업일 안에 발급돼요. 출국 당일 공항에서 반려동물 실물 검사를 받고 최종 서명을 받아요.\n\n발급 비용은 없어요. 증명서는 발급일로부터 8일간 유효해요.',
    doneSummary: '멕시코 수출 검역을 받았어요.',
    cardLine: '멕시코 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['mexico'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:mx_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'mx_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '멕시코에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '멕시코 수출 동물위생증명서(CZE)',
    links: [{ url: 'https://www.gob.mx/senasica/documentos/solicita-el-certificado-zoosanitario-para-exportacion-para-mascotas', label: '반려동물 수출 증명서 신청 (SENASICA)' }],
  },
  {
    id: 'br-export-quarantine',
    category: 'document',
    title: '브라질 수출 검역',
    shortLabel: '수출',
    // VIGIAGRO 발급 · 무료. 근거는 procedure-checks/br.ts 헤더와 destination-config 프로파일 주석 참고.
    // ── 2026-07-22 재조사(MAPA 한국행 전용 안내 PDF + 「Sair do Brasil」 본문) ──────────
    // ✅ **CVI 10일 유효**(서명일 기준)·**발급 당일 검역 수의사 현장 칩 판독** — 둘 다 MAPA
    //   한국행 문서에 명시. 구 카드가 맞았다. (근거 문서 — 카드 링크로는 걸지 않는다)
    //   https://www.gov.br/agricultura/pt-br/assuntos/vigilancia-agropecuaria/animais-estimacao/sair-do-brasil/coreia-do-sul-out-22.pdf
    //   ⚠️ 이 PDF 는 WebFetch 로 본문 추출이 안 된다(스캔형 — 첫 조사 때 '근거 없음'으로
    //     잘못 판정했다가 사용자가 원문을 열어 정정). **못 읽었다고 근거가 없는 게 아니다.**
    // ✅ **임상검사는 출국 전 10일 이내**(AS-1 Geral 서식). 같은 PDF.
    //   ⚠️ 10일이 두 번 나오지만 **서로 다른 요건**이다 — ①임상검사가 출국 전 10일 이내
    //     ②CVI 가 서명일부터 10일 유효. 한쪽으로 합치지 말 것.
    // ✅ **한국은 전자 CVI(e-CVI) 대상이 아니다** — 「Sair do Brasil」 전자 발급 가능국 목록
    //   (미국·캐나다·칠레·콜롬비아·일본·멕시코·메르코수르·영국·EU·페루)에 한국이 없다.
    //   → 대면 발급이라 **반려동물을 데리고** 사무소를 방문해야 한다(현장 칩 판독 때문).
    // ✅ **예약제** — MAPA 원문은 "대면 CVI 발급은 최소 60일 전 Vigiagro 지점에 문의 권장"
    //   이라고 쓴다. 다만 **권고(sugerimos)이지 법정 기한이 아니라** 카드엔 숫자를 쓰지 않고
    //   '미리 연락'으로 옮겼다. 숫자를 넣으려면 규정 여부부터 확인할 것.
    // ⛔ **뺀 것: '발급 비용은 없어요'** — 근거를 못 찾았다(MAPA 요금 관련 서술 자체를 발견
    //   못 함). 멕시코는 SENASICA 명문이라 쓴 것이고 브라질에 복제하면 안 된다. 되살리려면
    //   요금표 근거부터.
    description:
      // 첫 줄은 형제 카드 문형(캄보디아·몽골·우즈베키스탄·우크라이나)에 맞춘다 —
      // '<나라> 출국 전 수출 검역을 받고 <서류명>을 발급받으세요.'
      '브라질 출국 전 수출 검역을 받고 국제수의증명서(CVI)를 발급받으세요.\n\n먼저 현지 동물병원에서 출국 전 10일 이내에 임상검사를 받고 건강증명서를 받으세요.\n\n그 서류로 검역기관(VIGIAGRO) 사무소에 신청해 CVI를 발급받아요. 한국행은 전자 발급 대상이 아니라 반려동물과 함께 직접 방문해야 하고, 그 자리에서 마이크로칩을 판독해 확인해요.\n\n예약이 밀릴 수 있으니 사무소에 미리 연락해 방문 날짜를 잡으세요. CVI는 서명일로부터 10일간 유효해요.',
    doneSummary: '브라질 수출 검역을 받았어요.',
    cardLine: '브라질 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['brazil'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:br_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'br_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '브라질에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '브라질 국제수의증명서(CVI)',
    // 링크 2종 — 둘 다 응답 확인(2026-07-22, HTTP 200):
    //  ①출국 절차 개요 ②지점 찾기(카드가 '미리 연락'하라고 하므로 갈 곳이 필요하다 —
    //  지역(DIGRV)→주(州)→사무소로 들어가는 포털).
    // ⛔ **한국행 요건표 PDF 를 링크로 걸지 말 것**(사용자 지정 2026-07-22). 카드 문구의
    //   근거이지 고객이 읽을 문서가 아니다(포르투갈어 스캔 PDF). 근거로 참조할 주소는
    //   위 description 주석에 남겨 뒀다.
    links: [
      { url: 'https://www.gov.br/agricultura/pt-br/assuntos/vigilancia-agropecuaria/animais-estimacao/sair-do-brasil', label: '브라질 출국 안내 (MAPA)' },
      { url: 'https://www.gov.br/agricultura/pt-br/assuntos/vigilancia-agropecuaria/unidades-de-vigilancia-agropecuaria-1', label: '검역 사무소(VIGIAGRO) 지점 찾기' },
    ],
  },
  {
    id: 'ae-export-quarantine',
    category: 'document',
    title: '아랍에미리트 수출 검역',
    shortLabel: '수출',
    // ✅ **강제 O — 카드를 만드는 근거**(2026-07-22 조사). MOCCAE 수출 건강증명서는 반려동물이
    //   아랍에미리트를 떠날 때 **예외 없이 필수**다(기내·수하물·화물·전세기 무관).
    //   귀국 수출검역 카드는 '상대국이 출국 절차를 강제할 때만' 만든다는 규칙에 부합한다.
    // ✅ 유효기간 **30일**(발급일 기준). ✅ MOCCAE 지점(두바이·아부다비) 또는 온라인 신청 후
    //   **반려동물을 데려가 실물 검사**(칩 스캔 + 예방접종 수첩 확인)를 받는다.
    // ⚠️ 확인 실패 — 카드에 쓰지 말 것: 수수료 / 신청부터 발급까지 처리 일수 /
    //   지점 운영시간(민간 안내는 24시간이라 하나 공식 확인 불가).
    // ⚠️ MOCCAE 공식 사이트는 인증서 만료·요청 차단으로 직접 열람이 안 된다(2026-07-22 실측).
    //   위 값은 복수의 현지 이주 대행·수의 안내가 일치하는 선에서만 채택했다. 원문 대조가
    //   가능해지면 처리 일수·수수료를 보강할 것.
    description:
      '아랍에미리트 출국 전 수출 검역을 받고 수출 건강증명서를 발급받으세요.\n\n기후변화환경부(MOCCAE) 사무소에 방문해 검사를 받아요. 마이크로칩을 확인하고 예방접종 수첩을 함께 봐요.\n\n증명서는 발급일로부터 30일간 유효해요.',
    doneSummary: '아랍에미리트 수출 검역을 받았어요.',
    cardLine: '아랍에미리트 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['uae'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:ae_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'ae_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '아랍에미리트에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '아랍에미리트 수출 건강증명서',
    // 링크 — MOCCAE "Animal health certificate for export/re-export of live animals"
    //   서비스 페이지(사용자 지정 URL). 이 페이지 하단에 문의 채널(전화·이메일)이 함께
    //   있어 별도 연락처 링크는 두지 않는다(사용자 확인 2026-07-23).
    // ⚠️ 본문은 우리 도구로 못 읽는다("Request Rejected" — 사람이 브라우저로 열면 정상).
    //   그래서 지점 주소·운영시간·수수료를 카드 문구로 옮기지 않았다. MOCCAE 대표 문의처
    //   (800 3050 / info@moccae.gov.ae)는 사용자 조사값 — 근거로만 보존.
    links: [
      {
        url: 'https://moccae.gov.ae/en/services/animal-health-certificate-for-export-re-export-of-live-animals',
        label: '수출 건강증명서 발급·문의 (MOCCAE)',
      },
    ],
  },
  {
    id: 'kz-export-quarantine',
    category: 'document',
    title: '카자흐스탄 수출 검역',
    shortLabel: '수출',
    // 수의통제감독위원회 발급. 근거는 procedure-checks/kz.ts 헤더와 destination-config 프로파일 주석 참고.
    description:
      // ── 2026-07-22 재조사(gov.kz 서비스 3369「Выдача ветеринарного сертификата …
      //   при экспорте」+ Adilet V1500011898 + 사용자 조사) ───────────────────────
      // ✅ 최종 발급 = **농업부 수의통제감독위원회 지역검사기관**(아스타나·알마티·심켄트 및
      //   각 주). 사설 동물병원엔 수출증명서 발급 권한이 없다 — 진료·접종·칩 확인까지만.
      // ✅ 처리 **최대 2영업일**. 수의여권 사본·신분증·신청서·서식 대금 납부증이 필수 서류.
      // ✅ 유료 — "Платно физическим и юридическим лицам"(증명서 서식 대금). 금액은
      //   공개돼 있지 않아 숫자를 쓰지 않는다.
      // ✅ 온라인(elicense.kz) 신청은 **카자흐스탄 전자서명(ЭЦП) 필수** → 현지 계정이 없는
      //   보호자에겐 사실상 불가. 구 문구는 '온라인 또는 방문'을 **동등한 선택지**로 안내해
      //   오해를 만들었다(2026-07-22 정정).
      // ✅ 행정구역을 넘어 이동한 경우 국내 수의증명서 사본이 추가로 필요할 수 있다
      //   (전산에 이동 기록이 없을 때). 카자흐스탄은 국토가 넓어 카라간다→알마티처럼
      //   출발 공항이 다른 주인 경우가 흔해 카드에 남긴다.
      // ⛔ **'수의증명서(형식 1호)'로 쓰지 말 것** — 원문은 그냥 "ветеринарная справка"이고
      //   서식 번호를 특정하지 않는다. 우크라이나 Ф-1 처럼 확정된 이름이 아니다.
      // ⛔ 공항 당일 발급을 전제하지 말 것 — 공항 국경수의검역소는 이미 발급된 증명서를
      //   확인하는 곳이고, 신규 발급 창구라는 근거가 없다(처리기간 2영업일과도 어긋난다).
      // ⚠️ 임상검사 시점 — 카자흐스탄은 자국 기한을 두지 않고 **목적국 요건에 맞춰** 발급한다
      //   (Adilet). 그래서 'N일 이내' 숫자를 쓰지 않고 '출국 직전'으로만 안내한다.
      // ⛔ 아래 네 가지는 넣었다가 **뺐다**(사용자 지정 2026-07-22 "더 심플하게"). 근거는 위
      //   주석에 다 남아 있고, 실무 세부는 links 의 gov.kz 안내가 담당한다. 되살리지 말 것:
      //   · 신분증·수의여권 사본 등 제출서류 목록 — 링크에 전부 있다.
      //   · 발급 비용(유료) — 금액을 못 쓰는 정보라 한 줄을 쓸 값어치가 낮다.
      //   · 온라인 신청 전자서명 제약 — '미리 발급받으세요'로 행동은 같아진다.
      //   · 행정구역 이동 시 국내 수의증명서 — 해당되는 사람이 적은 예외.
      // ⛔ 사용자가 불러준 최종 원문(2026-07-22). 두 문단 그대로 — 문장 추가·병합 금지.
      //   직전 판본의 셋째 문단('발급에 최대 2영업일이 걸려요. 출국 당일 공항에서 받으려
      //   하지 말고 미리 발급받으세요.')도 이때 빠졌다. 2영업일·공항 당일 발급 불가는
      //   사실이며 근거는 위 주석에 있다 — 되살리려면 사용자 확인부터.
      '카자흐스탄 출국 전 수출 검역을 받고 수출 수의증명서를 발급받으세요.\n\n현지 동물병원에서 임상검사를 받고, 그 서류로 수의통제감독위원회 지역검사기관에 신청해요.',
    doneSummary: '카자흐스탄 수출 검역을 받았어요.',
    cardLine: '카자흐스탄 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['kazakhstan'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:kz_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'kz_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '카자흐스탄에서 수출 검역을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '검역 서류 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '카자흐스탄 수출 수의증명서',
    // 링크 2종 — 둘 다 응답 확인(2026-07-22, HTTP 200).
    //  ①서비스 안내(gov.kz 3369) — **영문 페이지가 있어** egov.kz 러시아어판보다 보호자가
    //   읽기 쉽다. 필요 서류·처리기간·신청 방법이 여기 다 있다.
    //  ②지역검사기관 연락처 — 카드가 '미리 문의'하라고 하므로 갈 곳이 필요하다
    //   (우크라이나·브라질 카드와 같은 처리).
    links: [
      { url: 'https://www.gov.kz/services/3369?lang=en', label: '수출 수의증명서 발급 안내 (gov.kz)' },
      { url: 'https://www.gov.kz/memleket/entities/vetcontrol?lang=ru', label: '수의통제감독위원회 지역검사기관 연락처' },
    ],
  },
  // ── 러시아 수출 검역 (왕복 — 귀국 출국 시) ────────────────────────────
  // ✅ 2026-07-23 조사로 구체화(사용자 지정). 러시아 수출은 **2단계**다:
  //   ① 거주 지역 **국립 수의서비스(государственная ветслужба)** 가 **수의증명서 Form 1** 발급
  //      (출국 전 5일 이내). 광견병 등 접종·지역 무발생 확인.
  //   ② 출국 공항 **연방수의식물위생감독청(Rosselkhoznadzor)** 이 Form 1 을 **국제수의증명서
  //      Form 5a** 로 **무료 교환**. 이게 한국행 최종 정부 수출증명서다.
  //   개·고양이 2마리 초과 시 Rosselkhoznadzor 수출 허가 별도(카드엔 안 담음 — 일반 케이스 1~2).
  //   공식 창구가 대면(지역 수의서비스+공항)이라 깔끔한 신청 링크가 없어 링크는 두지 않는다.
  {
    id: 'ru-export-quarantine',
    category: 'document',
    title: '러시아 수출 검역',
    shortLabel: '수출',
    description:
      '러시아 출국 전 수출 검역을 받고 국제수의증명서(Form 5a)를 발급받으세요.\n\n거주 지역 국립 수의서비스에서 수의증명서(Form 1)를 출국 전 5일 이내에 발급받아요.\n\n출국 공항의 연방수의식물위생감독청(Rosselkhoznadzor)에서 Form 1을 국제수의증명서(Form 5a)로 교환해요.',
    doneSummary: '러시아 수출 검역을 받았어요.',
    cardLine: '러시아 출국 전 수출 검역을 받으세요.',
    applicability: { destinations: ['russia'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:ru_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'ru_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '러시아에서 수출 검역(국제수의증명서 발급)을 받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '국제수의증명서(Form 5a) 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '국제수의증명서(Form 5a)',
    // Rosselkhoznadzor 공식 '반려동물 국외 출국 절차 안내'(러시아어) — 관할 국가 수의기관·공항
    //   검역소가 지역마다 달라 여기서 찾는다. 러시아어지만 유일한 공식 출처라 넣는다(2026-07-23
    //   사용자 지정 A). 브라우저 200 확인.
    links: [
      { url: 'https://fsvps.gov.ru/puteshestvujushhim-s-pitomcami-vvoz-vyvo/instrukcija-kak-puteshestvovat-s-zhivotnym-za-rubezh/', label: '반려동물 출국 절차 안내 (Rosselkhoznadzor)' },
    ],
  },
  // ── 튀르키예 수출 검역 (왕복 — 귀국 출국 시) ──────────────────────────
  // ✅ 1차 출처 확정(2026-07-23, 농림부 tarimorman.gov.tr). 카자흐스탄 복제본을 실제 규정으로 교체.
  //   발급 = 관할 시·구 농림청(İl/İlçe Tarım ve Orman Müdürlüğü) 공무 수의사, 보호자 직접 신청.
  //   "공식 수의사가 발급한 수의건강증명서 없는 개·고양이는 출국 불가" — 민간 진단서 불충분, 대체서류 없음.
  //   증명서는 **출국 48시간 이내** 발급(동물 실물+원본서류 지참). 격리 없음. 마이크로칩·항체(FAVN) 기재.
  {
    id: 'tr-export-quarantine',
    category: 'document',
    title: '튀르키예 수출 검역',
    shortLabel: '수출',
    description:
      // 첫 문장은 나라 이름으로 시작 — 수출검역 카드 전체 통일(사용자 지정 2026-07-21).
      // 문구는 사용자 최종안(2026-07-23) — 48시간·민간수의사 불충분·한국 기재요건 등 상세는
      // 뺀 간결본. 규정 상세는 카드 위 주석·procedure-checks/il 아닌 이 카드 히스토리(git) 참고.
      '튀르키예 출국 전 농림청(İl/İlçe Tarım ve Orman Müdürlüğü)에서 수출 검역을 받으세요.\n동물병원에서 필요한 서류를 준비하고, 거주지 관할 농림청에 직접 신청해요.\n검사를 통과하면 정부 수의건강증명서(Veteriner Sağlık Sertifikası)가 발급돼요.',
    doneSummary: '튀르키예 수출 검역을 받았어요.',
    cardLine: '튀르키예 관할 농림청에서 수출 검역을 받으세요.',
    applicability: { destinations: ['turkey'], species: 'all', tripType: 'round' },
    order: 155,
    done: 'dated:tr_export_quarantine_date',
    buttonComplete: true,
    inputs: [
      {
        key: 'tr_export_quarantine_date',
        label: '검역일',
        type: 'date',
        helpText: '관할 농림청에서 수의건강증명서를 발급받은 날짜',
      },
    ],
    allowAttachments: true,
    attachmentHint: '정부 수의건강증명서 사본을 사진·PDF로 보관하세요.',
    attachmentLabel: '튀르키예 수의건강증명서(Veteriner Sağlık Sertifikası)',
    // ⚠️ 링크 미설정 — 걸 만한 게 없다. 농림부 tarimorman.gov.tr 는 전 페이지 WAF("Request
    //   Rejected") 차단이고, e-Devlet(turkiye.gov.tr) 신청 서비스는 접속은 되나 **터키 신분증
    //   또는 외국인 등록번호(Yabancı Kimlik No) + e-Devlet 로그인 필수**라 터키 거주 외국인만
    //   쓸 수 있다 — 단기 방문 고객(대부분)은 불가하므로 오해를 줘 뺐다(사용자 확인 2026-07-23).
    //   실제 발급은 관할 İl/İlçe Tarım ve Orman Müdürlüğü 현장 신청이라 설명문 안내로 충분.
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
    attachmentLabel: '한국 수입 동물검역증',
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

/**
 * 구충 카드 '진행 중' 문구 — 필요 회차(PARASITE_REQUIRED_DOSES)를 아직 못 채운 상태에서
 * **다음 회차를 지시**한다(2026-07-30 사용자 지정 "2차 치료하라는 말로 바뀌어야").
 *
 * 전에는 1회만 넣어도 카드 문구가 "외부 기생충 치료를 하세요"(= 아직 안 한 사람용) 그대로였다.
 * 우측 칩만 '진행 중'으로 바뀌고 본문은 안 바뀌어서, 무엇이 남았는지 알 수 없었다.
 * 광견병 항체 검사·사전 신고·수입 허가가 쓰는 situational 2단계 문구와 같은 자리다.
 *
 * 회차 요건이 없는 목적지는 requiredParasiteDoses 가 1 이라 첫 기록에서 done → 여기 안 온다.
 * 뉴질랜드 외부구충은 카드가 1차/2차로 나뉘어 있어 요건이 1 이므로 역시 해당 없다.
 */
function parasiteNextDoseSituational(
  caseRow: CaseRow,
  kind: 'internal' | 'external',
  label: string,
): { desc: string; cardDesc: string } | undefined {
  const entries = kind === 'internal' ? readInternalParasiteEntries(caseRow) : readExternalParasiteEntries(caseRow)
  const today = todayKst()
  const arrived = entries.filter((e) => e.date.length >= 10 && e.date <= today).length
  if (arrived === 0) return undefined
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const species = typeof data.species === 'string' ? data.species : null
  const need = requiredParasiteDoses(kind, buildCaseJourneyContext(caseRow).destinationKey, species)
  if (arrived >= need) return undefined
  const msg = `${arrived + 1}차 ${label}를 하세요.`
  return { desc: msg, cardDesc: msg }
}
