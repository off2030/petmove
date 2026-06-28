import {
  deriveAdvanceNotificationStatus,
  deriveImportPermitStatus,
  deriveJpExportQuarantineStatus,
  findDestinationKey,
  flattenCaseForDestination,
  resolveDone,
  type CaseRow,
} from '@petmove/domain'
import { destinationTokens, petLabel } from './reminders'

/**
 * 관리자(펫무브워크) 완료 → 앱 푸시용 "마일스톤 완료" 수집 — 순수 함수.
 *
 * 일정 리마인더(reminders.ts)와 달리, 이건 "관리자가 특정 단계를 완료했다"는 사실을
 * 알리는 좋은-소식 푸시다. 일정 알림은 앱이 미래 날짜를 기기에 미리 예약하는 방식이지만,
 * 이건 관리자가 언제 누를지 모르는 시점의 서버 이벤트라 **서버(FCM)가 발송**한다 —
 * 이 함수는 "지금 어떤 단계가 완료 상태인지 + 무슨 문구로 보낼지"만 계산한다.
 * "케이스당 1회만" 발송하는 중복 제거는 발송 측(서버)이 key 로 처리한다.
 *
 * 목적지별 (사용자 확정, 2026-06-25):
 *   - 일본: 광견병 항체검사 / 사전 신고 / 일본 수출 검역 신청·예약
 *   - 태국·필리핀: 광견병 항체검사 / 수입 허가증
 * 완료 판정은 모두 기존 도메인 함수 재사용(resolveDone·derive*) — 새 판정 로직 없음.
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

/** 항체검사 완료 푸시를 보낼 목적지 키(사용자 확정 3개). 그 외 목적지는 미발송. */
const TITER_KEYS = new Set(['japan', 'thailand', 'philippines'])

/**
 * 한 케이스에서 "지금 완료 상태인" 마일스톤 푸시들을 수집. 목적지(by_dest) 토큰별로 본다.
 * - 항체검사: 글로벌 검사라 케이스당 1회(여러 목적지여도 중복 X).
 * - 사전 신고·일본 수출검역: 일본(key='japan') 목적지만.
 * - 수입 허가증: 태국·필리핀(key='thailand'|'philippines') 목적지만(목적지별 허가라 key별 dedup).
 */
export function collectMilestonePushes(caseRow: CaseRow): MilestonePush[] {
  const pet = petLabel(caseRow.pet_name)
  const tokens = destinationTokens(caseRow) // 한글 국가명 토큰들(예: ['일본'])
  const out: MilestonePush[] = []

  // 광견병 항체검사 — 글로벌(rabies_titer_records) 검사라 케이스당 1회. 대상 목적지에만.
  const hasTiterDest = tokens.some((t) => {
    const key = findDestinationKey(t)
    return !!key && TITER_KEYS.has(key)
  })
  if (hasTiterDest && resolveDone('has-titer-entry', caseRow)) {
    out.push({
      key: `${caseRow.id}|titer`,
      title: APP_TITLE,
      body: `${pet} 광견병 항체 검사가 완료됐어요. 결과를 앱에서 확인하세요. ✨`,
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
    } else if (key === 'thailand' || key === 'philippines') {
      if (deriveImportPermitStatus(flat) === 'done') {
        out.push({
          key: `${caseRow.id}|${key}|import-permit`,
          title: APP_TITLE,
          body: `${pet} 수입 허가증이 나왔어요. ✨`,
        })
      }
    }
  }

  return out
}
