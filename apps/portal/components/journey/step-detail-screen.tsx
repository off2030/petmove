'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
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
import { activeDestinationView } from '@/lib/cases/active-destination'
import { useCase } from '@/components/portal-shell/case-data-provider'
import { replaceTab } from '@/components/portal-shell/tab-nav'

/**
 * 케이스의 한 step 상세 본체 — TabHost 의 detail 레이어로 렌더. (구 /cases/<id>/journey/<stepId>
 * page 본문.) caseId·stepId·dest 는 TabHost 가 URL 에서 파싱해 props 로 내려준다.
 *
 * 1) Context 에서 케이스 조회 (네트워크 없음)
 * 2) JOURNEY_STEP_CATALOG 에서 stepId 매칭 + applicability 검증 → 미적용이면 일정으로 복귀
 *    (구 page 의 notFound() 는 TabHost(레이아웃 레벨)에서 던지면 셸 전체가 404 로 갈리므로
 *    부드러운 replace 로 통일 — 사용자에겐 어차피 정상 화면 복귀가 낫다)
 * 3) 매핑된 procedure-check 결과만 추려서 StepDetailView 로 전달
 *
 * 도메인 함수(buildCaseJourneyContext / runChecksForCase) 는 순수 — client 실행 OK.
 */
export function StepDetailScreen({
  caseId,
  stepId,
  dest,
}: {
  caseId: string
  stepId: string
  dest: string | null
}) {
  const id = caseId
  const activeDest = dest
  const router = useRouter()
  const caseRow = useCase(id)

  const baseStep = caseRow ? JOURNEY_STEP_CATALOG.find((s) => s.id === stepId) ?? null : null

  // 다중 목적지: 활성 목적지(?dest=) 1개짜리 뷰로 좁혀 단계 적용·완료·검증을 그 목적지 기준으로.
  const view = caseRow ? activeDestinationView(caseRow, activeDest) : null
  const applicable = view ? getStepsForCase(JOURNEY_STEP_CATALOG, view) : []
  const stepIndex = baseStep ? applicable.findIndex((s) => s.id === baseStep.id) : -1

  // 케이스 없음 / 미적용 step / 서류 체크리스트 — 각자 제 화면으로 부드럽게 복귀.
  // redirect() 는 server 전용, notFound() 는 셸 레벨에서 위험 — effect + replace 가 안전 패턴.
  useEffect(() => {
    const destQuery = activeDest ? `?dest=${encodeURIComponent(activeDest)}` : ''
    if (!caseRow) {
      router.replace('/cases')
    } else if (stepId === 'document-checklist') {
      // 서류 체크리스트는 전용 상세 화면 없이 서류 페이지에서 처리 — 직접 URL 진입·뒤로가기
      // 등으로 이 경로에 닿으면 서류 페이지로 보낸다.
      replaceTab(router, `/cases/${id}/docs${destQuery}`)
    } else if (!baseStep || stepIndex === -1) {
      // 데이터 변경(예: 추가 검사 항목 삭제)으로 step 이 더 이상 적용 안 되면 일정 목록으로.
      // 활성 목적지(?dest=) 보존 — 안 하면 기본(첫) 목적지로 튕긴다.
      replaceTab(router, `/cases/${id}/journey${destQuery}`)
    }
  }, [caseRow, baseStep, stepIndex, stepId, id, activeDest, router])

  if (!caseRow || !view || !baseStep || stepIndex === -1 || stepId === 'document-checklist') {
    return null
  }

  const ctx = buildCaseJourneyContext(view)
  // 상세 step 은 전체 일정(getStepsForCase) 결과에서 그대로 꺼낸다 — 목적지 override·종 분기
  // 등 모든 변환이 이미 적용된 동일 객체라, 두 화면(일정 목록·단계 상세)이 구조적으로 항상
  // 같은 step 을 본다. (예전엔 상세가 catalog 에서 직접 꺼내 변환을 재적용하다 종 분기를
  // 빠뜨린 회귀가 있었음 — 단일 출처로 정돈.)
  const step = applicable[stepIndex]
  const done = resolveDone(step.done, view)
  const checkResults = collectStepChecks(step, view, ctx.destinationKey)
  // 같은 레인의 후행 단계에 이미 입력된 데이터가 있는지 — 수정·삭제 전 '주의' 확인창 조건.
  // 메인 레인과 nonBlocking 귀국 레인은 병렬이므로 서로를 후행 일정으로 보지 않는다.
  const isReturnLane = step.nonBlocking === true
  const downstreamLane = applicable
    .slice(stepIndex + 1)
    .filter((s) => (s.nonBlocking === true) === isReturnLane)
  // 편집 step 과 같은 병렬 그룹(직후의 연속 concurrent 접종 — 광견병·종합백신처럼 순서 의존이
  // 없는 단계)은 후행 일정으로 보지 않는다. 슬라이스 선두의 concurrent run 을 건너뛴다 —
  // 그래야 광견병 수정 시 병렬인 종합백신 입력이 '이후 일정' 경고를 띄우지 않는다.
  let firstDependent = 0
  while (firstDependent < downstreamLane.length && downstreamLane[firstDependent].concurrent) {
    firstDependent++
  }
  const hasDownstreamData = downstreamLane
    .slice(firstDependent)
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
