'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { useCase } from '@/components/portal-shell/case-data-provider'
import { AnimalEditView } from '@/components/me/animal-edit-view'

/**
 * 설정 > 동물 — /me/animal/[caseId].
 * 다견 케이스 대응: hub 의 각 동물 카드가 자기 caseId 를 들고 진입.
 */
export default function MeAnimalCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = use(params)
  const caseRow = useCase(caseId)
  if (!caseRow) notFound()
  return <AnimalEditView caseRow={caseRow} caseId={caseId} />
}
