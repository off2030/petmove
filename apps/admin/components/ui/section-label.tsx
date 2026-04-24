import { cn } from '@/lib/utils'

/**
 * Editorial 스몰캡 라벨 (Clinic, Veterinarian, 접종 등).
 * 필드 그룹·섹션 구분용 작은 헤더.
 */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
