import { cn } from '@/lib/utils'

/**
 * Editorial peach 아바타. 멤버/사용자 목록에서 이니셜 표시.
 * muted 변형은 대기 중 초대 등 아직 "확정 안 된" 상태용.
 */
export function Avatar({
  label,
  muted = false,
  size = 'md',
  className,
}: {
  label: string
  muted?: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[14px]'
  const tone = muted
    ? 'bg-muted/60 text-muted-foreground'
    : 'bg-[#E5B89C]/45 text-[#9B4A2D] dark:bg-[#C08C70]/40 dark:text-[#E0917A]'
  return (
    <div className={cn('rounded-full flex items-center justify-center shrink-0', dim, tone, className)}>
      <span className={cn('font-serif', textSize)}>{label}</span>
    </div>
  )
}

export function avatarInitial(s: string): string {
  const trimmed = s.trim()
  if (!trimmed) return '?'
  return Array.from(trimmed)[0] ?? '?'
}
