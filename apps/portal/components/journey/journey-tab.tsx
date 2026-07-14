'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { parseDestinations, shouldPromptArrival } from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'
import { CompletionPrompt } from '@/components/journey/completion-prompt'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { replaceTab } from '@/components/portal-shell/tab-nav'
import {
  confirmArrival,
  removeCaseDestination,
  dismissCompletionPrompt,
  finishJourney,
  restoreJourney,
  type JourneySnapshot,
} from '@/lib/actions/destinations'

/**
 * 준비(여정) 탭 본체 — TabHost 의 pane 으로 상주 mount. (구 /cases/<id>/journey page 본문.)
 * caseId·dest 는 URL 이 아니라 TabHost 가 pathname/?dest= 에서 파싱해 props 로 내려준다 —
 * pane 은 숨김 중에도 mount 를 유지하므로 URL 을 직접 읽으면 다른 탭의 URL 로 오염된다.
 *
 * 완료 확인 prompt(A형, design §4.2): 출국/귀국일이 지났는데 미완료면 바텀시트.
 * - "잘 다녀왔어요" → confirmArrival(도착 확인) → **완료 카드가 뜬다(여정 제거 X)**.
 * - "아직 진행 중" → dismiss(이 anchorDate 동안 재발동 안 함).
 * - "이 여정은 취소할게요" → **confirm 한 번 더** → removeCaseDestination(깨끗이 제거).
 *   취소=삭제로 통일(2026-06): 지난 여정에 비석 안 남김. by_dest·trip_type 까지 정리.
 *   (지난 결함: 즉시 제거 + 오조작 취소 → 도착 확인/취소 분리 + 취소 confirm 으로 방지.)
 */
