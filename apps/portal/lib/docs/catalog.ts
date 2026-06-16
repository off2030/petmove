import type { CaseRow } from '@petmove/domain'
import {
  DEFAULT_CERT_CONFIG,
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  getStepsForCase,
  resolveCerts,
  resolveDone,
  resolveRequiredDocs,
  type CertDefinition,
  type RequiredDocItem,
  type StepDefinition,
} from '@petmove/domain'
import { activeDestinationView } from '@/lib/cases/active-destination'
import { formatFileSize, readCaseDocuments } from '@/lib/documents'

/**
 * Portal 서류함(/cases/<id>/docs) 데이터 모델.
 *
 * 시각 소스: docs/portal-preview/docs.jsx (DocList).
 * 3 섹션:
 *   1) 필수 서류 체크리스트 — 카탈로그 step 중 allowAttachments=true 인 항목
 *   2) 증명서 자동 작성 — destination + species 로 resolveCerts (admin 이 PDF 생성)
 *   3) 보관 중인 서류 — 보호자가 journey step 에서 올린 파일 (case.data.documents)
 *
 * 빌더는 read-only — 업로드/삭제/열람은 lib/actions/documents.ts.
 */

export interface DocsViewData {
  pet: { name: string }
  trip: { fromCity: string; toCity: string; tripType: 'round' | 'one_way' }
  /**
   * 국가별 큐레이션된 '필수 서류' (예: 일본 5개). spec 이 있는 목적지면 portal 은
   * 이 한 섹션만 노출하고 checklist/autoDocs 는 가린다. spec 없으면 null.
   */
  requiredDocs: RequiredDocItem[] | null
  checklist: ChecklistItem[]
  /**
   * 검역증 — 검역 단계에서 *받는* 증명서(한국 수출·수입 + 도착국 수입·현지 수출).
   * 케이스의 적용 검역 step 에서 파생. 행 클릭 시 해당 일정 step 상세로 이동(거기서 첨부·완료).
   */
  quarantineDocs: QuarantineDocItem[]
  autoDocs: AutoDocItem[]
  storedDocs: StoredDocItem[]
}

export interface QuarantineDocItem {
  /** step id — 클릭 시 /journey/<id> 로 이동 */
  id: string
  name: string
  source: string
  verified: boolean
}

export interface ChecklistItem {
  /** step id — 클릭 시 /journey/<stepId> 로 이동 가능 */
  id: string
  name: string
  source: string
  verified: boolean
}

export interface AutoDocItem {
  /** cert.key */
  id: string
  name: string
  /** UI 좌측 아이콘 라벨 — 'PDF'·'EQC' 등 */
  type: string
  date: string | null
  /** '발급 예정' / 'PetMove' */
  source: string
  verified: boolean
  fresh: boolean
}

export interface StoredDocItem {
  id: string
  name: string
  type: string
  date: string | null
  size?: string
  source: '병원 발급' | '고객 업로드'
  verified: boolean
  fresh: boolean
}

