import {
  buildCaseJourneyContext,
  flattenCaseForDestination,
  type CaseRow,
} from '@petmove/domain'

/**
 * 활성 목적지 1개로 좁힌 케이스 뷰 — 다중 목적지 케이스를 "그 목적지 하나짜리" 케이스처럼
 * 보이게 만든다.
 *
 *  - destination-scoped 데이터(`data.by_dest[active]`)를 top-level 로 평탄화
 *    (by_dest 에 없는 키는 top-level 값으로 fallback)
 *  - destination 문자열을 활성 토큰 1개로 치환
 *
 * → buildJourney·getStepsForCase·done-resolver·runChecksForCase 등 "단일 목적지" 가정의
 *   기존 로직이 수정 없이 활성 목적지 기준으로 동작한다. 활성 목적지는 `?dest=` 쿼리에서
 *   온 토큰(목록에 있을 때) 또는 첫 토큰.
 *
 * 단일 목적지 케이스(또는 by_dest 미사용)면 사실상 원본 그대로 반환 — 동작 무변경.
 */
export function activeDestinationView(
  caseRow: CaseRow,
  activeDestination?: string | null,
): CaseRow {
  const token = buildCaseJourneyContext(caseRow, activeDestination).destinationToken
  if (!token) return caseRow
  const flat = flattenCaseForDestination(caseRow, token)
  return flat.destination === token ? flat : { ...flat, destination: token }
}
