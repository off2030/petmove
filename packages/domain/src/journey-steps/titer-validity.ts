import { isRabiesFreeOrigin, DESTINATION_OVERRIDES } from '../destination-config'
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
 * 프로파일 파생 — 각 목적지의 `titer.entryValidityMonths` 선언(destination-config)이 진실
 * 출처(근거 주석도 그쪽에). admin 전용 국가(호주 12·싱가포르 12·대만 12·뉴질랜드 24·하와이
 * 36 등)는 24개국 정리 때 선언을 채운다. 그때까진 미선언 = 입국용 만료 알림 없음(귀국 2년만).
 */
export const TITER_ENTRY_VALIDITY_MONTHS: Record<string, number | null> = Object.fromEntries(
  Object.entries(DESTINATION_OVERRIDES).flatMap(([key, o]) =>
    o.titer?.entryValidityMonths !== undefined ? [[key, o.titer.entryValidityMonths]] : [],
  ),
)


/**
 * 최종 접종 후 채혈까지 최소 대기(일) — 프로파일 `titer.minDaysAfterVaccine` 파생.
 *
 * 포털 저장 차단(validateEuTiterAfterVaccine)의 **대상 목적지**를 넓히는 데 쓴다.
 * 그 차단은 원래 EU_ENTRY_FAMILY 하드코딩 목록에만 걸려 있어서, 같은 30일 요건을 가진
 * 모로코·우크라이나를 앱에 올렸을 때 채혈일 차단이 조용히 빠졌다(2026-07-20 발견).
 *
 * ⚠️ EU 패밀리 프로파일은 아직 이 값을 **선언하지 않는다.** 그래서 소비처는 이 맵과
 *   EU_ENTRY_FAMILY 의 **합집합**을 봐야 한다 — 파생만 보면 EU 차단이 사라진다.
 *   EU 프로파일에 선언을 채우는 건 별도 작업(선언 후 합집합을 걷어낼 것).
 */
export const TITER_MIN_DAYS_AFTER_VACCINE: Record<string, number> = Object.fromEntries(
  Object.entries(DESTINATION_OVERRIDES).flatMap(([key, o]) =>
    typeof o.titer?.minDaysAfterVaccine === 'number' ? [[key, o.titer.minDaysAfterVaccine]] : [],
  ),
)

/** 한국 귀국 시 광견병 항체검사 유효기간(개월) — 농림축산검역본부 공통. */
export const KR_RETURN_TITER_VALIDITY_MONTHS = 24

/**
 * '추가 검사'를 **별도 카드**로 두는 목적지 — 그 외에는 본 검사 카드 한 장에 목록으로 넣는다.
 *
 * 광견병 백신과 같은 모델이다: 회차마다 규칙·마감이 다른 곳(일본·대만)만 카드를 나누고,
 * 같은 규칙의 단순 누적이면 카드 한 장에 목록(1회 접종국 백신과 동일).
 *
 * 이 명단 밖 목적지는 예전에 **본 카드가 1건(index 0)만 편집**해서 재검사를 넣으면 이전
 * 기록을 조용히 덮어썼다 — 데이터는 배열인데 입력 경로만 1건이었다(2026-07-19 수정).
 *
 * catalog 의 rabies-titer-extra applicability 와 어긋나면 안 되므로 하드코딩하지 말고
 * 이 상수를 쓴다.
 */
// 하와이 — FAVN 은 36개월 유효 + 재검사로 갱신되므로 회차별 카드 분리(일본·대만과 동일).
export const TITER_EXTRA_CARD_DESTINATIONS: readonly string[] = ['japan', 'taiwan', 'hawaii']

/**
 * 목적지 입국용 항체검사 만료일 — 카드(추가 검사 노출·문구)가 쓰는 단일 출처.
 *
 * 예전엔 카드가 `addYears(채혈일, 2)`로 **2년을 하드코딩**했다. 일본(24개월)에만 맞고
 * 대만·중국(12개월)에선 만료를 1년 늦게 잡아, 이미 만료된 검사를 "아직 유효"로 판정했다.
 * 알림(titerReminderTargets)은 진작 목적지별 선언을 쓰고 있어서 **카드와 알림이 서로 다른
 * 만료일을 보던** 상태였다(2026-07-19 수정).
 *
 * null = 만료 개념 없음 — 무기한(EU 패밀리: 부스터 chain 유지 시 영구 유효)이거나
 * 입국에 항체검사가 불필요한 목적지(태국·필리핀·베트남 — 한국 귀국용으로만 필요).
 */
export function titerEntryValidUntil(
  destinationToken: string,
  latestTiterDate: string,
): string | null {
  if (!latestTiterDate) return null
  const key = findDestinationKey(destinationToken)
  if (!key) return null
  const months = TITER_ENTRY_VALIDITY_MONTHS[key]
  if (typeof months !== 'number') return null
  return addMonths(latestTiterDate, months)
}

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
 * @param tripType 이 목적지의 왕복/편도 — getTripType(data, token) 값. 'one_way' 면 귀국용
 *   SKIP. returnDate 존재만으로 판정하면 편도 전환 후 잔존 귀국일에 알림이 새서(카드
 *   필터는 tripType 기준인데 알림만 다른 기준) 명시적으로 받는다. 미지정=기존 동작.
 */
export function titerReminderTargets(opts: {
  destinationToken: string
  latestTiterDate: string
  entryDate: string
  returnDate: string
  tripType?: 'round' | 'one_way'
}): TiterReminderTarget[] {
  const { destinationToken, latestTiterDate, entryDate, returnDate, tripType } = opts
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
  //   ⚠️ **편도 전용 목적지는 제외**(2026-07-30 남아공을 앱에 올리며 발견). oneWayOnly 는
  //     getTripType 이 저장값과 무관하게 'one_way' 를 돌려주게 하는데, 여기선 tripType 이
  //     아니라 returnDate 존재만 봐서 잔여 귀국일이 남아 있으면 귀국 항체 만료 알림이 갔다.
  //     호주·뉴질랜드는 광견병 비발생국이라 아래 조건에서 이미 걸러져 증상이 없었고,
  //     발생국인 남아공이 처음으로 이 구멍을 드러냈다.
  const oneWayOnly = !!(key && DESTINATION_OVERRIDES[key]?.oneWayOnly)
  if (returnDate && !oneWayOnly && tripType !== 'one_way' && !isRabiesFreeOrigin(destinationToken)) {
    targets.push({
      kind: 'return',
      validUntil: addMonths(latestTiterDate, KR_RETURN_TITER_VALIDITY_MONTHS),
      anchorDate: returnDate,
      anchorLabel: '귀국',
    })
  }
  return targets
}
