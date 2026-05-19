'use client'

import type { CaseRow } from '@petmove/domain'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'

/**
 * 미리보기용 여정 렌더. (authed)/cases/[id]/journey 페이지와 동일하게 client 에서
 * buildJourney 를 돌려, 보호자가 보는 것과 같은 날짜 기준(클라이언트 시각)으로 렌더한다.
 * step 진입 링크는 보호자 인증 라우트라 preview 모드에서 비활성.
 */
export function JourneyPreview({ caseRow }: { caseRow: CaseRow }) {
  const data = buildJourney(caseRow)
  return <TimelineCalm data={data} caseId={caseRow.id} preview />
}
