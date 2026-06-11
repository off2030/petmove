/**
 * 여정 의견(feedback) — 목적지별 분리 형태 + legacy 호환. 순수 헬퍼.
 *
 * 저장 형태(현행): `case.data.feedback = { [목적지토큰]: { rating, text, submittedAt } }`
 *   - `arrival_confirmed`·`completion_prompt_dismissed` 와 같은 "목적지 키 맵" 패턴.
 *   - 케이스 단위 전역 키(GLOBAL_CASE_DATA_KEYS)지만 내부적으로 목적지별 분기 → 여정이
 *     지난 여정으로 내려가(by_dest 삭제) 도 의견 데이터는 살아남는다.
 *
 * legacy 형태: `case.data.feedback = { rating, text, submittedAt }` (케이스당 1개).
 *   - DB 마이그레이션 없이 read/write 시점에 호환 — legacy 는 케이스의 첫 목적지 것으로 간주,
 *     저장 시 keyed-map 으로 승격한다.
 */

export interface JourneyFeedback {
  rating: number | null
  text: string
  submittedAt: string | null
}

/** legacy 단일 객체인지 — rating/text/submittedAt 스칼라 키를 직접 가짐(목적지 토큰 키가 아님). */
function isLegacyFeedback(fb: Record<string, unknown>): boolean {
  return 'rating' in fb || 'text' in fb || 'submittedAt' in fb
}

/** 임의 값 → JourneyFeedback (내용 없으면 null). */
function coerce(fb: unknown): JourneyFeedback | null {
  if (!fb || typeof fb !== 'object') return null
  const o = fb as Record<string, unknown>
  const rating = typeof o.rating === 'number' ? o.rating : null
  const text = typeof o.text === 'string' ? o.text : ''
  if (rating === null && !text) return null
  return { rating, text, submittedAt: typeof o.submittedAt === 'string' ? o.submittedAt : null }
}

/**
 * 특정 목적지의 의견 읽기. legacy 단일 객체는 firstToken 의 것으로 간주(dest 미지정이면 무조건 노출).
 */
export function readJourneyFeedback(
  data: Record<string, unknown> | null | undefined,
  destToken: string | null | undefined,
  firstToken?: string | null,
): JourneyFeedback | null {
  const fb = data?.feedback
  if (!fb || typeof fb !== 'object') return null
  const obj = fb as Record<string, unknown>
  if (isLegacyFeedback(obj)) {
    if (!destToken || !firstToken || destToken === firstToken) return coerce(obj)
    return null
  }
  if (!destToken) return null
  return coerce(obj[destToken])
}

/**
 * 케이스의 모든 의견(목적지별) — 운영자 모아보기용. legacy 는 firstToken 1건.
 */
export function listJourneyFeedback(
  data: Record<string, unknown> | null | undefined,
  firstToken?: string | null,
): { destination: string | null; feedback: JourneyFeedback }[] {
  const fb = data?.feedback
  if (!fb || typeof fb !== 'object') return []
  const obj = fb as Record<string, unknown>
  if (isLegacyFeedback(obj)) {
    const c = coerce(obj)
    return c ? [{ destination: firstToken ?? null, feedback: c }] : []
  }
  const out: { destination: string | null; feedback: JourneyFeedback }[] = []
  for (const [k, v] of Object.entries(obj)) {
    const c = coerce(v)
    if (c) out.push({ destination: k, feedback: c })
  }
  return out
}

/**
 * 의견 저장(immutable) — destToken 칸에 set, 빈 값이면 그 칸 삭제. legacy 면 keyed-map 으로 승격.
 * submittedAt 은 caller(server action)가 생성해 넘긴다(도메인은 시간 의존 X).
 */
export function writeJourneyFeedback(
  data: Record<string, unknown>,
  destToken: string,
  firstToken: string | null,
  next: { rating: number | null; text: string; submittedAt: string } | null,
): Record<string, unknown> {
  const fb = data.feedback
  let map: Record<string, unknown> = {}
  if (fb && typeof fb === 'object') {
    const obj = fb as Record<string, unknown>
    if (isLegacyFeedback(obj)) {
      const legacy = coerce(obj)
      if (legacy) {
        map[firstToken ?? destToken] = {
          rating: legacy.rating,
          text: legacy.text,
          submittedAt: legacy.submittedAt,
        }
      }
    } else {
      map = { ...obj }
    }
  }
  const text = next ? next.text.trim() : ''
  if (!next || (next.rating === null && !text)) {
    delete map[destToken]
  } else {
    map[destToken] = { rating: next.rating, text, submittedAt: next.submittedAt }
  }
  const nextData = { ...data }
  if (Object.keys(map).length === 0) delete nextData.feedback
  else nextData.feedback = map
  return nextData
}
