'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect } from 'react'
import { buildDocsView } from '@/lib/docs/catalog'
import { DocsView } from '@/components/cases/docs-view'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'

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
  const { cases } = useCases()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeDest = searchParams.get('dest')
  // 케이스 없음 → 목록. 목적지 0개(여정 없음) → 다른 여정 동물 서류로 전환, 없으면 목록.
  useEffect(() => {
    if (!caseRow) {
      router.replace('/cases')
      return
    }
    if (!hasJourney(caseRow)) {
      const other = cases.find((c) => c.id !== id && hasJourney(c))
      router.replace(other ? `/cases/${other.id}/docs` : '/cases')
    }
  }, [caseRow, cases, id, router])
  if (!caseRow || !hasJourney(caseRow)) return null

  // multi-destination: ?dest=<token> → buildDocsView 가 그 토큰의 by_dest 분기 (단일·미지정은 첫 토큰)
  const data = buildDocsView(caseRow, activeDest)
  return <DocsView data={data} caseId={id} activeDest={activeDest} />
}
