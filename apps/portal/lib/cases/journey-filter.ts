import type { CaseRow } from '@petmove/domain'

/**
 * 케이스에 여정(목적지)이 하나라도 있는지 — 여정 화면(내 여정·일정·동물 전환 아바타) 노출 기준.
 *
 * 목적지 0개 동물은 '반려동물'(내 정보)에는 남지만 '여정'은 아니므로 여정 화면에서 제외한다.
 * (목적지를 다 지운 동물 = 준비 중인 여정 없음.) destination 토큰 파싱은 다른 곳과 동일 규칙.
 */
export function hasJourney(c: Pick<CaseRow, 'destination'>): boolean {
  return (
    (c.destination ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean).length > 0
  )
}
