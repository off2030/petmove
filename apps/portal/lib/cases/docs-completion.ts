import {
  areAllRequiredDocsVerified,
  parseDestinations,
  readByDestValue,
  resolveActiveDestination,
  todayKst,
  writeByDestValue,
  type CaseRow,
} from '@petmove/domain'
import { activeDestinationView } from './active-destination'

const COMPLETED_KEY = 'required_docs_completed_at'

/**
 * 서류 체크리스트(document-checklist)가 '모두 ✓' 로 전환되는 순간을 'YYYY-MM-DD'(KST)로
 * 박아 둔다 — 일정 표시일(resolveCompletedDate 'all-required-docs')용. 완료 판정은
 * done-resolver 와 동일한 areAllRequiredDocsVerified('document-checklist').
 *
 * 완료가 수기 플래그·첨부·step done 등 여러 경로에서 파생돼 단일 날짜 필드가 없어서, 서류
 * 상태를 바꾸는 portal 액션(수기 토글·첨부 추가/삭제)이 호출할 때마다 재계산해 박거나 지운다:
 *   - 완료됐는데 타임스탬프 없음 → 오늘(KST)로 박는다.
 *   - 미완료인데 타임스탬프 있음 → 지운다(되돌리면 다음 완료 때 다시 박힘).
 *   - 그 외(이미 박힌 완료 상태) → 그대로 — 첫 완료일 보존.
 *
 * 다중 목적지면 flags 와 동일하게 활성 목적지 by_dest 스코프에 저장 — flatten 이 surface 한다.
 * (admin 의 export_doc_status='done' 경로는 펫무브워크 소관이라 여기서 안 박음 — 그 경우만 '—'.)
 *
 * @param prevRow  변경 전 케이스 전체 행(완료 판정에 destination·departure_date 등 필요).
 * @param nextData 변경 후 case.data — 이 객체 기준으로 판정하고, 타임스탬프를 더해 반환.
 * @param activeDest 활성 목적지 토큰(?dest=). 다중 목적지에서만 의미, 없으면 자동 해석.
 */
export function stampDocsChecklistCompletion(
  prevRow: CaseRow,
  nextData: Record<string, unknown>,
  activeDest?: string | null,
): Record<string, unknown> {
  const tokens = parseDestinations(prevRow.destination ?? null)
  const useByDest = tokens.length > 1
  const dest = useByDest
    ? activeDest && tokens.includes(activeDest)
      ? activeDest
      : resolveActiveDestination(prevRow.destination ?? null, null)
    : null

  // 완료 판정 — 단일 목적지 가정 로직이므로 활성 목적지로 flatten 한 뷰로 본다.
  const flat = activeDestinationView({ ...prevRow, data: nextData }, dest)
  const complete = areAllRequiredDocsVerified(flat, 'document-checklist')

  const existing =
    useByDest && dest ? readByDestValue(nextData, dest, COMPLETED_KEY) : nextData[COMPLETED_KEY]
  const hasStamp = typeof existing === 'string' && existing.length >= 10

  if (complete && !hasStamp) {
    const today = todayKst()
    return useByDest && dest
      ? writeByDestValue(nextData, dest, COMPLETED_KEY, today)
      : { ...nextData, [COMPLETED_KEY]: today }
  }
  if (!complete && hasStamp) {
    if (useByDest && dest) return writeByDestValue(nextData, dest, COMPLETED_KEY, null)
    const { [COMPLETED_KEY]: _drop, ...rest } = nextData
    return rest
  }
  return nextData
}
