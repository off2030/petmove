import type { CaseRow } from '@petmove/domain'

/**
 * 케이스 목록 경량 로드 계약 — listActiveOrgCases() 가 반환하는 행에서 제외되는 data 키.
 *
 * (dashboard) 레이아웃이 org 전체 케이스를 initialCases 로 직렬화(RSC flight + 하이드레이션
 * 이중 전송)하므로, 목록 화면이 실제로 쓰지 않는 "무제한 성장형 대형 배열" 키만 빼서 보낸다.
 *
 * ── 방식 선택: "필요 키만 포함(projection)"이 아니라 "대형 키 제외(exclusion)" ──
 * 근거 (2026-08-01 운영 DB 전수 실측, 케이스 1,898건 · data 값 직렬화 합계 ~734KB):
 *  1. 목록 소비자가 data 를 사실상 전부 읽는다:
 *     - 검색(case-list buildSearchString)은 data 의 **모든 값**을 문자열화해 매칭
 *     - 검사 탭(todos-app buildInspectionRows)은 rabies_titer_records ·
 *       infectious_disease_records · by_dest(여행지별 출국일) · species 등 다수 키
 *     - 신고 탭 상태 derive(domain report-status)는 documents(stepId 태그) ·
 *       advance_notification_* · import_permit_* · jp_export_quarantine_* 등
 *     - 서류 탭 · destination-overrides · procedure-check 도 임의 키를 opt-in 없이 읽음
 *     → 포함 명단은 완결이 불가능하고, 새 필드 추가 때마다 검색·탭에서 조용히 빠지는
 *       회귀를 만든다. 제외 명단은 "빠진 키 = 아래 4개" 로 계약이 닫힌다.
 *  2. 실측상 data 대부분은 목록이 쓰는 소형 스칼라(주소·날짜·백신 기록)라 포함 방식으로도
 *     더 못 줄인다. 케이스당 크기가 무제한으로 자라는 키는 아래 4개뿐이다.
 *
 * ── 제외 키와 원 소비자 (전부 케이스 상세 전용, 저장은 배열 통째 교체형) ──
 *  - notes       (실측 42KB, 행당 최대 3.4KB) : notes-field (메모·보관함)
 *  - payments    (실측 66KB)                  : payment-field (결제 기록)
 *  - estimate    (실측 30KB, 행당 최대 0.8KB) : payment-field (비용 계산 스냅샷)
 *  - attachments (레거시, notes 로 이관 중)    : attachments-field (현재 미마운트) +
 *                                              notes-field 의 레거시 병합 표시
 *
 * ⚠️ documents 는 크기(20KB)에도 불구하고 **제외 금지** — 신고 탭 상태 derive
 *    (deriveAdvanceNotificationStatus/deriveApplicationStatus)가 목록 행에서 stepId 를 읽는다.
 *
 * ── 안전 장치 (경량 행 위에서의 편집 사고 방지) ──
 * 위 4개 키의 저장은 "클라이언트에서 배열 전체를 다시 만들어 통째 저장"이라, 제외된(빈)
 * 상태에서 편집하면 서버의 실제 배열을 지워버린다. 그래서:
 *  - cases-context 가 케이스 선택 시 getActiveOrgCaseById 로 풀 행을 받아 hydrate 하고
 *    hydratedIds 로 추적한다.
 *  - notes-field · payment-field · attachments-field 는 isCaseHydrated(caseId) 가 true 가
 *    되기 전까지 편집을 막는다(로딩 표시).
 *  - 그 외 키의 저장(updateCaseField 등)은 서버가 fresh read 후 해당 키만 머지하므로 안전.
 *
 * 여기에 키를 추가할 때는 반드시:
 *  1. 목록·검사·신고·서류 탭·검색·domain derive 가 그 키를 읽지 않는지 전수 확인
 *  2. 그 키를 통째 저장하는 컴포넌트에 isCaseHydrated 게이트 추가
 */
export const CASE_LIST_EXCLUDED_DATA_KEYS = [
  'notes',
  'payments',
  'estimate',
  'attachments',
] as const

export type CaseListExcludedDataKey = (typeof CASE_LIST_EXCLUDED_DATA_KEYS)[number]

/**
 * 목록 경량 행 — 구조는 CaseRow 와 동일하지만 data 에서
 * CASE_LIST_EXCLUDED_DATA_KEYS 가 제거되어 있(을 수 있)다.
 *
 * data 가 Record<string, unknown> 이라 타입만으로 키 접근을 막을 수 없으므로,
 * 계약은 위 상수 + cases-context 의 hydration 게이트(isCaseHydrated)로 지킨다.
 */
export type CaseListRow = CaseRow

/** 목록 응답에서 대형 키 제거. 제거할 게 없으면 원본 참조 그대로 반환. */
export function stripCaseListHeavyKeys(row: CaseRow): CaseListRow {
  const data = row.data as Record<string, unknown> | null | undefined
  if (!data || typeof data !== 'object') return row
  let hasHeavy = false
  for (const k of CASE_LIST_EXCLUDED_DATA_KEYS) {
    if (k in data) {
      hasHeavy = true
      break
    }
  }
  if (!hasHeavy) return row
  const next: Record<string, unknown> = { ...data }
  for (const k of CASE_LIST_EXCLUDED_DATA_KEYS) delete next[k]
  return { ...row, data: next }
}

/**
 * 경량 행(cached)에 풀 행(full)을 합쳐 hydrate 한 행을 만든다.
 *
 * fetch 가 날아가 있는 동안 사용자가 다른 필드를 optimistic 편집했을 수 있다
 * (updateLocalCaseField 가 updated_at 을 클라이언트 now 로 올림). 그 경우 풀 행으로
 * 통째 교체하면 방금 편집이 되돌아가 보이므로, cached 가 더 새로우면 제외 키만 보강한다.
 * 제외 키 자체는 hydrate 전 편집이 게이트로 막혀 있어 cached 쪽에 새 값이 있을 수 없다.
 */
export function mergeHydratedCaseRow(cached: CaseRow, full: CaseRow): CaseRow {
  if (!cached.updated_at || !full.updated_at || full.updated_at >= cached.updated_at) {
    return full
  }
  const data: Record<string, unknown> = {
    ...((cached.data as Record<string, unknown>) ?? {}),
  }
  const fullData = (full.data as Record<string, unknown>) ?? {}
  for (const k of CASE_LIST_EXCLUDED_DATA_KEYS) {
    if (k in fullData) data[k] = fullData[k]
  }
  return { ...cached, data }
}
