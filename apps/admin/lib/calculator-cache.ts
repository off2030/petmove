import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CalculatorItem } from '@/lib/supabase/types'

/**
 * Module-level singleton: 페이지 세션 동안 calculator_items를 한 번만 가져온다.
 * - DashboardShell이 앱 진입 시 호출하여 백그라운드 fetch 시작.
 * - CalculatorApp이 같은 함수 호출 — 이미 진행 중/완료된 promise를 재사용해 즉시 반환.
 */
let cachedPromise: Promise<CalculatorItem[]> | null = null

export function fetchCalculatorItems(): Promise<CalculatorItem[]> {
  if (!cachedPromise) {
    cachedPromise = (async () => {
      const { data } = await supabaseBrowser
        .from('calculator_items')
        .select('*')
        .order('country_order', { ascending: true })
        .order('item_order', { ascending: true })
      return (data ?? []) as CalculatorItem[]
    })()
  }
  return cachedPromise
}

/** 항목 편집 후 다음 호출 때 다시 가져오게 하려면 호출. */
export function invalidateCalculatorCache() {
  cachedPromise = null
}
