import { cn } from '@/lib/utils'

/**
 * 점 + 텍스트 상태 표기.
 * 배경 pill 없이 문맥 흐름을 끊지 않는 editorial 스타일.
 *
 * 예: <StatusDot tone="orange">D-21</StatusDot>
 */
export type DotTone = 'red' | 'orange' | 'yellow' | 'green' | 'gray' | 'muted'

const TONE_STYLES: Record<DotTone, { text: string; dot: string }> = {
  red:    { text: 'text-destructive',           dot: 'bg-destructive' },
  orange: { text: 'text-pmw-warning',           dot: 'bg-pmw-warning' },
  yellow: { text: 'text-pmw-warning',           dot: 'bg-pmw-warning' },
  green:  { text: 'text-pmw-positive',          dot: 'bg-pmw-positive' },
  gray:   { text: 'text-muted-foreground',      dot: 'bg-muted-foreground/60' },
  muted:  { text: 'text-muted-foreground/50',   dot: 'bg-muted-foreground/30' },
}

export function StatusDot({
  tone,
  children,
  className,
}: {
  tone: DotTone
  children: React.ReactNode
  className?: string
}) {
  const s = TONE_STYLES[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-serif text-[13px]', s.text, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.dot)} />
      {children}
    </span>
  )
}
