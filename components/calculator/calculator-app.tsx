'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CalculatorItem } from '@/lib/supabase/types'
import { Calculator } from './calculator'
import { ScheduleCalculator } from './schedule-calculator'

type Mode = 'cost' | 'schedule'

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'cost', label: '비용' },
  { value: 'schedule', label: '일정' },
]

export function CalculatorApp() {
  const [mode, setMode] = useState<Mode>('cost')
  const [items, setItems] = useState<CalculatorItem[] | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: rows }, { data: userData }] = await Promise.all([
        supabaseBrowser
          .from('calculator_items')
          .select('*')
          .order('country_order', { ascending: true })
          .order('item_order', { ascending: true }),
        supabaseBrowser.auth.getUser(),
      ])
      if (!alive) return
      setItems((rows ?? []) as CalculatorItem[])
      setCanEdit(!!userData?.user)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="h-full overflow-auto scrollbar-minimal pt-32 pb-24 px-20 2xl:pt-36 2xl:pb-28 2xl:px-24 3xl:pt-44 3xl:pb-36 3xl:px-32 4xl:pt-52 4xl:pb-44 4xl:px-40 6xl:pt-64 6xl:pb-52 6xl:px-56">
      <div className="mx-auto max-w-3xl 4xl:max-w-4xl 6xl:max-w-5xl">
        <div className="mb-6 flex gap-xs border-b border-border">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`px-md py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                mode === m.value
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'cost' ? (
          items === null ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : (
            <Calculator initialItems={items} canEdit={canEdit} />
          )
        ) : (
          <ScheduleCalculator />
        )}
      </div>
    </div>
  )
}
