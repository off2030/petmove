'use client'

import { cn } from '@/lib/utils'

/**
 * 리스트 행 공통 클래스 — 도구/할일/홈 등 모든 리스트의 한 줄.
 *   - 하단 hairline (마지막 행 제외)
 *   - px-lg: 페이지 패딩과 동일
 *   - py-4: 행 여백
 *   - transition-colors: hover 부드럽게
 *
 * 직접 li/button 으로 감싸는 경우(메모이즈, 키보드 내비 등) 클래스를 그대로 합성.
 * 단순 div 행은 아래 `<ListRow>` 사용.
 */
export const LIST_ROW_BASE =
  'border-b border-border/80 last:border-b-0 px-lg py-4 transition-colors'

export const LIST_ROW_INTERACTIVE = 'cursor-pointer hover:bg-accent'

/**
 * 단순 div 기반 리스트 행. 체크박스나 토글처럼 행 전체가 클릭 타깃이지만
 * 시맨틱 button 이 필요 없는 경우.
 *
 * 키보드 내비/메모이즈가 필요한 고밀도 리스트(고객 목록 등)는
 * `LIST_ROW_BASE` 상수만 가져다 li/button 으로 감싼다.
 */
export function ListRow({
  selected,
  highlighted,
  accent,
  interactive = true,
  onClick,
  className,
  children,
}: {
  selected?: boolean
  highlighted?: boolean
  accent?: boolean
  interactive?: boolean
  onClick?: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        LIST_ROW_BASE,
        interactive && LIST_ROW_INTERACTIVE,
        selected && 'bg-accent',
        highlighted && 'bg-accent/70',
        accent && !selected && 'bg-primary/5',
        className,
      )}
    >
      {children}
    </div>
  )
}
