'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Editorial-styled dropdown — 네이티브 `<select>` 의 파란 하이라이트·OS 차이를 제거하고
 * PMW 토큰(parchment/clay-soft/warm border) 위에 일관된 룩을 유지.
 *
 * Variants:
 * - `pill` (기본): rounded-full, warm border, bg-background/60. 필드 행 값 입력용.
 * - `chip`: clay-soft 배경 + deep text. 규칙 행 우측 기관 선택 같은 inline chip.
 * - `ghost`: dotted border + olive-gray text. "+ 추가" 등 보조 선택.
 */

export interface PillSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface PillSelectProps {
  value: string
  onChange: (value: string) => void
  options: PillSelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  menuClassName?: string
  variant?: 'pill' | 'chip' | 'ghost'
  /** 메뉴 너비를 버튼에 맞추지 않고 컨텐츠에 맞춤. */
  menuAutoWidth?: boolean
  'aria-label'?: string
  title?: string
}

export function PillSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  menuClassName,
  variant = 'pill',
  menuAutoWidth,
  'aria-label': ariaLabel,
  title,
}: PillSelectProps) {
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    function onDocMouse(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouse)
    return () => document.removeEventListener('mousedown', onDocMouse)
  }, [open])

  function openMenu() {
    if (disabled) return
    setOpen(true)
    const idx = options.findIndex(o => o.value === value)
    setHighlightIdx(idx >= 0 ? idx : 0)
  }

  function commit(idx: number) {
    const opt = options[idx]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => {
        let next = i
        do {
          next = Math.min(options.length - 1, next + 1)
        } while (options[next]?.disabled && next < options.length - 1)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => {
        let next = i
        do {
          next = Math.max(0, next - 1)
        } while (options[next]?.disabled && next > 0)
        return next
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0) commit(highlightIdx)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlightIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlightIdx(options.length - 1)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const buttonBase =
    'inline-flex items-center gap-1 transition-colors outline-none disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-foreground/20'

  const variantBtn =
    variant === 'pill'
      ? 'h-8 pl-md pr-2 rounded-full border border-border/60 bg-background/60 hover:bg-muted/40 pmw-st__input'
      : variant === 'chip'
      ? 'px-2 py-0.5 rounded-sm pmw-st__chip'
      : 'px-2 py-0.5 rounded-sm border border-dotted text-[11px] font-sans'

  const variantStyle =
    variant === 'ghost'
      ? { borderColor: 'var(--pmw-border-warm)', color: 'var(--pmw-olive-gray)' }
      : undefined

  return (
    <div ref={containerRef} className={cn('relative inline-block w-fit', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
        className={cn(buttonBase, variantBtn)}
        style={variantStyle}
      >
        <span className="truncate">
          {selected?.label ?? (
            <span style={{ color: 'var(--pmw-stone-gray)' }}>{placeholder ?? '선택'}</span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        // pointer-events-none 으로 ul 배경이 밑의 버튼을 가리지 않게 함.
        // 아이템 li 만 pointer-events-auto. 이렇게 해야 메뉴가 "규칙 추가" 같은
        // 버튼 위를 덮었을 때도 버튼 클릭이 가려지지 않는다.
        <ul
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 rounded-sm py-1 shadow-md max-h-64 overflow-auto pointer-events-none',
            menuAutoWidth ? 'w-max' : 'min-w-full w-max',
            menuClassName,
          )}
          style={{
            backgroundColor: 'var(--pmw-paper)',
            border: '1px solid var(--pmw-border-warm)',
          }}
          onMouseLeave={() => setHighlightIdx(-1)}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value
            const isHighlighted = i === highlightIdx
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled}
                onMouseEnter={() => !o.disabled && setHighlightIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!o.disabled) commit(i)
                }}
                className={cn(
                  'pointer-events-auto px-md py-1.5 font-sans text-[13.5px] whitespace-nowrap select-none transition-colors',
                  o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                  isHighlighted && !o.disabled ? 'bg-accent/60' : '',
                )}
                style={{
                  color: isSelected ? 'var(--pmw-deep)' : 'var(--pmw-near-black)',
                  fontWeight: isSelected ? 500 : 400,
                }}
              >
                {o.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
