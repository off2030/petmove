'use client'

import { notFound, useSearchParams } from 'next/navigation'
import { use } from 'react'
import { buildDocsView } from '@/lib/docs/catalog'
import { DocsView } from '@/components/cases/docs-view'
import { useCase } from '@/components/portal-shell/case-data-provider'

/**
 * 케이스별 서류함 — /cases/<id>/docs. Client 컴포넌트 — CaseDataProvider 에서 데이터 읽음.
 */
export default function CaseDocsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const caseRow = useCase(id)
  const searchParams = useSearchParams()
  const activeDest = searchParams.get('dest')
  if (!caseRow) notFound()

  // multi-destination: ?dest=<token> → buildDocsView 가 그 토큰의 by_dest 분기 (단일·미지정은 첫 토큰)
  const data = buildDocsView(caseRow, activeDest)
  return <DocsView data={data} caseId={id} />
}
