'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { Check, ChevronDown, Search, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { CalculatorItem } from '@/lib/supabase/types'
import {
  updateCalculatorItem,
  createCalculatorItem,
  deleteCalculatorItem,
} from '@/lib/actions/calculator'

const CAT_VARIANTS: Record<string, string> = {
  '호주': '호주(고양이)',
  '뉴질랜드': '뉴질랜드(고양이)',
}

const fmt = (n: number) => n.toLocaleString('ko-KR')
const cashDiscount = (total: number) => Math.round((total * 0.95) / 10000) * 10000

interface Props {
  initialItems: CalculatorItem[]
  canEdit: boolean
}

export function Calculator({ initialItems, canEdit }: Props) {
  const [items, setItems] = useState<CalculatorItem[]>(initialItems)
  const [species, setSpecies] = useState<'dog' | 'cat'>('dog')
  const [country, setCountry] = useState<string>('')
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [dropOpen, setDropOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [editMode, setEditMode] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const countries = useMemo(() => {
    const seen = new Map<string, number>()
    for (const it of items) {
      if (it.country.includes('(고양이)')) continue
      if (!seen.has(it.country)) seen.set(it.country, it.country_order)
    }
    return [...seen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name)
  }, [items])

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
    if (!dropOpen) return
    const onDown = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dropOpen])

  const total = visibleItems.reduce((s, it) => s + (checked[it.id] ? it.cost : 0), 0)
  const disc = total > 0 ? cashDiscount(total) : 0

  const filteredCountries = countries.filter((c) => c.includes(search))

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
    if (!confirm('이 항목을 삭제할까요?')) return
    const prev = items
    setItems((arr) => arr.filter((i) => i.id !== id))
    const res = await deleteCalculatorItem(id)
    if (!res.ok) {
      alert(`삭제 실패: ${res.error}`)
      setItems(prev)
    }
  }

  async function addItem() {
    if (!effectiveCountry) return
    const name = prompt('새 항목 이름을 입력하세요')?.trim()
    if (!name) return
    const costStr = prompt('비용(원)을 입력하세요', '50000')?.trim()
    if (!costStr) return
    const cost = Number(costStr.replace(/[^\d]/g, ''))
    if (!Number.isFinite(cost) || cost < 0) return alert('유효하지 않은 금액입니다')
    const nextOrder = (visibleItems[visibleItems.length - 1]?.item_order ?? -1) + 1
    const countryOrder = items.find((i) => i.country === effectiveCountry)?.country_order ?? 999
    const res = await createCalculatorItem({
      country: effectiveCountry,
      item_name: name,
      cost,
      item_order: nextOrder,
      country_order: countryOrder,
    })
    if (!res.ok) return alert(`추가 실패: ${res.error}`)
    // Reload by fetching fresh — for simplicity, do a soft reload
    window.location.reload()
  }

  return (
    <div className="mx-auto w-full max-w-xl px-md py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">비용 계산기</h1>
          <p className="mt-1 text-sm text-muted-foreground">반려동물 출국 준비 비용을 계산합니다</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`inline-flex items-center gap-xs.5 rounded-md border px-sm py-1.5 text-sm font-medium transition ${
              editMode
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Pencil size={14} />
            {editMode ? '수정 완료' : '가격 수정'}
          </button>
        )}
      </div>

      {/* Species */}
      <section className="mb-5">
        <Label>반려동물 종류</Label>
        <div className="flex gap-sm">
          {([
            ['dog', '🐶 강아지'],
            ['cat', '🐱 고양이'],
          ] as const).map(([v, label]) => {
            const active = species === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setSpecies(v)}
                className={`flex-1 rounded-lg border-2 px-sm py-3 text-sm font-bold transition ${
                  active
                    ? 'border-foreground bg-foreground/5 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/40'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Country dropdown */}
      <section className="mb-6">
        <Label>도착 국가</Label>
        <div className="relative" ref={dropRef}>
          <button
            type="button"
            onClick={() => setDropOpen((v) => !v)}
            className={`flex w-full items-center justify-between rounded-lg border-2 bg-background px-md py-3 text-left text-sm font-semibold transition ${
              dropOpen ? 'border-foreground' : 'border-border hover:border-muted-foreground/40'
            }`}
          >
            <span className={country ? 'text-foreground' : 'text-muted-foreground'}>
              {country || '국가를 선택하세요'}
            </span>
            <ChevronDown
              size={16}
              className={`text-muted-foreground transition-transform ${dropOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {dropOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              <div className="border-b border-border p-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="국가 검색..."
                    className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:border-foreground"
                  />
                </div>
              </div>
              <div className="scrollbar-minimal max-h-60 overflow-y-auto">
                {filteredCountries.length === 0 ? (
                  <div className="px-md py-3 text-sm text-muted-foreground">검색 결과 없음</div>
                ) : (
                  filteredCountries.map((c) => {
                    const sel = c === country
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCountry(c)
                          setDropOpen(false)
                          setSearch('')
                        }}
                        className={`block w-full px-md py-2.5 text-left text-sm font-medium transition ${
                          sel
                            ? 'bg-accent text-foreground'
                            : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Items */}
      {effectiveCountry ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <Label className="mb-0">준비 항목</Label>
            <span className="text-xs text-muted-foreground">
              {species === 'cat' && CAT_VARIANTS[country] ? `${country} (고양이)` : country}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {visibleItems.map((it, idx) => {
              const on = !!checked[it.id]
              const last = idx === visibleItems.length - 1
              return (
                <div
                  key={it.id}
                  className={`flex items-center justify-between gap-sm px-md py-3 transition ${
                    !last ? 'border-b border-border' : ''
                  } ${on ? 'bg-accent/40' : ''} ${editMode ? '' : 'cursor-pointer hover:bg-accent/60'}`}
                  onClick={() => {
                    if (editMode) return
                    setChecked((c) => ({ ...c, [it.id]: !c[it.id] }))
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-md">
                    {!editMode && (
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          on
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-muted-foreground/40 bg-background'
                        }`}
                      >
                        {on && <Check size={12} strokeWidth={3} />}
                      </div>
                    )}
                    {editMode ? (
                      <input
                        defaultValue={it.item_name}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v && v !== it.item_name) saveItemField(it.id, { item_name: v })
                        }}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-medium outline-none focus:border-foreground"
                      />
                    ) : (
                      <span
                        className={`truncate text-sm ${
                          on ? 'font-semibold text-foreground' : 'text-muted-foreground line-through'
                        }`}
                      >
                        {it.item_name}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-sm">
                    {editMode ? (
                      <>
                        <input
                          type="number"
                          defaultValue={it.cost}
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (Number.isFinite(v) && v >= 0 && v !== it.cost)
                              saveItemField(it.id, { cost: v })
                          }}
                          className="w-28 rounded border border-border bg-background px-2 py-1 text-right text-sm font-bold tabular-nums outline-none focus:border-foreground"
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
                        className={`text-sm font-bold tabular-nums ${
                          on ? 'text-foreground' : 'text-muted-foreground/60'
                        }`}
                      >
                        ₩{fmt(it.cost)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            {editMode && (
              <button
                type="button"
                onClick={addItem}
                className="flex w-full items-center justify-center gap-xs.5 border-t border-border bg-accent/30 px-md py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus size={14} />
                항목 추가
              </button>
            )}
          </div>

          {/* Total */}
          <div className="mt-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">합계</span>
              <span className="text-2xl font-extrabold tabular-nums tracking-tight">
                ₩{fmt(total)}
              </span>
            </div>
            {disc > 0 && disc < total && (
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-sm">
                  <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-extrabold text-background">
                    현금 5%
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">현금할인가</span>
                </div>
                <span className="text-xl font-extrabold tabular-nums text-foreground">
                  ₩{fmt(disc)}
                </span>
              </div>
            )}
          </div>
          {disc > 0 && disc < total && (
            <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
              💰 {fmt(total - disc)}원 절약
            </p>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <div className="mb-3 text-5xl">✈️</div>
          <p className="text-sm font-semibold text-muted-foreground">국가를 선택하면</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            필요한 준비항목과 비용이 표시됩니다
          </p>
        </div>
      )}
    </div>
  )
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`mb-2 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground ${className}`}
    >
      {children}
    </span>
  )
}
