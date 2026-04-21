'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CalcResult = { ok: true } | { ok: false; error: string }

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
}): Promise<CalcResult> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const { error } = await auth.supabase
    .from('calculator_items')
    .insert(input)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/calculator')
  return { ok: true }
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
