'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const REGULAR_COLUMNS = new Set([
  'customer_name',
  'customer_name_en',
  'pet_name',
  'pet_name_en',
  'microchip',
  'destination',
  'departure_date',
  'status',
])

export type UpdateResult = { ok: true } | { ok: false; error: string }

/**
 * Update a single field on a case. Records change in case_history for undo.
 */
export async function updateCaseField(
  caseId: string,
  storage: 'column' | 'data',
  key: string,
  value: unknown,
): Promise<UpdateResult> {
  if (!caseId || !key) return { ok: false, error: 'caseId and key are required' }

  const supabase = await createClient()

  // Get old value for history. Also capture org_id for case_history insert.
  let oldValue: string | null = null
  let orgId: string | null = null

  if (storage === 'column') {
    if (!REGULAR_COLUMNS.has(key)) {
      return { ok: false, error: `column "${key}" is not updatable` }
    }
    const { data: row } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (row) {
      const v = (row as Record<string, unknown>)[key]
      oldValue = v != null ? String(v) : null
      orgId = (row as { org_id: string }).org_id
    }

    const { error } = await supabase
      .from('cases')
      .update({ [key]: value })
      .eq('id', caseId)
    if (error) {
      if (error.message.includes('cases_org_microchip_unique')) {
        return { ok: false, error: '이미 등록된 번호입니다' }
      }
      return { ok: false, error: error.message }
    }

    // 출국일이 저장되면 내원가능일(vet_available_date)을 자동으로 -9일로 설정
    if (key === 'departure_date' && value) {
      try {
        const departureDate = new Date(String(value))
        if (!isNaN(departureDate.getTime())) {
          const availableDate = new Date(departureDate)
          availableDate.setDate(availableDate.getDate() - 9)
          const availableDateStr = availableDate.toISOString().split('T')[0]

          const { data: row, error: fetchErr } = await supabase
            .from('cases')
            .select('data')
            .eq('id', caseId)
            .single()
          if (!fetchErr && row) {
            const current: Record<string, unknown> =
              (row.data as Record<string, unknown> | null) ?? {}
            const next = { ...current, vet_available_date: availableDateStr }

            await supabase
              .from('cases')
              .update({ data: next })
              .eq('id', caseId)
          }
        }
      } catch {
        // 날짜 계산 실패는 무시
      }
    }
  } else {
    const { data: row, error: fetchErr } = await supabase
      .from('cases')
      .select('org_id, data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const current: Record<string, unknown> =
      (row?.data as Record<string, unknown> | null) ?? {}
    oldValue = current[key] != null ? String(current[key]) : null
    orgId = (row as { org_id: string }).org_id

    const next = { ...current }
    if (value === null || value === undefined || value === '') {
      delete next[key]
    } else {
      next[key] = value
    }

    const { error } = await supabase
      .from('cases')
      .update({ data: next })
      .eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  }

  // Record history (skip if value unchanged)
  const newValue = value != null && value !== '' ? String(value) : null
  if (oldValue !== newValue && orgId) {
    await supabase.from('case_history').insert({
      case_id: caseId,
      org_id: orgId,
      field_key: key,
      field_storage: storage,
      old_value: oldValue,
      new_value: newValue,
    })
  }

  revalidatePath('/cases')
  return { ok: true }
}

/**
 * Undo the most recent change for a case. Returns the restored field info.
 */
export async function undoLastChange(
  caseId: string,
): Promise<
  | { ok: true; key: string; storage: 'column' | 'data'; restoredValue: unknown }
  | { ok: false; error: string }
> {
  if (!caseId) return { ok: false, error: 'caseId is required' }

  const supabase = await createClient()

  // Get most recent history entry
  const { data: entry, error: histErr } = await supabase
    .from('case_history')
    .select('*')
    .eq('case_id', caseId)
    .order('changed_at', { ascending: false })
    .limit(1)
    .single()

  if (histErr || !entry) return { ok: false, error: '되돌릴 변경 이력이 없습니다' }

  const { field_key, field_storage, old_value } = entry
  const restoredValue = old_value

  // Restore the old value
  if (field_storage === 'column') {
    const { error } = await supabase
      .from('cases')
      .update({ [field_key]: restoredValue })
      .eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: row, error: fetchErr } = await supabase
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const current: Record<string, unknown> =
      (row?.data as Record<string, unknown> | null) ?? {}
    if (restoredValue === null) {
      delete current[field_key]
    } else {
      current[field_key] = restoredValue
    }
    const { error } = await supabase
      .from('cases')
      .update({ data: current })
      .eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  }

  // Delete this history entry (consumed)
  await supabase.from('case_history').delete().eq('id', entry.id)

  revalidatePath('/cases')
  return { ok: true, key: field_key, storage: field_storage as 'column' | 'data', restoredValue }
}
