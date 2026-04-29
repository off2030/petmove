'use client'

import { useState } from 'react'
import { DateTextField } from '@/components/ui/date-text-field'

export type ScheduleCountry = 'japan' | 'australia' | 'nz'

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${dateStr} (${weekdays[d.getDay()]})`
}

function daysFromToday(dateStr: string): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  if (isNaN(target.getTime())) return null
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function InlineResult({ label, date }: { label?: string; date: string }) {
  if (!date) return null
  const d = daysFromToday(date)
  let dText = ''
  let dClass = 'text-muted-foreground'
  if (d !== null) {
    if (d === 0) {
      dText = '오늘'
      dClass = 'text-emerald-600'
    } else if (d > 0) {
      dText = `D-${d}`
      dClass = 'text-blue-600'
    } else {
      dText = `D+${Math.abs(d)} (경과)`
      dClass = 'text-red-600'
    }
  }
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-sm">
      {label && (
        <>
          <span className="text-muted-foreground">{label}</span>
          <span className="text-muted-foreground/40">/</span>
        </>
      )}
      <span className="font-medium tabular-nums">{formatDate(date)}</span>
      <span className="text-muted-foreground/40">/</span>
      <span className={`font-medium ${dClass}`}>{dText}</span>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block text-sm font-medium text-muted-foreground">{children}</span>
}

const dateInputClass =
  'w-full h-10 rounded-md border border-border bg-card px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors'

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <DateTextField value={value} onChange={onChange} className={dateInputClass} />
}

interface ResultSpec {
  label?: string
  date: string
  note?: string
}

function InputBlock({
  inputLabel,
  inputValue,
  onChange,
  results,
}: {
  inputLabel: string
  inputValue: string
  onChange: (v: string) => void
  results: ResultSpec[]
}) {
  return (
    <div>
      <Label>{inputLabel}</Label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[14rem] flex-1">
          <DateInput value={inputValue} onChange={onChange} />
        </div>
        {results.some((r) => r.date) && (
          <div className="flex flex-col gap-1.5">
            {results.map((r, i) => (
              <div key={i}>
                <InlineResult label={r.label} date={r.date} />
                {r.note && r.date && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{r.note}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  country: ScheduleCountry
}

export function ScheduleCalculator({ country }: Props) {
  const [jpTestDate, setJpTestDate] = useState('')
  const [jpDepartureDate, setJpDepartureDate] = useState('')
  const [auDepartureDate, setAuDepartureDate] = useState('')
  const [nzDepartureDate, setNzDepartureDate] = useState('')

  return (
    <div className="rounded-xl bg-card p-md">
      {country === 'japan' && (
        <div className="space-y-5">
          <InputBlock
            inputLabel="광견병 항체검사일"
            inputValue={jpTestDate}
            onChange={setJpTestDate}
            results={[{ label: '출국 가능일', date: addDays(jpTestDate, 180) }]}
          />

          <div className="border-t border-border/80" />

          <InputBlock
            inputLabel="출국 예정일"
            inputValue={jpDepartureDate}
            onChange={setJpDepartureDate}
            results={[{ label: '신고 마감일', date: addDays(jpDepartureDate, -40) }]}
          />
        </div>
      )}

      {country === 'australia' && (
        <InputBlock
          inputLabel="출국 예정일"
          inputValue={auDepartureDate}
          onChange={setAuDepartureDate}
          results={[{ label: '전염병검사일', date: addDays(auDepartureDate, -44) }]}
        />
      )}

      {country === 'nz' && (
        <InputBlock
          inputLabel="출국 예정일"
          inputValue={nzDepartureDate}
          onChange={setNzDepartureDate}
          results={[
            {
              label: '전염병검사일',
              date: addDays(nzDepartureDate, -15),
            },
          ]}
        />
      )}
    </div>
  )
}
