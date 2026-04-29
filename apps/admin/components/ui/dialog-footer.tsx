'use client'

import { cn } from '@/lib/utils'

interface DestructiveAction {
  label?: string
  onClick: () => void
  disabled?: boolean
}

interface DialogFooterProps {
  onCancel: () => void
  onPrimary: () => void
  primaryLabel?: string
  cancelLabel?: string
  primaryDisabled?: boolean
  saving?: boolean
  /** 저장 중 표시 텍스트. 미지정 시 `${primaryLabel} 중…` 자동 생성. */
  savingLabel?: string
  /** 좌측 정렬 destructive 버튼 (예: "삭제"). 있으면 footer 좌측에 표시. */
  destructive?: DestructiveAction
  /** modal panel 바닥일 때 true — `border-t border-border/80 px-lg py-3` 추가. */
  bordered?: boolean
  className?: string
}

/**
 * 모든 모달/다이얼로그 footer의 공용 컴포넌트.
 * 패턴: [destructive] [...spacer] [cancel] [primary]
 * 스타일은 confirm-dialog와 동일 (`bg-foreground` primary, `border` cancel).
 */
export function DialogFooter({
  onCancel,
  onPrimary,
  primaryLabel = '저장',
  cancelLabel = '취소',
  primaryDisabled = false,
  saving = false,
  savingLabel,
  destructive,
  bordered = false,
  className,
}: DialogFooterProps) {
  const effectiveSavingLabel = savingLabel ?? `${primaryLabel} 중…`
  return (
    <div
      className={cn(
        'flex items-center gap-sm',
        bordered && 'border-t border-border/80 px-lg py-3',
        className,
      )}
    >
      {destructive && (
        <button
          type="button"
          onClick={destructive.onClick}
          disabled={destructive.disabled || saving}
          className="px-md py-1.5 text-sm rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          {destructive.label ?? '삭제'}
        </button>
      )}
      <div className="ml-auto flex items-center gap-sm">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-md py-1.5 text-sm rounded-md border border-border hover:bg-accent/60 transition-colors disabled:opacity-40"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled || saving}
          className="px-md py-1.5 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40"
        >
          {saving ? effectiveSavingLabel : primaryLabel}
        </button>
      </div>
    </div>
  )
}