export function buildDocsView(
  caseRowInput: CaseRow,
  activeDestination?: string | null,
): DocsViewData {
  // 다중 목적지: 활성 목적지 1개짜리 뷰로 좁혀 서류·증명서·체크리스트를 그 목적지 기준으로.
  const caseRow = activeDestinationView(caseRowInput, activeDestination)
  const ctx = buildCaseJourneyContext(caseRow)
  const applicableSteps = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)
  const requiredDocs = resolveRequiredDocs(caseRow.destination, caseRow)

  // 1) 체크리스트 — 첨부가 필요한 step (검역증 step 은 별도 섹션이라 제외)
  const checklist: ChecklistItem[] = applicableSteps
    .filter((s) => s.allowAttachments && !isQuarantineCertStep(s))
    .map((s) => ({
      id: s.id,
      name: s.title,
      source: checklistSourceFor(s.category),
      verified: resolveDone(s.done, caseRow),
    }))

  // 1-1) 검역증 — 검역 단계에서 받는 증명서. 한국 수출/수입 + 도착국 수입·현지 수출.
  //      신청·사전통지 단계(수입 허가·일본 수출검역 신청·아일랜드 사전통지)는 제외.
  const quarantineDocs: QuarantineDocItem[] = applicableSteps
    .filter(isQuarantineCertStep)
    .map((s) => ({
      id: s.id,
      name: s.title,
      source: isKrQuarantineAuthority(s) ? '농림축산검역본부' : '현지 동물검역소',
      verified: resolveDone(s.done, caseRow),
    }))

  // 2) 자동 작성 증명서 — destination + species
  const certs: CertDefinition[] = resolveCerts(
    caseRow.destination,
    DEFAULT_CERT_CONFIG,
    ctx.species,
  )
  const autoDocs: AutoDocItem[] = certs.map((c) => ({
    id: c.key,
    name: c.label,
    type: 'PDF',
    date: null,
    source: '발급 예정',
    verified: false,
    fresh: false,
  }))

  // 3) 보관함 — 체크리스트·검역증에 묶이지 않은 '기타' 첨부만(중복 노출 제거). 체크리스트
  //    서류는 그 항목 상세에서, 검역증은 일정 step 에서 보므로 여기선 misc 등 자유 첨부만.
  const linkedStepIds = new Set<string>()
  if (requiredDocs) requiredDocs.forEach((d) => linkedStepIds.add(d.attachStepId))
  else checklist.forEach((d) => linkedStepIds.add(d.id))
  quarantineDocs.forEach((d) => linkedStepIds.add(d.id))
  const storedDocs: StoredDocItem[] = readCaseDocuments(caseRow.data)
    .filter((d) => !linkedStepIds.has(d.stepId ?? ''))
    .slice()
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .map((d) => ({
      id: d.id,
      name: d.name,
      type: d.mime === 'application/pdf' ? 'PDF' : 'IMG',
      date: d.uploadedAt.slice(0, 10),
      size: formatFileSize(d.size),
      source: '고객 업로드',
      verified: true,
      fresh: false,
    }))

  return {
    pet: { name: caseRow.pet_name ?? '반려동물' },
    trip: {
      fromCity: '한국',
      toCity: ctx.destinationToken ?? caseRow.destination ?? '—',
      tripType: ctx.tripType,
    },
    requiredDocs,
    checklist,
    quarantineDocs,
    autoDocs,
    storedDocs,
  }
}

/**
 * 검역증 step 판정 — 검역 단계에서 *받는* 증명서만(한국 수출/수입·도착국 수입·현지 수출).
 * 신청·사전통지 단계는 제외: 수입 허가(has-import-permit)·일본 수출검역 신청
 * (has-jp-export-quarantine, 방문 step has-jp-export-quarantine-visit 는 포함)·
 * 아일랜드 사전통지(quarantine:ie_advance_notice_date).
 */
function isQuarantineCertStep(step: StepDefinition): boolean {
  const d = typeof step.done === 'string' ? step.done : ''
  if (d === 'has-jp-export-quarantine') return false
  if (d === 'quarantine:ie_advance_notice_date') return false
  if (d.startsWith('quarantine:')) return true
  return d.startsWith('has-') && d.includes('-quarantine')
}

/** 한국 검역(수출·수입)은 농림축산검역본부 발급, 그 외는 도착국 현지 검역소. */
function isKrQuarantineAuthority(step: StepDefinition): boolean {
  return step.done === 'has-kr-export-quarantine' || step.done === 'has-kr-import-quarantine'
}

/** 체크리스트 source 라벨 — step category 기반. UI 의 '병원 발급' / 'PetMove' 톤과 통일. */
function checklistSourceFor(category: string): string {
  switch (category) {
    case 'vaccination':
      return '병원 발급'
    case 'lab':
      return '검사기관'
    case 'permit':
      return '검역본부 발급'
    case 'document':
      return 'PetMove 발급'
    case 'preparation':
      return '병원 등록'
    case 'logistics':
      return '항공사 발급'
    default:
      return '병원 발급'
  }
}
