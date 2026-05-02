'use client'

import { cn } from '@/lib/utils'

type Size = 'sm' | 'md'

interface CheckboxProps {
  checked: boolean
  onChange?: (next: boolean) => void
  disabled?: boolean
  /** sm = 14px (compact, 본문 inline), md = 22px (default, list item) */
  size?: Size
  className?: string
  /** Accessible label */
  label?: string
}

/**
 * 통일 체크박스 — 앱 전역에서 동일 외형 + 토큰 기반 색상.
 *
 * 디자인:
 * - 비활성: border-foreground/40, bg-transparent
 * - 활성: bg-pmw-accent + border-pmw-accent, ✓ pmw-accent-foreground
 * - 사이즈 sm/md 두 가지만 노출 — 다른 사이즈는 className 으로 override (지양)
 */
export function Checkbox({ checked, onChange, disabled, size = 'md', className, label }: CheckboxProps) {
  const dim = size === 'sm' ? 'w-3.5 h-3.5 rounded-sm' : 'h-[22px] w-[22px] rounded-[3px]'
  const checkSize = size === 'sm' ? 10 : 14
  const stroke = size === 'sm' ? 1.6 : 1.8

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'inline-flex items-center justify-center border transition-colors shrink-0',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        dim,
        checked
          ? 'bg-pmw-accent border-pmw-accent'
          : 'border-foreground/40 bg-transparent hover:border-foreground/60',
        className,
      )}
    >
      {checked && (
        <svg
          width={checkSize}
          height={checkSize}
          viewBox="0 0 12 12"
          fill="none"
          className="text-pmw-accent-foreground"
          aria-hidden
        >
          <path
            d="M2.5 6L5 8.5L9.5 4"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
