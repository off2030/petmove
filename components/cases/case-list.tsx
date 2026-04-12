'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CaseRow } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { useCases } from './cases-context'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

/**
 * Left-pane list. Everything is client-side:
 *   - live multi-term search (space-separated terms, AND semantics)
 *   - searches across every scalar field in the row (identity + data jsonb)
 *   - progressive rendering: 100 rows first, +100 on scroll
 */
export function CaseList() {
  const { cases, selectedId, selectCase } = useCases()

  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(INITIAL_VISIBLE)

  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
  }, [query])

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return cases
    return cases.filter((c) => {
      const hay = buildSearchString(c).toLowerCase()
      for (const t of terms) {
        if (!hay.includes(t)) return false
      }
      return true
    })
  }, [cases, query])

  const visibleCases = filtered.slice(0, visible)

  // Infinite scroll via intersection observer
  const sentinelRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visible < filtered.length) {
          setVisible((v) => Math.min(v + LOAD_MORE_STEP, filtered.length))
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible, filtered.length])

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Search bar with magnifier icon */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="pl-9"
        />
      </div>

      {/* Scrollable list — minimal scrollbar (thin, subtle, drag-able) */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal -mx-3">
        {visibleCases.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            결과가 없습니다
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visibleCases.map((c) => {
              const isSelected = c.id === selectedId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectCase(c.id)}
                    className={cn(
                      'block w-full rounded-md px-3 py-3 text-left transition-colors',
                      'hover:bg-accent/60',
                      isSelected && 'bg-accent',
                    )}
                  >
                    {/* Proportional grid:
                        customer : pet : dest = 6 : 5 : 5  (fr units)
                        microchip stays fixed (needs exact space for 19 chars)
                        minmax(0, Nfr) lets columns shrink with truncation. */}
                    <div className="grid grid-cols-[minmax(0,6fr)_minmax(0,5fr)_minmax(0,5fr)_168px] items-baseline gap-2 text-sm">
                      <span className="truncate font-medium">
                        {c.customer_name}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {c.pet_name ?? '—'}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {c.destination ?? '—'}
                      </span>
                      <span className="font-mono text-muted-foreground/80 tabular-nums">
                        {c.microchip ?? '미등록'}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
            {visible < filtered.length && (
              <li ref={sentinelRef} className="h-10" />
            )}
          </ul>
        )}
      </div>

      {/* Result count at bottom */}
      <div className="shrink-0 px-1 pt-2 text-xs text-muted-foreground">
        {filtered.length.toLocaleString()}건
      </div>
    </div>
  )
}

/**
 * Flatten a case row into one string we can case-insensitive substring match.
 * Includes regular columns + every scalar value in the data jsonb.
 */
function buildSearchString(c: CaseRow): string {
  const parts: string[] = [
    c.customer_name,
    c.customer_name_en ?? '',
    c.pet_name ?? '',
    c.pet_name_en ?? '',
    c.microchip ?? '',
    ...(c.microchip_extra ?? []),
    c.destination ?? '',
    c.status,
  ]
  if (c.data && typeof c.data === 'object') {
    for (const v of Object.values(c.data as Record<string, unknown>)) {
      if (v === null || v === undefined) continue
      if (typeof v === 'object') {
        parts.push(JSON.stringify(v))
      } else {
        parts.push(String(v))
      }
    }
  }
  return parts.join(' ')
}
