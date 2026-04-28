'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import type { CalculatorItem } from '@/lib/supabase/types'
import {
  updateCalculatorItem,
  createCalculatorItem,
  deleteCalculatorItem,
} from '@/lib/actions/calculator'
import { ListRow } from '@/components/ui/list-row'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

const CAT_VARIANTS: Record<string, string> = {
  '호주': '호주(고양이)',
  '뉴질랜드': '뉴질랜드(고양이)',
}

const fmt = (n: number) => n.toLocaleString('ko-KR')
const cashDiscount = (total: number) => Math.round((total * 0.95) / 10000) * 10000

interface Props {
  items: CalculatorItem[]
  setItems: Dispatch<SetStateAction<CalculatorItem[]>>
  species: 'dog' | 'cat'
  country: string
  editMode: boolean
}

export function Calculator({ items, setItems, species, country, editMode }: Props) {
  const confirm = useConfirm()
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addCost, setAddCost] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addMenuPlacement, setAddMenuPlacement] = useState<'top' | 'bottom'>('bottom')
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [freeMode, setFreeMode] = useState(false)
  const [freeName, setFreeName] = useState('')
  const addMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const freeInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const effectiveCountry = useMemo(() => {
    if (!country) return ''
    if (species === 'cat' && CAT_VARIANTS[country]) return CAT_VARIANTS[country]
    return country
  }, [country, species])

  const visibleItems = useMemo(
    () =>
      items
        .filter((i) => i.country === effectiveCountry)
        .sort((a, b) => a.item_order - b.item_order),
    [items, effectiveCountry],
  )

  useEffect(() => {
    const next: Record<number, boolean> = {}
    visibleItems.forEach((it) => {
      next[it.id] = true
    })
    setChecked(next)
  }, [effectiveCountry]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!addMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false)
        setFreeMode(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addMenuOpen])

  useEffect(() => {
    if (!addMenuOpen) return
    if (freeMode) freeInputRef.current?.focus()
    else searchInputRef.current?.focus()
  }, [addMenuOpen, freeMode])

  const total = visibleItems.reduce((s, it) => s + (checked[it.id] ? it.cost : 0), 0)
  const disc = total > 0 ? cashDiscount(total) : 0
  const usedMenuOptions = useMemo(() => {
    const visibleNames = new Set(visibleItems.map((it) => it.item_name))
    const seen = new Set<string>()
    return items
      .filter((it) => !visibleNames.has(it.item_name))
      .filter((it) => {
        if (seen.has(it.item_name)) return false
        seen.add(it.item_name)
        return true
      })
      .sort((a, b) => a.item_name.localeCompare(b.item_name, 'ko-KR'))
  }, [items, visibleItems])
  const filteredMenuOptions = useMemo(() => {
    const keyword = query.trim()
    if (!keyword) return usedMenuOptions
    return usedMenuOptions.filter((it) => it.item_name.includes(keyword))
  }, [query, usedMenuOptions])

  function openAddMenu() {
    const rect = addMenuRef.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom
      const above = rect.top
      setAddMenuPlacement(below < 280 && above > below ? 'top' : 'bottom')
    }
    setAddMenuOpen(true)
  }

  async function saveItemField(id: number, patch: { item_name?: string; cost?: number }) {
    const prev = items.find((i) => i.id === id)
    if (!prev) return
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    const res = await updateCalculatorItem(id, patch)
    if (!res.ok) {
      alert(`저장 실패: ${res.error}`)
      setItems((arr) => arr.map((i) => (i.id === id ? prev : i)))
    }
  }

  async function removeItem(id: number) {
    if (!await confirm({ message: '이 항목을 삭제할까요?', okLabel: '삭제', variant: 'destructive' })) return
    const prev = items
    setItems((arr) => arr.filter((i) => i.id !== id))
    const res = await deleteCalculatorItem(id)
    if (!res.ok) {
      alert(`삭제 실패: ${res.error}`)
      setItems(prev)
    }
  }

  function resetAddForm() {
    setAddOpen(false)
    setAddName('')
    setAddCost('')
    setAddMenuOpen(false)
    setQuery('')
    setHighlightIdx(0)
    setFreeMode(false)
    setFreeName('')
  }

  function selectMenu(item: CalculatorItem) {
    setAddName(item.item_name)
    setAddCost(String(item.cost))
    setAddMenuOpen(false)
    setQuery('')
    setHighlightIdx(0)
  }

  function startFreeMode() {
    setFreeMode(true)
    setFreeName(addName)
  }

  function saveFreeMode() {
    const name = freeName.trim()
    if (!name) return
    setAddName(name)
    setAddMenuOpen(false)
    setFreeMode(false)
    setQuery('')
  }

  async function addItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!effectiveCountry) return
    const name = addName.trim()
    if (!name) return
    if (visibleItems.some((it) => it.item_name === name)) {
      alert('이미 이 목적지에 추가된 메뉴입니다')
      return
    }
    const costStr = addCost.trim()
    if (!costStr) return
    const cost = Number(costStr.replace(/[^\d]/g, ''))
    if (!Number.isFinite(cost) || cost < 0) return alert('유효하지 않은 금액입니다')
    const nextOrder = (visibleItems[visibleItems.length - 1]?.item_order ?? -1) + 1
    const countryOrder = items.find((i) => i.country === effectiveCountry)?.country_order ?? 999
    setAddSaving(true)
    const res = await createCalculatorItem({
      country: effectiveCountry,
      item_name: name,
      cost,
      item_order: nextOrder,
      country_order: countryOrder,
    }).catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : '추가 중 오류가 발생했습니다',
    }))
    setAddSaving(false)
    if (!res.ok) return alert(`추가 실패: ${res.error}`)
    setItems((arr) => [...arr, res.data])
    setChecked((c) => ({ ...c, [res.data.id]: true }))
    resetAddForm()
  }

  if (!effectiveCountry) return null

  return (
    <div>
    <div>
      <div>
        {visibleItems.map((it) => {
          const on = !!checked[it.id]
          // Split "마이크로칩 (미니)" → main + meta
          const m = it.item_name.match(/^(.+?)\s*(\([^)]+\))\s*$/)
          const mainName = m ? m[1] : it.item_name
          const meta = m ? m[2] : null

          return (
            <ListRow
              key={it.id}
              interactive={!editMode}
              onClick={
                editMode
                  ? undefined
                  : () => setChecked((c) => ({ ...c, [it.id]: !c[it.id] }))
              }
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {!editMode && (
                  <div
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                      on
                        ? 'border-[#D9A489] bg-[#D9A489] dark:border-[#C08C70] dark:bg-[#C08C70]'
                        : 'border-border bg-transparent'
                    }`}
                  >
                    {on && (
                      <span className="font-serif text-white text-[15px] leading-none -translate-y-[1px]">
                        ✓
                      </span>
                    )}
                  </div>
                )}
                {editMode ? (
                  <input
                    defaultValue={it.item_name}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== it.item_name) saveItemField(it.id, { item_name: v })
                    }}
                    className="h-8 w-full rounded border border-border bg-card px-2 font-serif text-[16px] outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70]"
                  />
                ) : (
                  <span
                    className={`truncate ${
                      on ? 'text-foreground' : 'text-muted-foreground/60 line-through'
                    }`}
                  >
                    <span className="font-serif text-[16px]">{mainName}</span>
                    {meta && (
                      <span className="font-serif italic text-[13px] text-[#6B6A3F] dark:text-[#B8B38A] ml-1">
                        {meta}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editMode ? (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      defaultValue={it.cost}
                      onBlur={(e) => {
                        const v = Number(e.target.value.replace(/[^\d]/g, ''))
                        if (Number.isFinite(v) && v >= 0 && v !== it.cost)
                          saveItemField(it.id, { cost: v })
                      }}
                      className="number-input-no-spinner h-8 w-28 rounded border border-border bg-card px-2 text-right font-mono text-[15px] tabular-nums outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70]"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeItem(it.id)
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : (
                  <span
                    className={`inline-flex items-baseline ${
                      on ? 'text-foreground' : 'text-muted-foreground/50 line-through'
                    }`}
                  >
                    <span className="font-serif text-[13px] text-[#6B6A3F] dark:text-[#B8B38A] mr-[3px]">
                      ₩
                    </span>
                    <span className="font-mono text-[15px] tabular-nums">{fmt(it.cost)}</span>
                  </span>
                )}
              </div>
            </ListRow>
          )
        })}
        {editMode && (
          <div className="border-t border-border/80 px-lg pt-3 mt-1">
            {addOpen ? (
              <form onSubmit={addItem} className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                  <div>
                    <div className="relative" ref={addMenuRef}>
                      <button
                        type="button"
                        onClick={() => {
                          if (addMenuOpen) {
                            setAddMenuOpen(false)
                            setFreeMode(false)
                          } else {
                            openAddMenu()
                          }
                        }}
                        className={cn(
                          'h-8 w-full text-left rounded border border-border bg-card px-2 font-serif text-[16px] outline-none transition-colors focus:border-[#D9A489] dark:focus:border-[#C08C70]',
                          !addName && 'text-muted-foreground/60',
                        )}
                      >
                        {addName || '메뉴 선택'}
                      </button>

                      {addMenuOpen && !freeMode && (
                        <div
                          className={cn(
                            'absolute left-0 z-50 w-72 rounded-md border border-border/80 bg-background shadow-md',
                            addMenuPlacement === 'top'
                              ? 'bottom-[calc(100%+4px)]'
                              : 'top-[calc(100%+4px)]',
                          )}
                        >
                          <div className="p-2 border-b border-border/30">
                            <input
                              ref={searchInputRef}
                              type="text"
                              value={query}
                              onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0) }}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setAddMenuOpen(false)
                                }
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  setHighlightIdx((i) => {
                                    const next = Math.min(i + 1, filteredMenuOptions.length - 1)
                                    setTimeout(() => {
                                      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
                                    }, 0)
                                    return next
                                  })
                                }
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  setHighlightIdx((i) => Math.max(i - 1, 0))
                                }
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  if (filteredMenuOptions.length > 0) selectMenu(filteredMenuOptions[highlightIdx])
                                }
                              }}
                              placeholder="메뉴 검색"
                              className="w-full h-8 rounded border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
                            />
                          </div>
                          <ul ref={listRef} className="max-h-60 overflow-y-auto scrollbar-minimal py-1">
                            {filteredMenuOptions.length === 0 ? (
                              <li className="px-sm py-2 text-sm text-muted-foreground">검색 결과 없음</li>
                            ) : (
                              filteredMenuOptions.map((it, i) => (
                                <li key={`${it.country}-${it.item_name}`}>
                                  <button
                                    type="button"
                                    onClick={() => selectMenu(it)}
                                    className={cn(
                                      'w-full text-left px-sm py-1.5 text-sm transition-colors',
                                      i === highlightIdx ? 'bg-accent' : 'hover:bg-accent/60',
                                    )}
                                  >
                                    <span>{it.item_name}</span>
                                    <span className="ml-2 text-muted-foreground">
                                      {it.country} · ₩{fmt(it.cost)}
                                    </span>
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                          <div className="border-t border-border/30 py-1">
                            <button
                              type="button"
                              onClick={startFreeMode}
                              className="w-full text-left px-sm py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors"
                            >
                              직접 입력
                            </button>
                          </div>
                        </div>
                      )}

                      {addMenuOpen && freeMode && (
                        <div
                          className={cn(
                            'absolute left-0 z-50 w-72 rounded-md border border-border/80 bg-background shadow-md p-3',
                            addMenuPlacement === 'top'
                              ? 'bottom-[calc(100%+4px)]'
                              : 'top-[calc(100%+4px)]',
                          )}
                        >
                          <div className="space-y-2">
                            <input
                              ref={freeInputRef}
                              type="text"
                              value={freeName}
                              onChange={(e) => setFreeName(e.target.value)}
                              placeholder="새 메뉴 이름"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveFreeMode()
                                if (e.key === 'Escape') { setFreeMode(false); setAddMenuOpen(false) }
                              }}
                              className="w-full h-8 rounded border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
                            />
                            <button
                              type="button"
                              onClick={saveFreeMode}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={addCost}
                    onChange={(e) => setAddCost(e.target.value)}
                    placeholder="비용"
                    className="number-input-no-spinner h-8 w-full rounded border border-border bg-card px-2 text-right font-mono text-[15px] tabular-nums outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70]"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="submit"
                      disabled={addSaving}
                      className="rounded p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      title="추가"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={resetAddForm}
                      disabled={addSaving}
                      className="rounded p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      title="취소"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 font-serif text-[14px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus size={14} />
                메뉴 추가
              </button>
            )}
          </div>
        )}
      </div>

      {/* Total block — solid line above */}
      <div className="mt-md border-t border-border/80 px-lg pt-md space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="font-serif text-[17px] text-foreground">합계</span>
          <span className="inline-flex items-baseline text-foreground">
            <span className="font-serif text-[18px] text-[#6B6A3F] dark:text-[#B8B38A] mr-1">
              ₩
            </span>
            <span className="font-serif text-[22px] font-medium tabular-nums tracking-[0.2px]">
              {fmt(total)}
            </span>
          </span>
        </div>
        {disc > 0 && disc < total && (
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-[2px] bg-[#9B4A2D] px-1.5 py-[2px] font-mono text-[10px] font-bold tracking-[1.3px] text-white dark:bg-[#E0917A]">
                현금 5%
              </span>
              <span className="font-serif text-[16px] text-foreground">현금할인가</span>
            </div>
            <span className="inline-flex items-baseline text-foreground">
              <span className="font-serif text-[15px] text-[#6B6A3F] dark:text-[#B8B38A] mr-1">
                ₩
              </span>
              <span className="font-serif text-[19px] font-medium tabular-nums tracking-[0.2px]">
                {fmt(disc)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
    {disc > 0 && disc < total && (
      <p className="mt-2 text-center">
        <span className="font-mono text-[15px] font-semibold tabular-nums text-[#9B4A2D] dark:text-[#E0917A]">
          {fmt(total - disc)}
        </span>
        <span className="font-serif italic text-[15px] text-[#6B6A3F] dark:text-[#B8B38A] ml-1">
          원 절약
        </span>
      </p>
    )}
    </div>
  )
}
