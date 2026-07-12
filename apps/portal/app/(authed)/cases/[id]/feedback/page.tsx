'use client'

import { notFound, useSearchParams } from 'next/navigation'
import { use } from 'react'
import { parseDestinations } from '@petmove/domain'
import { FeedbackView } from '@/components/feedback/feedback-view'
import { useCase } from '@/components/portal-shell/case-data-provider'

/**
 * 여정 완료 후 의견 화면 — /cases/<id>/feedback?dest=<목적지>. Client 컴포넌트.
 * Context 에서 케이스 조회(네트워크 없음). 없으면 notFound.
 * 활성 목적지(?dest)가 목적지 목록에 있으면 그 칸, 아니면 첫 목적지 칸의 의견을 다룬다.
 */
export default function CaseFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const caseRow = useCase(id)
  const searchParams = useSearchParams()
  if (!caseRow) notFound()

  const tokens = parseDestinations(caseRow.destination)
  const raw = searchParams.get('dest')
  const dest = raw && tokens.includes(raw) ? raw : tokens[0] ?? null
  // 소감 카드의 얼굴 원탭 진입(?rating=1~5) — 그 만족도가 선택된 채 시작.
  const ratingRaw = Number(searchParams.get('rating'))
  const initialRating =
    Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null

  return <FeedbackView caseId={id} dest={dest} initialRating={initialRating} />
}