export function JourneyTab({
  caseId,
  dest,
  active,
}: {
  caseId: string
  /** 활성 목적지(?dest=) — 없으면 첫 목적지. */
  dest: string | null
  /** 이 pane 이 화면에 보이는 중인지 — 숨김 중엔 redirect·prompt 사이드이펙트를 멈춘다. */
  active: boolean
}) {
  const id = caseId
  const caseRow = useCase(id)
  const { cases, refreshCases, profile } = useCases()
  const router = useRouter()
  const confirm = useConfirm()
  const activeDest = dest
  const [promptClosed, setPromptClosed] = useState(false)
  const [busy, startTransition] = useTransition()
  const [finishing, startFinish] = useTransition()
  // 마무리 직후 '되돌리기' 토스트 — 그 목적지 + 직전 스냅샷.
  const [undo, setUndo] = useState<{ dest: string; snap: JourneySnapshot } | null>(null)

  useEffect(() => {
    if (!active) return // 숨김 pane 이 백그라운드에서 redirect 를 쏘지 않게.
    if (!caseRow) {
      router.replace('/cases')
      return
    }
    if (!hasJourney(caseRow)) {
      const other = cases.find((c) => c.id !== id && hasJourney(c))
      if (other) replaceTab(router, `/cases/${other.id}/journey`)
      else router.replace('/cases')
    }
  }, [active, caseRow, cases, id, router])

  // 되돌리기 토스트 자동 해제(7초). dest 키가 바뀌면 타이머 재설정.
  useEffect(() => {
    if (!undo) return
    const t = window.setTimeout(() => setUndo(null), 7000)
    return () => window.clearTimeout(t)
  }, [undo])

  if (!caseRow || !hasJourney(caseRow)) return null

  const data = buildJourney(caseRow, activeDest, {
    freeInputMode: profile?.free_input_mode === true,
    hideStepDescriptions: profile?.hide_step_descriptions === true,
  })

  // ── 완료 확인 prompt (A형) 발동 판정 ──
  const destToken = data.trip.toCity
  const caseData = (caseRow.data ?? {}) as Record<string, unknown>
  const byDest = ((caseData.by_dest as Record<string, Record<string, unknown>> | undefined)?.[
    destToken
  ] ?? {}) as Record<string, unknown>
  const returnDate = (('return_date' in byDest ? byDest.return_date : caseData.return_date) ?? null) as
    | string
    | null
  const anchorDate =
    data.trip.tripType === 'round' ? returnDate : data.trip.departureDate ?? null
  const today = new Date().toISOString().slice(0, 10)
  const dismissedFor =
    (caseData.completion_prompt_dismissed as Record<string, string> | undefined)?.[destToken] ?? null
  const showPrompt =
    active && // 숨김 중엔 바텀시트 미노출 — 탭 복귀 시 조건 유지되면 그때 뜬다.
    !promptClosed &&
    !!destToken &&
    destToken !== '—' &&
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

  // ── 여정 마무리하기(다중 목적지 + 이 여정 완료) ──
  const destTokens = parseDestinations(caseRow.destination)
  const canFinish = data.journeyComplete && destTokens.length >= 2

  function handleFinish() {
    if (!canFinish) return
    // 마무리 직전 스냅샷(되돌리기용) — 현재 caseRow 에서 그 목적지 키들을 캡처.
    const cd = (caseRow!.data ?? {}) as Record<string, unknown>
    const byDest =
      (cd.by_dest as Record<string, Record<string, unknown>> | undefined)?.[destToken] ?? null
    const tripTypeMap = cd.trip_type as Record<string, 'round' | 'one_way'> | undefined
    const arrivalMap = cd.arrival_confirmed as Record<string, boolean> | undefined
    const snap: JourneySnapshot = {
      prevDestination: caseRow!.destination,
      prevDeparture: caseRow!.departure_date,
      byDestEntry: byDest,
      tripType: tripTypeMap?.[destToken] ?? null,
      arrivalConfirmed: !!arrivalMap?.[destToken],
    }
    startFinish(async () => {
      const res = await finishJourney(id, destToken)
      if (res.ok) {
        await refreshCases()
        setUndo({ dest: destToken, snap })
        const next = res.value.destinations[0]
        replaceTab(
          router,
          next ? `/cases/${id}/journey?dest=${encodeURIComponent(next)}` : `/cases/${id}/journey`,
        )
      }
    })
  }

  function handleUndo() {
    if (!undo) return
    const { dest: d, snap } = undo
    setUndo(null)
    startFinish(async () => {
      const res = await restoreJourney(id, d, snap)
      if (res.ok) {
        await refreshCases()
        replaceTab(router, `/cases/${id}/journey?dest=${encodeURIComponent(d)}`)
      } else {
        setUndo({ dest: d, snap }) // 실패 시 토스트 복구
      }
    })
  }

  return (
    <>
      <TimelineCalm
        data={data}
        caseId={id}
        activeDest={activeDest}
        canFinishJourney={canFinish}
        finishing={finishing}
        onFinishJourney={handleFinish}
      />
      {undo && active && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
            transform: 'translateX(-50%)',
            zIndex: 220,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            maxWidth: 'calc(100% - 32px)',
            padding: '12px 16px',
            borderRadius: 14,
            background: 'var(--pm-ink)',
            color: 'var(--pm-bg)',
            boxShadow: '0 8px 28px rgba(0,0,0,.22)',
            fontSize: 13.5,
            fontWeight: 500,
          }}
        >
          <span>여정을 마무리했어요.</span>
          <button
            type="button"
            onClick={handleUndo}
            disabled={finishing}
            className="pm-pressable"
            style={{
              flexShrink: 0,
              border: 0,
              background: 'transparent',
              color: 'var(--pm-bg)',
              fontFamily: 'inherit',
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            되돌리기
          </button>
        </div>
      )}
      {showPrompt && (
        <CompletionPrompt
          caseRow={caseRow}
          petName={data.pet.name}
          destination={destToken}
          busy={busy}
          onDone={() => run(() => confirmArrival(id, destToken))}
          onDismiss={() => {
            if (anchorDate) run(() => dismissCompletionPrompt(id, destToken, anchorDate))
          }}
          onCancel={async () => {
            // 시트를 먼저 내리고 확인창을 띄운다. 시트(zIndex 200)가 공용 confirm(z-100)
            // 보다 위라, 안 내리면 확인창이 시트 뒤에 깔린다. 한 번에 모달 하나만.
            setPromptClosed(true)
            const ok = await confirm({
              message: `${destToken} 여정을 취소할까요? 되돌릴 수 없어요.`,
              okLabel: '네, 취소할게요',
              cancelLabel: '아니요',
              variant: 'destructive',
            })
            if (ok) run(() => removeCaseDestination(id, destToken))
            else setPromptClosed(false) // 되돌리면 완료 확인 시트로 복귀
          }}
        />
      )}
    </>
  )
}
