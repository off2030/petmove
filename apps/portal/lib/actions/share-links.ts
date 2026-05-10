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

import { createAdminClient } from '@/lib/supabase/admin'
import {
  formatMicrochip,
  buildShareFieldDescriptors,
  type ShareFieldDescriptor,
  shareLinkStatus,
  SHARE_COLUMN_FIELDS,
  SHARE_VACCINE_GROUPS,
  loadDestinationOverridesByOrg,
  getEffectiveExtraFieldEntries,
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
    out.push(toShareFieldSpec(d, caseRow, data))
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
): ShareFieldSpec {
  const base = {
    id: d.id,
    key: d.key,
    label: d.label,
    category: d.category,
    subgroup: d.subgroup,
  } as const
  switch (d.source.kind) {
    case 'column': {
      const meta = d.source.meta
      return {
        ...base,
        storage: 'column',
        type: meta.type,
        current_value: (caseRow as unknown as Record<string, unknown>)[d.key] ?? null,
      }
    }
    case 'data': {
      const def = d.source.def
      return {
        ...base,
        storage: 'data',
        type: def.type as ShareFieldSpec['type'],
        options: def.options ?? undefined,
        current_value: data[d.key] ?? null,
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
        current_value: data[d.key] ?? null,
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
    if (!caseRow) return { ok: false, error: '연결된 케이스를 찾을 수 없습니다' }
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

    // 현재 case data 와 머지 — null 은 키 삭제로 취급
    const updates: Record<string, unknown> = { ...colUpdate }
    const needsDataRead = Object.keys(dataUpdate).length > 0 || vaccineSubmissions.length > 0
    if (needsDataRead) {
      const { data: caseRow } = await admin
        .from('cases')
        .select('data')
        .eq('id', row.case_id)
        .maybeSingle()
      const current = (caseRow?.data as Record<string, unknown> | null) ?? {}
      const merged: Record<string, unknown> = { ...current }
      for (const [k, v] of Object.entries(dataUpdate)) {
        if (v === null || v === undefined) delete merged[k]
        else merged[k] = v
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
        if (upErr.message.includes('cases_org_microchip_unique')) {
          return { ok: false, error: '이미 등록된 마이크로칩 번호입니다' }
        }
        return { ok: false, error: upErr.message }
      }
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
