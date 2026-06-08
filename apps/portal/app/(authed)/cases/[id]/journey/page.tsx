'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect } from 'react'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'

/**
 * 케이스별 여정 — /cases/<id>/journey. Client 컴포넌트 — CaseDataProvider 에서 케이스 데이터 읽음.
 *
 * ⚠️ 완료 확인 prompt(A형)는 일시 비활성화(2026-06-08). markJourneyComplete 가 완료/취소 시
 * destination 토큰을 즉시 제거 → 완료 카드(도착 배너)를 볼 새 없이 여정이 사라지고, 모달 오조작으로
 * 취소까지 발생하는 결함. 재설계(완료 카드 먼저 노출 + 토큰 제거 분리 + 파괴적 동작 확인) 후 재도입.
 * CompletionPrompt·shouldPromptArrival·markJourneyComplete 코드는 남겨두되 여기서 호출하지 않는다.
 */
export default function CaseJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const caseRow = useCase(id)
  const { cases } = useCases()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeDest = searchParams.get('dest')

  // 케이스 없음(운영자 삭제 등) → 목록으로. 목적지 0개(여정 없음) → 다른 여정 동물로 전환,
  // 없으면 목록('준비 중인 여정 없음'). 목적지 다 지운 동물의 일정 탭엔 머무를 수 없게 한다.
  useEffect(() => {
    if (!caseRow) {
      router.replace('/cases')
      return
    }
    if (!hasJourney(caseRow)) {
      const other = cases.find((c) => c.id !== id && hasJourney(c))
      router.replace(other ? `/cases/${other.id}/journey` : '/cases')
    }
  }, [caseRow, cases, id, router])
  if (!caseRow || !hasJourney(caseRow)) return null

  // multi-destination: activeDest 가 토큰 목록에 있으면 그걸로 분기.
  // 단일 케이스나 없으면 첫 토큰(buildCaseJourneyContext 내부 fallback).
  const data = buildJourney(caseRow, activeDest)
  return <TimelineCalm data={data} caseId={id} activeDest={activeDest} />
}
