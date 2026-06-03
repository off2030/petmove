'use server'

import { createClient } from '@petmove/auth/server'
import { applyAutoFillRules, getVetVisitWindowDays } from '@petmove/domain'
import { evaluateAndNotify } from './system-notifications'
import { isDestinationScopedKey, parseDestinations } from '@petmove/domain'

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
  | { ok: true; autoFilled?: { data: Record<string, unknown>; columns?: Record<string, unknown> } }
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
 * 내원·임상검진일은 출국일 포함 N일 이내여야 함 — 목적지별 윈도우(@petmove/domain
 * getVetVisitWindowDays). 한국 APQA 디폴트 10일, 말레이·싱가포르 7일,
 * 호주·러시아 5일, 뉴질랜드·터키 3일. 다중 목적지 시 가장 엄격한 윈도우.
 */
function validateVetVisitVsDeparture(
  visit: string | null | undefined,
  dep: string | null | undefined,
  destination: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!visit || !dep) return { ok: true }
  const v = String(visit).slice(0, 10)
  const d = String(dep).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: true }
  if (v > d) return { ok: false, error: '입력한 날짜가 출국일보다 늦습니다. 출국 전 임상검사는 출국 전에 받아야 합니다.' }
  const va = new Date(v + 'T00:00:00Z').getTime()
  const da = new Date(d + 'T00:00:00Z').getTime()
  if (isNaN(va) || isNaN(da)) return { ok: true }
  const days = Math.round((da - va) / 86_400_000)
  const windowDays = getVetVisitWindowDays(destination)
  if (days >= windowDays) {
    return {
      ok: false,
      error: `출국 전 임상검사는 출국일 기준 ${windowDays}일 이내에 받아야 합니다.`,
    }
  }
  return { ok: true }
}

/**
 * Update a single field on a case. Records change in case_history for undo.
 *
 * P1 #7 — 단일 SELECT + 단일 UPDATE 로 통합. 이전엔 column 경로의 vet_available_date
 * sync 와 status 리셋이 각자 별도 SELECT+UPDATE 했어서 최악 6 RTT. 이제 모든 in-row
 * 부수효과(vet_available_date, status 리셋) 를 client 측에서 합산 후 1회 UPDATE.
 *
 * P1 #8 — autoFill 의 최종 update 와 본 update 를 하나로 합치는 작업은 autoFill
 * 시그니처 변경이 필요해 추후 작업으로 분리. 현재는 autoFill 이 1회 더 update
 * 하지만 이 자체가 race condition·데이터 corruption 은 아니므로 audit 결과 안정.
 */
