/**
 * 목적지 **동작(반응) 스냅샷** — 정해둔 케이스들을 실제로 태워서 나오는
 * 입력불가 · 주의 · 안내 · 알림을 그대로 기록한다.
 *
 * 왜 필요한가 (2026-07-19 사용자 지적):
 *   설명문은 화면에서 눈으로 확인된다. 그런데 **입력불가·주의·안내·알림은 눈에 안 보인다** —
 *   제대로 걸려 있는지 알려면 매번 사람이 물어보거나 데이터를 직접 넣어봐야 했다.
 *   기존 스냅샷들은 "어떤 룰이 존재하는가"(destinations)와 "문구가 무엇인가"(checks-copy)만
 *   담아서, "이 입력에 실제로 반응하는가"는 아무도 지키지 않았다. 실제로 대만·중국 검역
 *   카드가 일본 룰을 가리켜 검증이 통째로 죽어 있었고(2026-07-19 발견) 어떤 스냅샷도
 *   그 사실을 드러내지 못했다.
 *
 * 이 파일이 답하는 질문:
 *   "생후 89일에 접종하고 칩을 나중에 넣은 케이스를 넣으면, 나라별로 무엇이 뜨는가?"
 *
 * 시나리오를 추가하는 법: SCENARIOS 에 케이스를 하나 더 적고 `pnpm lint:behavior:write`.
 * 규정을 고칠 때 이 스냅샷이 **의도한 목적지에서만** 바뀌는지 확인하는 게 핵심 용도다.
 */
import { readFileSync, writeFileSync } from 'fs'
import { runChecksForCase } from '../packages/domain/src/procedure-checks/registry'
import { collectReminders } from '../apps/portal/lib/journey/reminders'
import { collectMilestonePushes } from '../apps/portal/lib/journey/milestone-pushes'
import { APP_SUPPORTED_DESTINATION_KEYS, DESTINATION_OVERRIDES } from '../packages/domain/src/destination-config'
import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import { resolveStepForDestination } from '../packages/domain/src/journey-steps/destination-overrides'
import { getStepsForCase } from '../packages/domain/src/journey-steps/applicability'
import {
  validateMicrochipBeforeBooster,
  validateImportPermitFiledDate,
  validateEntryDateForDestination,
  validateRabiesPrimeAge,
} from '../packages/domain/src/journey-steps/date-rules'

/**
 * 입력불가(저장 거부) 층 — 화면에서 '저장'을 눌렀을 때 거부되는지.
 *
 * 주의·알림과 달리 이건 **저장 자체를 막는** 층이라 잘못 걸리면 사용자가 우회할 수 없다.
 * 그런데도 눈에 안 보여서 지금까지 스냅샷이 없었다(대만 titer 5개월 오차단, 베트남 89일
 * 오차단이 모두 이 층에서 났고 사람이 우연히 발견했다).
 *
 * 광견병 1차 카드가 선언한 earliest(일수 또는 달력 개월)를 그대로 태워 결과만 기록한다 —
 * 판정 로직을 복제하지 않는다(복제하면 진짜 동작과 어긋난다).
 */
