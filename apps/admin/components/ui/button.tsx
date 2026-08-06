import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'ghost' | 'secondary'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClass: Record<Variant, string> = {
  // 비활성은 회색으로 — 투명도만 낮추면 브랜드 하늘색이 옅어서 활성과 구분이 안 된다
  // (로그인 '인증번호 받기' 가 눌리는데도 꺼져 보인다는 보고, 2026-08-06).
  default:
    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground/60 disabled:opacity-100',
  outline:
    'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/80',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-sm text-xs',
  md: 'h-9 px-md text-sm',
  lg: 'h-10 px-5 text-base',
  icon: 'h-9 w-9',
}

export function buttonClass({
  variant = 'default',
  size = 'md',
  className,
}: {
  variant?: Variant
  size?: Size
  className?: string
} = {}) {
  return cn(
    'inline-flex items-center justify-center gap-sm rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none',
    variantClass[variant],
    sizeClass[size],
    className,
  )
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonClass({ variant, size, className })}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
