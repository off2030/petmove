'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect, useState, useTransition } from 'react'
import { shouldPromptArrival } from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'
import { CompletionPrompt } from '@/components/journey/completion-prompt'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { confirmArrival, markJourneyComplete, dismissCompletionPrompt } from '@/lib/actions/destinations'

/**
 * 케이스별 여정 — /cases/<id>/journey. Client — CaseDataProvider 에서 케이스 데이터 읽음.
 *
 * 완료 확인 prompt(A형, design §4.2): 출국/귀국일이 지났는데 미완료면 바텀시트.
 * - "잘 다녀왔어요" → confirmArrival(도착 확인) → **완료 카드가 뜬다(여정 제거 X)**.
 * - "아직 진행 중" → dismiss(이 anchorDate 동안 재발동 안 함).
 * - "이 여정은 취소할게요" → **confirm 한 번 더** → markJourneyComplete(cancelled).
 *   (지난 결함: 즉시 제거 + 오조작 취소 → 도착 확인/취소 분리 + 취소 confirm 으로 방지.)
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
  const confirm = useConfirm()
  const activeDest = searchParams.get('dest')
  const [promptClosed, setPromptClosed] = useState(false)
  const [busy, startTransition] = useTransition()

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

  const data = buildJourney(caseRow, activeDest)

  // ── 완료 확인 prompt (A형) 발동 판정 ──
  const dest = data.trip.toCity
  const caseData = (caseRow.data ?? {}) as Record<string, unknown>
  const byDest = ((caseData.by_dest as Record<string, Record<string, unknown>> | undefined)?.[dest] ??
    {}) as Record<string, unknown>
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
          onDone={() => run(() => confirmArrival(id, dest))}
          onDismiss={() => {
            if (anchorDate) run(() => dismissCompletionPrompt(id, dest, anchorDate))
          }}
          onCancel={async () => {
            // 시트를 먼저 내리고 확인창을 띄운다. 시트(zIndex 200)가 공용 confirm(z-100)
            // 보다 위라, 안 내리면 확인창이 시트 뒤에 깔린다. 한 번에 모달 하나만.
            setPromptClosed(true)
            const ok = await confirm({
              message: `${dest} 여정을 취소할까요? 되돌릴 수 없어요.`,
              okLabel: '네, 취소할게요',
              cancelLabel: '아니요',
              variant: 'destructive',
            })
            if (ok) run(() => markJourneyComplete(id, dest, 'cancelled'))
            else setPromptClosed(false) // 되돌리면 완료 확인 시트로 복귀
          }}
        />
      )}
    </>
  )
}