function inputBlocks(destKey: string, data: Record<string, unknown>): string[] {
  const out: string[] = []
  const base = JOURNEY_STEP_CATALOG.find((s) => s.id === 'rabies-vaccine-1')
  if (!base) return out
  const step = resolveStepForDestination(base, destKey, null)
  const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
  const chip =
    typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
  const rabies = Array.isArray(data.rabies_dates)
    ? (data.rabies_dates as Array<{ date?: string }>)
    : []
  const first = rabies[0]?.date ?? ''
  if (!first) return out

  const e = step.earliest
  if (e?.anchor === 'birth') {
    const msg = validateRabiesPrimeAge(birth, first, e.daysAfter, e.monthsAfter)
    if (msg) out.push(`광견병 1차 최소 일령: ${msg}`)
  }
  // 칩 선행은 그 나라가 *.microchip-before-rabies 를 선언할 때만 막는다 — portal
  // getSaveBlockError 와 **같은 게이트**여야 한다(step-detail-view). 이 게이트가 빠져 있어서
  // 칩이 입국 요건이 아닌 나라(베트남·캄보디아·캐나다)에 없는 저장 거부가 있는 것처럼
  // 골든에 박혀 있었다(2026-07-20 발견). 이 파일 머리말대로 판정 함수는 공유하되,
  // **어느 목적지에 거는지도 함께 복제**해야 진짜 동작과 어긋나지 않는다.
  //
  // ⚠️ 커버리지 한계 — 일본이 '0건'으로 나오는 건 정상이다. 되돌리지 말 것.
  //   일본은 1차가 아니라 **2차 카드 입력 시** 차단하는 모델인데(step-detail-view 주석),
  //   이 함수는 rabies-vaccine-1 층만 시뮬레이션한다. 그래서 일본의 진짜 차단 지점은
  //   이 골든에 안 잡힌다. 게이트를 빼서 일본을 억지로 '1건'으로 만들면 다른 나라 3곳에
  //   없는 차단이 생긴다(그래서 실제로 그랬다).
  if ((step.validationIds ?? []).some((id) => id.endsWith('.microchip-before-rabies'))) {
    const chipMsg = validateMicrochipBeforeBooster(chip, first)
    if (chipMsg) out.push(`마이크로칩 선행: ${chipMsg}`)
  }
  return out
}

/**
 * 입력불가 — 수입허가 신청일 층.
 *
 * 광견병 카드만 보던 시절엔 이 층이 스냅샷에 아예 없었다. 그래서 대만에 분기가 통째로
 * 빠져 출국일 이후 신청도 저장되던 걸 아무도 못 봤다(2026-07-19). client 와 **같은**
 * 도메인 함수를 태운다 — 여기서 복제하면 진짜 동작과 어긋난다.
 */
function importPermitBlocks(
  destKey: string,
  data: Record<string, unknown>,
  departure: string,
): string[] {
  const filed =
    typeof data.import_permit_application_date === 'string'
      ? data.import_permit_application_date
      : ''
  if (!filed) return []
  const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
  const msg = validateImportPermitFiledDate(destKey, filed, {
    departureDate: departure,
    entryDate: entry,
    data,
  })
  return msg ? [`수입허가 신청일: ${msg}`] : []
}

/**
 * 입력불가 — 출국·입국일 층(항공권 카드).
 *
 * 대만 180일 오차단이 바로 이 층에 있었는데 스냅샷이 없어 못 봤다(2026-07-19).
 * client 와 같은 도메인 함수를 태운다.
 */
function entryDateBlocks(
  destKey: string,
  data: Record<string, unknown>,
  departure: string,
): string[] {
  const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
  if (!entry && !departure) return []
  const msg = validateEntryDateForDestination(entry, departure, {
    data,
    destination: koLabel(destKey),
    departureDate: departure || null,
  } as never)
  return msg ? [`출국·입국일: ${msg}`] : []
}

/**
 * 상황별 설명문(step.situational) 층.
 *
 * 카드의 고정 description 은 lint:copy 가 지킨다. 그런데 만료 안내·진행 중 안내·재검사
 * 안내처럼 **고객이 실제로 읽는 문장 대부분**은 situational 이 조건에 따라 만들어내고,
 * 이건 어떤 스냅샷에도 없었다. 일본 추가 검사 문구를 고쳤을 때 5개 lint 가 바꾸기 전과
 * 후에 똑같이 통과했다(2026-07-19) — 사람이 임시 스크립트를 짜서야 확인됐다.
 *
 * situational 이 값을 돌려준 카드만 기록한다(undefined = 고정 description → lint:copy 담당).
 */
function situationalCopy(caseRow: unknown): string[] {
  const out: string[] = []
  for (const step of getStepsForCase(JOURNEY_STEP_CATALOG, caseRow as never)) {
    if (!step.situational) continue
    let r: { desc?: string; cardDesc?: string } | undefined
    try {
      r = step.situational(caseRow as never)
    } catch {
      out.push(`${step.id}: (예외)`)
      continue
    }
    if (!r?.desc) continue
    out.push(`${step.id}: ${r.desc.replace(/\s+/g, ' ')}`)
  }
  return out.sort()
}

