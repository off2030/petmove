'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
  setItems: React.Dispatch<React.SetStateAction<CalculatorItem[]>>
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
    window.location.reload()
  }

  if (!effectiveCountry) return null

  return (
    <div>
    <div className="rounded-xl bg-card px-lg pt-md pb-sm">
      <div>
        {visibleItems.map((it) => {
          const on = !!checked[it.id]
          // Split "마이크로칩 (미니)" → main + meta
          const m = it.item_name.match(/^(.+?)\s*(\([^)]+\))\s*$/)
          const mainName = m ? m[1] : it.item_name
          const meta = m ? m[2] : null

          return (
            <div
              key={it.id}
              className={`flex items-center justify-between gap-3 border-b border-dotted border-border/70 py-3 last:border-b-0 transition-colors ${
                editMode ? '' : 'cursor-pointer hover:bg-accent/30 -mx-sm px-sm rounded-sm'
              }`}
              onClick={() => {
                if (editMode) return
                setChecked((c) => ({ ...c, [it.id]: !c[it.id] }))
              }}
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
                      type="number"
                      defaultValue={it.cost}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v) && v >= 0 && v !== it.cost)
                          saveItemField(it.id, { cost: v })
                      }}
                      className="h-8 w-28 rounded border border-border bg-card px-2 text-right font-mono text-[15px] tabular-nums outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70]"
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
            </div>
          )
        })}
        {editMode && (
          <button
            type="button"
            onClick={addItem}
            className="flex w-full items-center justify-center gap-1.5 border-t border-dotted border-border/70 pt-3 mt-1 font-serif text-[14px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus size={14} />
            항목 추가
          </button>
        )}
      </div>

      {/* Total block — solid line above, inside same card */}
      <div className="mt-md border-t border-border/60 pt-md space-y-3">
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
