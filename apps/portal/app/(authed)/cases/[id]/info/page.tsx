import { notFound } from 'next/navigation'
import { getMyCase } from '@/lib/actions/cases'
import { buildInfoView } from '@/lib/info/catalog'
import { InfoView } from '@/components/cases/info-view'

export const dynamic = 'force-dynamic'

/**
 * 케이스별 정보 — /cases/<id>/info.
 *
 * layout 이 케이스 본인 매핑 보장. 여기서는 단건 재조회 (React cache dedupe).
 * 데이터 모델: lib/info/catalog.ts → InfoView (Stone 톤, app.jsx 의 Info 시안).
 */
export default async function CaseInfoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getMyCase(id)
  if (!result.ok || !result.value) notFound()

  const data = buildInfoView(result.value)
  return <InfoView data={data} />
}
