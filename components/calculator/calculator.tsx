'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
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
  items: CalculatorItem[]
  setItems: React.Dispatch<React.SetStateAction<CalculatorItem[] | null>>
  species: 'dog' | 'cat'
  country: string
  editMode: boolean
}

export function Calculator({ items, setItems, species, country, editMode }: Props) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})

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

  const total = visibleItems.reduce((s, it) => s + (checked[it.id] ? it.cost : 0), 0)
  const disc = total > 0 ? cashDiscount(total) : 0

  async function saveItemField(id: number, patch: { item_name?: string; cost?: number }) {
    const prev = items.find((i) => i.id === id)
    if (!prev) return
    setItems((arr) => (arr ? arr.map((i) => (i.id === id ? { ...i, ...patch } : i)) : arr))
    const res = await updateCalculatorItem(id, patch)
    if (!res.ok) {
      alert(`저장 실패: ${res.error}`)
      setItems((arr) => (arr ? arr.map((i) => (i.id === id ? prev : i)) : arr))
    }
  }

  async function removeItem(id: number) {
    if (!confirm('이 항목을 삭제할까요?')) return
    const prev = items
    setItems((arr) => (arr ? arr.filter((i) => i.id !== id) : arr))
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
    window.location.reload()
  }

  if (!effectiveCountry) return null

  return (
    <div className="rounded-xl border border-border/60 bg-card p-md shadow-sm">
      <div className="overflow-hidden rounded-md border border-border/60 bg-background">
        {visibleItems.map((it) => {
          const on = !!checked[it.id]
          return (
            <div
              key={it.id}
              className={`flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 transition-colors last:border-b-0 ${
                on ? 'bg-muted/40' : ''
              } ${editMode ? '' : 'cursor-pointer hover:bg-muted/60'}`}
              onClick={() => {
                if (editMode) return
                setChecked((c) => ({ ...c, [it.id]: !c[it.id] }))
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {!editMode && (
                  <div
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card'
                    }`}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </div>
                )}
                {editMode ? (
                  <input
                    defaultValue={it.item_name}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== it.item_name) saveItemField(it.id, { item_name: v })
                    }}
                    className="h-8 w-full rounded border border-border bg-card px-2 text-sm font-medium outline-none focus:border-primary"
                  />
                ) : (
                  <span
                    className={`truncate text-base ${
                      on ? 'text-foreground' : 'text-muted-foreground/60 line-through'
                    }`}
                  >
                    {it.item_name}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
                      className="h-8 w-28 rounded border border-border bg-card px-2 text-right text-sm font-medium tabular-nums outline-none focus:border-primary"
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
                    className={`text-base font-medium tabular-nums ${
                      on ? 'text-foreground' : 'text-muted-foreground/50'
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
            className="flex w-full items-center justify-center gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus size={14} />
            항목 추가
          </button>
        )}
      </div>

      {/* Total */}
      <div className="mt-4 rounded-md border border-border/60 bg-background px-md py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">합계</span>
          <span className="text-xl font-bold tabular-nums">₩{fmt(total)}</span>
        </div>
        {disc > 0 && disc < total && (
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                현금 5%
              </span>
              <span className="text-sm font-medium text-muted-foreground">현금할인가</span>
            </div>
            <span className="text-lg font-bold tabular-nums text-foreground">₩{fmt(disc)}</span>
          </div>
        )}
      </div>
      {disc > 0 && disc < total && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {fmt(total - disc)}원 절약
        </p>
      )}
    </div>
  )
}
