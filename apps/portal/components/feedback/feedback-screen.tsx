'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { parseDestinations } from '@petmove/domain'
import { FeedbackView } from '@/components/feedback/feedback-view'
import { useCase } from '@/components/portal-shell/case-data-provider'

/**
 * 여정 완료 후 의견 화면 본체 — TabHost detail 레이어. (구 /cases/<id>/feedback page 본문.)
 * Context 에서 케이스 조회(네트워크 없음). 없으면 목록으로 부드럽게 복귀(구 notFound 대체).
 * 활성 목적지(?dest)가 목적지 목록에 있으면 그 칸, 아니면 첫 목적지 칸의 의견을 다룬다.
 */
export function FeedbackScreen({
  caseId,
  dest,
  rating,
}: {
  caseId: string
  dest: string | null
  /** 소감 카드의 얼굴 원탭 진입(?rating=1~5) — 그 만족도가 선택된 채 시작. */
  rating: string | null
}) {
  const router = useRouter()
  const caseRow = useCase(caseId)

  useEffect(() => {
    if (!caseRow) router.replace('/cases')
  }, [caseRow, router])
  if (!caseRow) return null

  const tokens = parseDestinations(caseRow.destination)
  const effectiveDest = dest && tokens.includes(dest) ? dest : tokens[0] ?? null
  const ratingNum = Number(rating)
  const initialRating =
    Number.isInteger(ratingNum) && ratingNum >= 1 && ratingNum <= 5 ? ratingNum : null

  return <FeedbackView caseId={caseId} dest={effectiveDest} initialRating={initialRating} />
}
