import type { CaseRow } from './types'
import { JOURNEY_STEP_CATALOG } from './journey-steps/catalog'
import { resolveCompletedDate, resolveDone } from './journey-steps/done-resolver'

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
  /** '해당없음' 토글을 허용하는 서류 (예: 일본 첫 입국 시 수출 검역증). */
  naAllowed: boolean
  /** 보호자가 '해당없음' 으로 표시함 (case.data.required_doc_na[id]). 체크리스트 카운트에서 제외. */
  na: boolean
  /**
   * 발급 step 이 보호자의 현재 진행 step 보다 뒤에 있어 아직 능동 준비가 불가능한 상태 —
   * 보호자 능동 '준비중' 과 구분되는 수동 '대기' 톤. 예: 사전 신고 진행 중일 때 vet-visit 에서
   * 발급될 별지25/FormAC/RE 는 발급 예정. UI 에서 opacity·라벨로 시각 분리.
   * spec 의 issuanceStepId(없으면 kind='step' 의 stepRef 폴백) 보다 앞에 있는 main lane
   * (nonBlocking·advisoryOnly 제외) step 중 미완료가 하나라도 있고 verified=false, na=false 일 때 true.
   */
  awaiting: boolean
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
  /** 케이스에 따라 불필요할 수 있는 서류 — 상세에서 '해당없음' 토글 노출(예: 첫 입국 시 수출 검역증). */
  naAllowed?: boolean
  /**
   * 이 서류가 실제로 발급되는 step. kind='step' 이면 stepRef 와 같은 게 보통이라 생략 가능
   * (자동 폴백). kind='manual' 인데 특정 step 의 결과로 발급되는 서류(예: 별지25·FormAC/RE 는
   * vet-visit 검진 결과)는 여기에 명시. resolveRequiredDocs 가 발급 step 보다 앞 main lane
   * 미완료가 있을 때 awaiting=true 로 dim 처리한다.
   */
  issuanceStepId?: string
  description: string
  /** preview 영역에 노출할 step 의 업로드. 없으면 preview 영역 placeholder. */
  previewStepId?: string
}

