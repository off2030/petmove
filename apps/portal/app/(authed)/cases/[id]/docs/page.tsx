'use client'

import { notFound } from 'next/navigation'
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
  if (!caseRow) notFound()

  const data = buildDocsView(caseRow)
  return <DocsView data={data} />
}
