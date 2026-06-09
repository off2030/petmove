'use server'

/**
 * 외부 정보 입력용 매직 링크 — 수신자 측 액션 (anon).
 *
 * 발신 측(createShareLink/revoke 등)은 admin 앱의 동일 모듈 (apps/admin/lib/actions/
 * share-links.ts) 에 살아있다. portal 은 토큰 진입 흐름만 호스팅.
 *
 * 흐름:
 *  /share/[token] 열기 → getShareLinkByToken 으로 폼 표시 → submitShareLink 로 제출
 *  → 결과: 케이스에 직접 반영, submitted_at 마킹
 *
 * 도메인 헬퍼는 @petmove/domain 에서 import — admin 과 단일 출처 공유.
 */

import { createAdminClient } from '@petmove/auth'
import {
  formatMicrochip,
  buildShareFieldDescriptors,
  type ShareFieldDescriptor,
  shareLinkStatus,
  SHARE_COLUMN_FIELDS,
  SHARE_VACCINE_GROUPS,
  loadDestinationOverridesByOrg,
  getEffectiveExtraFieldEntries,
  isDestinationScopedKey,
  parseDestinations,
  readByDestValue,
  writeByDestValue,
  applyAutoFillRules,
  type CaseRow,
  type FieldDefinition,
  type DestinationExtraFieldEntry,
  type ShareFieldSpec,
  type ShareLinkPublicView,
  type ShareLinkRow,
  type ShareVaccineEntry,
  type ShareVaccineGroup,
} from '@petmove/domain'
import breedsData from '@petmove/domain/data/breeds.json'
import colorsData from '@petmove/domain/data/colors.json'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * fieldKeys → ShareFieldSpec[] 조립.
 * (admin/lib/actions/share-links.ts 와 동일 — 좌표 권위는 buildShareFieldDescriptors)
 */
async function buildFieldSpecs(
  fieldKeys: string[],
  fieldIds: string[] | null | undefined,
  destinationScope: string | null | undefined,
  caseRow: CaseRow,
  extraEntries: DestinationExtraFieldEntry[],
): Promise<ShareFieldSpec[]> {
  const allKeys = new Set(fieldKeys)
  const fieldDefs = await fetchFieldDefinitionsForKeys(fieldKeys)

  const descriptors = buildShareFieldDescriptors({
    fieldDefs,
    destinationScope,
    extraFieldEntries: extraEntries,
    caseScoped: null,
  })

  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const out: ShareFieldSpec[] = []
  const hasResolvedIds = !!fieldIds?.some((id) => id.includes(':'))
  const idFilter = hasResolvedIds ? new Set(fieldIds) : null
  for (const d of descriptors) {
    if (idFilter ? !idFilter.has(d.id) : !allKeys.has(d.key)) continue
    out.push(toShareFieldSpec(d, caseRow, data, destinationScope))
  }
  return out
}

