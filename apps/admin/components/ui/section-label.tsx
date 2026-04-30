import { cn } from '@/lib/utils'

/**
 * Editorial 스몰캡 라벨 (Clinic, Veterinarian, 접종 등).
 * 필드 그룹·섹션 구분용 작은 헤더.
 * onClick 이 주어지면 button 으로 렌더되어 빈 행에서도 라벨 클릭으로 편집을 시작할 수 있다.
 */
export function SectionLabel({
  children,
  className,
  onClick,
  title,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  title?: string
}) {
  const baseCls = 'font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(
          baseCls,
          'text-left cursor-pointer hover:text-foreground transition-colors',
          className,
        )}
      >
        {children}
      </button>
    )
  }
  return (
    <span className={cn(baseCls, className)} title={title}>
      {children}
    </span>
  )
}
