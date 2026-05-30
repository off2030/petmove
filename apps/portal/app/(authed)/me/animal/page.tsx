'use client'

import { useCases } from '@/components/portal-shell/case-data-provider'
import { AnimalEditView } from '@/components/me/animal-edit-view'
import { ComingSoonView } from '@/components/me/coming-soon-view'

export default function MeAnimalPage() {
  const { cases } = useCases()
  const primary = cases[0]
  if (!primary) {
    return <ComingSoonView title="동물" message="먼저 케이스를 등록해주세요." />
  }
  return <AnimalEditView caseRow={primary} caseId={primary.id} />
}
