'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import { InfoView } from '@/components/cases/info-view'
import { useCase } from '@/components/portal-shell/case-data-provider'

/**
 * 케이스별 정보 — /cases/<id>/info. Client 컴포넌트 — CaseDataProvider 에서 데이터 읽음.
 */
export default function CaseInfoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const caseRow = useCase(id)
  if (!caseRow) notFound()

  return <InfoView caseRow={caseRow} caseId={id} />
}
