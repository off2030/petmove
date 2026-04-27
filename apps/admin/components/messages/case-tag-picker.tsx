'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { listCasesForPicker, type CasePickerItem } from '@/lib/actions/chat'

/**
 * 케이스 picker — 부모는 trigger 요소만 넘기고, 클릭 시 dropdown 펼침.
 * onPick 호출 시 자동으로 닫힘.
 *
 * items 가 주어지면 그 정적 목록을 클라이언트에서 필터 (필터용 — 즉시 표시).
 * 없으면 listCasesForPicker 로 서버 fetch (작성 시 새 태그용).
 */
export function CaseTagPicker({
  trigger,
  onPick,
  items: staticItems,
}: {
  trigger: React.ReactNode
  onPick: (c: { id: string; label: string }) => void
  items?: CasePickerItem[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CasePickerItem[]>([])
  const [highlight, setHighlight] = useState(0)
  type Pos =
    | { right: number; top: number; maxHeight: number }
    | { right: number; bottom: number; maxHeight: number }
  const [pos, setPos] = useState<Pos | null>(null)
  const [, startFetch] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 트리거 위치 측정 — 팝업을 fixed 로 띄워 부모의 overflow:hidden 을 우회.
  // 위/아래 중 여유 큰 쪽으로 펼치고, max-height 로 뷰포트를 넘지 않게 제한.
  useEffect(() => {
    if (!open) return
    function measure() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const right = Math.max(8, window.innerWidth - rect.right)
      const gap = 4
      const above = rect.top - 8 - gap
      const below = window.innerHeight - rect.bottom - 8 - gap
      if (above >= below) {
        setPos({ right, bottom: window.innerHeight - rect.top + gap, maxHeight: Math.max(180, above) })
      } else {
        setPos({ right, top: rect.bottom + gap, maxHeight: Math.max(180, below) })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // 정적 items 모드 — 클라이언트 필터 (즉시).
  // 그 외엔 서버 fetch (debounce).
  useEffect(() => {
    if (!open) return
    if (staticItems) {
      const q = query.trim().toLowerCase()
      setItems(q ? staticItems.filter((c) => c.label.toLowerCase().includes(q)) : staticItems)
      return
    }
    const id = setTimeout(() => {
      startFetch(async () => {
        const r = await listCasesForPicker({ search: query })
        if (r.ok) setItems(r.value)
      })
    }, 150)
    return () => clearTimeout(id)
  }, [query, open, staticItems])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  const visible = useMemo(() => items.slice(0, 50), [items])

  function pick(c: CasePickerItem) {
    onPick({ id: c.id, label: c.label })
    setOpen(false)
    setQuery('')
  }

  const popup = open && pos && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            right: pos.right,
            top: 'top' in pos ? pos.top : undefined,
            bottom: 'bottom' in pos ? pos.bottom : undefined,
            width: '22rem',
            maxHeight: pos.maxHeight,
          }}
          className="z-50 rounded-md border border-border/50 bg-popover shadow-md flex flex-col overflow-hidden"
        >
          <div className="shrink-0 px-sm py-sm border-b border-border/40 relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlight((i) => Math.min(i + 1, visible.length - 1))
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlight((i) => Math.max(i - 1, 0))
                }
                if (e.key === 'Enter' && visible[highlight]) {
                  e.preventDefault()
                  pick(visible[highlight])
                }
              }}
              placeholder="동물명 / 마이크로칩 / 목적지"
              className="w-full h-8 rounded-md bg-card pl-8 pr-3 text-[13px] focus-visible:outline-none border border-transparent focus-visible:border-foreground/30"
            />
          </div>
          <ul className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal py-1">
            {visible.length === 0 ? (
              <li className="px-sm py-2 text-[13px] text-muted-foreground">
                {query.trim()
                  ? '결과 없음'
                  : staticItems
                    ? '이 대화방에서 태그된 케이스가 없습니다'
                    : '최근 케이스부터 표시됩니다'}
              </li>
            ) : (
              visible.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-sm py-1.5 text-[13px] transition-colors ${
                      i === highlight ? 'bg-accent' : 'hover:bg-accent/60'
                    }`}
                  >
                    {c.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={containerRef} className="relative inline-block">
      <span ref={triggerRef} onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {popup}
    </div>
  )
}
