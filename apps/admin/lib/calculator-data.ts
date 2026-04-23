/**
 * Server-side calculator_items loader.
 *
 * calculator_items 는 org_id 가 없는 글로벌 테이블 — 조직 간 공유됨.
 * React `cache()` 로 같은 요청 내 중복 조회 제거.
 */
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { CalculatorItem } from '@/lib/supabase/types'

export const getCalculatorItems = cache(async (): Promise<CalculatorItem[]> => {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('calculator_items')
      .select('*')
      .order('country_order', { ascending: true })
      .order('item_order', { ascending: true })
    if (error || !data) return []
    return data as CalculatorItem[]
  } catch {
    return []
  }
})
