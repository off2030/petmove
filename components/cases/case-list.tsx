'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, X, Paperclip, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CaseRow } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { useCases } from './cases-context'
import { isExtractableFile } from '@/lib/file-to-base64'
import { destColor } from '@/lib/destination-color'
import { TrashModal } from './trash-modal'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

/**
 * Left-pane list. Everything is client-side:
 *   - live multi-term search (space-separated terms, AND semantics)
 *   - searches across every scalar field in the row (identity + data jsonb)
 *   - progressive rendering: 100 rows first, +100 on scroll
 *   - drag/drop, Ctrl+V paste, or 📎 button: drop files → new case auto-filled from AI extraction
 */
export function CaseList({
  onAdd,
  onAddFromFiles,
  busy,
}: {
  onAdd?: () => void
  onAddFromFiles?: (files: File[]) => void
  busy?: boolean
}) {
  const { cases, selectedId, selectCase } = useCases()

  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const [highlight, setHighlight] = useState(-1)
  const [showTrash, setShowTrash] = useState(false)

  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
    setHighlight(-1)
  }, [query])

  const filtered = useMemo(() => {
    const raw = query.trim().toLowerCase()
    if (!raw) return cases

    // If query has spaces, try exact phrase match first
    // e.g., "000 000" should match "410 000 000 123 456", not every chip with a single "000"
    if (raw.includes(' ')) {
      const phraseMatch = cases.filter((c) =>
        buildSearchString(c).toLowerCase().includes(raw),
      )
      if (phraseMatch.length > 0) return phraseMatch
    }

    // Fallback: multi-term AND (each term must appear somewhere)
    // e.g., "오유진 루이" → both "오유진" AND "루이" must be present
    const terms = raw.split(/\s+/).filter(Boolean)
    return cases.filter((c) => {
      const hay = buildSearchString(c).toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [cases, query])

  const visibleCases = filtered.slice(0, visible)

  // ── File drop / paste / attach ─────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0) // 자식 위로 옮겨다닐 때 dragleave 깜빡임 방지

  function handleFiles(list: FileList | File[] | null | undefined) {
    if (!list || !onAddFromFiles) return
    const files = Array.from(list).filter(isExtractableFile)
    if (files.length > 0) onAddFromFiles(files)
  }

  // 전역 paste 리스너: 목록 화면이 실제로 보일 때만 동작.
  // 상세페이지(selectedId !== null)에서 붙여넣으면 다른 컴포넌트(예: Japan AI 입력)가
  // 같은 paste 이벤트를 먼저 처리하는데, 여기서도 반응하면 유령 새 케이스가 생김.
  useEffect(() => {
    if (!onAddFromFiles) return
    if (selectedId !== null) return  // 상세 뷰일 땐 비활성
    function onPaste(e: ClipboardEvent) {
      // input/textarea에 포커스돼 있으면 그쪽에 맡김
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!e.clipboardData) return
      const files: File[] = []
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        handleFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAddFromFiles, selectedId])

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
    <div
      ref={rootRef}
      className={cn(
        'relative flex h-full flex-col gap-md transition-colors',
        dragOver && 'ring-2 ring-primary/40 rounded-xl',
      )}
      onDragEnter={(e) => {
        if (!onAddFromFiles || selectedId !== null) return
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        dragDepth.current += 1
        setDragOver(true)
      }}
      onDragOver={(e) => {
        if (!onAddFromFiles || selectedId !== null) return
        if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault()
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragOver(false)
      }}
      onDrop={(e) => {
        if (!onAddFromFiles || selectedId !== null) return
        e.preventDefault()
        dragDepth.current = 0
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      {/* Drag overlay */}
      {dragOver && onAddFromFiles && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10 backdrop-blur-[1px]">
          <div className="text-sm text-primary font-medium">여기에 놓으면 새 케이스로 읽어옵니다</div>
        </div>
      )}
      {/* Busy overlay */}
      {busy && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm">
          <div className="flex items-center gap-sm text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            파일에서 정보 추출 중…
          </div>
        </div>
      )}

      {/* Search + actions — ABOVE the card */}
      <div className="flex items-center gap-sm shrink-0">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight(h => {
                  const next = Math.min(h + 1, filtered.length - 1)
                  const el = document.querySelector(`[data-case-idx="${next}"]`)
                  el?.scrollIntoView({ block: 'nearest' })
                  return next
                })
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight(h => {
                  const next = Math.max(h - 1, 0)
                  const el = document.querySelector(`[data-case-idx="${next}"]`)
                  el?.scrollIntoView({ block: 'nearest' })
                  return next
                })
              }
              if (e.key === 'Enter' && filtered.length > 0) {
                const target = highlight >= 0 ? filtered[highlight] : filtered[0]
                if (target) { selectCase(target.id); setQuery(''); setHighlight(-1) }
              }
              if (e.key === 'Escape') {
                setQuery('')
                setHighlight(-1)
                if (cases.length > 0) selectCase(cases[0].id)
              }
            }}
            autoFocus
            placeholder="검색"
            className="h-10 pl-9 pr-8 text-[15px] bg-card"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {onAddFromFiles && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="파일로 새 케이스 추가 (드래그·드롭 / Ctrl+V 도 가능)"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onAdd?.()}
          className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="새 케이스 추가"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Card: list + count */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border/60 bg-card p-md shadow-sm">
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal -mx-md">
        {visibleCases.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            결과가 없습니다
          </div>
        ) : (
          <ul>
            {visibleCases.map((c, i) => {
              const isSelected = c.id === selectedId
              const dest = c.destination
              const dests = dest ? dest.split(',').map(s => s.trim()).filter(Boolean) : []
              return (
                <li key={c.id} data-case-idx={i} className="border-b border-border/60 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => { selectCase(c.id); setHighlight(-1) }}
                    className={cn(
                      'block w-full px-md py-2.5 text-left transition-colors',
                      'hover:bg-muted/60',
                      isSelected && 'bg-accent',
                      !isSelected && i === highlight && 'bg-muted/60',
                    )}
                  >
                    <div className="grid grid-cols-[minmax(0,6fr)_minmax(0,5fr)_minmax(0,5fr)_168px] items-center gap-sm text-base">
                      <span className="truncate font-medium text-foreground">
                        {c.customer_name}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {c.pet_name ?? '—'}
                      </span>
                      <span className="truncate inline-flex items-center gap-1 flex-wrap">
                        {dests.length > 0 ? (
                          dests.map((d) => {
                            const tone = destColor(d)
                            return (
                              <span key={d} className={cn(
                                'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
                                tone.bg, tone.text,
                              )}>
                                {d}
                              </span>
                            )
                          })
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                      <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
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
      </div>

      {/* Result count (left) + trash (right) — below the card */}
      <div className="shrink-0 flex items-center justify-between text-[13px] text-muted-foreground">
        <span>총 {filtered.length.toLocaleString()}건</span>
        <button
          type="button"
          onClick={() => setShowTrash(true)}
          title="휴지통"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-foreground transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {showTrash && (
        <TrashModal
          onClose={() => setShowTrash(false)}
          onRestore={() => window.location.reload()}
        />
      )}
    </div>
  )
}

/**
 * Flatten a case row into one string we can case-insensitive substring match.
 * Includes regular columns + every scalar value in the data jsonb.
 */
function buildSearchString(c: CaseRow): string {
  const chip = c.microchip ?? ''
  const parts: string[] = [
    c.customer_name,
    c.customer_name_en ?? '',
    c.pet_name ?? '',
    c.pet_name_en ?? '',
    chip,
    chip.replace(/\s/g, ''), // 공백 없는 버전도 포함
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
