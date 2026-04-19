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
    <div className="h-full overflow-auto scrollbar-minimal px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
      <div className="mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl">
        <div className="mb-6 flex gap-xs border-b border-border">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`px-md py-2 text-base font-medium transition-colors border-b-2 -mb-px ${
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
