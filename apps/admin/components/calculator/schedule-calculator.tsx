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

function DaysLabel({ date }: { date: string }) {
  const d = daysFromToday(date)
  if (d === null) return null
  if (d === 0) return <span className="text-xs font-medium text-emerald-600">오늘</span>
  if (d > 0) return <span className="text-xs font-medium text-blue-600">D-{d}</span>
  return <span className="text-xs font-medium text-red-600">D+{Math.abs(d)} (경과)</span>
}

function ResultRow({ label, date, note }: { label: string; date: string; note?: string }) {
  if (!date) return null
  return (
    <div className="rounded-md bg-card px-3 py-2.5">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-medium tabular-nums">{formatDate(date)}</div>
      <div className="mt-1"><DaysLabel date={date} /></div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
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
          <div className="space-y-3">
            <div>
              <Label>광견병 항체검사일</Label>
              <DateInput value={jpTestDate} onChange={setJpTestDate} />
            </div>
            <ResultRow
              label="출국 가능일 (검사일 + 180일)"
              date={addDays(jpTestDate, 180)}
            />
          </div>

          <div className="border-t border-border/60" />

          <div className="space-y-3">
            <div>
              <Label>출국 예정일</Label>
              <DateInput value={jpDepartureDate} onChange={setJpDepartureDate} />
            </div>
            <ResultRow
              label="수입 신고 마감 (출국일 - 40일)"
              date={addDays(jpDepartureDate, -40)}
            />
          </div>
        </div>
      )}

      {country === 'australia' && (
        <div className="space-y-3">
          <div>
            <Label>출국 예정일</Label>
            <DateInput value={auDepartureDate} onChange={setAuDepartureDate} />
          </div>
          <ResultRow
            label="전염병검사 가능 시작일 (출국일 포함 45일 이내)"
            date={addDays(auDepartureDate, -44)}
            note="이 날짜부터 출국일 사이에 검사 완료 필요"
          />
          <ResultRow label="검사 마감 (출국일)" date={auDepartureDate} />
        </div>
      )}

      {country === 'nz' && (
        <div className="space-y-3">
          <div>
            <Label>출국 예정일</Label>
            <DateInput value={nzDepartureDate} onChange={setNzDepartureDate} />
          </div>
          <ResultRow
            label="전염병검사 가능일 (출국일 - 15일)"
            date={addDays(nzDepartureDate, -15)}
            note="APQA HQ + VBDDL 동시 검사"
          />
        </div>
      )}
    </div>
  )
}
