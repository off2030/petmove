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

/**
 * 기존 목적지의 비용 항목 전체를 새 목적지로 복제.
 * 새 목적지명이 이미 존재하면 거부. 새 country_order 는 현재 최대값 + 1.
 */
export async function cloneCalculatorDestination(input: {
  source: string
  target: string
}): Promise<CalcResult<CalculatorItem[]>> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const source = input.source.trim()
  const target = input.target.trim()
  if (!source) return { ok: false, error: '원본 목적지가 비어있습니다' }
  if (!target) return { ok: false, error: '새 목적지명을 입력하세요' }
  if (source === target) return { ok: false, error: '새 목적지명이 원본과 동일합니다' }

  const { data: srcItems, error: srcErr } = await auth.supabase
    .from('calculator_items')
    .select('item_name, cost, item_order')
    .eq('country', source)
    .order('item_order', { ascending: true })
  if (srcErr) return { ok: false, error: srcErr.message }
  if (!srcItems || srcItems.length === 0) {
    return { ok: false, error: '복제할 항목이 없습니다' }
  }

  const { data: existing, error: chkErr } = await auth.supabase
    .from('calculator_items')
    .select('id')
    .eq('country', target)
    .limit(1)
  if (chkErr) return { ok: false, error: chkErr.message }
  if (existing && existing.length > 0) {
    return { ok: false, error: '이미 존재하는 목적지명입니다' }
  }

  const { data: maxRow } = await auth.supabase
    .from('calculator_items')
    .select('country_order')
    .order('country_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const newCountryOrder = ((maxRow?.country_order as number) ?? 0) + 1

  const inserts = srcItems.map((it) => ({
    country: target,
    item_name: it.item_name as string,
    cost: it.cost as number,
    item_order: it.item_order as number,
    country_order: newCountryOrder,
  }))
  const { data: inserted, error: insErr } = await auth.supabase
    .from('calculator_items')
    .insert(inserts)
    .select('*')
  if (insErr) return { ok: false, error: insErr.message }

  revalidatePath('/calculator')
  return { ok: true, data: (inserted ?? []) as CalculatorItem[] }
}

/**
 * 빈 목적지를 추가 — placeholder 항목 1개로 시작.
 * 사용자가 비용 탭 진입 후 편집 모드에서 항목을 채워나가는 흐름.
 */
export async function addCalculatorDestination(input: {
  target: string
}): Promise<CalcResult<CalculatorItem>> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const target = input.target.trim()
  if (!target) return { ok: false, error: '목적지명을 입력하세요' }

  const { data: existing, error: chkErr } = await auth.supabase
    .from('calculator_items')
    .select('id')
    .eq('country', target)
    .limit(1)
  if (chkErr) return { ok: false, error: chkErr.message }
  if (existing && existing.length > 0) {
    return { ok: false, error: '이미 존재하는 목적지명입니다' }
  }

  const { data: maxRow } = await auth.supabase
    .from('calculator_items')
    .select('country_order')
    .order('country_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const newCountryOrder = ((maxRow?.country_order as number) ?? 0) + 1

  const { data, error } = await auth.supabase
    .from('calculator_items')
    .insert({
      country: target,
      item_name: '항목 1',
      cost: 0,
      item_order: 1,
      country_order: newCountryOrder,
    })
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? '추가 실패' }
  revalidatePath('/calculator')
  return { ok: true, data: data as CalculatorItem }
}

/**
 * 목적지의 모든 비용 항목을 삭제 — 해당 country 가 country 드롭다운에서 사라짐.
 */
export async function deleteCalculatorDestination(input: {
  country: string
}): Promise<CalcResult<{ deletedIds: number[] }>> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const country = input.country.trim()
  if (!country) return { ok: false, error: '목적지가 비어있습니다' }

  const { data: rows, error: selErr } = await auth.supabase
    .from('calculator_items')
    .select('id')
    .eq('country', country)
  if (selErr) return { ok: false, error: selErr.message }
  const ids = (rows ?? []).map((r) => r.id as number)
  if (ids.length === 0) return { ok: true, data: { deletedIds: [] } }

  const { error: delErr } = await auth.supabase
    .from('calculator_items')
    .delete()
    .in('id', ids)
  if (delErr) return { ok: false, error: delErr.message }
  revalidatePath('/calculator')
  return { ok: true, data: { deletedIds: ids } }
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
