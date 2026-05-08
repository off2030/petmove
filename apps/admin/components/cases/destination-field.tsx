'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import destsData from '@/data/destinations.json'
import { destCode } from '@/lib/country-code'
import { resolveActiveDestination, getTripType } from '@petmove/domain'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@/components/ui/confirm-dialog'

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

type TripType = 'round' | 'one_way'

export function DestinationField({ caseId, destination }: { caseId: string; destination: string | null }) {
  const { cases, updateLocalCaseField, activeDestination, setActiveDestination } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()

  const selected = parseDests(destination)
  const multi = selected.length > 1

  // 목적지별 왕복/편도 토글 — case.data.trip_type 객체에 저장. 디폴트 round.
  const currentCase = cases.find(c => c.id === caseId)
  const tripTypeMap =
    ((currentCase?.data as Record<string, unknown> | undefined)?.trip_type as
      | Record<string, TripType>
      | undefined) ?? {}
  const targetDest = resolveActiveDestination(destination, activeDestination)
  const tripType: TripType = getTripType(currentCase?.data, targetDest)

  async function setTripType(value: TripType) {
    if (!targetDest) return
    const next: Record<string, TripType> = { ...tripTypeMap, [targetDest]: value }
    updateLocalCaseField(caseId, 'data', 'trip_type', next)
    await updateCaseField(caseId, 'data', 'trip_type', next)
  }

  // Display: show English names
  const display = selected.length > 0
    ? selected.map(ko => {
        const matched = ALL_DESTS.find(d => d.ko === ko)
        return matched ? matched.en : ko
      }).join(', ')
    : '—'

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = ALL_DESTS.filter((d) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return d.ko.toLowerCase().includes(q) || d.en.toLowerCase().includes(q) || (d.alias ?? []).some(a => a.toLowerCase().includes(q))
  })

  useEffect(() => { setOpen(false); setQuery('') }, [caseId])
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])
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
    const ok = await confirm({
      message: `목적지 "${ko}"를 삭제하시겠습니까?`,
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const next = selected.filter(s => s !== ko)
    const val = joinDests(next)
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await updateCaseField(caseId, 'column', 'destination', val)
  }

  async function reorderDests(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    if (fromIdx < 0 || fromIdx >= selected.length) return
    if (toIdx < 0 || toIdx >= selected.length) return
    const next = selected.slice()
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const val = joinDests(next)
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await updateCaseField(caseId, 'column', 'destination', val)
  }

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? () => { setOpen(true); setQuery(''); setHighlightIdx(0) } : undefined}
          title={editMode ? '목적지 추가' : undefined}
        >
          목적지
        </SectionLabel>
      </div>
      <div ref={containerRef} className="relative min-w-0 flex items-start gap-md">
        <div className="flex-1 min-w-0">
        {selected.length > 0 ? (
          <div className="group/val inline-flex items-center gap-md flex-wrap">
            {selected.map((ko, idx) => {
              const code = destCode(ko)
              const isActive = multi && (activeDestination ?? selected[0]) === ko
              const isDragOver = multi && editMode && overIdx === idx && dragIdx !== null && dragIdx !== idx
              return (
                <span
                  key={ko}
                  draggable={multi && editMode}
                  onDragStart={(e) => {
                    if (!multi || !editMode) return
                    setDragIdx(idx)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(idx))
                  }}
                  onDragOver={(e) => {
                    if (!multi || !editMode || dragIdx === null) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (overIdx !== idx) setOverIdx(idx)
                  }}
                  onDragLeave={() => {
                    if (overIdx === idx) setOverIdx(null)
                  }}
                  onDrop={(e) => {
                    if (!multi || !editMode || dragIdx === null) return
                    e.preventDefault()
                    void reorderDests(dragIdx, idx)
                    setDragIdx(null); setOverIdx(null)
                  }}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                  className={cn(
                    'group/chip inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-0.5 transition-all',
                    'bg-pmw-tag text-pmw-tag-foreground',
                    multi && isActive && 'ring-1 ring-pmw-accent/45',
                    multi && editMode && 'cursor-grab active:cursor-grabbing',
                    dragIdx === idx && 'opacity-30',
                    isDragOver && 'ring-2 ring-pmw-tag-foreground/50',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => { if (multi) setActiveDestination(ko) }}
                    className={cn(
                      'inline-flex items-baseline gap-1.5 -mx-2.5 -my-0.5 px-2.5 py-0.5 transition-opacity',
                      multi && 'cursor-pointer',
                      multi && !isActive && 'opacity-55 group-hover/chip:opacity-90',
                    )}
                    title={multi ? '클릭하여 이 국가 항목 보기' : undefined}
                    disabled={!multi}
                  >
                    {code && (
                      <span className="font-mono text-[13px] uppercase tracking-[1px] text-pmw-code">
                        {code}
                      </span>
                    )}
                    <span className="font-serif text-[15px] text-pmw-tag-foreground">
                      {ko}
                    </span>
                  </button>
                  {editMode && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeDest(ko) }}
                      className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-pmw-tag-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/chip:opacity-70 hover:!opacity-100"
                      title="목적지 삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        ) : null}

        {open && (
          <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-md border border-border/80 bg-background shadow-md">
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
                className="w-full h-8 rounded border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
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
            <div className="border-t border-border/30 py-1 flex justify-end">
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
        </div>
        {selected.length > 0 && targetDest && (
          <div
            className="shrink-0 inline-flex items-center rounded-full border border-border/70 bg-background p-0.5 font-serif text-[12px] mt-0.5"
            title={multi ? `${targetDest} 여행 유형` : '여행 유형'}
          >
            <button
              type="button"
              onClick={() => setTripType('round')}
              className={cn(
                'px-2 py-0.5 rounded-full transition-colors',
                tripType === 'round'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              왕복
            </button>
            <button
              type="button"
              onClick={() => setTripType('one_way')}
              className={cn(
                'px-2 py-0.5 rounded-full transition-colors',
                tripType === 'one_way'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              편도
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
