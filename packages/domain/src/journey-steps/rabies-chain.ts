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
  /**
   * 깨진 사유:
   *  - 'too-early': 직전 차수보다 이른 날짜(예: 3차가 2차보다 빠름) — 순서 위반.
   *  - 'expired'  : 직전 접종의 면역 유효기간을 넘긴 날짜 — chain 끊김(새 기초접종).
   */
  reason: 'too-early' | 'expired'
  /** 직전 접종일 (YYYY-MM-DD). */
  prevDate: string
  /** 직전 접종의 면역 유효기간 마지막일 (YYYY-MM-DD). */
  prevValidUntil: string
}

/**
 * entries 는 차수 순서(1·2·3차...)대로 들어와야 한다. 빈 date 는 자동 skip.
 * chain 깨진 첫 지점 1건만 반환 — 그 지점이 막히면 그 뒤는 의미 없음.
 *
 * 각 접종(n)은 (a) 직전 접종(n-1) **이후**이고, (b) 직전 접종의 면역 유효기간 **이내**여야
 * 부스터로 인정된다. (a) 위반은 'too-early'(순서 거꾸로), (b) 위반은 'expired'(만료 후).
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
    // (a) 순서 위반 — 직전 차수보다 이른 날짜.
    if (cur.date < prev.date) {
      return { brokenAt: i + 1, reason: 'too-early', prevDate: prev.date, prevValidUntil }
    }
    // (b) 유효기간 경과 — 부스터가 직전 면역 유효기간을 넘김.
    if (cur.date > prevValidUntil) {
      return { brokenAt: i + 1, reason: 'expired', prevDate: prev.date, prevValidUntil }
    }
  }
  return null
}
