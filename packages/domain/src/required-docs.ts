import type { CaseRow } from './types'
import { JOURNEY_STEP_CATALOG } from './journey-steps/catalog'
import { resolveDone } from './journey-steps/done-resolver'

/**
 * 국가별 '필수 서류' 큐레이션. 서류함의 자동 체크리스트(step.allowAttachments 전부)
 * 와 증명서 자동 작성(resolveCerts) 을 합쳐 한 섹션으로 줄인 목적지별 화이트리스트.
 *
 * spec 이 있는 국가는 portal 의 서류 페이지에서 이 목록만 노출. spec 이 없는 국가는
 * 기존 3섹션(체크리스트 + 자동 작성 + 보관) 폴백.
 */

export interface RequiredDocItem {
  id: string
  name: string
  source: string
  verified: boolean
}

interface RequiredDocSpec {
  id: string
  name: string
  source: string
  /** 'step' → 해당 step.done 으로 verified 판정. 'cert' → admin PDF 발급(현재 항상 준비중). */
  kind: 'step' | 'cert'
  /** step.id 또는 cert.key. cert 는 현재 verified 로직 없음 — 향후 PDF 생성 연동 시 사용. */
  ref: string
}

const SPECS: Record<string, RequiredDocSpec[]> = {
  '일본': [
    {
      id: 'rabies-titer-result',
      name: '광견병 항체가 검사 결과지',
      source: '검사기관',
      kind: 'step',
      ref: 'rabies-titer',
    },
    {
      id: 'advance-notification-approval',
      name: '허가증(Approval)',
      source: '검역본부 발급',
      kind: 'step',
      ref: 'advance-notification',
    },
    {
      id: 'form25',
      name: '접종 및 건강증명서(별지 제 25호 서식)',
      source: 'PetMove 발급',
      kind: 'cert',
      ref: 'form25',
    },
    {
      id: 'form-ac-or-re',
      name: 'FormAC 또는 FormRE',
      source: 'PetMove 발급',
      kind: 'cert',
      ref: 'formAC',
    },
    {
      id: 'jp-export-quarantine-cert',
      name: '일본 수출 동물검역증(Export Quarantine Certificate)',
      source: '검역본부 발급',
      kind: 'step',
      ref: 'jp-export-quarantine-visit',
    },
  ],
}

export function resolveRequiredDocs(
  destination: string | null | undefined,
  caseRow: CaseRow,
): RequiredDocItem[] | null {
  if (!destination) return null
  const specs = SPECS[destination]
  if (!specs) return null
  return specs.map((spec) => ({
    id: spec.id,
    name: spec.name,
    source: spec.source,
    verified: spec.kind === 'step' ? resolveStepDone(spec.ref, caseRow) : false,
  }))
}

function resolveStepDone(stepId: string, caseRow: CaseRow): boolean {
  const step = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  if (!step) return false
  return resolveDone(step.done, caseRow)
}
