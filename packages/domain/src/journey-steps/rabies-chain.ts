import { resolveValidUntil } from '../procedure-checks/utils'

/**
 * 광견병 백신 chain 의 연속성 검증.
 *
 * chain 컨벤션: 각 접종(n)은 직전 접종(n-1)의 면역 유효기간 마지막일 이내에 받아야
 * 부스터로 인정된다. 만료 다음 날 이후 접종은 chain 이 끊겨 새 기초접종(1차) 으로
 * 간주 — 1·2차 + 검사 + 180일 사이클을 다시 시작해야 한다.
 *
 * 이런 데이터는 절차 검증의 '주의' 배지가 아니라 입력 단계에서 거부한다
 * (memory: 입력 조건은 입력 불가로). 호출 측이 메시지·UI 톤을 직접 만든다.
 */

export interface RabiesChainBreak {
  /** chain 이 깨진 접종의 1-based dose number (3차이면 3). */
  brokenAt: number
  /** 직전 접종의 면역 유효기간 마지막일 (YYYY-MM-DD). */
  prevValidUntil: string
}

/**
 * entries 는 시간순(1·2·3차...) 정렬되어 들어와야 한다. 빈 date 는 자동 skip.
 * chain 깨진 첫 지점 1건만 반환 — 그 지점이 막히면 그 뒤는 의미 없음.
 */
export function findRabiesChainBreak(
  entries: { date: string; valid_until?: string | null }[],
): RabiesChainBreak | null {
  const valid = entries.filter(
    (e) => typeof e.date === 'string' && e.date.length >= 10,
  )
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1]
    const cur = valid[i]
    const prevValidUntil = resolveValidUntil(prev.date, prev.valid_until)
    if (cur.date > prevValidUntil) {
      return { brokenAt: i + 1, prevValidUntil }
    }
  }
  return null
}
