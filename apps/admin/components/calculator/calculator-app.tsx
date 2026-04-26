'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Pencil, Search } from 'lucide-react'
import { useCalculatorData } from '@/components/providers/calculator-data-provider'
import { Calculator } from './calculator'
import { ScheduleCalculator, type ScheduleCountry } from './schedule-calculator'
import { ExternalLinks } from './external-links'
import { PageShell, PageTabs } from '@/components/ui/page-shell'
import type { ExternalLinksConfig } from '@petmove/domain'

type Mode = 'cost' | 'schedule' | 'links'

const MODES = [
  { id: 'cost', label: '비용' },
  { id: 'schedule', label: '일정' },
  { id: 'links', label: '바로가기' },
] as const satisfies ReadonlyArray<{ readonly id: Mode; readonly label: string }>

const SCHEDULE_COUNTRIES: Array<{ value: ScheduleCountry; label: string }> = [
  { value: 'japan', label: '일본' },
  { value: 'australia', label: '호주' },
  { value: 'nz', label: '뉴질랜드' },
]

export function CalculatorApp({
  initialExternalLinks,
}: {
  initialExternalLinks: ExternalLinksConfig
}) {
  const { items, setItems } = useCalculatorData()
  const [mode, setMode] = useState<Mode>('cost')

  // Cost mode toolbar state (lifted)
  const [species, setSpecies] = useState<'dog' | 'cat'>('dog')
  const [country, setCountry] = useState<string>('일본')
  const [editMode, setEditMode] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

  // Schedule mode toolbar state
  const [scheduleCountry, setScheduleCountry] = useState<ScheduleCountry>('japan')

  useEffect(() => {
    if (!dropOpen) return
    const onDown = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dropOpen])

  const countries = useMemo(() => {
    const seen = new Map<string, number>()
    for (const it of items) {
      if (it.country.includes('(고양이)')) continue
      if (!seen.has(it.country)) seen.set(it.country, it.country_order)
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n)
  }, [items])

  const filteredCountries = countries.filter((c) => c.includes(search))

  const right =
    mode === 'cost' ? (
      <>
        {/* Species segment */}
        <div className="inline-flex rounded-full border border-border/60 bg-transparent p-0.5">
          {([
            ['dog', '강아지'],
            ['cat', '고양이'],
          ] as const).map(([v, label]) => {
            const active = species === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setSpecies(v)}
                className={`h-7 rounded-full px-3 text-sm transition-colors ${
                  active
                    ? 'bg-[#D9A489] text-white dark:bg-[#C08C70]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Country dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            type="button"
            onClick={() => setDropOpen((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border bg-transparent px-3.5 text-sm transition-colors ${
              dropOpen
                ? 'border-[#D9A489] text-[#A87862] dark:border-[#C08C70] dark:text-[#D9A489]'
                : country
                ? 'border-border/60 text-foreground hover:text-foreground'
                : 'border-border/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-1 w-1 rounded-full bg-current opacity-50" aria-hidden />
            <span>{country || '목적지'}</span>
            <ChevronDown
              size={13}
              className={`transition-transform ${dropOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {dropOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
              <div className="border-b border-border p-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const first = filteredCountries[0]
                        if (first) {
                          setCountry(first)
                          setDropOpen(false)
                          setSearch('')
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setDropOpen(false)
                        setSearch('')
                      }
                    }}
                    placeholder="목적지 검색..."
                    className="h-9 w-full rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70]"
                  />
                </div>
              </div>
              <div className="scrollbar-minimal max-h-60 overflow-y-auto">
                {filteredCountries.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">검색 결과 없음</div>
                ) : (
                  filteredCountries.map((c) => {
                    const sel = c === country
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCountry(c)
                          setDropOpen(false)
                          setSearch('')
                        }}
                        className={`block w-full px-3 py-2 text-left text-[15px] transition-colors ${
                          sel
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
            editMode
              ? 'border-[#D9A489] bg-[#D9A489]/15 text-[#A87862] dark:border-[#C08C70] dark:bg-[#C08C70]/15 dark:text-[#D9A489]'
              : 'border-border/60 bg-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Pencil size={13} />
          {editMode ? '수정 완료' : '가격 수정'}
        </button>
      </>
    ) : mode === 'schedule' ? (
      <div className="inline-flex rounded-full border border-border/60 bg-transparent p-0.5">
        {SCHEDULE_COUNTRIES.map((c) => {
          const active = scheduleCountry === c.value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setScheduleCountry(c.value)}
              className={`h-7 rounded-full px-3 text-sm transition-colors ${
                active
                  ? 'bg-[#D9A489] text-white dark:bg-[#C08C70]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    ) : undefined

  return (
    <PageShell
      title="도구"
      tabs={<PageTabs tabs={MODES} value={mode} onChange={setMode} right={right} />}
    >
      {mode === 'cost' && (
        <Calculator
          items={items}
          setItems={setItems}
          species={species}
          country={country}
          editMode={editMode}
        />
      )}
      {mode === 'schedule' && <ScheduleCalculator country={scheduleCountry} />}
      {mode === 'links' && (
        <div className="px-lg">
          <ExternalLinks initialConfig={initialExternalLinks} />
        </div>
      )}
    </PageShell>
  )
}
