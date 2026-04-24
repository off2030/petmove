import { cn } from '@/lib/utils'

/**
 * 점 + 텍스트 상태 표기.
 * 배경 pill 없이 문맥 흐름을 끊지 않는 editorial 스타일.
 *
 * 예: <StatusDot tone="orange">D-21</StatusDot>
 */
export type DotTone = 'red' | 'orange' | 'yellow' | 'green' | 'gray' | 'muted'

const TONE_STYLES: Record<DotTone, { text: string; dot: string }> = {
  red:    { text: 'text-red-700',               dot: 'bg-red-500' },
  orange: { text: 'text-orange-700',            dot: 'bg-orange-500' },
  yellow: { text: 'text-yellow-700',            dot: 'bg-yellow-500' },
  green:  { text: 'text-emerald-700',           dot: 'bg-emerald-500' },
  gray:   { text: 'text-muted-foreground',      dot: 'bg-gray-400' },
  muted:  { text: 'text-muted-foreground/50',   dot: 'bg-gray-300' },
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
