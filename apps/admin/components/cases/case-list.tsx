'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, X, Paperclip, Loader2, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CaseRow } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { useCases } from './cases-context'
import { isExtractableFile } from '@/lib/file-to-base64'
import { formatMicrochip } from '@/lib/fields'
import { destCode } from '@/lib/country-code'
import { TrashModal } from './trash-modal'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

interface CaseRowItemProps {
  caseRow: CaseRow
  index: number
  isSelected: boolean
  isNew: boolean
  isHighlighted: boolean
  onSelect: (id: string) => void
}

/**
 * 메모이즈된 케이스 행. 같은 case 가 같은 상태로 들어오면 다시 렌더링되지 않음.
 * 1797개 행 중 단 하나의 isSelected/isNew/필드 값만 바뀌어도 그 행만 다시 렌더링.
 */
const CaseRowItem = memo(function CaseRowItem({
  caseRow: c,
  index,
  isSelected,
  isNew,
  isHighlighted,
  onSelect,
}: CaseRowItemProps) {
  const dest = c.destination
  const dests = dest ? dest.split(',').map((s) => s.trim()).filter(Boolean) : []
  return (
    <li data-case-idx={index} className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        className={cn(
          'group relative block w-full px-lg py-4 text-left transition-colors',
          'hover:bg-accent',
          isSelected && 'bg-accent',
          isHighlighted && 'bg-accent/70',
          isNew && !isSelected && 'bg-primary/5',
        )}
      >
        {isNew && (
          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
        )}
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)] md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)_minmax(0,5fr)_168px] items-center gap-sm">
          <span className="truncate font-sans font-normal text-[16px] leading-tight text-foreground/85">
            {c.customer_name}
          </span>
          <span className="truncate font-serif font-semibold text-[17px] leading-tight text-foreground">
            {c.pet_name ?? '—'}
          </span>
          <span className="truncate inline-flex items-center justify-end md:justify-start gap-2 flex-wrap">
            {dests.length > 0 ? (
              dests.map((d) => {
                const code = destCode(d)
                return (
                  <span key={d} className="inline-flex items-baseline gap-1.5">
                    {code && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {code}
                      </span>
                    )}
                    <span className="font-serif font-normal text-[16px] text-foreground">{d}</span>
                  </span>
                )
              })
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
          <span className="hidden md:block font-mono text-[12px] text-muted-foreground/80 tabular-nums tracking-wide">
            {formatMicrochip(c.microchip) ?? c.microchip ?? (
              <span className="italic font-serif tracking-normal">미등록</span>
            )}
          </span>
        </div>
      </button>
    </li>
  )
})

/**
 * Left-pane list — Editorial tone.
 *
 * 행동(검색·드롭·Ctrl+V·무한스크롤·키보드 내비·휴지통)과 데이터 흐름은
 * 원본과 100% 동일합니다. 변경된 것은 "어떻게 보이는가"뿐입니다:
 *   - 보호자 이름: Source Serif 4 (Editorial primary)
 *   - 반려동물 이름: italic secondary
 *   - 마이크로칩: JetBrains Mono, faded tertiary
 *   - 행 간격 여유, 구분선 hairline
 *   - 검색창 pill, 아이콘 버튼 원형 테두리
 *   - 카드 컨테이너 border-only (shadow 제거)
 *   - 카운터는 소문자 에디토리얼 캡션
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
  const { cases, selectedId, selectCase, newCaseIds } = useCases()

  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const [highlight, setHighlight] = useState(-1)
  const [showTrash, setShowTrash] = useState(false)

  // 안정적인 callback 으로 만들어 CaseRowItem 의 React.memo 가 정상 동작하도록 함.
  const handleRowSelect = useCallback((id: string) => {
    selectCase(id)
    setHighlight(-1)
  }, [selectCase])

  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
    setHighlight(-1)
  }, [query])

  const filtered = useMemo(() => {
    const raw = query.trim().toLowerCase()
    if (!raw) return cases

    if (raw.includes(' ')) {
      const phraseMatch = cases.filter((c) =>
        buildSearchString(c).toLowerCase().includes(raw),
      )
      if (phraseMatch.length > 0) return phraseMatch
    }

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
  const dragDepth = useRef(0)

  function handleFiles(list: FileList | File[] | null | undefined) {
    if (!list || !onAddFromFiles) return
    const files = Array.from(list).filter(isExtractableFile)
    if (files.length > 0) onAddFromFiles(files)
  }

  useEffect(() => {
    if (!onAddFromFiles) return
    if (selectedId !== null) return
    function onPaste(e: ClipboardEvent) {
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

  // Infinite scroll
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
        'relative flex h-full flex-col gap-lg transition-colors',
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

      {/* Page header — editorial title + count + 복원 */}
      <div className="shrink-0 px-lg flex items-baseline justify-between gap-md">
        <h1 className="font-serif text-[26px] leading-tight tracking-tight text-foreground">
          고객 정보
        </h1>
        <div className="flex items-center gap-sm">
          <button
            type="button"
            onClick={() => setShowTrash(true)}
            title="삭제된 항목 복원"
            aria-label="삭제된 항목 복원"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <span className="text-muted-foreground text-[13px]">
            <span className="font-serif italic">총</span>{' '}
            <span className="font-mono tabular-nums">{cases.length.toLocaleString()}</span>
            <span className="font-serif italic">건</span>
          </span>
        </div>
      </div>

      {/* Search + actions */}
      <div className="flex items-center gap-sm shrink-0">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            // Editorial pill: 살짝 둥근 필, 카드 배경(흰색), hairline 보더
            className="h-11 pl-10 pr-9 text-[15px] !bg-white shadow-none border-border/70 rounded-full focus-visible:ring-0 focus-visible:border-foreground/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
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
              className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="파일로 새 케이스 추가 (드래그·드롭 / Ctrl+V 도 가능)"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onAdd?.()}
          className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="새 케이스 추가"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* List — borderless, editorial */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Column header — editorial caption */}
        <div className="shrink-0 px-lg pb-3 border-b border-border/60">
          <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)] md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)_minmax(0,5fr)_168px] items-center gap-sm font-sans text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
            <span>보호자</span>
            <span>반려동물</span>
            <span>목적지</span>
            <span className="hidden md:block">마이크로칩</span>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto scrollbar-minimal">
          {visibleCases.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground italic font-serif">
              결과가 없습니다
            </div>
          ) : (
            <ul>
              {visibleCases.map((c, i) => (
                <CaseRowItem
                  key={c.id}
                  caseRow={c}
                  index={i}
                  isSelected={c.id === selectedId}
                  isNew={newCaseIds.has(c.id)}
                  isHighlighted={!!(c.id !== selectedId && i === highlight)}
                  onSelect={handleRowSelect}
                />
              ))}
              {visible < filtered.length && (
                <li ref={sentinelRef} className="h-10" />
              )}
            </ul>
          )}
        </div>
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
 */
function buildSearchString(c: CaseRow): string {
  const chip = c.microchip ?? ''
  const parts: string[] = [
    c.customer_name,
    c.customer_name_en ?? '',
    c.pet_name ?? '',
    c.pet_name_en ?? '',
    chip,
    chip.replace(/\s/g, ''),
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
