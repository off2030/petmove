'use client'

import { notFound, useRouter } from 'next/navigation'
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
  const caseRow = useCase(id)
  if (!caseRow) notFound()

  const baseStep = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  if (!baseStep) notFound()

  const applicable = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)
  const stepIndex = applicable.findIndex((s) => s.id === baseStep.id)
  // 케이스 데이터 변경(예: 추가 검사 항목 삭제)으로 step 이 더 이상 적용 안 되면
  // 일정 목록으로 — 자기 자신을 보고 있던 사용자에게 404 대신 정상 화면을 보여준다.
  // redirect() 는 server context 전용이라 client component render 에서 호출하면
  // prod 빌드에서 "couldn't load" 에러가 난다 (dev 에선 우회됨). router.replace 를
  // effect 에서 호출하는 게 client 안전 패턴.
  useEffect(() => {
    if (stepIndex === -1) router.replace(`/cases/${id}/journey`)
  }, [stepIndex, id, router])
  if (stepIndex === -1) return null

  const ctx = buildCaseJourneyContext(caseRow)
  // 목적지별 description/title override 적용. validation 은 base.done/validationIds 그대로.
  const step = resolveStepForDestination(baseStep, ctx.destinationKey)
  const done = resolveDone(step.done, caseRow)
  const checkResults = collectStepChecks(step, caseRow, ctx.destinationKey)

  return (
    <StepDetailView
      caseId={id}
      step={step}
      done={done}
      stepNumber={stepIndex + 1}
      checkResults={checkResults}
      destinationKey={ctx.destinationKey}
      tripType={ctx.tripType}
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
  if (targetIds.size === 0) return []
  // 다중 목적지 케이스에서 by_dest 가 destinationKey 토큰으로 조회되도록 전달.
  // 단일 목적지면 caseRow.destination 그대로, 다중이면 첫 토큰(검증 대상 destination).
  const all = runChecksForCase(destinationKey, { caseRow, destination: caseRow.destination })
  return all
    .filter(({ check }) => targetIds.has(check.id))
    .sort((a, b) => Number(a.result.ok) - Number(b.result.ok))
}