const SPECS: Record<string, RequiredDocSpec[]> = {
  '일본': [
    {
      id: 'rabies-titer-result',
      name: '광견병 항체 검사 결과지',
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
      issuanceStepId: 'vet-visit',
      description:
        '농림축산검역본부 지정 양식의 접종 및 건강증명서입니다.\n\n출국일 기준 10일 이내에 임상 수의사가 검진 후 발급합니다.\n\n원본 2부를 준비해서, 동물검역 때 1부를 제출합니다.\n\n접종과 출국 전 임상검사를 한 동물병원이 다른 경우, 각각의 동물병원에서 별개의 증명서를 받아야 하는 점에 주의하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리합니다.',
    },
    {
      id: 'form-ac-or-re',
      name: 'FormAC/RE',
      source: '동물병원',
      kind: 'manual',
      issuanceStepId: 'vet-visit',
      description:
        '일본 지정 양식의 접종, 검사 및 건강증명서입니다.\n\n일본에 처음 입국하는 경우 FormAC를 준비합니다.\n\n재입국의 경우 FormRE와 일본 수출동물검역증을 준비합니다.\n\n출국일 기준 10일 이내에 임상 수의사의 서명을 받습니다.\n\n한국 수출 동물검역 때 검역관 확인·서명을 받습니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리합니다.',
    },
    {
      id: 'kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      description:
        '한국 수출 동물검역 후 발급받습니다.\n\n일본 수입 동물검역 때 원본을 제시해야 합니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리합니다.',
      previewStepId: 'certificate-issue',
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
  const flags = readBoolFlags(caseRow, 'required_doc_flags')
  const naFlags = readBoolFlags(caseRow, 'required_doc_na')
  return specs.map((spec) => {
    // 첨부 대상 stepId — step 연동 서류는 공유 step, 그 외는 doc.id 자체.
    const attachStepId = spec.previewStepId ?? spec.id
    const naAllowed = spec.naAllowed === true
    // '해당없음' 으로 표시한 서류는 보유 판정 자체를 끈다(첨부가 있어도 카운트 제외).
    const na = naAllowed && naFlags[spec.id] === true
    // 발급 step — 명시(issuanceStepId) 우선, kind='step' 이면 stepRef 폴백.
    const issuanceStepId = spec.issuanceStepId ?? (spec.kind === 'step' ? spec.stepRef : undefined)
    // 발급 step 시작 여부 — 1차 입력(검진일·신청일 등) 존재 = started. 일정탭이 단일 truth 라
    // manual 서류 verified 의 전제 조건으로 사용: 단계가 시작 전이면 수기 플래그·첨부가 남아있어도
    // 보유로 인정하지 않음 → 단계 되돌리기(검진일 삭제) 시 서류도 자동으로 '발급 예정'으로 복귀.
    const issuanceStarted = !isIssuanceNotStarted(issuanceStepId, caseRow)
    const verified =
      !na &&
      (spec.kind === 'manual'
        ? // 발급 step 시작됨 AND (수기 발급완료 플래그 OR 사본 첨부) → '보유'.
          issuanceStarted && (flags[spec.id] === true || hasAttachmentForStep(caseRow, attachStepId))
        : spec.stepRef
          ? resolveStepDone(spec.stepRef, caseRow)
          : false)
    const awaiting = !verified && !na && !issuanceStarted
    return {
      id: spec.id,
      name: spec.name,
      source: spec.source,
      manual: spec.kind === 'manual',
      naAllowed,
      na,
      awaiting,
      description: spec.description,
      previewStepId: spec.previewStepId,
      attachStepId,
      verified,
    }
  })
}

/**
 * 발급 step 이 아직 '시작 전'인지 — 그 step 의 1차 입력(채혈일·신청일·검진일·검역일 등)이
 * 없으면 true(=발급 예정, dim). 시작됐으면(in_progress) false(=활성, '준비중'), 완료면
 * verified 가 true 라 awaiting 자체가 false.
 *
 * 'started' 판별: resolveCompletedDate 가 그 step 의 1차 날짜를 done 여부와 무관하게
 * 반환한다(없으면 null) — 채혈일만 입력된 진행 중 검사도 시작됨으로 잡힌다. 그래서:
 *   - 광견병 항체 검사 진행 중(채혈일 있음) → 결과지 '준비중'(활성)
 *   - 사전 신고 진행 중(신청일 있음) → 허가증 '준비중', 그 뒤(검진·검역) 발급 서류는 발급 예정
 * issuance step 미지정·카탈로그 누락이면 false (보수적: dim 처리 안 함).
 */
function isIssuanceNotStarted(issuanceStepId: string | undefined, caseRow: CaseRow): boolean {
  if (!issuanceStepId) return false
  const step = JOURNEY_STEP_CATALOG.find((s) => s.id === issuanceStepId)
  if (!step) return false
  return resolveCompletedDate(step.done, caseRow) === null
}

/** case.data.documents 에 해당 stepId 태그의 파일이 하나라도 있으면 true. */
function hasAttachmentForStep(caseRow: CaseRow, stepId: string): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const docs = Array.isArray(data.documents) ? (data.documents as Array<Record<string, unknown>>) : []
  return docs.some((d) => !!d && typeof d === 'object' && d.stepId === stepId)
}

/**
 * 큐레이션된 필수 서류가 모두 ✓ 인지(verified 또는 해당없음). spec 이 없는 목적지는 false —
 * 자동 완료 시그널 자체가 없는 것으로 본다.
 *
 * `uptoStepId` 가 주어지면 그 step 까지 발급되는 서류만 게이트에 넣는다 — 그 step 보다
 * 뒤에 발급되는 서류(예: vet-visit 기준 한국 수출 동물검역증은 certificate-issue 발급물)는
 * 아직 발급 전이라 제외. StepDocChecklist 카드가 previewStepId 로 미래 서류를 가리는 것과
 * 동일 규칙이라, 카드에 보이는 서류가 다 ✓ 면 곧 완료가 되도록 맞춘다.
 *
 * vet-visit done-resolver 가 'vet-visit' 로 호출 — 출국 전 임상검사 시점까지의 서류(항체검사
 * 결과지·허가증·별지25·FormAC/RE)가 다 갖춰지면 자동 완료.
 */
export function areAllRequiredDocsVerified(caseRow: CaseRow, uptoStepId?: string): boolean {
  const items = resolveRequiredDocs(caseRow.destination, caseRow)
  if (!items || items.length === 0) return false
  let scoped = items
  if (uptoStepId) {
    const cutoff = JOURNEY_STEP_CATALOG.find((s) => s.id === uptoStepId)?.order
    if (cutoff != null) {
      scoped = items.filter((d) => {
        // previewStepId 미지정(별지25·FormAC 등) = 현재 step 발급물 → 포함.
        if (!d.previewStepId) return true
        const ref = JOURNEY_STEP_CATALOG.find((s) => s.id === d.previewStepId)
        return ref ? ref.order <= cutoff : true
      })
    }
  }
  if (scoped.length === 0) return false
  return scoped.every((d) => d.verified || d.na)
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

/** case.data 의 boolean 플래그 맵(required_doc_flags / required_doc_na) 읽기. true 만 남긴다. */
function readBoolFlags(caseRow: CaseRow, key: string): Record<string, boolean> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data[key]
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true) out[k] = true
  }
  return out
}