/**
 * situational 은 todayKst() = Date.now() 를 본다. 그대로 두면 스냅샷이 **날마다** 달라져
 * 가드가 못 쓰게 된다. 호출 시점에 읽으므로 수집 구간만 기준 시각으로 고정한다.
 */
function withFrozenNow<T>(fn: () => T): T {
  const real = Date.now
  Date.now = () => NOW.getTime()
  try {
    return fn()
  } finally {
    Date.now = real
  }
}

const GOLDEN = 'scripts/behavior.snapshot.txt'
/** 고정 기준 시각 — 알림은 '지금'에 따라 개수가 달라지므로 반드시 고정한다. */
const NOW = new Date('2026-01-01T00:00:00Z')

interface Scenario {
  name: string
  /** 왜 이 케이스인지 — 스냅샷에 함께 남는다. */
  why: string
  data: Record<string, unknown>
  departure?: string
}

const SCENARIOS: Scenario[] = [
  {
    name: '정상 준비',
    why: '문제 없는 케이스 — 여기서 경고가 뜨면 과잉 차단이다',
    departure: '2026-09-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-10',
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-03-05' }],
      rabies_titer_records: [{ date: '2026-03-20', result: '1.2' }],
      entry_date: '2026-09-01',
      return_date: '2026-09-20',
    },
  },
  {
    name: '어린 나이 접종',
    why: '생후 89일 접종 — 달력 3개월은 충족(2월생). 일수 기준 나라만 걸려야 한다',
    departure: '2026-09-01',
    data: {
      birth_date: '2026-02-01',
      microchip_implant_date: '2026-04-01',
      rabies_dates: [{ date: '2026-05-01' }],
      entry_date: '2026-09-01',
    },
  },
  {
    name: '칩이 접종보다 늦음',
    why: '마이크로칩 선행 규정 위반 — 대부분 목적지가 잡아야 한다',
    departure: '2026-09-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-05-10',
      rabies_dates: [{ date: '2026-05-01' }],
      entry_date: '2026-09-01',
    },
  },
  {
    name: '항체 검사가 2차 접종보다 빠름',
    why: '2회 접종국(일본·중국)만 걸려야 하고, 메시지가 "2차 접종 후"라고 명시해야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-01',
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-03-10' }],
      rabies_titer_records: [{ date: '2026-02-15', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
    },
  },
  // ── '나중에 어긋나는' 유형 ──────────────────────────────────────────────
  // 입력불가는 **저장하는 순간**만 본다. 앞 단계를 나중에 고쳐서 뒤가 어긋나는 경로는 못 잡고
  // 주의만 뜬다(date-rules 헤더에 명시된 설계). 실무에서 흔한데 시나리오가 없었다
  // (2026-07-19 사용자 지시로 추가). 여기서 '입력불가 0건 + 주의 N건'이 나오는 게 정상이다.
  {
    name: '출국일을 미뤄 백신 유효기간이 만료됨',
    why: '접종 입력 시점엔 정상이었는데 출국일을 뒤로 옮겨 도착일에 만료 — 입력불가는 못 잡고 주의만 떠야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2024-01-01',
      // 칩 → 접종 순서는 정상. 만료만 남기려고 칩을 접종보다 앞에 둔다.
      microchip_implant_date: '2025-05-01',
      // 2025-06-01 접종, 유효기간 2026-06-01 — 도착(12-01)엔 이미 만료.
      // 2회 접종국도 만료만 보이도록 2차까지 넣는다(2차 누락 경고와 섞이지 않게).
      rabies_dates: [
        { date: '2025-06-01', valid_until: '2026-06-01' },
        { date: '2025-07-05', valid_until: '2026-07-05' },
      ],
      rabies_titer_records: [{ date: '2025-08-01', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
    },
  },
  {
    name: '2차 접종을 뒤로 옮겨 채혈이 역전됨',
    why: '채혈 입력 땐 2차보다 늦었는데 2차를 나중으로 수정해 순서가 뒤집힘 — 입력불가가 이미 지나간 상태',
    departure: '2026-12-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-01',
      // 채혈(03-20) 후에 2차를 04-15 로 옮긴 상황.
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-04-15' }],
      rabies_titer_records: [{ date: '2026-03-20', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
    },
  },
  {
    name: '검역일이 도착보다 빠름',
    why: '물리적으로 불가능한 날짜 — 각 나라 수입검역 룰이 잡아야 한다',
    departure: '2026-09-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-10',
      rabies_dates: [{ date: '2026-02-01' }],
      entry_date: '2026-09-01',
      return_date: '2026-09-20',
      jp_import_quarantine_date: '2026-08-20',
      cn_import_quarantine_date: '2026-08-20',
      tw_import_quarantine_date: '2026-08-20',
      vn_import_quarantine_date: '2026-08-20',
      th_import_quarantine_date: '2026-08-20',
      ph_import_quarantine_date: '2026-08-20',
    },
  },
  // ── 접종 → 출국 간격 / 달력 나이 ────────────────────────────────────────
  // 두 층 다 시나리오가 없었다(2026-07-20 발견). 베트남 severity 를 info→warning 으로
  // 셋 승격했는데 스냅샷이 한 줄만 바뀌어서 드러났다 — 나머지 두 룰을 **실패시키는**
  // 케이스가 없으면 승격도 문구 수정도 스냅샷에 안 남는다.
  {
    name: '접종 직후 출국',
    why: '접종 후 대기일(베트남 30일·태국 21일·대만 90일 등)을 못 채운 케이스 — 접종일은 과거라 조치는 입국일을 미루는 것뿐이고, 나라별 대기일 차이가 여기서 보여야 한다',
    departure: '2026-09-01',
    data: {
      birth_date: '2024-01-01',
      // 칩·나이는 정상 — 대기일 미달만 남긴다.
      microchip_implant_date: '2025-01-01',
      rabies_dates: [{ date: '2026-08-20' }],
      entry_date: '2026-09-01',
    },
  },
  {
    name: '생후 2개월에 접종',
    why: '달력 3개월도 못 채운 케이스 — 위 "어린 나이 접종"(89일)은 달력 3개월을 충족해 달력 기준국(베트남)이 안 걸린다. 달력·일수 두 기준이 모두 걸려야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2026-03-01',
      // 칩을 접종보다 앞에 둬 순서 위반과 섞이지 않게 한다.
      microchip_implant_date: '2026-03-10',
      rabies_dates: [{ date: '2026-04-15' }],
      entry_date: '2026-12-01',
    },
  },
  // ── 수입허가 신청일 ────────────────────────────────────────────────────
  // 이 층은 스냅샷에 없었다(광견병 카드만 봤다). 그래서 대만에 분기가 통째로 빠진 걸
  // 못 봤다 — 출국일 이후 신청도 저장됐다(2026-07-19 발견·수정).
  {
    name: '수입허가를 출국일 이후에 신청',
    why: '허가 없이 이미 출국한 셈 — 논리적 불가능이라 수입허가 카드가 있는 나라는 전부 입력불가여야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-01',
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-03-05' }],
      rabies_titer_records: [{ date: '2026-03-20', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
      import_permit_application_date: '2026-12-20',
    },
  },
  {
    // 2026-07-19 명세 변경: 대만은 20일 미만이면 신청 자체가 접수 안 되므로 입력불가로 승격.
    // 태국(9일)·필리핀은 마감 성격이 달라 여전히 주의만 뜬다 — 그 차이가 여기서 보인다.
    name: '수입허가 마감만 지남 (출국일 이전)',
    why: '대만은 20일 미만이라 입력불가, 태국·필리핀은 주의 — 나라별로 갈려야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-01',
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-03-05' }],
      rabies_titer_records: [{ date: '2026-03-20', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
      // 대만 120일·20일 마감 모두 지남. 태국 9일 마감도 지남.
      import_permit_application_date: '2026-11-25',
    },
  },
  {
    // 20~120일 구간 — 신청은 되고 대가는 7일 격리. 이 구간을 태우는 시나리오가 없어
    // 문구를 고쳐도 behavior 스냅샷이 조용히 통과했다(2026-07-19).
    name: '수입허가를 도착 60일 전에 신청 (20~120일)',
    why: '신청은 가능하고 도착 후 7일 격리 — 차단이 아니라 격리 안내여야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2024-01-01',
      microchip_implant_date: '2024-06-01',
      rabies_dates: [{ date: '2024-07-01' }],
      rabies_titer_records: [{ date: '2026-01-05', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
      // 10-02 신청 → 12-01 도착 = 60일 간격.
      import_permit_application_date: '2026-10-02',
    },
  },
  // 반대 방향 — 허가를 먼저 내고 출발일을 나중에 당기는 경로. 대만은 카드 순서가
  // 허가(43) → 항공권(45)이라 이 조합이 실제로 나온다. 신청일 쪽만 막으면 새는 구멍.
  {
    name: '수입허가 후 출발일을 20일 안쪽으로 당김',
    why: '나중에 넣는 게 출발일이어도 막혀야 한다 — 신청일 칸만 막으면 이 경로로 샌다',
    departure: '2026-06-10',
    data: {
      birth_date: '2024-01-01',
      microchip_implant_date: '2024-06-01',
      rabies_dates: [{ date: '2024-07-01' }],
      rabies_titer_records: [{ date: '2025-06-01', result: '1.2' }],
      entry_date: '2026-06-10',
      return_date: '2026-06-20',
      // 신청 6/1 → 출발 6/10 = 9일 간격(20일 미만).
      import_permit_application_date: '2026-06-01',
    },
  },
  // ── 대만 항체 대기 2단계 (90일 = 입국 / 180일 = 격리 면제) ──────────────
  // 180일은 격리 면제 조건이지 입국 조건이 아니다. 예전엔 90~180일을 입력불가로 막아
  // 규정상 갈 수 있는 사람의 항공권 저장을 거부했다(2026-07-19 수정).
  {
    name: '대만 — 채혈 후 150일 입국 (90일↑ 180일↓)',
    why: '입국은 되고 도착 후 7일 격리 — 차단이 아니라 격리 안내여야 한다',
    departure: '2026-06-01',
    data: {
      birth_date: '2024-01-01',
      microchip_implant_date: '2024-06-01',
      rabies_dates: [{ date: '2024-07-01' }],
      // 2026-01-02 채혈 → 출발(2026-06-01)까지 150일.
      rabies_titer_records: [{ date: '2026-01-02', result: '1.2' }],
      entry_date: '2026-06-01',
      return_date: '2026-06-20',
    },
  },
  {
    name: '대만 — 채혈 후 60일 입국 (90일 미만)',
    why: '규정상 갈 수 없는 일정 — 여기서만 입력불가여야 한다',
    departure: '2026-06-01',
    data: {
      birth_date: '2024-01-01',
      microchip_implant_date: '2024-06-01',
      rabies_dates: [{ date: '2024-07-01' }],
      // 2026-04-02 채혈 → 출발까지 60일.
      rabies_titer_records: [{ date: '2026-04-02', result: '1.2' }],
      entry_date: '2026-06-01',
      return_date: '2026-06-20',
    },
  },
  // 접종 후 선적 대기 — 평소엔 항체 90일 대기가 이 요건을 덮어 드러나지 않는다.
  // 재검사 체인으로 대기가 면제되는 경로에서만 이 룰이 유일한 방어선이 된다.
  {
    name: '대만 — 체인 유지 상태에서 부스터 직후 출국',
    why: '항체 대기가 면제돼도 부스터 30일은 남는다 — 이 경로에서 이 룰만 남는다',
    departure: '2026-06-01',
    data: {
      birth_date: '2024-01-01',
      microchip_implant_date: '2024-06-01',
      // 2025-06-01 접종(유효 2026-06-01) → 2026-05-20 부스터(유효기간 내 = 체인 유지).
      // 출국까지 12일 — 부스터 30일 미달.
      rabies_dates: [
        { date: '2025-06-01', valid_until: '2026-06-01' },
        { date: '2026-05-20', valid_until: '2027-05-20' },
      ],
      // 채혈 2건이 180~1년 간격(209일) — 체인 유지로 180일 대기 면제.
      rabies_titer_records: [
        { date: '2025-06-10', result: '1.2' },
        { date: '2026-01-05', result: '1.4' },
      ],
      entry_date: '2026-06-01',
      return_date: '2026-06-20',
    },
  },
  // ── 항체 유효기간 만료 (상황별 설명문 층) ────────────────────────────────
  // 고객이 실제로 읽는 만료 안내는 step.situational 이 만든다. 이 층이 스냅샷에 없어서
  // 일본 추가 검사 문구를 고쳐도 5개 lint 가 전부 조용히 통과했다(2026-07-19).
  //
  // 채혈 2024-01-10 기준: 일본(2년)은 2026-01-10 만료 — NOW(2026-01-01)에서 9일 뒤라
  // '만료 30일 전' 노출 조건에 걸린다. 대만·중국·태국·필리핀(1년)은 2025-01-10 에
  // 이미 만료됐어야 하는데, 카드가 2년을 하드코딩하고 있어 그렇게 안 나온다.
  // 그 어긋남이 스냅샷에 드러나는 게 이 시나리오의 목적이다.
  {
    name: '항체 유효기간이 입국 전 만료',
    why: '만료 안내 문구가 나라별로 맞는지 — 유효기간 1년 국가에서 2년으로 계산되는지 드러난다',
    departure: '2026-06-01',
    data: {
      birth_date: '2023-01-01',
      microchip_implant_date: '2023-06-01',
      microchip_number: '900000000000001',
      rabies_dates: [{ date: '2023-07-01' }, { date: '2023-08-05' }],
      rabies_titer_records: [{ date: '2024-01-10', result: '1.2' }],
      entry_date: '2026-06-01',
      return_date: '2026-06-20',
    },
  },
  {
    // 채혈 2023-01-10 → 일본(2년) 2025-01-10 만료. NOW(2026-01-01) 기준 이미 1년 지났다.
    // 과거형('만료되었어요')으로 떠야 한다 — 예전엔 이 분기가 없어 1년 전에 만료된 건도
    // "만료돼요"라는 미래형이라 아직 시간이 남은 것처럼 읽혔다.
    name: '항체 유효기간이 이미 지남',
    why: '지나간 일은 과거형으로 — 미래형이면 아직 여유가 있는 것처럼 읽힌다',
    departure: '2026-06-01',
    data: {
      birth_date: '2022-01-01',
      microchip_implant_date: '2022-06-01',
      microchip_number: '900000000000001',
      rabies_dates: [{ date: '2022-07-01' }, { date: '2022-08-05' }],
      rabies_titer_records: [{ date: '2023-01-10', result: '1.2' }],
      entry_date: '2026-06-01',
      return_date: '2026-06-20',
    },
  },
  {
    name: '항체 만료 예정인데 항공권 미입력',
    why: '입국일을 모를 때 만료를 어떻게 안내하는지 — 없는 마감을 만들면 안 된다',
    data: {
      birth_date: '2023-01-01',
      microchip_implant_date: '2023-06-01',
      microchip_number: '900000000000001',
      rabies_dates: [{ date: '2023-07-01' }, { date: '2023-08-05' }],
      rabies_titer_records: [{ date: '2024-01-10', result: '1.2' }],
    },
  },
]

function koLabel(destKey: string): string {
  return DESTINATION_OVERRIDES[destKey]?.keywords[0] ?? destKey
}

function build(): string {
  const out: string[] = [
    '# 목적지 동작(반응) 스냅샷 — scripts/lint-behavior.ts 로 자동 생성.',
    '#',
    '# 정해둔 케이스를 실제로 태워서 나오는 주의·알림·푸시를 기록한다.',
    '# 문구(journey-copy)·구조(destinations) 스냅샷이 못 잡는 "실제 반응"을 지킨다.',
    `# 기준 시각 ${NOW.toISOString().slice(0, 10)} 고정 — 알림 개수가 '지금'에 안 흔들리게.`,
    '#',
    '# 손으로 고치지 마세요. `pnpm lint:behavior:write` 로 재생성합니다.',
    '',
  ]

  for (const sc of SCENARIOS) {
    out.push('═'.repeat(76))
    out.push(`[시나리오] ${sc.name}`)
    out.push(`  ${sc.why}`)
    out.push('═'.repeat(76))

    for (const destKey of APP_SUPPORTED_DESTINATION_KEYS) {
      const token = koLabel(destKey)
      const caseRow = {
        id: 'snapshot',
        pet_name: '테스트',
        destination: token,
        trip_type: 'round',
        departure_date: sc.departure ?? null,
        data: sc.data,
      } as never

      // 메시지까지 기록한다 — 룰 id 만 담으면 "같은 룰이 다른 문구를 낸다"를 못 잡는다.
      // 실제로 msgTiterBeforeVaccine 을 2회 접종국용으로 바꿨을 때 id 는 그대로라 스냅샷이
      // 조용히 통과했다(2026-07-19). 고객이 읽는 건 id 가 아니라 이 문장이다.
      // 주의 층도 시각 고정 — 여러 룰이 todayKst()를 본다(cn·jp·th + 대만 항체 만료).
      // 고정 없이 두면 스냅샷이 날마다 달라져 가드로 못 쓴다(상황별 설명문 층과 같은 이유).
      const failed = withFrozenNow(() =>
        runChecksForCase(destKey, { caseRow, destination: token } as never)
        .filter((r) => (r.result as { ok?: boolean })?.ok === false)
        .map((r) => {
          const msg = (r.result as { message?: string })?.message ?? ''
          return `${r.check.id} [${r.check.severity}]\n         ${msg.replace(/\s+/g, ' ')}`
        })
        .sort(),
      )

      let reminders: string[] = []
      let pushes: string[] = []
      try {
        reminders = collectReminders([caseRow], NOW)
          .map((r) => r.body.replace(/\s+/g, ' ').slice(0, 44))
          .sort()
        pushes = collectMilestonePushes(caseRow)
          .map((p) => p.key.split('|').slice(1).join('|'))
          .sort()
      } catch {
        reminders = ['(수집 실패)']
      }

      const blocks = [
        ...inputBlocks(destKey, sc.data),
        ...importPermitBlocks(destKey, sc.data, sc.departure ?? ''),
        ...entryDateBlocks(destKey, sc.data, sc.departure ?? ''),
      ]

      out.push('')
      out.push(`▸ ${destKey} (${token})`)
      out.push(`   입력불가 ${blocks.length}건`)
      for (const b of blocks) out.push(`     ✕ ${b}`)
      out.push(`   주의·차단 ${failed.length}건`)
      for (const f of failed) out.push(`     - ${f}`)
      const situ = withFrozenNow(() => situationalCopy(caseRow))
      out.push(`   상황별 설명문 ${situ.length}건`)
      for (const s of situ) out.push(`     ▸ ${s}`)
      out.push(`   알림 ${reminders.length}건`)
      for (const r of [...new Set(reminders)]) out.push(`     · ${r}`)
      if (pushes.length) out.push(`   푸시: ${pushes.join(', ')}`)
    }
    out.push('')
  }
  return out.join('\n').replace(/\s+$/, '') + '\n'
}

const snapshot = build()
if (process.argv.includes('--write')) {
  writeFileSync(GOLDEN, snapshot, 'utf-8')
  console.log(`✓ behavior 스냅샷 재생성: ${GOLDEN}`)
  console.log('  git diff 로 어떤 목적지의 반응이 바뀌었는지 확인한 뒤 함께 커밋하세요.')
} else {
  let prev = ''
  try {
    prev = readFileSync(GOLDEN, 'utf-8')
  } catch {
    console.error(`✗ 골든 파일이 없습니다. \`pnpm lint:behavior:write\` 로 먼저 생성하세요.`)
    process.exit(1)
  }
  if (prev === snapshot) {
    console.log('✓ behavior lint: 목적지 반응이 골든 스냅샷과 일치')
  } else {
    console.error('✗ behavior lint: 목적지 반응이 바뀌었습니다.\n')
    const a = prev.split('\n')
    const b = snapshot.split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        if (a[i] !== undefined) console.error(`  - ${a[i]}`)
        if (b[i] !== undefined) console.error(`  + ${b[i]}`)
      }
    }
    console.error('\n  의도한 변경이면 `pnpm lint:behavior:write` 로 갱신해 함께 커밋하세요.')
    process.exit(1)
  }
}
