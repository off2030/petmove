'use client'

import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { useCases } from './cases-context'
import { StatusChip } from './status-chip'
import {
  INSPECTION_STATUS_OPTIONS,
  inspectionStatusKey,
  inspectionStatusLabel,
  inspectionStatusTone,
  readInspectionStatus,
  type InspectionStatusTarget,
} from '@/lib/inspection-status'
import type { CaseRow } from '@petmove/domain'

/**
 * 상세페이지에서 검사 진행상태를 보고 바꾸는 칩.
 *
 * 검사 탭(todos)과 **같은 키**를 읽고 쓴다 — 저장 키·legacy 폴백 규칙은
 * lib/inspection-status 단일 출처. 여기선 표시와 저장만 담당한다.
 */
export function InspectionStatusChip({
  caseId,
  caseRow,
  target,
  date,
}: {
  caseId: string
  caseRow: CaseRow
  target: InspectionStatusTarget
  /** 전염병검사 legacy 상속 판별용 검사일. titer 대상에선 무시된다. */
  date?: string | null
}) {
  const { updateLocalCaseField } = useCases()
  const value = readInspectionStatus(caseRow, target, date)

  async function pick(next: string) {
    if (next === value) return
    const key = inspectionStatusKey(target)
    // Optimistic — 실패해도 값 보존 + '다시 시도' 토스트(persistField).
    updateLocalCaseField(caseId, 'data', key, next)
    await persistField('진행상태', () => updateCaseField(caseId, 'data', key, next))
  }

  return (
    <StatusChip
      value={value}
      label={inspectionStatusLabel(value)}
      tone={inspectionStatusTone(value)}
      options={INSPECTION_STATUS_OPTIONS}
      optionTone={inspectionStatusTone}
      onPick={pick}
    />
  )
}
