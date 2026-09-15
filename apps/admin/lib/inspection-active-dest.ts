'use client'

import { parseDestinations } from '@petmove/domain'
import { updateCaseField } from '@/lib/actions/cases'

/** 검사 탭이 케이스 한 줄의 "활성 여행지"를 읽는 키 (DestinationCell overrideKey 와 동일). */
export const INSPECTION_ACTIVE_DEST_KEY = 'inspection_active_dest'

/**
 * 상세페이지에서 검사(광견병항체·전염병)를 그 여행지 탭 기준으로 입력했음을 검사 탭에 각인.
 *
 * 검사 기록 자체는 여행지 공통(by_dest 아님)이라, 각인이 없으면 검사 탭의 여행지 칩이
 * resolveTabActiveDest 기본값(출국일 있는 첫 여행지 → 첫 여행지)으로 떨어져
 * "일본 탭에서 입력했는데 검사 탭엔 미국" 이 된다.
 *
 * 서류·신고 탭의 export_doc_active_dest / import_report_active_dest 각인
 * (editable-field 의 출국일·내원일 저장)과 같은 패턴.
 *
 * 각인 시점은 "이 검사가 어느 여행지 것인지"를 정하는 행위 — 기록 신규 생성과
 * 검사기관 변경 — 으로만 한정한다. 수치·날짜 수정까지 각인하면 다른 탭이 활성인 채로
 * 결과지를 입력했을 때 칩이 되돌아가 깜빡인다.
 *
 * 단일 여행지 케이스는 각인 불필요(해석 기본값이 곧 그 여행지).
 */
export function stampInspectionActiveDest(
  caseId: string,
  destination: string | null | undefined,
  activeDest: string | null | undefined,
  updateLocalCaseField: UpdateLocalCaseField,
) {
  stampTabActiveDest(INSPECTION_ACTIVE_DEST_KEY, caseId, destination, activeDest, updateLocalCaseField)
}

/** 신고 탭이 케이스 한 줄의 "활성 여행지"를 읽는 키. */
export const IMPORT_REPORT_ACTIVE_DEST_KEY = 'import_report_active_dest'

/**
 * 상세페이지에서 신고(수입·수출) 상태를 그 여행지 탭 기준으로 바꿨음을 신고 탭에 각인.
 *
 * 각인이 없으면 다중 여행지 케이스에서 "일본 탭에서 완료로 바꿨는데 신고 탭 줄은 태국 기준
 * 대기" 가 된다. 상태 저장 자체는 [[setReportSlotStatus]] 에 목적지를 명시해 넘기므로
 * 각인은 탭 표시를 따라오게 하는 용도다 — 저장 경합과 무관.
 *
 * ⚠️ 신고 탭 자동 포함 판정(isAutoImportReport)이 이 각인값을 본다 — 신고 대상이 아닌
 * 여행지로 각인하면 케이스가 탭에서 빠진다. 호출부(신고 행)는 신고 대상 여행지에서만
 * 렌더되므로 안전하다.
 */
export function stampImportReportActiveDest(
  caseId: string,
  destination: string | null | undefined,
  activeDest: string | null | undefined,
  updateLocalCaseField: UpdateLocalCaseField,
) {
  stampTabActiveDest(IMPORT_REPORT_ACTIVE_DEST_KEY, caseId, destination, activeDest, updateLocalCaseField)
}

type UpdateLocalCaseField = (
  caseId: string,
  storage: 'column' | 'data',
  key: string,
  value: unknown,
) => void

/** 단일 여행지 케이스는 각인 불필요(해석 기본값이 곧 그 여행지). */
function stampTabActiveDest(
  key: string,
  caseId: string,
  destination: string | null | undefined,
  activeDest: string | null | undefined,
  updateLocalCaseField: UpdateLocalCaseField,
) {
  if (!activeDest) return
  const dests = parseDestinations(destination)
  if (dests.length < 2 || !dests.includes(activeDest)) return
  updateLocalCaseField(caseId, 'data', key, activeDest)
  void updateCaseField(caseId, 'data', key, activeDest)
}
