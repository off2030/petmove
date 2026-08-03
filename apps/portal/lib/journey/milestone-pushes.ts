import {
  buildCaseJourneyContext,
  deriveAdvanceNotificationStatus,
  deriveImportPermitStatus,
  deriveJpExportQuarantineStatus,
  findDestinationKey,
  flattenCaseForDestination,
  isStepApplicable,
  JOURNEY_STEP_CATALOG,
  resolveDone,
  usesRabiesTiter,
  type CaseRow,
} from '@petmove/domain'
import { destinationTokens, petLabel } from './reminders'

/**
 * 전염병 검사 카드가 이 케이스·목적지에 **실제로 뜨는가** — 푸시 게이트의 단일 출처.
 *
 * ⚠️ 예전엔 `requiresInfectiousDiseaseTest(token)`(목적지만 봄)을 썼는데, 이 검사는 호주·
 *   뉴질랜드·남아공 모두 **강아지 전용**(카드 applicability 의 speciesByDestination)이라
 *   고양이 케이스에 기록만 있으면 "검사가 완료됐어요" 푸시가 나갔다(2026-07-30 사용자 지적).
 *   목적지 명단을 따로 들지 말고 **카드 자신에게 물어본다** — 목적지·종·왕복 조건이 한 번에
 *   맞는다. 항체 푸시가 홍콩·아랍에미리트에서 겪은 사고와 같은 부류다.
 */
const INFECTIOUS_CARD = JOURNEY_STEP_CATALOG.find((s) => s.id === 'infectious-disease-test')
function infectiousTestCardApplies(caseRow: CaseRow, token: string): boolean {
  if (!INFECTIOUS_CARD) return false
  return isStepApplicable(INFECTIOUS_CARD.applicability, buildCaseJourneyContext(caseRow, token))
}

/**
 * 관리자(펫무브워크) 완료 → 앱 푸시용 "마일스톤 완료" 수집 — 순수 함수.
 *
 * 일정 리마인더(reminders.ts)와 달리, 이건 "관리자가 특정 단계를 완료했다"는 사실을
 * 알리는 좋은-소식 푸시다. 일정 알림은 앱이 미래 날짜를 기기에 미리 예약하는 방식이지만,
 * 이건 관리자가 언제 누를지 모르는 시점의 서버 이벤트라 **서버(FCM)가 발송**한다 —
 * 이 함수는 "지금 어떤 단계가 완료 상태인지 + 무슨 문구로 보낼지"만 계산한다.
 * "케이스당 1회만" 발송하는 중복 제거는 발송 측(서버)이 key 로 처리한다.
 *
 * 마일스톤:
 *   - 광견병 항체검사 완료 — **모든 목적지 공통**(글로벌 검사). 케이스당 1회.
 *   - 전염병 검사 완료 — 호주·뉴질랜드·남아공(글로벌 검사). 케이스당 1회.
 *   - 일본: 사전 신고 / 일본 수출 검역 신청·예약
 *   - 태국·필리핀·대만: 수입 허가증
 * 완료 판정은 모두 기존 도메인 함수 재사용(resolveDone·derive*) — 새 판정 로직 없음.
 *
 * **푸시를 안 붙이는 단계 — 고객이 직접 수행하는 것**(2026-07-19 확인).
 *   한국 수출 검역·도착 검역 등 검역은 **고객이 직접 간다**. 본인이 한 일을 앱이 다시
 *   알릴 이유가 없다. 여기 있는 마일스톤들은 고객이 결과를 **기다리는** 단계다 —
 *   검사 결과, 신고 수리, 허가 발급. 전수 점검 때 '검역 완료 푸시가 빠졌다'로 걸리는데
 *   누락이 아니라 설계다. (예정일 리마인더는 별개로 reminders.ts 가 담당.)
 *
 * ⚠️ 목적지 토큰은 **한글 국가명**('일본'·'태국'·'필리핀')이라, derive 분기는 반드시
 *    `findDestinationKey` 로 영어 키('japan'·'thailand'·'philippines')로 정규화한 뒤 비교한다.
 *    (정규화 없이 토큰을 'japan' 과 직접 비교하면 한글 토큰이 안 잡혀 한 건도 발송 안 됨.)
 */

export interface MilestonePush {
  /** 케이스+마일스톤 안정 키 — 발송 1회 보장(중복 제거)용. 같은 단계는 항상 같은 key. */
  key: string
  title: string
  body: string
}

const APP_TITLE = '펫무브'

/**
 * 한 케이스에서 "지금 완료 상태인" 마일스톤 푸시들을 수집. 목적지(by_dest) 토큰별로 본다.
 * - 항체검사: 글로벌 검사라 케이스당 1회(여러 목적지여도 중복 X). 모든 목적지 공통.
 * - 사전 신고·일본 수출검역: 일본(key='japan') 목적지만.
 * - 수입 허가증: 태국·필리핀·대만 목적지만(목적지별 허가라 key별 dedup).
 */
