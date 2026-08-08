'use server'

/**
 * 외부 정보 입력용 매직 링크 — 수신자(보호자) 측 액션 (anon).
 *
 * 발신 측(createShareLink/revoke 등)은 같은 디렉터리의 share-links.ts.
 * 본 모듈은 토큰 진입 흐름(/share/[token]) 만 호스팅한다.
 *
 * 흐름:
 *  /share/[token] 열기 → getShareLinkByToken 으로 폼 표시 → submitShareLink 로 제출
 *  → 결과: 케이스에 직접 반영, submitted_at 마킹
 *
 * 인증 모델: 토큰 자체가 인증이다 (/apply 공개 신청폼과 동일 패턴). createAdminClient
 *  (service role, RLS 우회) 를 쓰지만 UUID 토큰 검증 + field_keys 화이트리스트로
 *  접근 범위를 케이스 1건의 허용 필드로 한정 — proxy.ts 의 /share PUBLIC_PREFIXES 통과.
 *
 * 도메인 헬퍼는 @petmove/domain 에서 import — 발신 측과 단일 출처 공유.
 *
 * 이력: Phase 11.0.5 에서 portal 로 이전됐다가, share 폼이 펫무브워크 Editorial 톤
 *  (@petmove/ui) 그대로였고 "스태프가 보내는 정보 수집 폼" 성격이라 work 도메인으로
 *  회귀. 입력 정보는 cases 테이블에 직접 반영되므로 펫무브 앱 연동은 DB 로 그대로 유지.
 */

import { reportActionError } from './_report-error'
import { randomUUID } from 'node:crypto'
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
  resolveShareScopeToken,
  readByDestValue,
  writeByDestValue,
  computeAutoFill,
  SHARE_FILE_REQUESTS,
  shareFileRequestByKey,
  SHARE_RECIPIENT_FIELD_DESCRIPTION,
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
 * (좌표 권위는 buildShareFieldDescriptors)
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
    description: SHARE_RECIPIENT_FIELD_DESCRIPTION[d.key],
  } as const
  // scoped 키는 여행지 개수와 무관하게 by_dest 우선 (null sentinel 도 인식) — 아래 제출
  // 경로가 단일 여행지에서도 by_dest 에 쓰기 때문. isMulti 게이트를 두면 단일 여행지
  // 케이스에서 이미 받은 값이 수신자 폼에 빈 칸으로 보인다(shareDescriptorHasValue 와 동일 수정).
  const scopeToken = resolveShareScopeToken(caseRow.destination, destinationScope)
  const useByDest = !!scopeToken && isDestinationScopedKey(d.key)
  const byDestVal = useByDest ? readByDestValue(data, scopeToken, d.key) : undefined
  // by_dest 에 없을 때의 폴백 — 단일 여행지는 top-level 잔존값(legacy)까지 보여주고,
  // 다중 여행지는 보여주지 않는다(다른 여행지 값이 이 여행지 폼에 프리필되는 누수 차단).
  const isMulti = parseDestinations(caseRow.destination).length > 1
  const fallback = <T,>(topLevel: T): T | null =>
    useByDest && isMulti ? null : (topLevel ?? null)
  switch (d.source.kind) {
    case 'column': {
      const meta = d.source.meta
      return {
        ...base,
        storage: 'column',
        type: meta.type,
        current_value: useByDest && byDestVal !== undefined
          ? byDestVal
          : fallback((caseRow as unknown as Record<string, unknown>)[d.key]),
      }
    }
    case 'data': {
      const def = d.source.def
      return {
        ...base,
        storage: 'data',
        type: def.type as ShareFieldSpec['type'],
        options: def.options ?? undefined,
        current_value: useByDest && byDestVal !== undefined
          ? byDestVal
          : fallback(data[d.key]),
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
        dose_offset: g.has_other_hospital ? countOwnHospitalEntries(g, data) : undefined,
      }
    }
    case 'extra': {
      const ed = d.source.def
      return {
        ...base,
        storage: 'data',
        type: mapExtraType(ed.type),
        options: ed.options?.map((o) => ({ value: o.value, label_ko: o.label })),
        current_value: useByDest && byDestVal !== undefined
          ? byDestVal
          : fallback(data[d.key]),
      }
    }
  }
}

