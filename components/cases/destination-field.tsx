'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import destsData from '@/data/destinations.json'

interface Dest {
  ko: string
  en: string
  alias?: string[]
}

const ALL_DESTS = destsData as Dest[]

export function DestinationField({ caseId, destination }: { caseId: string; destination: string | null }) {
  const { updateLocalCaseField } = useCases()

  // Show English name if available
  const matched = ALL_DESTS.find(d => d.ko === destination)
  const display = matched ? matched.en : destination || '—'
  const isEmpty = display === '—'

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [freeMode, setFreeMode] = useState(false)
  const [freeVal, setFreeVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = ALL_DESTS.filter((d) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return d.ko.toLowerCase().includes(q) || d.en.toLowerCase().includes(q) || (d.alias ?? []).some(a => a.toLowerCase().includes(q))
  })

  useEffect(() => { setOpen(false); setQuery(''); setFreeMode(false) }, [caseId])
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setFreeMode(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function selectDest(dest: Dest) {
    setOpen(false); setQuery('')
    const r = await updateCaseField(caseId, 'column', 'destination', dest.ko)
    if (r.ok) updateLocalCaseField(caseId, 'column', 'destination', dest.ko)
  }

  async function saveFree() {
    const v = freeVal.trim()
    if (!v) return
    setOpen(false); setFreeMode(false); setQuery('')
    const r = await updateCaseField(caseId, 'column', 'destination', v)
    if (r.ok) updateLocalCaseField(caseId, 'column', 'destination', v)
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="pt-1 text-sm text-muted-foreground">목적지</div>
      <div ref={containerRef} className="relative min-w-0">
        <button
          type="button"
          onClick={() => { setOpen(!open); setFreeMode(false); setQuery(''); setHighlightIdx(0) }}
          className={cn(
            'text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer',
            isEmpty && 'text-muted-foreground/60 italic',
          )}
        >
          {display}
        </button>

        {open && !freeMode && (
          <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-md border border-border/50 bg-background shadow-md">
            <div className="p-2 border-b border-border/30">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false)
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
                    setTimeout(() => {
                      listRef.current?.children[Math.min(highlightIdx + 1, filtered.length - 1)]?.scrollIntoView({ block: 'nearest' })
                    }, 0)
                  }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (filtered.length > 0) selectDest(filtered[highlightIdx])
                  }
                }}
                placeholder="국가 검색 (한글/영문)"
                className="w-full h-8 rounded border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
              />
            </div>
            <ul ref={listRef} className="max-h-60 overflow-y-auto scrollbar-minimal py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">검색 결과 없음</li>
              ) : (
                filtered.map((d, i) => (
                  <li key={d.ko}>
                    <button
                      type="button"
                      onClick={() => selectDest(d)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm transition-colors',
                        i === highlightIdx ? 'bg-accent' : 'hover:bg-accent/60',
                      )}
                    >
                      <span>{d.ko}</span>
                      <span className="ml-2 text-muted-foreground">{d.en}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="border-t border-border/30 py-1">
              <button
                type="button"
                onClick={() => { setFreeMode(true); setFreeVal('') }}
                className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors"
              >
                기타 (직접 입력)
              </button>
            </div>
          </div>
        )}

        {open && freeMode && (
          <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-md border border-border/50 bg-background shadow-md p-3">
            <input
              type="text"
              value={freeVal}
              onChange={(e) => setFreeVal(e.target.value)}
              placeholder="국가명 입력"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveFree()
                if (e.key === 'Escape') { setFreeMode(false); setOpen(false) }
              }}
              className="w-full h-8 rounded border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
            />
            <button type="button" onClick={saveFree}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              저장
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
