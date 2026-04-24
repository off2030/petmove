import { cn } from '@/lib/utils'

/**
 * Editorial 페이지 타이틀. 설정/상세/서브페이지 최상단 h2.
 * 예: <SectionHeader>약품</SectionHeader>
 */
export function SectionHeader({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <Tag className={cn('font-serif text-[28px] leading-tight text-foreground', className)}>
      {children}
    </Tag>
  )
}
