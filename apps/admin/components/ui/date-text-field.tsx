'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconButton } from '@/lib/design-system'
import { Calendar } from './calendar'

function normalizeDateInput(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [yearStr, monthStr, dayStr] = value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (year < 1900 || year > 2100) return false
  if (month < 1 || month > 12) return false
  const maxDay = new Date(year, month, 0).getDate()
  return day >= 1 && day <= maxDay
}

function parseDate(value: string): Date | undefined {
  if (!isValidDateInput(value)) return undefined
  // Local timezone parsing — avoid UTC shift
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDateToStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Focus the input on mount (editor contexts). */
  autoFocus?: boolean
  /** Called after the internal blur-commit has run (used by editors to exit edit mode). */
  onBlur?: () => void
  /** Forwarded onKeyDown — runs before the internal Enter handler. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** Size preset. `sm` is used by dense editor rows (todo tables, etc.). */
  size?: 'default' | 'sm'
}

export function DateTextField({
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  className,
  autoFocus,
  onBlur: onBlurExt,
  onKeyDown,
  size = 'default',
}: Props) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectedDate = parseDate(value)
  const iconSize = size === 'sm' ? 14 : 18

  function commitDraft() {
    if (!draft) {
      onChange('')
      return
    }
    if (isValidDateInput(draft)) {
      onChange(draft)
      return
    }
    setDraft(value)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={draft}
        maxLength={10}
        placeholder={placeholder}
        className={cn(className, size === 'sm' ? 'pr-8' : 'pr-12')}
        onChange={(e) => {
          const next = normalizeDateInput(e.target.value)
          setDraft(next)
          if (next.length === 10 && isValidDateInput(next)) {
            onChange(next)
          } else if (next.length === 0) {
            onChange('')
          }
        }}
        onKeyDown={(e) => {
          if (onKeyDown) onKeyDown(e)
          if (e.defaultPrevented) return
          if (e.key === 'Enter') {
            e.preventDefault()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(value)
            inputRef.current?.blur()
          }
        }}
        onBlur={() => {
          commitDraft()
          // Delay so popover-inside clicks don't cause premature editor exit
          setTimeout(() => onBlurExt?.(), 150)
        }}
      />
      <button
        type="button"
        aria-label="달력에서 날짜 선택"
        className={cn(
          iconButton,
          'absolute top-1/2 -translate-y-1/2 border-transparent bg-transparent',
          size === 'sm' ? 'right-0.5 h-6 w-6' : 'right-1',
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((p) => !p)}
      >
        <CalendarIcon size={iconSize} />
      </button>
      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-[calc(100%+4px)] z-50 rounded-xl border border-border/60 bg-popover shadow-md"
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (d) {
                const s = formatDateToStr(d)
                setDraft(s)
                onChange(s)
                setOpen(false)
                setTimeout(() => inputRef.current?.blur(), 0)
              } else {
                setDraft('')
                onChange('')
              }
            }}
            defaultMonth={selectedDate ?? new Date()}
            footer={
              <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 px-1">
                <button
                  type="button"
                  className="font-serif italic text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setDraft('')
                    onChange('')
                    setOpen(false)
                    setTimeout(() => inputRef.current?.blur(), 0)
                  }}
                >
                  삭제
                </button>
                <button
                  type="button"
                  className="font-serif italic text-[13px] text-[#6B6A3F] dark:text-[#B8B38A] hover:text-foreground transition-colors"
                  onClick={() => {
                    const s = formatDateToStr(new Date())
                    setDraft(s)
                    onChange(s)
                    setOpen(false)
                    setTimeout(() => inputRef.current?.blur(), 0)
                  }}
                >
                  오늘
                </button>
              </div>
            }
          />
        </div>
      )}
    </div>
  )
}
