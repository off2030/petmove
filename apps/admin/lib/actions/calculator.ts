'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

import type { CalculatorItem } from '@/lib/supabase/types'

export type CalcResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: '인증이 필요합니다' }
  return { ok: true as const, supabase }
}

export async function updateCalculatorItem(id: number, patch: { item_name?: string; cost?: number }): Promise<CalcResult> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const { error } = await auth.supabase
    .from('calculator_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/calculator')
  return { ok: true }
}

export async function createCalculatorItem(input: {
  country: string
  item_name: string
  cost: number
  item_order: number
  country_order: number
}): Promise<CalcResult<CalculatorItem>> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const { data, error } = await auth.supabase
    .from('calculator_items')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) {
    return { ok: false, error: error?.message ?? '추가된 항목을 불러오지 못했습니다' }
  }
  revalidatePath('/calculator')
  return { ok: true, data: data as CalculatorItem }
}

export async function deleteCalculatorItem(id: number): Promise<CalcResult> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const { error } = await auth.supabase
    .from('calculator_items')
    .delete()
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/calculator')
  return { ok: true }
}