/**
 * 보호자가 공유 링크로 제출한 변경분을 case_history 행으로 만든다.
 *
 * WHY: 이 액션은 cases 를 직접 UPDATE 하면서 이력을 남기지 않았다. 그래서 링크로 들어온
 * 값은 '이력' 화면에 아무 흔적이 없고, 나중에 어떤 경로로든 덮어써지면 되돌릴 방법이
 * 없었다(2026-08-03 시월 해외주소 소실 — 이력 0건이라 백업 말고는 복구 수단이 없었음).
 *
 * 직렬화·field_key 규칙은 admin cases.ts 의 serializeForHistory / updateCaseField 와 동일해야
 * undo(restoreToHistoryPoint)가 같은 값을 되돌릴 수 있다:
 *   - data       : null/undefined/'' → null, 그 외 JSON.stringify
 *   - column     : null/'' → null, 그 외 String(value)
 *   - by_dest 키 : field_key = `by_dest:{여행지}:{키}`, storage = 'data'
 *
 * updates.data 전체를 before 와 비교하므로 auto-fill(computeAutoFill)이 덧붙인 변경도 함께 남는다.
 */
function buildSubmitHistoryRows(args: {
  caseId: string
  orgId: string
  before: Record<string, unknown>
  beforeColumns: Record<string, unknown>
  updates: Record<string, unknown>
}): Array<{
  case_id: string
  org_id: string
  field_key: string
  field_storage: 'column' | 'data'
  old_value: string | null
  new_value: string | null
}> {
  const { caseId, orgId, before, beforeColumns, updates } = args
  if (!orgId) return []

  const ser = (storage: 'column' | 'data', v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null
    return storage === 'column' ? String(v) : JSON.stringify(v)
  }
  const rows: Array<{
    case_id: string
    org_id: string
    field_key: string
    field_storage: 'column' | 'data'
    old_value: string | null
    new_value: string | null
  }> = []
  const push = (field_key: string, field_storage: 'column' | 'data', oldV: unknown, newV: unknown) => {
    const o = ser(field_storage, oldV)
    const n = ser(field_storage, newV)
    if (o === n) return
    rows.push({ case_id: caseId, org_id: orgId, field_key, field_storage, old_value: o, new_value: n })
  }

  const asObj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

  const after = updates.data as Record<string, unknown> | undefined
  if (after) {
    // top-level data 키 (by_dest 는 아래에서 여행지·키 단위로 따로 기록).
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (k === 'by_dest') continue
      push(k, 'data', before[k], after[k])
    }
    // by_dest[여행지][키]
    const bBy = asObj(before['by_dest'])
    const aBy = asObj(after['by_dest'])
    for (const dest of new Set([...Object.keys(bBy), ...Object.keys(aBy)])) {
      const bDest = asObj(bBy[dest])
      const aDest = asObj(aBy[dest])
      for (const k of new Set([...Object.keys(bDest), ...Object.keys(aDest)])) {
        push(`by_dest:${dest}:${k}`, 'data', bDest[k], aDest[k])
      }
    }
  }

  // 컬럼 — updates 에 실린 것만 (data 제외).
  for (const [k, v] of Object.entries(updates)) {
    if (k === 'data') continue
    push(k, 'column', beforeColumns[k], v)
  }

  return rows
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

