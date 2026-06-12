'use client'

import { notFound, useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect } from 'react'
import {
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  getChecksForStep,
  getStepsForCase,
  resolveDone,
  resolveStepForDestination,
  runChecksForCase,
  type CaseRow,
  type CheckResult,
  type ProcedureCheck,
  type StepDefinition,
} from '@petmove/domain'
import { StepDetailView } from '@/components/journey/step-detail-view'
import { activeDestinationView } from '@/lib/cases/active-destination'
import { useCase } from '@/components/portal-shell/case-data-provider'

/**
 * 케이스의 한 step 상세. `/cases/<id>/journey/<stepId>`. Client 컴포넌트.
 *
 * 1) Context 에서 케이스 조회 (네트워크 없음)
 * 2) JOURNEY_STEP_CATALOG 에서 stepId 매칭 + applicability 검증 → 미적용 notFound
 * 3) 매핑된 procedure-check 결과만 추려서 StepDetailView 로 전달
 *
 * 도메인 함수(buildCaseJourneyContext / runChecksForCase) 는 순수 — client 실행 OK.
 */
export default function CaseJourneyStepPage({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>
}) {
  const { id, stepId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeDest = searchParams.get('dest')
  const caseRow = useCase(id)
  if (!caseRow) notFound()

  const baseStep = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  if (!baseStep) notFound()

  // 다중 목적지: 활성 목적지(?dest=) 1개짜리 뷰로 좁혀 단계 적용·완료·검증을 그 목적지 기준으로.
  const view = activeDestinationView(caseRow, activeDest)
  const applicable = getStepsForCase(JOURNEY_STEP_CATALOG, view)
  const stepIndex = applicable.findIndex((s) => s.id === baseStep.id)
  // 케이스 데이터 변경(예: 추가 검사 항목 삭제)으로 step 이 더 이상 적용 안 되면
  // 일정 목록으로 — 자기 자신을 보고 있던 사용자에게 404 대신 정상 화면을 보여준다.
  // redirect() 는 server context 전용이라 client component render 에서 호출하면
  // prod 빌드에서 "couldn't load" 에러가 난다 (dev 에선 우회됨). router.replace 를
  // effect 에서 호출하는 게 client 안전 패턴.
  useEffect(() => {
    // 다중 목적지: 활성 목적지(?dest=) 보존 — 안 하면 기본(첫) 목적지로 튕긴다.
    if (stepIndex === -1) {
      router.replace(
        activeDest
          ? `/cases/${id}/journey?dest=${encodeURIComponent(activeDest)}`
          : `/cases/${id}/journey`,
      )
    }
  }, [stepIndex, id, router, activeDest])
  if (stepIndex === -1) return null

  const ctx = buildCaseJourneyContext(view)
  // 목적지별 description/title override 적용. validation 은 base.done/validationIds 그대로.
  const step = resolveStepForDestination(baseStep, ctx.destinationKey)
  const done = resolveDone(step.done, view)
  const checkResults = collectStepChecks(step, view, ctx.destinationKey)
  // 이 step 보다 뒤(후행) 적용 단계에 이미 입력된 데이터가 있는지 — 수정·삭제 전 '주의'
  // 확인창 조건. 뒤 일정이 있으면 앞 단계 변경이 정합성을 깨뜨릴 수 있어 사전 경고한다.
  const hasDownstreamData = applicable
    .slice(stepIndex + 1)
    .some((s) => resolveDone(s.done, view) || (s.hasInputData?.(view) ?? false))

  return (
    <StepDetailView
      caseId={id}
      step={step}
      done={done}
      stepNumber={stepIndex + 1}
      checkResults={checkResults}
      destinationKey={ctx.destinationKey}
      tripType={ctx.tripType}
      hasDownstreamData={hasDownstreamData}
      activeDest={activeDest}
    />
  )
}

export interface CollectedCheck {
  check: ProcedureCheck
  result: CheckResult
}

function collectStepChecks(
  step: StepDefinition,
  caseRow: CaseRow,
  destinationKey: string | null,
): CollectedCheck[] {
  if (!destinationKey) return []
  const targetIds = new Set(getChecksForStep(step.id))

  // 동적 매핑 — scenario.ts 와 일관: 1차 < 마이크로칩 사전 안내(jp.rabies-prime-before-microchip)는
  // 2차 백신 미완 → catalog 매핑(rabies-vaccine-2), 2차 done → rabies-titer 로 옮긴다.
  // (다음 액션 step 에 안내 — '같은 날' 룰을 두 입력 시점 모두에서 환기.)
  const r2 = JOURNEY_STEP_CATALOG.find((s) => s.id === 'rabies-vaccine-2')
  const r2Done = r2 ? resolveDone(r2.done, caseRow) : false
  if (step.id === 'rabies-titer' && r2Done) {
    targetIds.add('jp.rabies-prime-before-microchip')
  } else if (step.id === 'rabies-vaccine-2' && r2Done) {
    targetIds.delete('jp.rabies-prime-before-microchip')
  }

  if (targetIds.size === 0) return []
  // 다중 목적지 케이스에서 by_dest 가 destinationKey 토큰으로 조회되도록 전달.
  // 단일 목적지면 caseRow.destination 그대로, 다중이면 첫 토큰(검증 대상 destination).
  const all = runChecksForCase(destinationKey, { caseRow, destination: caseRow.destination })
  return all
    .filter(({ check }) => targetIds.has(check.id))
    .sort((a, b) => Number(a.result.ok) - Number(b.result.ok))
}
