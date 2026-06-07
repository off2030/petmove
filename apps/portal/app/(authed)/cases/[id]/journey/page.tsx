'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect } from 'react'
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeDest = searchParams.get('dest')
  // 케이스가 없으면(예: 운영자가 펫무브워크에서 삭제) 404 대신 내 케이스 목록으로 — 부드럽게.
  useEffect(() => {
    if (!caseRow) router.replace('/cases')
  }, [caseRow, router])
  if (!caseRow) return null

  // multi-destination: activeDest 가 토큰 목록에 있으면 그걸로 분기.
  // 단일 케이스나 없으면 첫 토큰(buildCaseJourneyContext 내부 fallback).
  const data = buildJourney(caseRow, activeDest)
  return <TimelineCalm data={data} caseId={id} activeDest={activeDest} />
}
