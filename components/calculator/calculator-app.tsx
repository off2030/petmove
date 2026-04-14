'use client'

import { useMemo, useState } from 'react'
import { calculate, COUNTRIES, type CalcResult } from '@/lib/calculator-rules'

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const wd = weekdays[d.getDay()]
  return `${y}-${m}-${day} (${wd})`
}

function daysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function DaysLabel({ date }: { date: string }) {
  const days = daysFromToday(date)
  if (days === 0) return <span className="text-emerald-600 font-medium">오늘</span>
  if (days > 0) return <span className="text-blue-600">D-{days}</span>
  return <span className="text-red-600">D+{Math.abs(days)} (경과)</span>
}

function ResultCard({ result }: { result: CalcResult }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="text-sm text-muted-foreground mb-1">{result.label}</div>
      <div className="text-lg font-semibold flex items-center gap-3">
        {formatDate(result.date)}
        <DaysLabel date={result.date} />
      </div>
      <div className="text-xs text-muted-foreground mt-1">{result.description}</div>
    </div>
  )
}

export function CalculatorApp() {
  const [country, setCountry] = useState('japan')
  const [departureDate, setDepartureDate] = useState('')
  const [testDate, setTestDate] = useState('')

  const results = useMemo(() => {
    if (!departureDate && !testDate) return []
    return calculate({ country, departureDate, testDate })
  }, [country, departureDate, testDate])

  return (
    <div className="h-full flex items-start justify-center pt-20 px-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-xl font-semibold">일정 계산기</h1>

        {/* Country select */}
        <div>
          <label className="block text-sm text-muted-foreground mb-1">국가</label>
          <div className="flex gap-2">
            {COUNTRIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCountry(c.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  country === c.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">출발 예정일</label>
            <input
              type="date"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">채혈일 (항체가 검사)</label>
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="text-sm font-medium text-muted-foreground">계산 결과</div>
            {results.map((r) => (
              <ResultCard key={r.label} result={r} />
            ))}
          </div>
        )}

        {results.length === 0 && (departureDate || testDate) && (
          <div className="text-sm text-muted-foreground text-center py-4">
            날짜를 입력하면 결과가 표시됩니다
          </div>
        )}
      </div>
    </div>
  )
}
