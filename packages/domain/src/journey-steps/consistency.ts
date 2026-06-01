import type { CaseRow } from '../types'
import { resolveCompletedDate, resolveDone } from './done-resolver'
import type { StepDefinition } from './types'

/**
 * 여정 단계 정합성 패스 (read-time invariant 재검사).
 *
 * WHY: done 판정은 단계별로 "데이터 유무"만 본다(done-resolver). 입력 시점 차단은
 * 순서대로 채울 때만 막아주고, 뒤 단계가 이미 채워진 상태에서 앞 단계를 수정·삭제하면
 * 정합성 차단을 우회한 모순 상태(예: 항체 검사일 < 1차 백신일, 2차 없이 항체만 입력)에
 * 도달할 수 있다. procedure-checks 는 "체인이 존재한다"는 전제 위에서만 돌아(한쪽이 비면
 * SKIP) 이런 참조 무결성 문제를 못 잡는다.
 *
 * 그래서 케이스 데이터 전체에 대해 두 가지 불변식을 매 렌더마다 재확인한다:
 *   1) 시간 순서  — 후행 단계의 완료일은 선행 단계 완료일 이후여야 한다.
 *   2) 선행 존재  — 후행 단계가 완료(데이터 있음)면 선행 단계도 완료여야 한다.
 * 위반은 해당(후행) 단계에 '주의'로 표면화한다. 데이터는 건드리지 않는다(삭제·리셋 X).
 *
 * 정상 입력 흐름에서는 위반이 없어 조용하고, 편집·삭제로 체인이 깨졌을 때만 신호한다.
 */

export type ConsistencyKind = 'order' | 'missing-prerequisite'

export interface ConsistencyIssue {
  /** 모순이 표면화될(=후행) step id. */
  stepId: string
  kind: ConsistencyKind
  /** 보호자에게 보일 안내문 (이미 라벨·날짜가 채워진 완성 문장). */
  message: string
}

/**
 * 명시적 선행 의존 엣지 (prereq → step). 시간순서·선행존재 불변식의 단일 출처.
 * 같은 후행 step 의 엣지는 "가까운 선행"이 뒤에 오도록 배열(누락 안내 우선순위에 사용).
 * 광견병 체인부터. 다른 목적지·단계는 여기 엣지를 추가하면 자동 확장된다.
 */
interface DependencyEdge {
  prereq: string
  step: string
}
const DEPENDENCY_EDGES: DependencyEdge[] = [
  { prereq: 'rabies-vaccine-1', step: 'rabies-vaccine-2' },
  { prereq: 'rabies-vaccine-1', step: 'rabies-titer' },
  { prereq: 'rabies-vaccine-2', step: 'rabies-titer' },
]

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식이 아니면 원문. */
function formatKoreanDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/**
 * 적용 가능한 step 들에 대해 의존 엣지 불변식을 검사. step 당 최대 1건(순서 위반 우선,
 * 없으면 선행 누락). 둘 다 정상이면 빈 배열.
 */
export function evaluateChainConsistency(
  steps: StepDefinition[],
  caseRow: CaseRow,
): ConsistencyIssue[] {
  const byId = new Map(steps.map((s) => [s.id, s]))

  // 후행 step 별로 엣지를 모아 한 번에 판정.
  const edgesByStep = new Map<string, DependencyEdge[]>()
  for (const edge of DEPENDENCY_EDGES) {
    // 두 끝 모두 현재 케이스에 적용되는 step 이어야 의미 있음.
    if (!byId.has(edge.prereq) || !byId.has(edge.step)) continue
    const list = edgesByStep.get(edge.step) ?? []
    list.push(edge)
    edgesByStep.set(edge.step, list)
  }

  const issues: ConsistencyIssue[] = []
  for (const [stepId, edges] of edgesByStep) {
    const step = byId.get(stepId)!
    // 후행이 완료(데이터 있음)가 아니면 모순 자체가 성립 안 함.
    if (!resolveDone(step.done, caseRow)) continue
    const stepDate = resolveCompletedDate(step.done, caseRow)

    const orderViolations: { prereq: StepDefinition; prereqDate: string }[] = []
    const missing: StepDefinition[] = []

    for (const edge of edges) {
      const prereq = byId.get(edge.prereq)!
      if (!resolveDone(prereq.done, caseRow)) {
        missing.push(prereq)
        continue
      }
      const prereqDate = resolveCompletedDate(prereq.done, caseRow)
      if (stepDate && prereqDate && stepDate < prereqDate) {
        orderViolations.push({ prereq, prereqDate })
      }
    }

    // 순서 위반 우선 — 두 날짜가 직접 모순되는 가장 구체적 신호.
    if (orderViolations.length > 0) {
      // 가장 늦은 선행일(=가장 강하게 위반된 제약)을 기준으로 안내.
      const worst = orderViolations.reduce((a, b) => (b.prereqDate > a.prereqDate ? b : a))
      issues.push({
        stepId,
        kind: 'order',
        message: `${step.title} 날짜(${formatKoreanDate(stepDate!)})가 ${worst.prereq.title} 날짜(${formatKoreanDate(worst.prereqDate)})보다 앞섭니다. 날짜를 확인해 주세요.`,
      })
      continue
    }
    // 선행 누락 — 배열상 가까운(뒤쪽) 선행을 먼저 안내.
    if (missing.length > 0) {
      const closest = missing[missing.length - 1]
      issues.push({
        stepId,
        kind: 'missing-prerequisite',
        message: `${closest.title} 정보가 없는데 ${step.title}가 입력되어 있습니다. ${closest.title} 정보를 입력해 주세요.`,
      })
    }
  }

  return issues
}
