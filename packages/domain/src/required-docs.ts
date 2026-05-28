import type { CaseRow } from './types'
import { JOURNEY_STEP_CATALOG } from './journey-steps/catalog'
import { resolveDone } from './journey-steps/done-resolver'

/**
 * 국가별 '필수 서류' 큐레이션. 서류함의 자동 체크리스트(step.allowAttachments 전부)
 * 와 증명서 자동 작성(resolveCerts) 을 합쳐 한 섹션으로 줄인 목적지별 화이트리스트.
 *
 * spec 이 있는 국가는 portal 의 서류 페이지에서 이 목록만 노출. spec 이 없는 국가는
 * 기존 3섹션(체크리스트 + 자동 작성 + 보관) 폴백.
 *
 * verified 판정:
 *   - kind='step' → step.done 시그널 (자동, 검사·신고 같은 본 흐름에 종속).
 *   - kind='manual' → case.data.required_doc_flags[id] (보호자 수기 완료 표시).
 */

export interface RequiredDocItem {
  id: string
  name: string
  source: string
  verified: boolean
  /** 수기 완료 토글이 필요한 항목 (kind='manual'). 상세 페이지에서 토글 버튼 노출. */
  manual: boolean
  /** 상세 페이지 본문. 서류 설명·받는 방법. */
  description: string
  /** preview 소스 step.id — 해당 step 에 업로드된 파일이 '디지털원본/사본' 으로 노출. */
  previewStepId?: string
}

interface RequiredDocSpec {
  id: string
  name: string
  source: string
  kind: 'step' | 'manual'
  /** kind='step' 시 verified 판정에 쓸 step.id. manual 은 무시. */
  stepRef?: string
  description: string
  /** preview 영역에 노출할 step 의 업로드. 없으면 preview 영역 placeholder. */
  previewStepId?: string
}

const SPECS: Record<string, RequiredDocSpec[]> = {
  '일본': [
    {
      id: 'rabies-titer-result',
      name: '광견병 항체가 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      description:
        '광견병 항체가 검사(FAVN/RFFIT) 결과지입니다.\n검사기관에서 발급한 원본을 보관하고 수출 동물검역 신청 시 제출합니다.\n검사일 기준 2년간 유효하며, 일본 입국일이 유효기간 내여야 합니다.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'advance-notification-approval',
      name: '허가증(Approval)',
      source: '일본 동물검역소',
      kind: 'step',
      stepRef: 'advance-notification',
      description:
        '일본 동물검역소에 사전 신고를 마치면 발급되는 허가증(Approval)입니다.\n수출 검역 단계에서 제출하고, 입국 시 일본 동물검역소에 함께 제시합니다.\n신청 후 발급까지 통상 1~2주가 소요됩니다.',
      previewStepId: 'advance-notification',
    },
    {
      id: 'form25',
      name: '접종 및 건강증명서(별지 제 25호 서식)',
      source: '동물병원',
      kind: 'manual',
      description:
        '한국 수출 동물검역 신청 시 제출하는 접종 및 건강증명서입니다.\nPetMove 가 케이스 입력 정보를 바탕으로 자동 작성합니다.\n발급된 PDF 를 출력해 임상 수의사의 서명·날인을 받아 완료 표시해주세요.',
    },
    {
      id: 'form-ac-or-re',
      name: 'FormAC 또는 FormRE',
      source: '동물병원',
      kind: 'manual',
      description:
        '일본 입국 시 제출하는 영문 증명서입니다 — Form AC (광견병 항체검사 정보) 또는 Form RE (광견병 면역 이력).\nPetMove 가 자동 작성하며, 출력해 임상 수의사의 서명·날인을 받아 완료 표시해주세요.',
    },
    {
      id: 'jp-export-quarantine-cert',
      name: '일본 수출 동물검역증(Export Quarantine Certificate)',
      source: '일본 동물검역소',
      kind: 'manual',
      description:
        '일본에서 한국으로 돌아오기 위한 수출 동물검역증입니다.\n일본 동물검역소를 방문해 검역을 받으면 발급됩니다.\n원본을 보관 후 완료 표시해주세요.',
      previewStepId: 'jp-export-quarantine-visit',
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
  const flags = readManualFlags(caseRow)
  return specs.map((spec) => ({
    id: spec.id,
    name: spec.name,
    source: spec.source,
    manual: spec.kind === 'manual',
    description: spec.description,
    previewStepId: spec.previewStepId,
    verified:
      spec.kind === 'manual'
        ? flags[spec.id] === true
        : spec.stepRef
          ? resolveStepDone(spec.stepRef, caseRow)
          : false,
  }))
}

/** 단일 docId 의 spec 을 찾는다 — 상세 페이지에서 사용. */
export function findRequiredDoc(
  destination: string | null | undefined,
  docId: string,
  caseRow: CaseRow,
): RequiredDocItem | null {
  const all = resolveRequiredDocs(destination, caseRow)
  if (!all) return null
  return all.find((d) => d.id === docId) ?? null
}

function resolveStepDone(stepId: string, caseRow: CaseRow): boolean {
  const step = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  if (!step) return false
  return resolveDone(step.done, caseRow)
}

function readManualFlags(caseRow: CaseRow): Record<string, boolean> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data.required_doc_flags
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true) out[k] = true
  }
  return out
}
