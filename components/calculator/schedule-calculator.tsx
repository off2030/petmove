'use client'

import { useState } from 'react'

type Country = 'japan' | 'australia' | 'nz'

const COUNTRIES: Array<{ value: Country; label: string }> = [
  { value: 'japan', label: '일본' },
  { value: 'australia', label: '호주' },
  { value: 'nz', label: '뉴질랜드' },
]

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
  if (d === 0) return <span className="text-emerald-600 font-medium">오늘</span>
  if (d > 0) return <span className="text-blue-600">D-{d}</span>
  return <span className="text-red-600">D+{Math.abs(d)} (경과)</span>
}

function ResultRow({ label, date, note }: { label: string; date: string; note?: string }) {
  if (!date) return null
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold tabular-nums">{formatDate(date)}</span>
        <DaysLabel date={date} />
      </div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-foreground"
    />
  )
}

export function ScheduleCalculator() {
  const [country, setCountry] = useState<Country>('japan')

  // Japan inputs
  const [jpTestDate, setJpTestDate] = useState('')
  const [jpDepartureDate, setJpDepartureDate] = useState('')
  // AU input
  const [auDepartureDate, setAuDepartureDate] = useState('')
  // NZ input
  const [nzDepartureDate, setNzDepartureDate] = useState('')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">일정 계산기</h1>
        <p className="mt-1 text-sm text-muted-foreground">국가별 검사·신고 일정을 계산합니다</p>
      </div>

      {/* Country */}
      <div className="flex gap-2">
        {COUNTRIES.map((c) => {
          const active = country === c.value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setCountry(c.value)}
              className={`flex-1 rounded-lg border-2 px-3 py-3 text-sm font-bold transition ${
                active
                  ? 'border-foreground bg-foreground/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/40'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {country === 'japan' && (
        <div className="space-y-5">
          <section className="space-y-3">
            <Field label="광견병 항체검사일">
              <DateInput value={jpTestDate} onChange={setJpTestDate} />
            </Field>
            <ResultRow
              label="출국 가능일 (검사일 + 180일)"
              date={addDays(jpTestDate, 180)}
              note="이 날짜부터 일본 출국 가능"
            />
          </section>

          <div className="border-t border-border" />

          <section className="space-y-3">
            <Field label="출국 예정일">
              <DateInput value={jpDepartureDate} onChange={setJpDepartureDate} />
            </Field>
            <ResultRow
              label="수입 신고 마감 (출국일 - 40일)"
              date={addDays(jpDepartureDate, -40)}
              note="이 날짜까지 일본 동물검역소에 사전 신고 완료"
            />
          </section>
        </div>
      )}

      {country === 'australia' && (
        <div className="space-y-3">
          <Field label="출국 예정일">
            <DateInput value={auDepartureDate} onChange={setAuDepartureDate} />
          </Field>
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
          <Field label="출국 예정일">
            <DateInput value={nzDepartureDate} onChange={setNzDepartureDate} />
          </Field>
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
