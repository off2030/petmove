import type { CaseRow } from '@petmove/domain'
import {
  DEFAULT_CERT_CONFIG,
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  getStepsForCase,
  resolveCerts,
  resolveDone,
  type CertDefinition,
} from '@petmove/domain'
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
  checklist: ChecklistItem[]
  autoDocs: AutoDocItem[]
  storedDocs: StoredDocItem[]
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

export function buildDocsView(caseRow: CaseRow): DocsViewData {
  const ctx = buildCaseJourneyContext(caseRow)
  const applicableSteps = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)

  // 1) 체크리스트 — 첨부가 필요한 step
  const checklist: ChecklistItem[] = applicableSteps
    .filter((s) => s.allowAttachments)
    .map((s) => ({
      id: s.id,
      name: s.title,
      source: checklistSourceFor(s.category),
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

  // 3) 보관 중인 서류 — 보호자가 step 에서 올린 파일. 최신 업로드가 위로.
  const storedDocs: StoredDocItem[] = readCaseDocuments(caseRow.data)
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
    checklist,
    autoDocs,
    storedDocs,
  }
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