export function collectMilestonePushes(caseRow: CaseRow): MilestonePush[] {
  const pet = petLabel(caseRow.pet_name)
  const tokens = destinationTokens(caseRow) // 한글 국가명 토큰들(예: ['일본'])
  const out: MilestonePush[] = []

  // 광견병 항체검사 — 글로벌(rabies_titer_records) 검사라 케이스당 1회.
  // 단 **항체검사를 쓰는 목적지가 하나라도 있을 때만** 보낸다(2026-07-26). 홍콩·아랍에미리트는
  // 입국 요건도 아니고(titer.need 'none') 귀국 때도 면제(광견병 비발생국)라 여정에 항체 카드가
  // 아예 없는데, 기록용으로 입력한 값 때문에 "검사가 완료됐어요" 푸시가 나가고 있었다.
  // 목적지 미입력 케이스는 여정이 정해지기 전이라 기존대로 보낸다.
  if (
    resolveDone('has-titer-entry', caseRow) &&
    (tokens.length === 0 || tokens.some((t) => usesRabiesTiter(t)))
  ) {
    out.push({
      key: `${caseRow.id}|titer`,
      title: APP_TITLE,
      body: `${pet} 광견병 항체 검사가 완료됐어요. 결과를 앱에서 확인하세요. ✨`,
    })
  }

  // 전염병 검사 — 글로벌(infectious_disease_records) 검사라 케이스당 1회. 항체 검사와 같은
  // 모델이다: **병원이 대행해 보호자가 결과를 기다리는** 단계라 완료 푸시 대상이다
  // (2026-07-28 사용자 지정). 검역처럼 보호자가 직접 하는 절차가 아니다.
  //
  // 이 검사 **카드가 실제로 뜨는** 목적지·종일 때만 보낸다(호주·뉴질랜드·남아공 강아지) — 카드가 없는
  // 목적지에 기록용으로 남은 값 때문에 푸시가 나가는 건 항체 푸시가 홍콩·아랍에미리트에서
  // 겪은 사고와 같은 자리다. ⚠️ 항체와 달리 **목적지 미입력(tokens 빈 배열)은 제외**한다 —
  // 항체는 사실상 모든 여정에 있어 미리 보내도 맞지만, 이 검사는 3개국 전용이라 목적지가
  // 정해지기 전에 "완료됐어요"를 보내면 대부분 틀린 알림이 된다.
  if (
    resolveDone('has-infectious-disease-test', caseRow) &&
    tokens.some((t) => infectiousTestCardApplies(caseRow, t))
  ) {
    out.push({
      key: `${caseRow.id}|infectious-disease`,
      title: APP_TITLE,
      body: `${pet} 전염병 검사가 완료됐어요. 결과를 앱에서 확인하세요. ✨`,
    })
  }

  for (const token of tokens) {
    const key = findDestinationKey(token) // '일본' → 'japan'
    if (!key) continue
    // 목적지별 필드(수입 허가증 등)는 **네이티브 토큰**으로 flatten(by_dest 키가 한글이라).
    let flat: CaseRow
    try {
      flat = flattenCaseForDestination(caseRow, token)
    } catch {
      continue
    }

    if (key === 'japan') {
      if (deriveAdvanceNotificationStatus(flat) === 'done') {
        out.push({
          key: `${caseRow.id}|japan|advance`,
          title: APP_TITLE,
          body: `${pet} 사전 신고가 완료됐어요. ✨`,
        })
      }
      if (deriveJpExportQuarantineStatus(flat) === 'done') {
        out.push({
          key: `${caseRow.id}|japan|jp-export`,
          title: APP_TITLE,
          body: `${pet} 일본 수출 검역 신청과 예약이 완료됐어요. 예약 일시를 앱에서 확인하세요. ✨`,
        })
      }
    } else if (
      key === 'thailand' ||
      key === 'philippines' ||
      key === 'taiwan'
      // ⛔ 말레이시아·인도네시아 제외(2026-07-23) — 수입 허가를 현지에서 처리하고 신청 마감이
      //   없거나 미확인이라 '허가 나왔어요' 발급 푸시를 만들지 않는다(아랍에미리트와 같은 판단).
      //   reminders.ts 의 마감 알림 제거와 짝.
    ) {
      // 대만도 같은 import-permit 카드·같은 판정 함수를 쓴다(APHIA e-permit). 발급됐다는 사실은
      // 앱에 기록되는 순간 알릴 가치가 있다 — 도착 120일 전 마감이라 발급 확인이 늦으면 일정
      // 전체가 흔들린다. (신청 주체와 무관한 푸시라 로잔 대행 전환 2026-08-03 에도 그대로.)
      if (deriveImportPermitStatus(flat) === 'done') {
        out.push({
          key: `${caseRow.id}|${key}|import-permit`,
          title: APP_TITLE,
          body: `${pet} 수입 허가증이 나왔어요. ✨`,
        })
      }
    }
    // ⛔ **아랍에미리트(uae)는 이 목록에 넣지 말 것**(사용자 확정 2026-07-22).
    //   수입 허가 카드는 있지만 발급 완료 푸시는 만들지 않는다. 신청 마감일이 없어
    //   '언제까지 해야 하는' 일정이 아니라, 발급 시점을 알려도 보호자가 당길 일이 없다.
    //   (같은 이유로 reminders.ts 의 신청 마감 알림도 만들지 않았다.)
    // ⛔ **홍콩(hongkong)도 같은 판단**(2026-07-26). Special Permit 은 현지 대리인이 신청하고
    //   (localApplyOnly) 확정 신청 마감이 없어, 발급 시점을 알려도 보호자가 당길 일이 없다.
    //   대신 도착 24시간 전 사전 통지는 마감이 있어 reminders.ts 알림 테이블에 등록했다.
    // ⛔ **싱가포르(singapore)도 같은 판단**(사용자 지정, destination-config 싱가포르 주석 참조).
    //   GoBusiness 수입 허가·강아지 라이선스·계류장 예약 모두 selfApply + 확정 마감 없음이라
    //   발급 푸시를 만들지 않는다. 글로벌 항체검사 완료 푸시(위)는 싱가포르에도 나간다.
  }

  return out
}
