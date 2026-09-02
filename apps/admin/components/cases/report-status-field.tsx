'use client'

import { useConfirm } from '@petmove/ui'
import { SectionLabel } from '@/components/ui/section-label'
import { StatusChip } from './status-chip'
import { setReportSlotStatus } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { stampImportReportActiveDest } from '@/lib/inspection-active-dest'
import {
  exportSlotApplies,
  REPORT_STATUS_OPTIONS,
  reportSlotStatusFor,
  reportStatusLabel,
  reportStatusTone,
} from '@/lib/report-status'
import { useCases } from './cases-context'
import type { CaseRow, ReportSlot } from '@petmove/domain'

const SLOT_LABEL: Record<ReportSlot, string> = { import: '수입', export: '수출' }

/**
 * 상세페이지 '신고' 행 — 수입·수출 진행상태만 보여주고 바꾼다(날짜·메모는 신고 탭 소관).
 *
 * 값의 출처는 신고 탭과 같다([[reportSlotStatusFor]]): 여정 카드가 단일 출처이고, 이어질
 * 카드가 없는 목적지만 운영자 수동값을 본다. 다만 목적지는 **지금 보고 있는 여행지 탭**
 * 기준 — 다른 필드들과 같은 기준이라야 다중 여행지에서 화면이 엇갈리지 않는다.
 *
 * 행 자체를 언제 띄울지는 [[reportRowApplies]] 가 정한다(case-detail).
 */
export function ReportStatusField({
  caseId,
  caseRow,
  destination,
}: {
  caseId: string
  caseRow: CaseRow
  /** 활성 여행지 단일 토큰. */
  destination: string | null
}) {
  const slots: ReportSlot[] = exportSlotApplies(caseRow, destination)
    ? ['import', 'export']
    : ['import']

  return (
    <div
      data-field="report_status"
      className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors last:border-0"
    >
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel>신고</SectionLabel>
      </div>
      <div className="min-w-0 flex items-baseline gap-[10px] pt-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {slots.map((slot, i) => (
          <span key={slot} className="inline-flex items-baseline gap-[10px]">
            {i > 0 && <span className="text-muted-foreground/30 select-none">|</span>}
            <span className="text-base text-muted-foreground/70">{SLOT_LABEL[slot]}</span>
            <ReportSlotChip
              caseId={caseId}
              caseRow={caseRow}
              destination={destination}
              slot={slot}
            />
          </span>
        ))}
      </div>
    </div>
  )
}

function ReportSlotChip({
  caseId,
  caseRow,
  destination,
  slot,
}: {
  caseId: string
  caseRow: CaseRow
  destination: string | null
  slot: ReportSlot
}) {
  const { replaceLocalCaseData, updateLocalCaseField } = useCases()
  const confirm = useConfirm()
  const value = reportSlotStatusFor(caseRow, destination, slot)

  async function pick(next: string) {
    if (next === value) return
    if (next === 'not_started') {
      // 신고 탭의 되돌리기 확인과 같은 문구 — 카드 시그널을 지우는 동작이라 확인이 필요하다.
      const ok = await confirm({
        message: '대기로 되돌리시겠어요?',
        description:
          slot === 'import'
            ? '신고·신청 진행 정보(신청일·완료 표시)가 지워집니다. 보호자가 첨부한 서류나 입력된 허가번호는 그대로 유지됩니다.'
            : '수출검역 진행 정보(신청일·확정·완료 표시)가 지워집니다.',
        okLabel: '대기로 되돌리기',
      })
      if (!ok) return
    }
    // 낙관적 선반영 없이 서버 결과로 교체 — 한 번에 카드 시그널 여러 개를 쓰므로
    // 반환된 data 전체가 곧 새 상태다(신고 탭과 동일 경로).
    const res = await persistField('신고 진행상태', () =>
      setReportSlotStatus(caseId, slot, next as 'not_started' | 'in_progress' | 'done', destination),
    )
    if (!res?.ok) return
    if (res.autoFilled?.data) replaceLocalCaseData(caseId, res.autoFilled.data)
    // 신고 탭 줄이 이 여행지를 따라오게 각인 (다중 여행지에서만 의미 있음).
    stampImportReportActiveDest(caseId, caseRow.destination, destination, updateLocalCaseField)
  }

  return (
    <StatusChip
      value={value}
      label={reportStatusLabel(value)}
      tone={reportStatusTone(value)}
      options={REPORT_STATUS_OPTIONS}
      optionTone={reportStatusTone}
      onPick={pick}
    />
  )
}
