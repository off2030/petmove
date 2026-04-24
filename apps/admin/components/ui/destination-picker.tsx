'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { COUNTRY_CODE_MAP, destCode } from '@/lib/country-code'
import { cn } from '@/lib/utils'

/**
 * 목적지 검색형 multi-select combobox.
 * - 입력 = `COUNTRY_CODE_MAP` 기준으로만 선택 (오타·유효하지 않은 값 차단).
 * - 선택된 항목은 tan pill (MONO code + Serif 이름) — 할일→검사 탭의 DestinationCell 과 동일.
 * - 키보드: ↓↑ 네비, Enter 선택, Backspace(빈 input) 마지막 chip 제거, Esc 닫기.
 */

const ALL_DESTINATIONS = Object.keys(COUNTRY_CODE_MAP)

interface DestinationPickerProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** 선택된 칩을 컨테이너 안에 표시하지 않음. 외부에서 별도 렌더링 할 때 사용. */
  hideSelectedChips?: boolean
  /** `box` (기본) = border + paper bg / `underline` = 바닥 밑줄만. */
  variant?: 'box' | 'underline'
  'aria-label'?: string
}

export function DestinationPicker({
  values,
  onChange,
  placeholder = '목적지 검색',
  disabled,
  className,
  hideSelectedChips,
  variant = 'box',
  'aria-label': ariaLabel,
}: DestinationPickerProps) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase()
    const selected = new Set(values)
    return ALL_DESTINATIONS.filter(d => {
      if (selected.has(d)) return false
      if (q === '') return true
      if (d.toLowerCase().includes(q)) return true
      const code = destCode(d)?.toLowerCase()
      return code ? code.includes(q) : false
    }).slice(0, 40)
  }, [input, values])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setInput('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    setHighlightIdx(0)
  }, [input])

  function addValue(v: string) {
    if (values.includes(v)) return
    onChange([...values, v])
    setInput('')
    setHighlightIdx(0)
    inputRef.current?.focus()
  }

  function removeValue(v: string) {
    onChange(values.filter(x => x !== v))
    inputRef.current?.focus()
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIdx(i => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[highlightIdx]
      if (pick) addValue(pick)
    } else if (e.key === 'Backspace' && input === '' && values.length > 0) {
      removeValue(values[values.length - 1])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setInput('')
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const isUnderline = variant === 'underline'

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative min-h-[2.25rem] flex flex-wrap items-center gap-1.5 cursor-text',
        isUnderline
          ? 'border-b px-0.5 py-1'
          : 'rounded-sm border px-1.5 py-1',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      style={{
        borderColor: 'var(--pmw-border-warm)',
        ...(isUnderline ? {} : { backgroundColor: 'var(--pmw-paper)' }),
      }}
      onClick={() => {
        if (disabled) return
        inputRef.current?.focus()
        setOpen(true)
      }}
    >
      {!hideSelectedChips && values.map(v => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-[12px] whitespace-nowrap"
          style={{
            borderColor: 'var(--pmw-border-warm)',
            color: 'var(--pmw-near-black)',
          }}
        >
          {v}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeValue(v)
            }}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label={`${v} 제거`}
            tabIndex={-1}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        disabled={disabled}
        onChange={(e) => {
          setInput(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={hideSelectedChips || values.length === 0 ? placeholder : ''}
        aria-label={ariaLabel ?? '목적지 검색'}
        className="flex-1 min-w-[120px] bg-transparent outline-none border-0 font-sans text-[13.5px] pmw-st__input px-1"
      />

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 w-full max-h-64 overflow-auto rounded-sm py-1 shadow-md"
          style={{
            backgroundColor: 'var(--pmw-paper)',
            border: '1px solid var(--pmw-border-warm)',
          }}
        >
          {filtered.length === 0 ? (
            <li className="px-md py-2 font-serif italic text-[13px] text-muted-foreground">
              일치하는 목적지가 없습니다
            </li>
          ) : (
            filtered.map((d, i) => {
              const code = destCode(d)
              const isHighlighted = i === highlightIdx
              return (
                <li
                  key={d}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    addValue(d)
                  }}
                  className={cn(
                    'cursor-pointer px-md py-1.5 flex items-baseline gap-2.5 select-none transition-colors',
                    isHighlighted && 'bg-accent/60',
                  )}
                >
                  <span className="font-mono text-[11px] uppercase tracking-[1px] text-[#7B7B5F] w-6 shrink-0">
                    {code ?? ''}
                  </span>
                  <span className="font-serif text-[14px]" style={{ color: 'var(--pmw-near-black)' }}>
                    {d}
                  </span>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
