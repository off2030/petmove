'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconButton } from '@/lib/design-system'

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

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className: string
}

export function DateTextField({ value, onChange, placeholder = 'YYYY-MM-DD', className }: Props) {
  const [draft, setDraft] = useState(value)
  const pickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        maxLength={10}
        placeholder={placeholder}
        className={`${className} pr-12`}
        onChange={(e) => {
          const next = normalizeDateInput(e.target.value)
          setDraft(next)
          if (next.length === 10 && isValidDateInput(next)) {
            onChange(next)
          } else if (next.length === 0) {
            onChange('')
          }
        }}
        onBlur={() => {
          if (!draft) {
            onChange('')
            return
          }
          if (isValidDateInput(draft)) {
            onChange(draft)
            return
          }
          setDraft(value)
        }}
      />
      <input
        ref={pickerRef}
        type="date"
        min="1900-01-01"
        max="2100-12-31"
        value={value}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          onChange(next)
        }}
      />
      <button
        type="button"
        aria-label="달력에서 날짜 선택"
        className={cn(iconButton, 'absolute right-1 top-1/2 -translate-y-1/2 border-transparent bg-transparent')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const input = pickerRef.current
          if (!input) return
          if (typeof input.showPicker === 'function') {
            input.showPicker()
            return
          }
          input.focus()
          input.click()
        }}
      >
        <Calendar size={18} />
      </button>
    </div>
  )
}