export async function updateCaseField(
  caseId: string,
  storage: 'column' | 'data',
  key: string,
  value: unknown,
  /**
   * 다중 목적지 케이스에서 destination-scoped 키 입력 시 활성 목적지 토큰.
   * - 미지정: 기존 경로 (column 또는 data top-level).
   * - 지정 + isDestinationScopedKey(key) + 다중 목적지 케이스 → `data.by_dest[destination][key]` 에 저장.
   * - 부수효과(vet_available_date 동기화·status 리셋·auto-fill)는 by_dest 경로에선 우선 스킵.
   */
  destination?: string | null,
): Promise<UpdateResult> {
  if (!caseId || !key) return { ok: false, error: 'caseId and key are required' }
  if (storage === 'column' && !REGULAR_COLUMNS.has(key)) {
    return { ok: false, error: `column "${key}" is not updatable` }
  }

  const supabase = await createClient()

  // Single read — old value (column 또는 data 안), org_id, current data.
  const { data: row, error: fetchErr } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  const orgId = (row as { org_id: string }).org_id
  const currentData = ((row as { data: Record<string, unknown> | null }).data ?? {}) as Record<string, unknown>
  const destinationRaw = (row as { destination: string | null }).destination
  const isMultiDest = parseDestinations(destinationRaw).length > 1
  // by_dest 경로 적용 조건: 활성 목적지 + scoped 키 + 다중 목적지.
  const useByDest = !!destination && isDestinationScopedKey(key) && isMultiDest

  // 내원일 ↔ 출국일 10일 이내 룰 — 한국 APQA 공통, 모든 목적지에 적용.
  // 입력 시점에 거부 (procedure-check 안내 배지 아님).
  if (storage === 'data' && key === 'vet_visit_date' && value) {
    const currentDep = (row as { departure_date: string | null }).departure_date
    const check = validateVetVisitVsDeparture(value as string, currentDep, destinationRaw)
    if (!check.ok) return { ok: false, error: check.error }
  }
  if (storage === 'column' && key === 'departure_date' && value) {
    const currentVisit = typeof currentData.vet_visit_date === 'string'
      ? (currentData.vet_visit_date as string)
      : null
    const check = validateVetVisitVsDeparture(currentVisit, value as string, destinationRaw)
    if (!check.ok) return { ok: false, error: check.error }
  }

  // by_dest 경로 — 별도 분기로 처리하고 기존 부수효과는 우회.
  if (useByDest) {
    const byDestPrev = (currentData['by_dest'] as Record<string, Record<string, unknown>> | undefined) ?? {}
    const destObjPrev = byDestPrev[destination!] ?? {}
    const oldValueByDest = serializeForHistory('data', destObjPrev[key])
    const nextByDest: Record<string, Record<string, unknown>> = { ...byDestPrev }
    const nextDestObj = { ...destObjPrev }
    // 비움(null/empty) 시에도 키 삭제 X — 명시적 null sentinel 저장.
    // 그래야 read 시 top-level 잔여 데이터가 fallback 으로 부활하지 않음.
    if (value === null || value === undefined || value === '') {
      nextDestObj[key] = null
    } else {
      nextDestObj[key] = value
    }
    nextByDest[destination!] = nextDestObj
    const nextData = { ...currentData }
    nextData['by_dest'] = nextByDest
    const { error: updErr } = await supabase
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }
    const newValueByDest = serializeForHistory('data', value)
    if (oldValueByDest !== newValueByDest && orgId) {
      // History: key 에 by_dest 경로 인코딩 (undo 시 파싱) — 형식 'by_dest:{destination}:{key}'.
      await supabase.from('case_history').insert({
        case_id: caseId,
        org_id: orgId,
        field_key: `by_dest:${destination}:${key}`,
        field_storage: 'data',
        old_value: oldValueByDest,
        new_value: newValueByDest,
      })
    }
    // 자동 채움 — 활성 목적지 기준 trigger 가 by_dest 안의 다른 키를 채움.
    // departure_date / vet_visit_date / entry_date 등 날짜 트리거에 한해 가동.
    let autoFilled: { data: Record<string, unknown>; columns?: Record<string, unknown> } | undefined
    const BY_DEST_TRIGGER_KEYS = new Set([
      'departure_date', 'departure_flight_date', 'vet_visit_date', 'entry_date',
    ])
    if (BY_DEST_TRIGGER_KEYS.has(key)) {
      try {
        await applyAutoFillRules(supabase, caseId, key, destination)
        const { data: refreshed } = await supabase
          .from('cases')
          .select('data, departure_date')
          .eq('id', caseId)
          .single()
        if (refreshed) {
          const r = refreshed as { data: Record<string, unknown> | null; departure_date: string | null }
          autoFilled = {
            data: r.data ?? {},
            columns: { departure_date: r.departure_date ?? null },
          }
        }
      } catch { /* best-effort */ }
    }
    await evaluateAndNotify(caseId)
    return autoFilled ? { ok: true, autoFilled } : { ok: true }
  }

  let oldValue: string | null
  if (storage === 'column') {
    oldValue = serializeForHistory('column', (row as Record<string, unknown>)[key])
  } else {
    oldValue = serializeForHistory('data', currentData[key])
  }

  // 누적할 update 객체 + data 워킹카피.
  const updateObj: Record<string, unknown> = {}
  const nextData = { ...currentData }
  let dataMutated = false

  if (storage === 'column') {
    updateObj[key] = value
    // 출국일 저장 시 내원가능일(vet_available_date) = 출국일 - 9 자동 채움.
    if (key === 'departure_date' && value) {
      try {
        const d = new Date(String(value))
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() - 9)
          nextData.vet_available_date = d.toISOString().split('T')[0]
          dataMutated = true
        }
      } catch { /* 날짜 계산 실패 무시 */ }
    }
  } else {
    if (value === null || value === undefined || value === '') {
      delete nextData[key]
    } else {
      nextData[key] = value
    }
    dataMutated = true
  }
  // 일본 등 destination 별 sync (예: departure_flight_date ↔ departure_date) 는
  // hardcode 가 아닌 org_auto_fill_rules 로 처리 — applyAutoFillRules 가 트리거.

  // 서류/신고 탭 상태 자동 리셋 — 재출국 시 'done' 클리어.
  //   서류(export_doc_status):
  //     · 내원일(vet_visit_date) 변경 → 무조건 리셋
  //     · 출국일(departure_date) 변경 + 내원일 비었거나 이미 지남 → 리셋
  //   신고(import_import_status, import_export_status):
  //     · 출국일 변경 + 이전 값이 과거(이미 다녀온 케이스) → 둘 다 + dismissed 플래그 클리어
  const newValue = serializeForHistory(storage, value)
  const valueChanged = oldValue !== newValue
  const isVetVisit = storage === 'data' && key === 'vet_visit_date'
  const isDeparture = storage === 'column' && key === 'departure_date'
  if ((isVetVisit || isDeparture) && valueChanged) {
    const today = new Date().toISOString().slice(0, 10)
    if (currentData.export_doc_status === 'done') {
      let shouldReset = false
      if (isVetVisit) {
        shouldReset = true
      } else {
        const visit = typeof currentData.vet_visit_date === 'string' ? currentData.vet_visit_date : ''
        if (!visit || visit < today) shouldReset = true
      }
      if (shouldReset) {
        delete nextData.export_doc_status
        dataMutated = true
      }
    }
    if (isDeparture) {
      const wasPast = !!oldValue && oldValue < today
      const someDone =
        currentData.import_import_status === 'done' || currentData.import_export_status === 'done'
      if (wasPast && someDone) {
        delete nextData.import_import_status
        delete nextData.import_export_status
        delete nextData.import_report_dismissed
        dataMutated = true
      }
    }
  }

  if (dataMutated) updateObj.data = nextData

  // Single UPDATE — column 변경 + data 부수효과 + status 리셋 모두 합산.
  const { error: updErr } = await supabase
    .from('cases')
    .update(updateObj)
    .eq('id', caseId)
  if (updErr) {
    if (updErr.message.includes('cases_org_microchip_unique')) {
      return { ok: false, error: '이미 등록된 번호입니다' }
    }
    return { ok: false, error: updErr.message }
  }

  // History — 값이 실제로 바뀐 경우만.
  if (valueChanged && orgId) {
    await supabase.from('case_history').insert({
      case_id: caseId,
      org_id: orgId,
      field_key: key,
      field_storage: storage,
      old_value: oldValue,
      new_value: newValue,
    })
  }

  // 자동 채움 규칙 적용 — 날짜 관련 필드가 변경됐을 때만.
  // 체이닝은 엔진 내부에서 iter loop 로 처리.
  // entry_date: 통합 입국일 — 일본·하와이·태국·스위스 모두 같은 키. 출국일과 동기화 규칙 트리거.
  const DATE_TRIGGER_KEYS = new Set([
    'departure_date',
    'departure_flight_date', // 일본 출국 항공편 출발일 (departure_date 와 양방향 sync)
    'vet_visit_date',
    'rabies_dates',
    'general_vaccine_dates',
    'civ_dates',
    'kennel_cough_dates',
    'internal_parasite_dates',
    'external_parasite_dates',
    'heartworm_dates',
    'entry_date',
  ])
  let autoFilled: { data: Record<string, unknown>; columns?: Record<string, unknown> } | undefined
  if (DATE_TRIGGER_KEYS.has(key)) {
    try {
      await applyAutoFillRules(supabase, caseId, key)
      // auto-fill 이후 최신 data + 엔진이 쓸 수 있는 컬럼 (departure_date) 을 같이 읽어
      // 클라이언트 context 에 반영할 수 있게 리턴.
      const { data: refreshed } = await supabase
        .from('cases')
        .select('data, departure_date')
        .eq('id', caseId)
        .single()
      if (refreshed) {
        const r = refreshed as { data: Record<string, unknown> | null; departure_date: string | null }
        autoFilled = {
          data: r.data ?? {},
          columns: { departure_date: r.departure_date ?? null },
        }
      }
    } catch { /* best-effort */ }
  }

  // 검증 실패가 새로 생기면 펫무브워크 시스템 메시지로 알림.
  // 서버 액션 종료 전 완료되어야 메시지가 확실히 적재되므로 await.
  // evaluateAndNotify 내부에서 모든 예외를 swallow 하므로 본 흐름엔 영향 없음.
  await evaluateAndNotify(caseId)

  // revalidatePath('/cases') 의도적으로 호출하지 않음 — 클라이언트는 updateLocalCaseField
  // 로 optimistic update, 타 클라이언트는 Realtime UPDATE 로 동기화. revalidate 는 RSC
  // refetch 를 트리거해 (dashboard) 레이아웃 재실행 → 그 안의 Promise.all 이 transient
  // throw 하면 global-error 거쳐 리마운트, 결국 상세→목록 튕김으로 이어지던 원인.
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

  // revalidatePath 미사용 — updateCaseField 와 동일한 사유 (클라이언트가 반환값으로
  // updateLocalCaseField 호출).
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
  //    entries are DESC (newest → oldest). 두 가지 값을 동시에 추적:
  //     - restoredValue: 가장 OLD entry 의 old_value (= 범위 시작 전 값, 복원 대상)
  //     - currentValue: 가장 NEW entry 의 new_value (= 현재 DB 값, 새 history old_value 로 사용)
  const finalByKey = new Map<
    string,
    { storage: 'column' | 'data'; key: string; restoredValue: unknown; currentValue: unknown }
  >()
  for (const e of entries) {
    const storage = e.field_storage as 'column' | 'data'
    const k = `${storage}:${e.field_key}`
    const restored = deserializeFromHistory(storage, e.old_value)
    const existing = finalByKey.get(k)
    if (existing) {
      // 같은 키의 더 OLD entry — restoredValue 갱신 (그게 진짜 복원 대상).
      existing.restoredValue = restored
    } else {
      // 첫(=NEWEST) entry — currentValue 캡처. restoredValue 는 일단 채워두고 더 OLD 가 있으면 덮어씀.
      finalByKey.set(k, {
        storage,
        key: e.field_key,
        restoredValue: restored,
        currentValue: deserializeFromHistory(storage, e.new_value),
      })
    }
  }

  // 4. Separate column and data updates.
  const columnUpdates: Record<string, unknown> = {}
  const dataKeyUpdates = new Map<string, unknown>()
  for (const f of finalByKey.values()) {
    if (f.storage === 'column') {
      if (REGULAR_COLUMNS.has(f.key)) columnUpdates[f.key] = f.restoredValue
    } else {
      dataKeyUpdates.set(f.key, f.restoredValue)
    }
  }

  // 5+6. Column + data 업데이트를 한 번의 UPDATE 로 합쳐서 부분 실패 윈도우 최소화.
  const updateObj: Record<string, unknown> = { ...columnUpdates }
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
    updateObj.data = next
  }
  if (Object.keys(updateObj).length > 0) {
    const { error } = await supabase.from('cases').update(updateObj).eq('id', caseId)
    if (error) return { ok: false, error: error.message }
  }

  // 7. 새 history entries 기록 — 복원 행위 자체를 정상 변경 이벤트로 남긴다.
  //    옛 동작은 consumed entries 를 DELETE 했지만 audit trail 이 사라져 (1) 무엇이 복원됐는지
  //    추적 불가, (2) Ctrl+Z(undoLastChange) 로 복원 자체를 되돌리는 경로가 끊김.
  //    각 필드의 currentValue(복원 직전) → restoredValue(복원 후) 를 새 entry 로 insert.
  //    실제로 값이 바뀐 필드만 (currentValue !== restoredValue) 기록.
  const orgId = (await supabase
    .from('cases')
    .select('org_id')
    .eq('id', caseId)
    .single()).data?.org_id as string | undefined
  if (orgId) {
    const historyRows: Array<{
      case_id: string
      org_id: string
      field_key: string
      field_storage: 'column' | 'data'
      old_value: string | null
      new_value: string | null
    }> = []
    for (const f of finalByKey.values()) {
      const oldSer = serializeForHistory(f.storage, f.currentValue)
      const newSer = serializeForHistory(f.storage, f.restoredValue)
      if (oldSer === newSer) continue
      historyRows.push({
        case_id: caseId,
        org_id: orgId,
        field_key: f.key,
        field_storage: f.storage,
        old_value: oldSer,
        new_value: newSer,
      })
    }
    if (historyRows.length > 0) {
      await supabase.from('case_history').insert(historyRows)
    }
  }

  // revalidatePath 미사용 — 반환된 restored 배열을 클라이언트가 updateLocalCaseField 로 일괄 반영.
  return {
    ok: true,
    restored: Array.from(finalByKey.values()).map((f) => ({
      storage: f.storage,
      key: f.key,
      value: f.restoredValue,
    })),
  }
}