/** rabies_dates 등 배열에서 '우리 병원' 기록(other_hospital 플래그 없는) 건수 — dose_offset 계산용. */
function countOwnHospitalEntries(
  group: ShareVaccineGroup,
  data: Record<string, unknown>,
): number {
  if (group.storage_mode !== 'array' || !group.array_key) return 0
  const arr = data[group.array_key]
  if (!Array.isArray(arr)) return 0
  let count = 0
  for (const item of arr) {
    if (typeof item === 'string') {
      if (item.trim()) count++
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const obj = item as Record<string, unknown>
    if (obj.other_hospital === true) continue
    const date = typeof obj.date === 'string' ? obj.date : ''
    if (date) count++
  }
  return count
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

    // 요청된 파일 슬롯 — 저장된 key 를 도메인 정의로 라벨·필수여부 복원(정의 순서).
    const requestedKeys = new Set(row.file_request_keys ?? [])
    const fileRequests = SHARE_FILE_REQUESTS.filter((r) => requestedKeys.has(r.key)).map((r) => ({
      key: r.key,
      label: r.label,
      required: r.required,
    }))

    return {
      ok: true,
      value: {
        token: row.token,
        case_label: caseLabelFrom(caseRow as CaseRow),
        org_name: (orgRow?.name as string | undefined) ?? '',
        org_name_en: (orgRow?.name_en as string | undefined) ?? '',
        title: row.title,
        fields,
        file_requests: fileRequests,
        status,
        expires_at: row.expires_at,
        submitted_at: row.submitted_at,
      },
    }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'share-links-public.getShareLinkByToken') }
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
    // 다중 여행지 케이스 + share-link 가 destination_scope 지정 시: scoped 키는 by_dest 경로로.
    const updates: Record<string, unknown> = {}
    const { data: caseInfo } = await admin
      .from('cases')
      // org_id·departure_date 는 auto-fill 룰(computeAutoFill pending 스냅샷) 계산용.
      .select('data, destination, org_id, departure_date')
      .eq('id', row.case_id)
      .maybeSingle()
    const current = ((caseInfo?.data as Record<string, unknown> | null) ?? {})
    const caseDestination = (caseInfo as { destination?: string | null } | null)?.destination ?? null
    const caseOrgId = (caseInfo as { org_id?: string } | null)?.org_id ?? ''
    const caseDepartureDate = (caseInfo as { departure_date?: string | null } | null)?.departure_date ?? null
    // 활성 여행지 토큰을 읽기(flatten)와 동일하게 해석 — scope 미지정이면 첫 토큰으로 폴백한다.
    // 읽기(activeDestinationView/buildCaseJourneyContext)가 activeDest 없을 때 첫 토큰으로 폴백하므로,
    // 쓰기도 첫 토큰 by_dest 에 저장해야 일치한다. 다중 여행지인데 scope 없이 top-level 에 쓰면
    // strict flatten 이 떨궈 제출값이 증발한다(resolveWriteToken 과 동일 컨벤션).
    // destination_scope 가 "캐나다, 말레이시아" 같은 다중 문자열로 저장돼 있으면 첫 토큰으로
    // 정규화한다 — 그대로 쓰면 by_dest["캐나다, 말레이시아"] 라는 아무 리더도 안 보는 칸에
    // 저장돼 제출값이 조용히 사라진다. 읽기(toShareFieldSpec)와 같은 함수를 쓴다.
    const caseDests = parseDestinations(caseDestination)
    const scope = resolveShareScopeToken(caseDestination, row.destination_scope)
    const useByDest = !!scope

    // colUpdate 처리 — by_dest 모드면 departure_date 같은 scoped 컬럼은 by_dest 로.
    const colNonScoped: Record<string, unknown> = {}
    let merged: Record<string, unknown> = { ...current }
    for (const [k, v] of Object.entries(colUpdate)) {
      if (useByDest && isDestinationScopedKey(k)) {
        merged = writeByDestValue(merged, scope!, k, v)
        // departure_date 는 컬럼과 lockstep — admin updateCaseField 의 by_dest 분기와 동일하게
        // 단일 여행지 케이스에 한해 컬럼도 함께 갱신한다(목록 필터·정렬·auto-fill 컬럼 호환).
        // 안 하면 departure_flight_date → departure_date 동기화(위)가 by_dest 로만 빠져
        // 컬럼이 영원히 stale. 다중 여행지는 공용 컬럼(단일값) 의미가 모호해 admin 규약대로 미적용.
        if (k === 'departure_date' && caseDests.length === 1) {
          colNonScoped[k] = v
        }
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
      // flight_info_recorded_at 은 destination-scoped 키 — by_dest 모드면 by_dest[scope]에 저장/조회해야
      // read(flatten strict)와 일치한다. top-level 에 쓰면 다중 여행지에서 strict flatten 이 떨궈
      // 항공 단계 완료 표시일이 증발한다(다른 scoped 키와 동일 처리).
      if (recordingFlightInfo) {
        const existingRecordedAt = useByDest
          ? readByDestValue(merged, scope!, 'flight_info_recorded_at')
          : merged.flight_info_recorded_at
        if (typeof existingRecordedAt !== 'string') {
          const recordedAt = new Date().toISOString().slice(0, 10)
          if (useByDest) merged = writeByDestValue(merged, scope!, 'flight_info_recorded_at', recordedAt)
          else merged.flight_info_recorded_at = recordedAt // scoping-fallback-ok: scope 없음(여행지 없는 케이스) 폴백
        }
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
      // 매직링크 입력 후 org_auto_fill_rules 트리거 — 예: 일본 departure_flight_date ↔
      // departure_date 양방향 sync, departure_date 변경 시 백신 일정 자동 계산 등이
      // admin 의 updateCaseField 와 동일하게 매직링크 입력에서도 적용되도록.
      //  - useByDest 면 활성 여행지 scope 를 넘겨 by_dest 경로로 라우팅.
      //  - userEditedKey 는 명시 안 함 — 본 share-link 는 다중 키 입력이므로 전부 유효.
      //    각 룰의 overwrite_existing 플래그로 사용자가 방금 입력한 값 보호 (기본 false).
      //  - 커밋 전 pending 스냅샷으로 계산해 아래 단일 UPDATE 에 합산(엔진 자체
      //    SELECT/UPDATE 제거 — P1 #8).
      try {
        const computed = await computeAutoFill(admin, row.case_id, undefined, useByDest ? scope : null, {
          orgId: caseOrgId,
          destination: caseDestination,
          departureDate:
            typeof updates.departure_date === 'string' ? updates.departure_date : caseDepartureDate,
          data: (updates.data as Record<string, unknown> | undefined) ?? current,
        })
        if (computed.ok && computed.changed) {
          updates.data = computed.data
          Object.assign(updates, computed.columns)
        }
      } catch { /* best-effort — 실패해도 share-link 제출 자체는 성공 */ }

      // 변경 이력 — UPDATE 직전 스냅샷으로 계산해두고, 성공 후 적재한다.
      // 안 남기면 보호자가 링크로 넣은 값은 '이력'에 흔적이 없어, 이후 누가/무엇이 덮어써도
      // 되돌릴 수 없다(2026-08-03 해외주소 소실 — 이력 0건이라 복구 불가였음).
      const historyRows = buildSubmitHistoryRows({
        caseId: row.case_id,
        orgId: caseOrgId,
        before: current,
        beforeColumns: { destination: caseDestination, departure_date: caseDepartureDate },
        updates,
      })

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

      // best-effort — 이력 적재 실패가 제출을 되돌리지는 않는다.
      if (historyRows.length > 0) {
        const { error: histErr } = await admin.from('case_history').insert(historyRows)
        if (histErr) reportActionError(histErr, 'share-links-public.submitShareLink.history')
      }
    }

    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'share-links-public.submitShareLink') }
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

