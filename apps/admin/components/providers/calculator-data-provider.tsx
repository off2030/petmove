'use client'

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react'
import type { CalculatorItem } from '@/lib/supabase/types'

interface Ctx {
  items: CalculatorItem[]
  setItems: Dispatch<SetStateAction<CalculatorItem[]>>
}

const CalculatorCtx = createContext<Ctx | null>(null)

export function CalculatorDataProvider({
  initialItems,
  children,
}: {
  initialItems: CalculatorItem[]
  children: React.ReactNode
}) {
  const [items, setItems] = useState<CalculatorItem[]>(initialItems)
  return <CalculatorCtx.Provider value={{ items, setItems }}>{children}</CalculatorCtx.Provider>
}

/**
 * Dashboard layout 밖에서 mount 될 수도 있어 fallback 반환.
 * (super-admin 페이지 등 — calculator 는 dashboard 안에서만 사용하지만 방어적으로.)
 */
export function useCalculatorData(): Ctx {
  const ctx = useContext(CalculatorCtx)
  if (!ctx) {
    throw new Error('useCalculatorData must be used within CalculatorDataProvider')
  }
  return ctx
}
