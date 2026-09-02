'use client'

import { DropdownSelect } from '@petmove/ui'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { useCases } from './cases-context'
import { useSectionEditMode } from './section-edit-mode-context'
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
 * 읽기 모드(절차정보 접힘 상태)에선 드롭다운 없이 글자만 보여준다.
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
  const editMode = useSectionEditMode()
  const value = readInspectionStatus(caseRow, target, date)
  const label = inspectionStatusLabel(value)
  const tone = inspectionStatusTone(value)

  async function pick(next: string) {
    if (next === value) return
    const key = inspectionStatusKey(target)
    // Optimistic — 실패해도 값 보존 + '다시 시도' 토스트(persistField).
    updateLocalCaseField(caseId, 'data', key, next)
    await persistField('진행상태', () => updateCaseField(caseId, 'data', key, next))
  }

  const face = (
    <>
      <span
        aria-hidden
        className="mr-1.5 inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-current align-middle"
      />
      {label}
    </>
  )

  if (!editMode) {
    return (
      <span className={cn('inline-flex items-center font-serif text-[15px]', tone)}>{face}</span>
    )
  }

  return (
    <DropdownSelect
      value={value}
      options={INSPECTION_STATUS_OPTIONS}
      onChange={pick}
      portal
      // 평소엔 차분한 글자, hover 시 링+꺾쇠로 '눌러서 바꾸는 드롭다운' 신호 — 검사 탭과 동일.
      triggerClassName={cn(
        'group inline-flex items-center rounded-md px-2 py-0.5 -mx-1 font-serif text-[15px]',
        'hover:ring-1 hover:ring-inset hover:ring-border/60 transition-colors',
        tone,
      )}
      renderTrigger={() => (
        <>
          {face}
          <span
            aria-hidden
            className="ml-1 text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-70"
          >
            ▼
          </span>
        </>
      )}
      renderOption={(o) => (
        <span className={cn('inline-flex items-center', inspectionStatusTone(o.value))}>
          <span
            aria-hidden
            className="mr-1.5 inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-current align-middle"
          />
          {o.label}
        </span>
      )}
    />
  )
}
