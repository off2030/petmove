'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from './copy-button'
import { useCases } from './cases-context'
import { useDetailViewSettings } from '@/components/providers/detail-view-settings-provider'
import type { CaseRow } from '@/lib/supabase/types'
import { SectionLabel } from '@/components/ui/section-label'
import breedsData from '@/data/breeds.json'

interface Breed {
  ko: string
  en: string
  type: 'dog' | 'cat'
  alias?: string[]
}

const ALL_BREEDS = breedsData as Breed[]

/**
 * Searchable breed selector. Type Korean or English to filter.
 * Selecting a breed fills both breed (ko) and breed_en automatically.
 * "기타" option allows free text input.
 */
export function BreedField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const { settings: detailViewSettings } = useDetailViewSettings()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const breedKo = (data.breed as string) ?? ''
  const breedEn = (data.breed_en as string) ?? ''
  const species = (data.species as string) ?? '' // 'dog' or 'cat'

  const bilingual = detailViewSettings.breed_bilingual && breedKo && breedEn
  const fallback = breedKo || breedEn || ''
  const isEmpty = !bilingual && !fallback
  const copyText = bilingual ? `${breedKo} | ${breedEn}` : (isEmpty ? '' : fallback)
  const display = bilingual ? (
    <>
      <span className="text-muted-foreground">{breedKo}</span>
      <span className="text-muted-foreground/30 mx-1.5 select-none">|</span>
      <span className="italic text-foreground">{breedEn}</span>
    </>
  ) : isEmpty ? (
    <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>
  ) : (
    fallback
  )

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Filter breeds by species and query
  const filtered = ALL_BREEDS.filter((b) => {
    if (species && b.type !== species) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return b.ko.toLowerCase().includes(q) || b.en.toLowerCase().includes(q) || (b.alias ?? []).some(a => a.toLowerCase().includes(q))
  })

  // Reset on case change
  useEffect(() => {
    setOpen(false)
    setQuery('')
  }, [caseId])

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function selectBreed(breed: Breed) {
    setOpen(false)
    setQuery('')
    // Optimistic — UI 즉시 반영.
    updateLocalCaseField(caseId, 'data', 'breed', breed.ko)
    updateLocalCaseField(caseId, 'data', 'breed_en', breed.en)
    void (async () => {
      await updateCaseField(caseId, 'data', 'breed', breed.ko)
      await updateCaseField(caseId, 'data', 'breed_en', breed.en)
    })()
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <SectionLabel
        className="pt-1"
        onClick={() => { setOpen(!open); setQuery('') }}
        title={isEmpty ? '품종 추가' : '품종 변경'}
      >
        품종
      </SectionLabel>
      <div ref={containerRef} className="relative min-w-0">
        {/* Display / trigger */}
        <div className="group/val relative w-fit">
          <button
            type="button"
            onClick={() => { setOpen(!open); setQuery('') }}
            className={cn(
              'text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
              isEmpty && 'text-muted-foreground/60',
            )}
          >
            {display}
          </button>
          <CopyButton
            value={copyText}
            className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/val:opacity-100"
          />
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 top-full mt-1 z-20 w-72 rounded-md border border-border/80 bg-background shadow-md">
            {/* Search input */}
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
                    setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
                    // Scroll into view
                    setTimeout(() => {
                      listRef.current?.children[Math.min(highlightIdx + 1, filtered.length - 1)]
                        ?.scrollIntoView({ block: 'nearest' })
                    }, 0)
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHighlightIdx((i) => Math.max(i - 1, 0))
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (filtered.length > 0) selectBreed(filtered[highlightIdx])
                  }
                }}
                placeholder="품종 검색 (한글/영문)"
                className="w-full h-8 rounded border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
              />
            </div>
            {/* Options list */}
            <ul ref={listRef} className="max-h-60 overflow-y-auto scrollbar-minimal py-1">
              {filtered.length === 0 ? (
                <li className="px-sm py-2 text-sm text-muted-foreground">검색 결과 없음</li>
              ) : (
                filtered.map((b, i) => (
                  <li key={`${b.type}:${b.en}:${b.ko}`}>
                    <button
                      type="button"
                      onClick={() => selectBreed(b)}
                      className={cn(
                        'w-full text-left px-sm py-1.5 text-sm transition-colors',
                        i === highlightIdx ? 'bg-accent' : 'hover:bg-accent/60',
                      )}
                    >
                      <span>{b.ko}</span>
                      <span className="ml-2 text-muted-foreground">{b.en}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
