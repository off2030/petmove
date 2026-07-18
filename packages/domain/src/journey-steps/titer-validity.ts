import { isRabiesFreeOrigin } from '../destination-config'
import { addMonths } from '../procedure-checks/utils'
import { findDestinationKey } from './applicability'

/**
 * 목적지 **입국용** 광견병 항체검사(RNATT) 유효기간(개월) — 단일 출처.
 *  - 숫자: 그 개월 수 (예: 일본 24개월).
 *  - null: 무기한 — 부스터 chain 유지 시 결과가 영구 유효(EU 패밀리 입국). 입국용 만료 알림 없음.
 *  - 키 미존재: 입국에 항체검사 불필요(태국·필리핀 등 — 한국 귀국용으로만 필요).
 *
 * 한국 **귀국용**(왕복) 유효기간은 별도 — 한국 농림축산검역본부 공통 24개월이며, 광견병
 * **발생국**에서 올 때만 적용(비발생국은 면제 — `isRabiesFreeOrigin`).
 *
 * admin 전용 국가(호주 12·싱가포르 12·중국 12·대만 12·뉴질랜드 24·하와이 36 등)는 24개국
 * 정리 때 숫자만 채운다. 그때까진 미지정 = 입국용 만료 알림 없음(귀국 2년만).
 */
export const TITER_ENTRY_VALIDITY_MONTHS: Record<string, number | null> = {
  japan: 24,
  // 중국 — GACC 실무상 RNATT 입국용 채혈일 기준 1년(cn.rnatt-valid-1year-on-arrival 와 동일).
  china: 12,
  // EU 패밀리 — 입국용은 chain 유지 시 무기한(별도 만료 알림 없음).
  eu: null,
  uk: null,
  ireland: null,
  malta: null,
  norway: null,
  finland: null,
  switzerland: null,
}

/** 한국 귀국 시 광견병 항체검사 유효기간(개월) — 농림축산검역본부 공통. */
export const KR_RETURN_TITER_VALIDITY_MONTHS = 24

export interface TiterReminderTarget {
  /** 'entry' = 목적지 입국용, 'return' = 한국 귀국용. (만료 알림 ID 구분에도 사용) */
  kind: 'entry' | 'return'
  /** 채혈 + 유효기간 = 만료일 (YYYY-MM-DD). */
  validUntil: string
  /** 항체검사가 유효해야 하는 기준일(목적지 입국일 / 한국 귀국일). */
  anchorDate: string
  /** 메시지 표기 ('출국' = 목적지 입국용, '귀국' = 한국 귀국용). */
  anchorLabel: '출국' | '귀국'
}

/**
 * 한 목적지(token)에 대해 항체검사 만료 리마인더가 필요한 시점들 — 입국용 + 귀국용.
 * 포털 로컬 알림(reminders.ts)에서 목적지별로 호출한다. 채혈일이 없으면 빈 배열.
 *
 * @param destinationToken 목적지 토큰(한글 국가명 등 — findDestinationKey 로 정규화)
 * @param latestTiterDate 가장 최근 채혈일 (YYYY-MM-DD)
 * @param entryDate 그 목적지 입국일(없으면 입국용 SKIP)
 * @param returnDate 한국 귀국일(왕복일 때만 — 없으면 귀국용 SKIP)
 */
export function titerReminderTargets(opts: {
  destinationToken: string
  latestTiterDate: string
  entryDate: string
  returnDate: string
}): TiterReminderTarget[] {
  const { destinationToken, latestTiterDate, entryDate, returnDate } = opts
  if (!latestTiterDate) return []
  const targets: TiterReminderTarget[] = []
  // 입국용 — config 에 개월수가 명시(무기한 null·미지정 제외)되고 입국일이 있을 때.
  const key = findDestinationKey(destinationToken)
  if (key && entryDate) {
    const months = TITER_ENTRY_VALIDITY_MONTHS[key]
    if (typeof months === 'number') {
      targets.push({
        kind: 'entry',
        validUntil: addMonths(latestTiterDate, months),
        anchorDate: entryDate,
        anchorLabel: '출국',
      })
    }
  }
  // 귀국용 — 왕복(귀국일 있음) + 발생국(비발생국은 한국이 항체검사 자체를 면제).
  if (returnDate && !isRabiesFreeOrigin(destinationToken)) {
    targets.push({
      kind: 'return',
      validUntil: addMonths(latestTiterDate, KR_RETURN_TITER_VALIDITY_MONTHS),
      anchorDate: returnDate,
      anchorLabel: '귀국',
    })
  }
  return targets
}
