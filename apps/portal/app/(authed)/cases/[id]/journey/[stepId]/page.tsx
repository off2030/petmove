import { notFound } from 'next/navigation'
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
import { getMyCase } from '@/lib/actions/cases'
import { StepDetailView } from '@/components/journey/step-detail-view'

export const dynamic = 'force-dynamic'

/**
 * 케이스의 한 step 상세. `/cases/<id>/journey/<stepId>`.
 *
 * 흐름:
 *  1) layout 이 케이스 본인 매핑 보장 → getMyCase 단건 재조회 (React cache dedupe)
 *  2) JOURNEY_STEP_CATALOG 에서 stepId 매칭 + 케이스 applicability 검증 → 미적용 404
 *  3) 매핑된 procedure-check 결과만 추려서 StepDetailView 로 전달
 *
 * MVP 에서는 read-only. 입력 폼 / 첨부 업로드 / 완료 토글은 후속 PR.
 */
export default async function CaseJourneyStepPage({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>
}) {
  const { id, stepId } = await params
  const result = await getMyCase(id)
  if (!result.ok || !result.value) notFound()

  const caseRow = result.value
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
