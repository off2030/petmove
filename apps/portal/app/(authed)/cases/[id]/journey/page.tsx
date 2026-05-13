'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'
import { useCase } from '@/components/portal-shell/case-data-provider'

/**
 * 케이스별 여정 — /cases/<id>/journey. Client 컴포넌트 — CaseDataProvider 에서 케이스 데이터 읽음.
 *
 * layout 이 케이스 본인 매핑 + initialCases 로 Provider 주입을 보장. 여기서는 useCase(id) 로
 * 메모리에서 바로 조회 — 추가 네트워크 없음. buildJourney 는 순수 함수라 client 에서 실행.
 */
export default function CaseJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const caseRow = useCase(id)
  if (!caseRow) notFound()

  const data = buildJourney(caseRow)
  return <TimelineCalm data={data} caseId={id} />
}
