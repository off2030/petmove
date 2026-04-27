'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PillSelectOption } from './pill-select'

/**
 * 다중 선택 드롭다운. `PillSelect` 와 같은 pill 쉐입(rounded-full + warm border + bg-background/60).
 * 메뉴는 각 항목을 체크박스 토글로 다루며, 선택해도 닫히지 않고, 외부 클릭 시 닫힘.
 *
 * 사용처: 전염병검사 규칙 등 한 규칙에 복수 기관을 매핑해야 하는 경우.
 * 최소 1개 선택을 강제하려면 `minSelection={1}` 로 설정 → 마지막 하나는 해제 못 하게 막음.
 */

interface PillMultiSelectProps {
  values: string[]
  onChange: (values: string[]) => void
  options: PillSelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  minSelection?: number
  'aria-label'?: string
  title?: string
}

export function PillMultiSelect({
  values,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  minSelection = 0,
  'aria-label': ariaLabel,
  title,
}: PillMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const selectedLabels = values
    .map(v => options.find(o => o.value === v)?.label ?? v)
    .join(', ')

  useEffect(() => {
    if (!open) return
    function onDocMouse(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouse)
    return () => document.removeEventListener('mousedown', onDocMouse)
  }, [open])

  function toggle(value: string) {
    if (values.includes(value)) {
      if (values.length <= minSelection) return
      onChange(values.filter(v => v !== value))
    } else {
      onChange([...values, value])
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

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
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKey}
        className={cn(
          'inline-flex items-center gap-1 transition-colors outline-none disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-foreground/20',
          'h-8 pl-md pr-2 rounded-full border border-border/80 bg-background/60 hover:bg-muted/40 pmw-st__input',
        )}
      >
        <span className="truncate">
          {selectedLabels || (
            <span style={{ color: 'var(--pmw-stone-gray)' }}>{placeholder ?? '선택'}</span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 mt-1 rounded-sm py-1 shadow-md max-h-64 overflow-auto min-w-full w-max pointer-events-none"
          style={{
            backgroundColor: 'var(--pmw-paper)',
            border: '1px solid var(--pmw-border-warm)',
          }}
        >
          {options.map((o) => {
            const isSelected = values.includes(o.value)
            const isLocked = isSelected && values.length <= minSelection
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || isLocked}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!o.disabled && !isLocked) toggle(o.value)
                }}
                className={cn(
                  'pointer-events-auto flex items-center gap-2 px-md py-1.5 font-sans text-[13.5px] whitespace-nowrap select-none transition-colors',
                  (o.disabled || isLocked) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60',
                )}
                style={{
                  color: isSelected ? 'var(--pmw-deep)' : 'var(--pmw-near-black)',
                  fontWeight: isSelected ? 500 : 400,
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border"
                  style={{
                    borderColor: isSelected ? 'var(--pmw-deep)' : 'var(--pmw-border-warm)',
                    backgroundColor: isSelected ? 'var(--pmw-deep)' : 'transparent',
                  }}
                >
                  {isSelected && <Check size={10} color="white" strokeWidth={3} />}
                </span>
                {o.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
