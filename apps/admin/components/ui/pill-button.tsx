import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Editorial pill 버튼. 2가지 variant.
 * - outline: 보조 액션 (역할 라벨, 링크 복사, 리셋 등)
 * - solid:   주요 액션 (초대 보내기, 제출 등)
 *
 * 기본 `type="button"` — form 안에서도 실수 submit 을 막음.
 */
type Variant = 'outline' | 'solid'

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  function PillButton({ variant = 'outline', className, type = 'button', children, ...props }, ref) {
    const styles =
      variant === 'solid'
        ? 'h-8 px-md font-serif text-[14px] bg-foreground text-background hover:bg-foreground/90'
        : 'font-serif text-[12px] px-2.5 py-0.5 border border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center gap-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          styles,
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)
