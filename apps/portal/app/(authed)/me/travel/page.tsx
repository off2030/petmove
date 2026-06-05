'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { ComingSoonView } from '@/components/me/coming-soon-view'

/**
 * 옛 /me/travel 진입점 — 여행 정보 편집은 동물별로 분리되어 동물 sub-page
 * (/me/animal/[caseId]) 안에서 함께 다룬다. 외부 링크/북마크 보존을 위해
 * 첫 동물 페이지로 자동 redirect. 케이스가 없으면 안내 화면.
 */
export default function MeTravelPage() {
  const router = useRouter()
  const { cases } = useCases()
  const primary = cases[0]

  useEffect(() => {
    if (primary) router.replace(`/me/animal/${primary.id}`)
  }, [primary, router])

  if (!primary) {
    return <ComingSoonView title="여행 정보" message="먼저 케이스를 등록해주세요." />
  }
  return null
}
