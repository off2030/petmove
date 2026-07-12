'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { buildDocsView } from '@/lib/docs/catalog'
import { DocsView } from '@/components/cases/docs-view'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { replaceTab } from '@/components/portal-shell/tab-nav'

/**
 * 서류 탭 본체 — TabHost 의 pane 으로 상주 mount. (구 /cases/<id>/docs page 본문.)
 * caseId·dest 는 TabHost 가 URL 에서 파싱해 props 로 내려준다 — JourneyTab 과 동일 규약.
 */
export function DocsTab({
  caseId,
  dest,
  active,
}: {
  caseId: string
  /** 활성 목적지(?dest=) — buildDocsView 가 그 토큰의 by_dest 분기 (단일·미지정은 첫 토큰). */
  dest: string | null
  /** 이 pane 이 화면에 보이는 중인지 — 숨김 중엔 redirect 를 쏘지 않는다. */
  active: boolean
}) {
  const caseRow = useCase(caseId)
  const { cases } = useCases()
  const router = useRouter()
  // 케이스 없음 → 목록. 목적지 0개(여정 없음) → 다른 여정 동물 서류로 전환, 없으면 목록.
  useEffect(() => {
    if (!active) return
    if (!caseRow) {
      router.replace('/cases')
      return
    }
    if (!hasJourney(caseRow)) {
      const other = cases.find((c) => c.id !== caseId && hasJourney(c))
      if (other) replaceTab(router, `/cases/${other.id}/docs`)
      else router.replace('/cases')
    }
  }, [active, caseRow, cases, caseId, router])
  if (!caseRow || !hasJourney(caseRow)) return null

  const data = buildDocsView(caseRow, dest)
  return <DocsView data={data} caseId={caseId} activeDest={dest} />
}
