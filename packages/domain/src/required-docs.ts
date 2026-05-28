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
  /** 수기 완료 토글이 필요한 항목 (kind='manual'). 상세 페이지에서 발급완료 버튼 노출. */
  manual: boolean
  /** 상세 페이지 본문. 서류 설명·받는 방법. */
  description: string
  /** preview 소스 step.id — 해당 step 에 업로드된 파일이 '디지털원본/사본' 으로 노출. */
  previewStepId?: string
  /**
   * 첨부 업로드·미리보기 대상 stepId. step 연동 서류는 previewStepId(공유 step),
   * 그 외(별지25 등)는 doc.id 자체. 이 키로 case.data.documents 를 태깅·필터.
   */
  attachStepId: string
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
        '검사를 의뢰한 동물병원에서 발급받습니다.\n\n동물검역을 받을 때 반드시 원본이 필요합니다.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리합니다.\n\n광견병 백신 유효기간 유지 시 최대 2년까지 사용할 수 있습니다.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'advance-notification-approval',
      name: '허가증(Approval)',
      source: '일본 동물검역소',
      kind: 'step',
      stepRef: 'advance-notification',
      description:
        '사전 신고 후 일본 동물검역소에서 발급 받을 수 있습니다.\n\n발급까지 수 주 이상 걸릴 수 있으며, 1회만 사용이 가능합니다.\n\n동물검역을 받을 때 반드시 소지해야 합니다.\n\nPDF 파일로 발급되며, 앱에 저장해두면 필요할 때 쉽게 사용하실 수 있습니다.',
      previewStepId: 'advance-notification',
    },
    {
      id: 'form25',
      name: '접종 및 건강증명서(별지 제 25호 서식)',
      source: '동물병원',
      kind: 'manual',
      description:
        '농림축산검역본부 지정 양식의 접종 및 건강증명서입니다.\n\n출국일 기준 10일 이내에 임상 수의사가 검진 후 발급합니다.\n\n원본 2부를 준비해서, 동물검역 때 1부를 제출합니다.\n\n접종과 출국 전 임상검사를 한 동물병원이 다른 경우, 각각의 동물병원에서 별개의 증명서를 받아야 하는 점에 주의하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리합니다.',
    },
    {
      id: 'form-ac-or-re',
      name: 'FormAC 또는 FormRE',
      source: '동물병원',
      kind: 'manual',
      description:
        '일본 지정 양식의 접종, 검사 및 건강증명서입니다.\n\n출국일 기준 10일 이내에 임상 수의사의 서명을 받아야 합니다.\n\n한국 수출 동물검역 때 검역관 확인·서명을 받습니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리합니다.',
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
  return specs.map((spec) => {
    // 첨부 대상 stepId — step 연동 서류는 공유 step, 그 외는 doc.id 자체.
    const attachStepId = spec.previewStepId ?? spec.id
    return {
      id: spec.id,
      name: spec.name,
      source: spec.source,
      manual: spec.kind === 'manual',
      description: spec.description,
      previewStepId: spec.previewStepId,
      attachStepId,
      verified:
        spec.kind === 'manual'
          ? // 수기 발급완료 플래그 OR 사본 첨부가 있으면 '보유'.
            flags[spec.id] === true || hasAttachmentForStep(caseRow, attachStepId)
          : spec.stepRef
            ? resolveStepDone(spec.stepRef, caseRow)
            : false,
    }
  })
}

/** case.data.documents 에 해당 stepId 태그의 파일이 하나라도 있으면 true. */
function hasAttachmentForStep(caseRow: CaseRow, stepId: string): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const docs = Array.isArray(data.documents) ? (data.documents as Array<Record<string, unknown>>) : []
  return docs.some((d) => !!d && typeof d === 'object' && d.stepId === stepId)
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
