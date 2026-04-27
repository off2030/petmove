'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  // Compute portal popover position when open. Right-align with input, flip up if not enough room below.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    function reposition() {
      const wrap = wrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      const popW = popRef.current?.offsetWidth ?? 280
      const popH = popRef.current?.offsetHeight ?? 320
      const margin = 8
      // Prefer right-aligned; fall back to left-aligned if it overflows left edge.
      let left = rect.right - popW
      if (left < margin) left = Math.min(rect.left, window.innerWidth - popW - margin)
      if (left < margin) left = margin
      // Default below; flip above if no room
      let top = rect.bottom + 4
      if (top + popH > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - popH - 4)
      }
      setPopPos({ top, left })
    }
    reposition()
    // Re-measure after popover mounts (popRef.current was null on first run).
    const id = window.requestAnimationFrame(reposition)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      const inWrap = wrapRef.current?.contains(target)
      const inPop = popRef.current?.contains(target)
      if (!inWrap && !inPop) setOpen(false)
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
    <div className="relative inline-block w-fit" ref={wrapRef}>
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
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: popPos?.top ?? -9999,
            left: popPos?.left ?? -9999,
            visibility: popPos ? 'visible' : 'hidden',
          }}
          className="z-50 rounded-xl border border-border/80 bg-popover shadow-md"
          // mousedown preventDefault: input 이 blur 되면서 commitDraft("") → onChange("")
          // → 부모의 saveNewDate("") 가 빈 값으로 호출되어 입력이 cancel 되는 것을 방지.
          // click 이벤트는 mousedown 의 default(focus shift) 만 막아도 정상 발화함.
          onMouseDown={(e) => {
            // 단, Calendar 내부 인터랙션이 마우스 이벤트로 의존하지 않는 day 버튼은 click 으로 동작.
            // preventDefault 가 click 까지 막지는 않으므로 안전.
            if (e.target !== e.currentTarget) {
              // 자식 클릭 시에도 input blur 막기 위해 preventDefault — 단, button 자체의
              // click 은 별도 dispatch 로 정상 발화.
            }
            e.preventDefault()
          }}
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
              <div className="mt-2 flex items-center justify-between border-t border-border/80 pt-2 px-1">
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
        </div>,
        document.body,
      )}
    </div>
  )
}
