'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { labColor } from '@/lib/lab-color'
import { cn } from '@/lib/utils'

/**
 * 검사기관 전용 드롭다운 — 할일→검사 탭의 LabCell/LabPicker 와 동일한 시각 언어.
 * `labColor(value)` 를 트리거에 반영해 각 기관 고유 tone 의 rounded-full pill 로 렌더링.
 *
 * 설정 페이지에서 PillSelect/PillMultiSelect 대신 검사기관 필드 전용으로 사용.
 */

export interface LabOption {
  value: string
  label: string
  disabled?: boolean
}

interface LabPillSelectProps {
  value: string
  onChange: (value: string) => void
  options: LabOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function LabPillSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  'aria-label': ariaLabel,
}: LabPillSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = options.find(o => o.value === value)
  const tone = selected ? labColor(selected.value) : null

  function pick(v: string) {
    setOpen(false)
    if (v !== value) onChange(v)
  }

  return (
    <div ref={ref} className={cn('relative inline-block w-fit', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 transition-colors',
          selected
            ? cn(
                'font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap',
                tone ? cn(tone.bg, tone.text) : 'bg-muted/60 text-muted-foreground',
              )
            : 'border border-dashed border-border/80 text-muted-foreground font-mono text-[11px] uppercase tracking-[1px]',
        )}
      >
        <span>{selected?.label ?? placeholder ?? '선택'}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-sm py-1 shadow-md pointer-events-none"
          style={{ backgroundColor: 'var(--pmw-paper)', border: '1px solid var(--pmw-border-warm)' }}
        >
          {options.map(o => {
            const isCurrent = o.value === value
            const oTone = labColor(o.value)
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isCurrent}
                aria-disabled={o.disabled}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!o.disabled) pick(o.value)
                }}
                className={cn(
                  'pointer-events-auto px-md py-1.5 flex items-center gap-sm select-none transition-colors',
                  o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.8px] whitespace-nowrap',
                    oTone ? cn(oTone.bg, oTone.text) : 'bg-muted/60 text-muted-foreground',
                  )}
                >
                  {o.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto text-primary text-xs" aria-hidden="true">✓</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

interface LabPillMultiSelectProps {
  values: string[]
  onChange: (values: string[]) => void
  options: LabOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  minSelection?: number
  'aria-label'?: string
}

export function LabPillMultiSelect({
  values,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  minSelection = 0,
  'aria-label': ariaLabel,
}: LabPillMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selectedOptions = values
    .map(v => options.find(o => o.value === v))
    .filter((o): o is LabOption => !!o)

  function toggle(v: string) {
    if (values.includes(v)) {
      if (values.length <= minSelection) return
      onChange(values.filter(x => x !== v))
    } else {
      onChange([...values, v])
    }
  }

  return (
    <div ref={ref} className={cn('relative inline-block w-fit', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 transition-colors',
          selectedOptions.length === 0
            ? 'border border-dashed border-border/80 text-muted-foreground font-mono text-[11px] uppercase tracking-[1px] px-2.5 py-0.5'
            : 'px-0.5 py-0.5',
        )}
      >
        {selectedOptions.length === 0 ? (
          <span>{placeholder ?? '선택'}</span>
        ) : (
          selectedOptions.map(o => {
            const tone = labColor(o.value)
            return (
              <span
                key={o.value}
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap',
                  tone ? cn(tone.bg, tone.text) : 'bg-muted/60 text-muted-foreground',
                )}
              >
                {o.label}
              </span>
            )
          })
        )}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60 mr-1" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-sm py-1 shadow-md pointer-events-none"
          style={{ backgroundColor: 'var(--pmw-paper)', border: '1px solid var(--pmw-border-warm)' }}
        >
          {options.map(o => {
            const isSelected = values.includes(o.value)
            const isLocked = isSelected && values.length <= minSelection
            const oTone = labColor(o.value)
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
                  'pointer-events-auto px-md py-1.5 flex items-center gap-sm select-none transition-colors',
                  (o.disabled || isLocked) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60',
                )}
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
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.8px] whitespace-nowrap',
                    oTone ? cn(oTone.bg, oTone.text) : 'bg-muted/60 text-muted-foreground',
                  )}
                >
                  {o.label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
