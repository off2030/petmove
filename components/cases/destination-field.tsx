'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import destsData from '@/data/destinations.json'
import { destColor } from '@/lib/destination-color'
import { CopyButton } from './copy-button'

interface Dest {
  ko: string
  en: string
  alias?: string[]
}

const ALL_DESTS = destsData as Dest[]

/** Parse comma-separated destination string into array */
function parseDests(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** Join destination array back to string */
function joinDests(arr: string[]): string | null {
  return arr.length > 0 ? arr.join(', ') : null
}

export function DestinationField({ caseId, destination }: { caseId: string; destination: string | null }) {
  const { updateLocalCaseField, activeDestination, setActiveDestination } = useCases()

  const selected = parseDests(destination)
  const multi = selected.length > 1

  // Display: show English names
  const display = selected.length > 0
    ? selected.map(ko => {
        const matched = ALL_DESTS.find(d => d.ko === ko)
        return matched ? matched.en : ko
      }).join(', ')
    : '—'
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

  async function toggleDest(dest: Dest) {
    let next: string[]
    if (selected.includes(dest.ko)) {
      next = selected.filter(s => s !== dest.ko)
    } else {
      next = [...selected, dest.ko]
    }
    const val = joinDests(next)
    // Optimistic update first
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await updateCaseField(caseId, 'column', 'destination', val)
  }

  async function removeDest(ko: string) {
    const next = selected.filter(s => s !== ko)
    const val = joinDests(next)
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await updateCaseField(caseId, 'column', 'destination', val)
  }

  async function saveFree() {
    const v = freeVal.trim()
    if (!v) return
    setFreeMode(false); setQuery('')
    const next = selected.includes(v) ? selected : [...selected, v]
    const val = joinDests(next)
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await updateCaseField(caseId, 'column', 'destination', val)
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
      <div className="flex items-center gap-xs pt-1">
        <span className="text-base text-primary">목적지</span>
        <button
          type="button"
          onClick={() => { setOpen(!open); setFreeMode(false); setQuery(''); setHighlightIdx(0) }}
          className="text-muted-foreground/40 hover:text-foreground text-lg font-semibold leading-none transition-colors"
          title="목적지 추가"
        >
          +
        </button>
      </div>
      <div ref={containerRef} className="relative min-w-0">
        {selected.length > 0 ? (
          <div className="group/val inline-flex items-center gap-xs flex-wrap">
            {selected.map((ko) => {
              const tone = destColor(ko)
              const isActive = multi && (activeDestination ?? selected[0]) === ko
              return (
                <span
                  key={ko}
                  className={cn(
                    'group/chip inline-flex items-center gap-1 rounded px-2 py-1 text-base font-medium transition-all',
                    tone.bg, tone.text,
                    multi && !isActive && 'opacity-50 hover:opacity-80',
                    isActive && 'ring-2 ring-offset-1 ring-current',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => { if (multi) setActiveDestination(ko) }}
                    className="text-base cursor-pointer"
                    title={multi ? '클릭하여 이 국가 항목 보기' : undefined}
                  >
                    {ko}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeDest(ko) }}
                    className="opacity-0 group-hover/chip:opacity-70 hover:!opacity-100 leading-none text-base transition-opacity"
                    title="삭제"
                  >
                    ×
                  </button>
                </span>
              )
            })}
            <CopyButton value={display} className="opacity-0 group-hover/val:opacity-100" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setOpen(!open); setFreeMode(false); setQuery(''); setHighlightIdx(0) }}
            className="text-left rounded-md px-2 py-1 -mx-2 text-base text-primary/60 transition-colors hover:bg-accent/60 cursor-pointer"
          >
            —
          </button>
        )}

        {open && !freeMode && (
          <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-md border border-border/50 bg-background shadow-md">
            <div className="p-2 border-b border-border/30">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0) }}
                onKeyDown={async (e) => {
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
                    if (filtered.length > 0) {
                      await toggleDest(filtered[highlightIdx])
                      setOpen(false); setQuery('')
                    }
                  }
                }}
                placeholder="국가 검색 (한글/영문)"
                className="w-full h-8 rounded border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
              />
            </div>
            <ul ref={listRef} className="max-h-60 overflow-y-auto scrollbar-minimal py-1">
              {filtered.length === 0 ? (
                <li className="px-sm py-2 text-sm text-muted-foreground">검색 결과 없음</li>
              ) : (
                filtered.map((d, i) => {
                  const isSelected = selected.includes(d.ko)
                  return (
                    <li key={d.ko}>
                      <button
                        type="button"
                        onClick={async () => { await toggleDest(d); setOpen(false); setQuery('') }}
                        className={cn(
                          'w-full text-left px-sm py-1.5 text-sm transition-colors',
                          i === highlightIdx ? 'bg-accent' : 'hover:bg-accent/60',
                          isSelected && 'font-medium',
                        )}
                      >
                        {isSelected && <span className="mr-1">✓</span>}
                        <span>{d.ko}</span>
                        <span className="ml-2 text-muted-foreground">{d.en}</span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="border-t border-border/30 py-1 flex">
              <button
                type="button"
                onClick={() => { setFreeMode(true); setFreeVal('') }}
                className="flex-1 text-left px-sm py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors"
              >
                기타 (직접 입력)
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-sm py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                닫기
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