// ─────────────────────────────────────────────────
// 수신자 파일 첨부 (anon) — 저장소 직접 업로드(signed URL) 방식
//   ① createShareUploadTickets: 토큰 검증 + 슬롯별 저장 경로·서명 업로드 URL 발급(바이트 X)
//   ② 클라이언트가 서명 URL 로 저장소에 직접 업로드 (서버 경유 X)
//   ③ recordShareUploadedFiles: 업로드된 파일 메타를 케이스 첨부(documents/notes)로 기록
// 예전 uploadShareSubmissionFiles(파일을 서버 액션으로 보내 서버가 재업로드)는 폰→서버→
// 저장소로 파일이 직렬 이중 전송돼 느렸음 — 위 3단계로 폰→저장소 1회 직접 전송으로 개선
// (2026-07-17). 저장·표시(documents/notes)는 동일해 운영자 화면은 그대로.
// ─────────────────────────────────────────────────

const SHARE_UPLOAD_BUCKET = 'attachments'
const SHARE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
const SHARE_UPLOAD_MAX_FILES = 10

function shareFileAllowed(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf'
}

export interface ShareUploadTicket {
  slotKey: string
  /** 저장소 내 목표 경로 (case_id 로 스코프). uploadToSignedUrl 에 그대로 전달. */
  path: string
  /** uploadToSignedUrl 용 서명 토큰. */
  token: string
  /** 저장·표시용 파일명(슬롯 라벨 기반). */
  name: string
  size: number
  mime: string
}

