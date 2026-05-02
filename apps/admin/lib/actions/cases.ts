'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { applyAutoFillRules } from '@/lib/auto-fill-engine'

const REGULAR_COLUMNS = new Set([
  'customer_name',
  'customer_name_en',
  'pet_name',
  'pet_name_en',
  'microchip',
  'destination',
  'departure_date',
])

export type UpdateResult =
  | { ok: true; autoFilled?: { data: Record<string, unknown> } }
  | { ok: false; error: string }

// case_history.old_value/new_value 는 text 컬럼.
// column storage 는 원래 text 라 그대로 저장. data storage 는 jsonb 이므로 JSON 직렬화.
// 과거(2026-04 이전) 엔트리는 String(value) 로 저장돼 배열·객체가 깨진 형태 — 역직렬화 시 fallback.
function serializeForHistory(storage: 'column' | 'data', value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (storage === 'column') return String(value)
  return JSON.stringify(value)
}

function deserializeFromHistory(storage: 'column' | 'data', raw: string | null): unknown {
  if (raw === null) return null
  if (storage === 'column') return raw
  try { return JSON.parse(raw) } catch { return raw }
}

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
      oldValue = serializeForHistory('column', v)
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
    oldValue = serializeForHistory('data', current[key])
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
  const newValue = serializeForHistory(storage, value)
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

  // 서류/신고 탭 상태 자동 리셋 — 재출국으로 간주되는 변경 시 'done' 상태를 클리어.
  //
  // 서류(export_doc_status='done'):
  //  · 내원일(vet_visit_date) 변경 → 무조건 리셋
  //  · 출국일(departure_date) 변경 + 내원일 비었거나 이미 지난 경우 → 리셋
  //
  // 신고(import_import_status='done' 또는 import_export_status='done'):
  //  · 출국일(departure_date) 변경 + 이전 값이 과거(=이미 다녀온 케이스) → 둘 다 + dismissed 플래그까지 클리어
  //  · 단순 오타 수정(둘 다 미래) 이나 첫 등록(이전 값 없음)은 리셋 안 함
  const isVetVisit = storage === 'data' && key === 'vet_visit_date'
  const isDeparture = storage === 'column' && key === 'departure_date'
  if ((isVetVisit || isDeparture) && oldValue !== newValue) {
    const { data: row } = await supabase
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (row) {
      const current: Record<string, unknown> =
        (row.data as Record<string, unknown> | null) ?? {}
      const today = new Date().toISOString().slice(0, 10)
      const next = { ...current }
      let mutated = false

      // 서류 리셋
      if (current.export_doc_status === 'done') {
        let shouldReset = false
        if (isVetVisit) {
          shouldReset = true
        } else {
          const visit = typeof current.vet_visit_date === 'string' ? current.vet_visit_date : ''
          if (!visit || visit < today) shouldReset = true
        }
        if (shouldReset) {
          delete next.export_doc_status
          mutated = true
        }
      }

      // 신고 리셋 (출국일 변경 시에만)
      if (isDeparture) {
        const wasPast = !!oldValue && oldValue < today
        const someDone =
          current.import_import_status === 'done' || current.import_export_status === 'done'
        if (wasPast && someDone) {
          delete next.import_import_status
          delete next.import_export_status
          delete next.import_report_dismissed
          mutated = true
        }
      }

      if (mutated) {
        await supabase
          .from('cases')
          .update({ data: next })
          .eq('id', caseId)
      }
    }
  }

  // 자동 채움 규칙 적용 — 날짜 관련 필드가 변경됐을 때만.
  // 체이닝은 엔진 내부에서 iter loop 로 처리.
  const DATE_TRIGGER_KEYS = new Set([
    'departure_date',
    'vet_visit_date',
    'rabies_dates',
    'general_vaccine_dates',
    'civ_dates',
    'kennel_cough_dates',
    'internal_parasite_dates',
    'external_parasite_dates',
    'heartworm_dates',
  ])
  let autoFilled: { data: Record<string, unknown> } | undefined
  if (DATE_TRIGGER_KEYS.has(key)) {
    try {
      await applyAutoFillRules(supabase, caseId, key)
      // auto-fill 이후 최신 data 를 다시 읽어 클라이언트 context 에 반영할 수 있게 리턴.
      const { data: refreshed } = await supabase
        .from('cases')
        .select('data')
        .eq('id', caseId)
        .single()
      if (refreshed) {
        autoFilled = { data: (refreshed.data as Record<string, unknown> | null) ?? {} }
      }
    } catch { /* best-effort */ }
  }

  revalidatePath('/cases')
  return autoFilled ? { ok: true, autoFilled } : { ok: true }
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
  const storage = field_storage as 'column' | 'data'
  const restoredValue = deserializeFromHistory(storage, old_value)

  // Restore the old value
  if (storage === 'column') {
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

/**
 * Restore a case to the state BEFORE the given history entry was created.
 * Rolls back all changes at or after that point (bulk revert to a point-in-time).
 * Returns the final state of each affected field so client can sync local state.
 */
export async function restoreToHistoryPoint(
  caseId: string,
  historyId: string,
): Promise<
  | {
      ok: true
      restored: Array<{ key: string; storage: 'column' | 'data'; value: unknown }>
    }
  | { ok: false; error: string }
> {
  if (!caseId || !historyId) return { ok: false, error: 'caseId and historyId are required' }

  const supabase = await createClient()

  // 1. Get the selected entry's changed_at (the boundary).
  const { data: selected, error: selErr } = await supabase
    .from('case_history')
    .select('changed_at')
    .eq('id', historyId)
    .eq('case_id', caseId)
    .single()
  if (selErr || !selected) return { ok: false, error: '이력 항목을 찾을 수 없습니다' }

  // 2. Fetch all entries at or after that point, newest first.
  const { data: entries, error: fetchErr } = await supabase
    .from('case_history')
    .select('*')
    .eq('case_id', caseId)
    .gte('changed_at', selected.changed_at)
    .order('changed_at', { ascending: false })
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!entries || entries.length === 0) return { ok: false, error: '되돌릴 이력이 없습니다' }

  // 3. Reduce to per-field final state.
  //    entries are DESC (newest → oldest). Iterating in this order with .set() means
  //    the OLDEST entry for each key wins — which is exactly what we want: the value
  //    before any change in the selected range.
  const finalByKey = new Map<
    string,
    { storage: 'column' | 'data'; key: string; value: unknown }
  >()
  for (const e of entries) {
    const storage = e.field_storage as 'column' | 'data'
    finalByKey.set(`${storage}:${e.field_key}`, {
      storage,
      key: e.field_key,
      value: deserializeFromHistory(storage, e.old_value),
    })
  }

  // 4. Separate column and data updates.
  const columnUpdates: Record<string, unknown> = {}
  const dataKeyUpdates = new Map<string, unknown>()
  for (const f of finalByKey.values()) {
    if (f.storage === 'column') {
      if (REGULAR_COLUMNS.has(f.key)) columnUpdates[f.key] = f.value
    } else {
      dataKeyUpdates.set(f.key, f.value)
    }
  }

  // 5. Apply column updates in a single UPDATE.
  if (Object.keys(columnUpdates).length > 0) {
    const { error } = await supabase.from('cases').update(columnUpdates).eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  }

  // 6. Apply data updates: read-merge-write.
  if (dataKeyUpdates.size > 0) {
    const { data: row, error: dFetchErr } = await supabase
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (dFetchErr) return { ok: false, error: dFetchErr.message }

    const current: Record<string, unknown> = (row?.data as Record<string, unknown> | null) ?? {}
    const next = { ...current }
    for (const [k, v] of dataKeyUpdates) {
      if (v === null || v === undefined) delete next[k]
      else next[k] = v
    }
    const { error } = await supabase.from('cases').update({ data: next }).eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  }

  // 7. Delete consumed history entries.
  const ids = entries.map((e) => e.id)
  await supabase.from('case_history').delete().in('id', ids)

  revalidatePath('/cases')

  return {
    ok: true,
    restored: Array.from(finalByKey.values()),
  }
}
