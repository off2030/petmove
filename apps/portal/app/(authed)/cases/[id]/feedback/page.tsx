'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { FeedbackView } from '@/components/feedback/feedback-view'
import { useCase } from '@/components/portal-shell/case-data-provider'

/**
 * 여정 완료 후 의견 화면 — /cases/<id>/feedback. Client 컴포넌트.
 * Context 에서 케이스 조회(네트워크 없음). 없으면 notFound.
 */
export default function CaseFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const caseRow = useCase(id)
  if (!caseRow) notFound()

  return <FeedbackView caseId={id} />
}