/**
 * 슬롯별 서명 업로드 URL 발급 — 파일 바이트는 받지 않는다. 토큰(active)·개수·크기·MIME 만
 * 검증하고 case_id 로 스코프된 경로에 대한 서명 토큰을 돌려준다. 클라이언트는 이 토큰으로
 * 저장소에 직접 업로드한다(서버 경유 없음). 경로는 서버가 생성하므로 다른 케이스로 못 샌다.
 */
export async function createShareUploadTickets(
  token: string,
  files: { slotKey: string; name: string; size: number; mime: string }[],
): Promise<Result<{ tickets: ShareUploadTicket[] }>> {
  try {
    if (typeof token !== 'string' || !UUID_RE.test(token)) {
      return { ok: false, error: '유효하지 않은 링크입니다' }
    }
    if (files.length === 0) return { ok: true, value: { tickets: [] } }
    if (files.length > SHARE_UPLOAD_MAX_FILES) {
      return { ok: false, error: `파일은 최대 ${SHARE_UPLOAD_MAX_FILES}개까지 첨부할 수 있습니다.` }
    }
    for (const f of files) {
      if (!shareFileAllowed(f.mime)) {
        return { ok: false, error: '이미지 또는 PDF 파일만 올릴 수 있습니다.' }
      }
      if (f.size > SHARE_UPLOAD_MAX_BYTES) {
        return { ok: false, error: '파일 크기는 각 8MB 이하여야 합니다.' }
      }
    }

    const admin = createAdminClient()
    const { data: link } = await admin
      .from('case_share_links')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (!link) return { ok: false, error: '유효하지 않은 링크입니다' }
    const row = link as ShareLinkRow
    if (shareLinkStatus(row) !== 'active') {
      return { ok: false, error: '이 링크로는 더 이상 제출할 수 없습니다.' }
    }

    // 슬롯 키 대조 — 이 링크가 요청한 파일 키(file_request_keys)만 티켓 발급.
    // 안 하면 active 링크 소지자가 요청되지 않은 임의 슬롯 키로 첨부를 누적할 수 있다.
    // (정상 클라이언트는 view.file_requests = file_request_keys 에서 온 키만 보낸다.)
    const requestedSlotKeys = new Set(row.file_request_keys ?? [])
    for (const f of files) {
      if (!requestedSlotKeys.has(f.slotKey)) {
        return { ok: false, error: '요청되지 않은 파일 항목입니다.' }
      }
    }

    const tickets: ShareUploadTicket[] = []
    for (const f of files) {
      const def = shareFileRequestByKey(f.slotKey)
      const ext = f.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ''
      const displayName = def?.label ? `${def.label}${ext}` : (f.name || 'file')
      const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${row.case_id}/${Date.now()}_${randomUUID().slice(0, 8)}_${safeName}`
      const { data: signed, error: sErr } = await admin.storage
        .from(SHARE_UPLOAD_BUCKET)
        .createSignedUploadUrl(path)
      if (sErr || !signed) return { ok: false, error: sErr?.message ?? '업로드 준비에 실패했습니다.' }
      tickets.push({ slotKey: f.slotKey, path, token: signed.token, name: displayName, size: f.size, mime: f.mime })
    }
    return { ok: true, value: { tickets } }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'share-links-public.createShareUploadTickets') }
  }
}

/**
 * 저장소에 직접 업로드된 파일들을 케이스 첨부(documents/notes)로 기록. 경로는 반드시
 * 해당 케이스(case_id)로 스코프돼야 한다(다른 케이스 경로 주입 차단). 값 제출 전에 호출.
 */
export async function recordShareUploadedFiles(
  token: string,
  uploaded: { path: string; name: string; size: number; mime: string }[],
): Promise<Result<{ count: number }>> {
  try {
    if (typeof token !== 'string' || !UUID_RE.test(token)) {
      return { ok: false, error: '유효하지 않은 링크입니다' }
    }
    if (uploaded.length === 0) return { ok: true, value: { count: 0 } }
    if (uploaded.length > SHARE_UPLOAD_MAX_FILES) {
      return { ok: false, error: `파일은 최대 ${SHARE_UPLOAD_MAX_FILES}개까지 첨부할 수 있습니다.` }
    }

    const admin = createAdminClient()
    const { data: link } = await admin
      .from('case_share_links')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (!link) return { ok: false, error: '유효하지 않은 링크입니다' }
    const row = link as ShareLinkRow
    if (shareLinkStatus(row) !== 'active') {
      return { ok: false, error: '이 링크로는 더 이상 제출할 수 없습니다.' }
    }

    // 경로 스코프 검증 — 클라이언트가 임의 경로를 넣어 다른 케이스 파일을 참조하지 못하게.
    const prefix = `${row.case_id}/`
    for (const u of uploaded) {
      if (typeof u.path !== 'string' || !u.path.startsWith(prefix)) {
        return { ok: false, error: '잘못된 파일 경로입니다.' }
      }
    }

    const { data: caseInfo } = await admin
      .from('cases')
      .select('data')
      .eq('id', row.case_id)
      .maybeSingle()
    const current = (caseInfo?.data as Record<string, unknown> | null) ?? {}
    const existingDocs = Array.isArray(current.documents) ? (current.documents as unknown[]) : []
    const existingNotes = Array.isArray(current.notes) ? (current.notes as unknown[]) : []

    const newDocs: Record<string, unknown>[] = []
    const newNotes: Record<string, unknown>[] = []
    // 링크에 여행지 스코프가 지정돼 있으면 첨부에도 같은 여행지 태깅(portal 업로드와 동일
    // 모델 — 무태그 = 케이스 공유). stepId 'share-submission' 은 필수서류 attachStepId 가
    // 아니라 판정에는 안 걸리지만, 태그를 남겨 두면 이후 여행지별 표시·정리에 쓸 수 있다.
    const shareDest =
      typeof row.destination_scope === 'string' && row.destination_scope
        ? row.destination_scope
        : null
    for (const u of uploaded) {
      const uploadedAt = new Date().toISOString()
      newDocs.push({
        id: randomUUID(),
        name: u.name,
        path: u.path,
        size: u.size,
        mime: u.mime,
        stepId: 'share-submission',
        ...(shareDest ? { destination: shareDest } : {}),
        uploadedAt,
      })
      newNotes.push({ type: 'file', name: u.name, path: u.path, size: u.size, createdAt: uploadedAt })
    }

    const nextData: Record<string, unknown> = {
      ...current,
      documents: [...existingDocs, ...newDocs],
      notes: [...existingNotes, ...newNotes],
    }
    const { error } = await admin.from('cases').update({ data: nextData }).eq('id', row.case_id)
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: { count: uploaded.length } }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'share-links-public.recordShareUploadedFiles') }
  }
}
