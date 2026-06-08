'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect, useState, useTransition } from 'react'
import { shouldPromptArrival } from '@petmove/domain'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'
import { CompletionPrompt } from '@/components/journey/completion-prompt'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { markJourneyComplete, dismissCompletionPrompt } from '@/lib/actions/destinations'

/**
 * 케이스별 여정 — /cases/<id>/journey. Client 컴포넌트 — CaseDataProvider 에서 케이스 데이터 읽음.
 *
 * layout 이 케이스 본인 매핑 + initialCases 로 Provider 주입을 보장. 여기서는 useCase(id) 로
 * 메모리에서 바로 조회 — 추가 네트워크 없음. buildJourney 는 순수 함수라 client 에서 실행.
 *
 * 완료 확인 prompt(A형): 출국/귀국일이 지났는데 미완료면 바텀시트로 "잘 마치셨나요?" 확인.
 * design journey-lifecycle §4.2.
 */
export default function CaseJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const caseRow = useCase(id)
  const { cases, refreshCases } = useCases()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeDest = searchParams.get('dest')
  const [promptClosed, setPromptClosed] = useState(false)
  const [busy, startTransition] = useTransition()

  // 케이스 없음(운영자 삭제 등) → 목록으로. 목적지 0개(여정 없음) → 다른 여정 동물로 전환,
  // 없으면 목록('준비 중인 여정 없음'). 목적지 다 지운 동물의 일정 탭엔 머무를 수 없게 한다.
  useEffect(() => {
    if (!caseRow) {
      router.replace('/cases')
      return
    }
    if (!hasJourney(caseRow)) {
      const other = cases.find((c) => c.id !== id && hasJourney(c))
      router.replace(other ? `/cases/${other.id}/journey` : '/cases')
    }
  }, [caseRow, cases, id, router])
  if (!caseRow || !hasJourney(caseRow)) return null

  // multi-destination: activeDest 가 토큰 목록에 있으면 그걸로 분기.
  // 단일 케이스나 없으면 첫 토큰(buildCaseJourneyContext 내부 fallback).
  const data = buildJourney(caseRow, activeDest)

  // ── 완료 확인 prompt (A형) 발동 판정 ──
  const dest = data.trip.toCity
  const caseData = (caseRow.data ?? {}) as Record<string, unknown>
  const byDest = ((caseData.by_dest as Record<string, Record<string, unknown>> | undefined)?.[dest] ??
    {}) as Record<string, unknown>
  // 왕복=귀국일, 편도=출국일. by_dest 우선 + top-level/컬럼 fallback.
  const returnDate = (('return_date' in byDest ? byDest.return_date : caseData.return_date) ?? null) as
    | string
    | null
  const anchorDate =
    data.trip.tripType === 'round' ? returnDate : data.trip.departureDate ?? null
  const today = new Date().toISOString().slice(0, 10)
  const dismissedFor =
    (caseData.completion_prompt_dismissed as Record<string, string> | undefined)?.[dest] ?? null
  const showPrompt =
    !promptClosed &&
    !!dest &&
    dest !== '—' &&
    shouldPromptArrival({
      journeyComplete: data.journeyComplete,
      anchorDate,
      today,
      dismissedFor,
    })

  function run(action: () => Promise<{ ok: boolean }>) {
    setPromptClosed(true)
    startTransition(async () => {
      const res = await action()
      if (res.ok) void refreshCases()
      else setPromptClosed(false)
    })
  }

  return (
    <>
      <TimelineCalm data={data} caseId={id} activeDest={activeDest} />
      {showPrompt && (
        <CompletionPrompt
          caseRow={caseRow}
          petName={data.pet.name}
          destination={dest}
          busy={busy}
          onDone={() => run(() => markJourneyComplete(id, dest, 'done'))}
          onCancel={() => run(() => markJourneyComplete(id, dest, 'cancelled'))}
          onDismiss={() => {
            if (anchorDate) run(() => dismissCompletionPrompt(id, dest, anchorDate))
          }}
        />
      )}
    </>
  )
}
