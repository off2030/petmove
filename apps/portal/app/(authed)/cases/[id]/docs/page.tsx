import { notFound } from 'next/navigation'
import { getMyCase } from '@/lib/actions/cases'
import { buildDocsView } from '@/lib/docs/catalog'
import { DocsView } from '@/components/cases/docs-view'

export const dynamic = 'force-dynamic'

/**
 * 케이스별 서류함 — /cases/<id>/docs.
 *
 * layout 이 케이스 본인 매핑 보장. 여기서는 단건 재조회 (React cache dedupe).
 * 데이터 모델: lib/docs/catalog.ts → DocsView (Stone 톤, docs.jsx 시안 충실).
 */
export default async function CaseDocsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getMyCase(id)
  if (!result.ok || !result.value) notFound()

  const data = buildDocsView(result.value)
  return <DocsView data={data} />
}
