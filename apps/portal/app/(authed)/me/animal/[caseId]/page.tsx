'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCase } from '@/components/portal-shell/case-data-provider'
import { AnimalEditView } from '@/components/me/animal-edit-view'

/**
 * 설정 > 동물 — /me/animal/[caseId].
 * 다견 케이스 대응: hub 의 각 동물 카드가 자기 caseId 를 들고 진입.
 *
 * 케이스가 없으면(삭제 직후 또는 잘못된 id) 404 대신 내 정보(/me)로 부드럽게 복귀.
 * provider 는 서버 initialCases 로 시드되므로 로딩 레이스 없이 "진짜 없음"만 null.
 */
export default function MeAnimalCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = use(params)
  const caseRow = useCase(caseId)
  const router = useRouter()

  useEffect(() => {
    if (!caseRow) router.replace('/me')
  }, [caseRow, router])

  if (!caseRow) return null
  return <AnimalEditView caseRow={caseRow} caseId={caseId} />
}