async function fetchFieldDefinitionsForKeys(fieldKeys: string[]): Promise<FieldDefinition[]> {
  if (fieldKeys.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('field_definitions')
    .select('*')
    .is('org_id', null)
    .in('key', fieldKeys)
  return (data ?? []) as FieldDefinition[]
}

function toShareFieldSpec(
  d: ShareFieldDescriptor,
  caseRow: CaseRow,
  data: Record<string, unknown>,
  destinationScope: string | null | undefined,
): ShareFieldSpec {
  const base = {
    id: d.id,
    key: d.key,
    label: d.label,
    category: d.category,
    subgroup: d.subgroup,
  } as const
  // 다중 목적지 + scope 지정 + scoped 키: by_dest 우선 (null sentinel 도 인식).
  const isMulti = parseDestinations(caseRow.destination).length > 1
  const useByDest = isMulti && !!destinationScope && isDestinationScopedKey(d.key)
  const byDestVal = useByDest ? readByDestValue(data, destinationScope ?? null, d.key) : undefined
  switch (d.source.kind) {
    case 'column': {
      const meta = d.source.meta
      return {
        ...base,
        storage: 'column',
        type: meta.type,
        current_value: useByDest
          ? (byDestVal === undefined ? ((caseRow as unknown as Record<string, unknown>)[d.key] ?? null) : byDestVal)
          : ((caseRow as unknown as Record<string, unknown>)[d.key] ?? null),
      }
    }
    case 'data': {
      const def = d.source.def
      return {
        ...base,
        storage: 'data',
        type: def.type as ShareFieldSpec['type'],
        options: def.options ?? undefined,
        current_value: useByDest
          ? (byDestVal === undefined ? (data[d.key] ?? null) : byDestVal)
          : (data[d.key] ?? null),
      }
    }
    case 'synthetic-vaccine': {
      const g = d.source.group
      return {
        ...base,
        storage: 'synthetic',
        type: 'date_array',
        max_entries: g.max_entries,
        hide_valid_until: g.hide_valid_until,
        current_value: extractVaccineEntries(g, data),
      }
    }
    case 'extra': {
      const ed = d.source.def
      return {
        ...base,
        storage: 'data',
        type: mapExtraType(ed.type),
        options: ed.options?.map((o) => ({ value: o.value, label_ko: o.label })),
        current_value: useByDest
          ? (byDestVal === undefined ? (data[d.key] ?? null) : byDestVal)
          : (data[d.key] ?? null),
      }
    }
  }
}

function mapExtraType(t: string): ShareFieldSpec['type'] {
  switch (t) {
    case 'date': return 'date'
    case 'select': return 'select'
    case 'email': return 'text'
    case 'time': return 'text'
    default: return 'text'
  }
}

const VACCINE_GROUP_BY_KEY = new Map<string, ShareVaccineGroup>(
  SHARE_VACCINE_GROUPS.map((g) => [g.key, g]),
)

function extractVaccineEntries(
  group: ShareVaccineGroup,
  data: Record<string, unknown>,
): ShareVaccineEntry[] {
  const entries: ShareVaccineEntry[] = []
  if (group.storage_mode === 'array' && group.array_key) {
    const arr = data[group.array_key]
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const obj = item as Record<string, unknown>
        if (group.has_other_hospital && obj.other_hospital !== true) continue
        const date = typeof obj.date === 'string' ? obj.date : ''
        if (!date) continue
        entries.push({
          date,
          valid_until: typeof obj.valid_until === 'string' ? obj.valid_until : null,
          product: typeof obj.product === 'string' ? obj.product : null,
          manufacturer: typeof obj.manufacturer === 'string' ? obj.manufacturer : null,
          lot: typeof obj.lot === 'string' ? obj.lot : null,
          expiry: typeof obj.expiry === 'string' ? obj.expiry : null,
          other_hospital: group.has_other_hospital ? true : null,
        })
      }
    }
  }
  return entries
}

function caseLabelFrom(c: CaseRow): string {
  const customer = c.customer_name || ''
  const pet = c.pet_name || c.pet_name_en || ''
  const parts = [customer, pet].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : '(이름 없음)'
}

// ─────────────────────────────────────────────────
// 수신자 측 액션 (anon)
// ─────────────────────────────────────────────────