// ───── 신고 탭 상태 변경 (일본 케이스 양방향 sync) ─────
//
// admin 신고탭 dropdown 변경 시 portal data 필드를 atomic 하게 patch.
// portal 의 사전신고·수출검역 step 시그널과 같은 키를 공유 — 어느 쪽 변경이든 즉시 반영.
//
// 매핑:
//   - not_started: 진행 시그널 제거 (date·skipped·confirmed·demoted_at). 첨부는 portal
//     관할이라 손대지 않음 — 첨부가 남아 있으면 derive 가 'done' 으로 잡으므로 admin 의
//     '대기' 의도가 표면에 안 보일 수 있음. UI 에서 confirm 시 안내.
//   - in_progress: 현재 done 시그널이 있으면 demote (admin_demoted_at = now).
//     date 가 비어 있으면 today 로 set (derive 가 'in_progress' 로 잡히도록).
//   - done: skipped (사전신고) / confirmed (수출검역, date+time 있는 경우만; 없으면 skipped)
//     set + demoted_at 클리어.

type ReportTarget = 'not_started' | 'in_progress' | 'done'

async function patchCaseData(
  caseId: string,
  mutate: (data: Record<string, unknown>) => void,
): Promise<UpdateResult> {
  const supabase = await createClient()
  const { data: row, error: fetchErr } = await supabase
    .from('cases')
    .select('data')
    .eq('id', caseId)
    .single()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  const current = ((row?.data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
  const next = { ...current }
  mutate(next)
  const { error } = await supabase.from('cases').update({ data: next }).eq('id', caseId)
  if (error) return { ok: false, error: error.message }
  // autoFilled.data 채널로 patched data 를 클라이언트에 반환 — 호출자가 replaceLocalCaseData
  // 로 반영. (UpdateResult 형 호환 유지하면서 다중 키 업데이트 결과를 전달.)
  return { ok: true, autoFilled: { data: next } }
}

function hasAdvanceAttachment(data: Record<string, unknown>): boolean {
  const docs = Array.isArray(data.documents) ? data.documents : []
  return docs.some(
    (d) =>
      !!d &&
      typeof d === 'object' &&
      (d as Record<string, unknown>).stepId === 'advance-notification',
  )
}

export async function setAdvanceNotificationReportStatus(
  caseId: string,
  target: ReportTarget,
): Promise<UpdateResult> {
  return patchCaseData(caseId, (d) => {
    // 새 액션이 호출되는 시점 = derive 모드로 전환. legacy stored 는 클리어.
    delete d.import_import_status
    if (target === 'not_started') {
      delete d.advance_notification_date
      delete d.advance_notification_approval_skipped
      delete d.advance_notification_admin_demoted_at
      return
    }
    if (target === 'in_progress') {
      const wasDone =
        hasAdvanceAttachment(d) || d.advance_notification_approval_skipped === true
      if (wasDone) {
        d.advance_notification_admin_demoted_at = new Date().toISOString()
        delete d.advance_notification_approval_skipped
      } else {
        // 대기 → 진행중: 신청일이 없으면 오늘로 — derive 가 'in_progress' 로 잡힘.
        if (typeof d.advance_notification_date !== 'string' || (d.advance_notification_date as string).length < 10) {
          d.advance_notification_date = new Date().toISOString().slice(0, 10)
        }
      }
      return
    }
    // target === 'done'
    d.advance_notification_approval_skipped = true
    delete d.advance_notification_admin_demoted_at
    // 신청일이 비어 있으면 오늘로 (skipped + date 가 정합).
    if (typeof d.advance_notification_date !== 'string' || (d.advance_notification_date as string).length < 10) {
      d.advance_notification_date = new Date().toISOString().slice(0, 10)
    }
  })
}

export async function setJpExportQuarantineReportStatus(
  caseId: string,
  target: ReportTarget,
): Promise<UpdateResult> {
  return patchCaseData(caseId, (d) => {
    // 새 액션이 호출되는 시점 = derive 모드로 전환. legacy stored 는 클리어.
    delete d.import_export_status
    if (target === 'not_started') {
      delete d.jp_export_quarantine_application_date
      delete d.jp_export_quarantine_reservation_skipped
      delete d.jp_export_quarantine_confirmed
      delete d.jp_export_quarantine_admin_demoted_at
      return
    }
    if (target === 'in_progress') {
      // 완료 단일 경로(skip 플래그) 기준. legacy confirmed=true 가 남아 있을 수 있으니
      // 같이 정리한다(이제 derive 에서 무시되지만 데이터 위생 차원).
      const wasDone = d.jp_export_quarantine_reservation_skipped === true
      delete d.jp_export_quarantine_confirmed
      if (wasDone) {
        d.jp_export_quarantine_admin_demoted_at = new Date().toISOString()
        delete d.jp_export_quarantine_reservation_skipped
      } else {
        if (
          typeof d.jp_export_quarantine_application_date !== 'string' ||
          (d.jp_export_quarantine_application_date as string).length < 10
        ) {
          d.jp_export_quarantine_application_date = new Date().toISOString().slice(0, 10)
        }
      }
      return
    }
    // target === 'done' — 완료는 단일 경로(reservation_skipped 플래그)로 일원화.
    // 예약일·시간은 '희망' 데이터로만 취급되고 완료 판정에 영향 없음. legacy confirmed
    // 플래그가 남아 있다면 정리한다(이제 derive 에서 무시되지만 데이터 위생 차원).
    delete d.jp_export_quarantine_admin_demoted_at
    d.jp_export_quarantine_reservation_skipped = true
    delete d.jp_export_quarantine_confirmed
    if (
      typeof d.jp_export_quarantine_application_date !== 'string' ||
      (d.jp_export_quarantine_application_date as string).length < 10
    ) {
      d.jp_export_quarantine_application_date = new Date().toISOString().slice(0, 10)
    }
  })
}

