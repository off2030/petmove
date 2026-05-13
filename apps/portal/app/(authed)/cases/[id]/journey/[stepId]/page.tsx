'use client'

import { notFound } from 'next/navigation'
import { use } from 'react'
import {
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  getChecksForStep,
  getStepsForCase,
  resolveDone,
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
  const caseRow = useCase(id)
  if (!caseRow) notFound()

  const step = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  if (!step) notFound()

  const applicable = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)
  if (!applicable.some((s) => s.id === step.id)) notFound()

  const ctx = buildCaseJourneyContext(caseRow)
  const done = resolveDone(step.done, caseRow)
  const checkResults = collectStepChecks(step, caseRow, ctx.destinationKey)

  return (
    <StepDetailView
      caseId={id}
      step={step}
      done={done}
      checkResults={checkResults}
      destinationLabel={ctx.destinationToken ?? caseRow.destination ?? '—'}
      petName={caseRow.pet_name ?? '반려동물'}
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
  const all = runChecksForCase(destinationKey, { caseRow })
  return all
    .filter(({ check }) => targetIds.has(check.id))
    .sort((a, b) => Number(a.result.ok) - Number(b.result.ok))
}