/** 토큰으로 폼 표시용 데이터 로드. service role 우회. */
export async function getShareLinkByToken(
  token: string,
): Promise<Result<ShareLinkPublicView>> {
  try {
    if (!UUID_RE.test(token)) return { ok: false, error: '유효하지 않은 링크입니다' }
    const admin = createAdminClient()
    const { data: link, error: lErr } = await admin
      .from('case_share_links')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (lErr) return { ok: false, error: lErr.message }
    if (!link) return { ok: false, error: '유효하지 않은 링크입니다' }

    const row = link as ShareLinkRow
    const status = shareLinkStatus(row)

    const { data: caseRow } = await admin
      .from('cases')
      .select('*')
      .eq('id', row.case_id)
      .maybeSingle()
    if (!caseRow) return { ok: false, error: '연결된 여정을 찾을 수 없습니다' }
    const { data: orgRow } = await admin
      .from('organizations')
      .select('name, name_en')
      .eq('id', row.org_id)
      .maybeSingle()

    const destOverrides = await loadDestinationOverridesByOrg(admin, row.org_id)
    const destinationScope = row.destination_scope || (caseRow as CaseRow).destination
    const extraEntries = getEffectiveExtraFieldEntries(destinationScope, destOverrides)
    const fields = await buildFieldSpecs(
      row.field_keys,
      row.field_ids,
      destinationScope,
      caseRow as CaseRow,
      extraEntries,
    )

    return {
      ok: true,
      value: {
        token: row.token,
        case_label: caseLabelFrom(caseRow as CaseRow),
        org_name: (orgRow?.name as string | undefined) ?? '',
        org_name_en: (orgRow?.name_en as string | undefined) ?? '',
        title: row.title,
        fields,
        status,
        expires_at: row.expires_at,
        submitted_at: row.submitted_at,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export interface SubmitShareLinkInput {
  token: string
  /** key → 사용자 입력 값 (string, number, null). 화이트리스트 외 키는 무시. */
  values: Record<string, unknown>
  submitterName?: string | null
  submitterNote?: string | null
}

export async function submitShareLink(
  input: SubmitShareLinkInput,
): Promise<Result<null>> {
  try {
    if (!UUID_RE.test(input.token)) return { ok: false, error: '유효하지 않은 링크입니다' }
    const admin = createAdminClient()
    const { data: link, error: lErr } = await admin
      .from('case_share_links')
      .select('*')
      .eq('token', input.token)
      .maybeSingle()
    if (lErr) return { ok: false, error: lErr.message }
    if (!link) return { ok: false, error: '유효하지 않은 링크입니다' }
    const row = link as ShareLinkRow
    const status = shareLinkStatus(row)
    if (status === 'submitted') return { ok: false, error: '이미 제출된 링크입니다' }
    if (status === 'expired') return { ok: false, error: '만료된 링크입니다' }
    if (status === 'revoked') return { ok: false, error: '취소된 링크입니다' }

    // 화이트리스트 적용 — 허용 외 키는 통째 무시
    const allowed = new Set(row.field_keys)
    const colUpdate: Record<string, unknown> = {}
    const dataUpdate: Record<string, unknown> = {}

    const vaccineSubmissions: { group: ShareVaccineGroup; entries: ShareVaccineEntry[] }[] = []
    for (const group of SHARE_VACCINE_GROUPS) {
      if (!allowed.has(group.key)) continue
      const raw = input.values[group.key]
      if (!Array.isArray(raw)) continue
      const flagOther = group.has_other_hospital === true
      const entries: ShareVaccineEntry[] = []
      for (const item of raw as unknown[]) {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          const date = typeof obj.date === 'string' ? obj.date.trim() : ''
          if (!date) continue
          entries.push({
            date,
            valid_until: cleanString(obj.valid_until),
            product: cleanString(obj.product),
            manufacturer: cleanString(obj.manufacturer),
            lot: cleanString(obj.lot),
            expiry: cleanString(obj.expiry),
            other_hospital: flagOther ? true : null,
          })
        } else if (typeof item === 'string' && item.trim()) {
          entries.push({ date: item.trim(), other_hospital: flagOther ? true : null })
        }
      }
      if (group.storage_mode === 'array' && group.array_key) {
        vaccineSubmissions.push({ group, entries })
      } else if (group.storage_mode === 'split_singles' && group.split_keys) {
        const max = group.max_entries ?? group.split_keys.length
        for (let i = 0; i < group.split_keys.length; i++) {
          dataUpdate[group.split_keys[i]] = i < max && entries[i] ? entries[i].date : null
        }
      }
    }

    for (const [key, raw] of Object.entries(input.values)) {
      if (!allowed.has(key)) continue
      if (VACCINE_GROUP_BY_KEY.has(key)) continue
      const value = normalizeValue(key, raw)
      if (value === undefined) continue
      if (value === null) continue
      if (typeof value === 'string' && value.trim() === '') continue
      if (Array.isArray(value) && value.length === 0) continue
      if (SHARE_COLUMN_FIELDS.has(key)) {
        colUpdate[key] = value
      } else {
        dataUpdate[key] = value
      }
    }

    // 출국 항공편 날짜 → 케이스 departure_date(출국일) 컬럼 동기화.
    // 일본: departure_flight_date 가 출발일 = 출국일. 양방향 sync — 한쪽만 입력돼도 다른 쪽 채움.
    //
    // 일본 외 destination 의 entry_date(도착일) → departure_date 단방향 sync 는 제거됨.
    //   기존 legacy 동작은 같은 날 가정으로 적용됐지만, 스위스·태국·미국·하와이 등 시차 큰
    //   노선에선 entry_date(도착일) 와 departure_date(출국일) 가 다른 날일 수 있어 잘못된 값을
    //   덮어쓸 위험이 있음. 이제 admin 이 share-link field_keys 에 departure_date 를 명시적으로
    //   포함하거나, 차후 org_auto_fill_rules 의 destination 별 룰로 처리.
    if (typeof dataUpdate.departure_flight_date === 'string' && dataUpdate.departure_flight_date.trim()) {
      colUpdate.departure_date = dataUpdate.departure_flight_date.trim()
    } else if (typeof colUpdate.departure_date === 'string' && colUpdate.departure_date.trim()) {
      // 보호자가 출국일을 직접 적은 경우 — 일본 케이스면 departure_flight_date 도 같이 채움.
      // (allowed 키 화이트리스트 통과한 입력만 colUpdate 에 들어왔음.)
      if (!dataUpdate.departure_flight_date) {
        dataUpdate.departure_flight_date = colUpdate.departure_date.trim()
      }
    }

    // 항공권 구매 step 표시 날짜 = 정보 입력 날짜(flight_info_recorded_at). 매직링크로 항공권
    // 필드가 처음 입력되는 시점에 캡처 (실제 머지는 needsDataRead 블록 안에서 기존 값 유무 확인 후 세팅).
    const flightShareKeys = [
      'departure_flight_date',
      'entry_date',
      'entry_departure_airport',
      'entry_airport',
      'entry_flight_number',
      'entry_transport',
      'return_date',
      'return_departure_airport',
      'return_arrival_airport',
      'return_flight_number',
      'return_transport',
    ] as const
    const recordingFlightInfo = flightShareKeys.some((k) => {
      const v = dataUpdate[k]
      return typeof v === 'string' && v.trim().length > 0
    })

    // breed/color 한글 → 영문 자동 보정
    if (typeof dataUpdate.breed === 'string' && dataUpdate.breed.trim()) {
      const ko = dataUpdate.breed.trim()
      const matched = (breedsData as Array<{ ko: string; en: string }>).find((b) => b.ko === ko)
      if (matched) dataUpdate.breed_en = matched.en
    }
    if (typeof dataUpdate.color === 'string' && dataUpdate.color.trim()) {
      const kos = dataUpdate.color.split(',').map((s) => s.trim()).filter(Boolean)
      const colors = colorsData as Array<{ ko: string; en: string }>
      const ens = kos.map((ko) => colors.find((c) => c.ko === ko)?.en ?? ko)
      dataUpdate.color_en = ens.join(', ')
    }

    // 현재 case data + destination 컨텍스트 머지.
    // 다중 목적지 케이스 + share-link 가 destination_scope 지정 시: scoped 키는 by_dest 경로로.
    const updates: Record<string, unknown> = {}
    const { data: caseInfo } = await admin
      .from('cases')
      .select('data, destination')
      .eq('id', row.case_id)
      .maybeSingle()
    const current = ((caseInfo?.data as Record<string, unknown> | null) ?? {})
    const caseDestination = (caseInfo as { destination?: string | null } | null)?.destination ?? null
    // B: 단일도 by_dest 통일 — scope 미지정이면 단일 목적지의 유일 토큰으로 resolve.
    // (다중 목적지인데 scope 가 없으면 어느 칸인지 알 수 없어 종전대로 top-level.)
    const caseDests = parseDestinations(caseDestination)
    const scope = row.destination_scope ?? (caseDests.length === 1 ? caseDests[0] : null)
    const useByDest = !!scope

    // colUpdate 처리 — by_dest 모드면 departure_date 같은 scoped 컬럼은 by_dest 로.
    const colNonScoped: Record<string, unknown> = {}
    let merged: Record<string, unknown> = { ...current }
    for (const [k, v] of Object.entries(colUpdate)) {
      if (useByDest && isDestinationScopedKey(k)) {
        merged = writeByDestValue(merged, scope!, k, v)
      } else {
        colNonScoped[k] = v
      }
    }
    Object.assign(updates, colNonScoped)

    const needsDataRead = Object.keys(dataUpdate).length > 0 || vaccineSubmissions.length > 0 || useByDest
    if (needsDataRead) {
      for (const [k, v] of Object.entries(dataUpdate)) {
        if (useByDest && isDestinationScopedKey(k)) {
          // scoped 키 → by_dest 경로. null/empty 는 명시 sentinel 로 저장됨.
          merged = writeByDestValue(merged, scope!, k, v)
          continue
        }
        if (v === null || v === undefined) delete merged[k]
        else merged[k] = v
      }
      // 항공권 정보 최초 입력 시점에만 캡처 — 기존 값이 있으면 덮어쓰지 않음 (updateFlightFields 와 동일).
      if (recordingFlightInfo && typeof merged.flight_info_recorded_at !== 'string') {
        merged.flight_info_recorded_at = new Date().toISOString().slice(0, 10)
      }
      for (const { group, entries } of vaccineSubmissions) {
        if (!group.array_key) continue
        if (entries.length === 0) continue
        const existing = Array.isArray(merged[group.array_key])
          ? (merged[group.array_key] as unknown[])
          : []
        const flagOther = group.has_other_hospital === true
        const baseRecords = flagOther
          ? existing.filter((item) => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) return true
              return (item as { other_hospital?: boolean }).other_hospital !== true
            })
          : []
        const recipientRecords = entries.map((e) => {
          const rec: Record<string, unknown> = { date: e.date }
          if (flagOther) rec.other_hospital = true
          if (e.valid_until) rec.valid_until = e.valid_until
          if (e.product) rec.product = e.product
          if (e.manufacturer) rec.manufacturer = e.manufacturer
          if (e.lot) rec.lot = e.lot
          if (e.expiry) rec.expiry = e.expiry
          return rec
        })
        merged[group.array_key] = [...baseRecords, ...recipientRecords]
      }
      updates.data = merged
    }

    // Atomic claim
    const submittedAt = new Date().toISOString()
    const { data: claimed, error: markErr } = await admin
      .from('case_share_links')
      .update({
        submitted_at: submittedAt,
        submitter_name: input.submitterName?.trim() || null,
        submitter_note: input.submitterNote?.trim() || null,
      })
      .eq('id', row.id)
      .is('submitted_at', null)
      .select('id')
      .maybeSingle()
    if (markErr) return { ok: false, error: markErr.message }
    if (!claimed) return { ok: false, error: '이미 제출된 링크입니다' }

    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await admin
        .from('cases')
        .update(updates)
        .eq('id', row.case_id)
      if (upErr) {
        await admin
          .from('case_share_links')
          .update({
            submitted_at: null,
            submitter_name: null,
            submitter_note: null,
          })
          .eq('id', row.id)
          .eq('submitted_at', submittedAt)
        if (upErr.message.includes('cases_microchip_global_unique')) {
          return { ok: false, error: '이미 등록된 마이크로칩 번호입니다' }
        }
        return { ok: false, error: upErr.message }
      }

      // 매직링크 입력 후 org_auto_fill_rules 트리거 — 예: 일본 departure_flight_date ↔
      // departure_date 양방향 sync, departure_date 변경 시 백신 일정 자동 계산 등이
      // admin 의 updateCaseField 와 동일하게 portal 입력에서도 적용되도록.
      //  - useByDest 면 활성 목적지 scope 를 넘겨 by_dest 경로로 라우팅.
      //  - userEditedKey 는 명시 안 함 — 본 share-link 는 다중 키 입력이므로 전부 유효.
      //    각 룰의 overwrite_existing 플래그로 사용자가 방금 입력한 값 보호 (기본 false).
      try {
        await applyAutoFillRules(admin, row.case_id, undefined, useByDest ? scope : null)
      } catch { /* best-effort — 실패해도 share-link 제출 자체는 성공 */ }
    }

    // portal 은 아직 /cases 라우트가 없어 revalidatePath 생략. admin 측은 자체 캐시
    // 컨텍스트라 portal 의 revalidate 가 admin 에 전파되지 않음 — admin 은 자연 만료 또는
    // 실시간 채널(realtime) 로 refresh.

    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function normalizeValue(key: string, raw: unknown): unknown {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t === '') return null
    if (key === 'microchip') return formatMicrochip(t)
    return t
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }
  if (Array.isArray(raw)) {
    return raw
  }
  return raw
}
