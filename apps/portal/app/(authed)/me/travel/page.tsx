'use client'

import { useCases } from '@/components/portal-shell/case-data-provider'
import { TravelEditView } from '@/components/me/travel-edit-view'
import { ComingSoonView } from '@/components/me/coming-soon-view'

export default function MeTravelPage() {
  const { cases } = useCases()
  const primary = cases[0]
  if (!primary) {
    return <ComingSoonView title="여행정보" message="먼저 케이스를 등록해주세요." />
  }
  return <TravelEditView caseRow={primary} caseId={primary.id} />
}
