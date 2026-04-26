'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { listCasesForPicker, type CasePickerItem } from '@/lib/actions/chat'

/**
 * 케이스 picker — 부모는 trigger 요소만 넘기고, 클릭 시 dropdown 펼침.
 * onPick 호출 시 자동으로 닫힘.
 */
export function CaseTagPicker({
  trigger,
  onPick,
}: {
  trigger: React.ReactNode
  onPick: (c: { id: string; label: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CasePickerItem[]>([])
  const [highlight, setHighlight] = useState(0)
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null)
  const [, startFetch] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 트리거 위치 측정 — 팝업을 fixed 로 띄워 부모의 overflow:hidden 을 우회.
  useEffect(() => {
    if (!open) return
    function measure() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos({
        right: Math.max(8, window.innerWidth - rect.right),
        bottom: Math.max(8, window.innerHeight - rect.top + 4),
      })
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

  // 입력 변경 시 fetch (간단 debounce)
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => {
      startFetch(async () => {
        const r = await listCasesForPicker({ search: query })
        if (r.ok) setItems(r.value)
      })
    }, 150)
    return () => clearTimeout(id)
  }, [query, open])

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
          style={{ position: 'fixed', right: pos.right, bottom: pos.bottom, width: '22rem' }}
          className="z-50 rounded-md border border-border/50 bg-popover shadow-md"
        >
          <div className="px-sm py-sm border-b border-border/40 relative">
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
          <ul className="max-h-72 overflow-y-auto scrollbar-minimal py-1">
            {visible.length === 0 ? (
              <li className="px-sm py-2 text-[13px] text-muted-foreground">
                {query.trim() ? '결과 없음' : '최근 케이스부터 표시됩니다'}
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
