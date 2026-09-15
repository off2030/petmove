'use client'

import { DropdownSelect } from '@petmove/ui'
import { cn } from '@/lib/utils'
import { useSectionEditMode } from './section-edit-mode-context'

/**
 * 상세페이지 진행상태 칩 — 검사·신고가 공유하는 **표시 전용** 껍데기.
 *
 * 읽기/저장 규칙은 각 도메인(inspection-status-chip / report-status-field)이 갖고,
 * 여기는 점·라벨·hover 꺾쇠와 읽기 모드 분기만 책임진다. 두 벌로 두면 한쪽 hover
 * 스타일만 손대다 조용히 갈라진다.
 *
 * 읽기 모드(절차정보 접힘)에선 드롭다운 없이 글자만 보여준다.
 */
export function StatusChip({
  value,
  label,
  tone,
  options,
  optionTone,
  onPick,
}: {
  value: string
  label: string
  /** 현재 값의 색 클래스. */
  tone: string
  options: Array<{ value: string; label: string }>
  /** 옵션별 색 클래스 — 메뉴에서도 상태 색이 보이도록. */
  optionTone: (value: string) => string
  onPick: (next: string) => void | Promise<void>
}) {
  const editMode = useSectionEditMode()

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
    return <span className={cn('inline-flex items-center font-serif text-[15px]', tone)}>{face}</span>
  }

  return (
    <DropdownSelect
      value={value}
      options={options}
      onChange={onPick}
      portal
      // 평소엔 차분한 글자, hover 시 링+꺾쇠로 '눌러서 바꾸는 드롭다운' 신호 — 할일 탭과 동일.
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
        <span className={cn('inline-flex items-center', optionTone(o.value))}>
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
