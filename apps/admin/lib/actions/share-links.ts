'use server'

/**
 * 외부 정보 입력용 매직 링크.
 * 받는 사람은 계정 없이 토큰 URL 만 열면 허용된 필드만 채워서 제출 가능.
 *
 * 사용 흐름:
 *  - 발신자: createShareLink → 링크 복사 → 본인 채널(카톡·이메일)로 전달
 *  - 수신자: /share/[token] 열기 → getShareLinkByToken 으로 폼 표시 → submitShareLink 로 제출
 *  - 결과: 케이스에 직접 반영, submitted_at 마킹
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { formatMicrochip } from '@/lib/fields'
import breedsData from '@/data/breeds.json'
import colorsData from '@/data/colors.json'
import {
  getEffectiveExtraFieldEntries,
  type DestinationExtraFieldEntry,
} from '@petmove/domain'
import { loadDestinationOverridesByOrg } from '@/lib/destination-overrides-config'
import {
  buildShareFieldDescriptors,
  type ShareFieldDescriptor,
} from '@/lib/share-field-layout'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import {
  shareLinkStatus,
  SHARE_COLUMN_FIELDS,
  SHARE_VACCINE_GROUPS,
  type ShareFieldSpec,
  type ShareLinkPublicView,
  type ShareLinkRow,
  type ShareVaccineEntry,
  type ShareVaccineGroup,
} from '@/lib/share-links-types'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * fieldKeys → ShareFieldSpec[] 조립.
 *
 * 좌표(category·subgroup·정렬)는 buildShareFieldDescriptors 가 단독 책임 — 다이얼로그·프리셋·
 * case-detail 추가정보 영역과 동일한 단일 권위. 이 함수는 그 위에서 fieldKeys 화이트리스트를 적용하고
 * descriptor.source 메타로 storage·type·current_value 를 박을 뿐이다.
 *
 * caseScoped 는 null 로 — 발급 시점에 다이얼로그가 이미 species/destination 필터를 통과시킨 키만
 * fieldKeys 에 들어 있으므로, 케이스 species 가 변경된 뒤에도 슬롯이 사라지지 않게.
 */
async function buildFieldSpecs(
  fieldKeys: string[],
  fieldIds: string[] | null | undefined,
  destinationScope: string | null | undefined,
  caseRow: CaseRow,
  extraEntries: DestinationExtraFieldEntry[],
): Promise<ShareFieldSpec[]> {
  // jsonb 키만 DB lookup — 컬럼·합성·EXTRA 는 descriptor.source 에서 직접 처리됨.
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

/** field_definitions DB lookup — null org_id (플랫폼 기본). fieldKeys 에 jsonb 후보가 없으면 query 스킵. */
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

/** descriptor.source 한 곳에서 storage/type/options/current_value 결정 — server 전용 변환. */
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

/** ExtraFieldType → ShareFieldSpec.type — email/time 은 일반 text 로 폴백. */
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

/**
 * 백신·구충 그룹의 현재 값을 ShareVaccineEntry[] 로 추출 — UI 미리채우기용.
 *
 * group.has_other_hospital 에 따라 동작이 갈린다:
 *   - true (광견병/종합백신/독감/켄넬코프): 본인 병원 기록은 노출하지 않고
 *     other_hospital=true 항목만 prefill — 수신자가 타병원 기록만 편집/추가.
 *   - false (외부구충/내부구충): 케이스 상세에 "타병원 접종" 체크박스 자체가 없어
 *     본인/타병원 구분이 없다. 기존 기록을 모두 prefill 해 수신자가 그대로 보고 편집.
 *
 * 레거시 단일 키(rabies_1, comprehensive, external_parasite_1 등)는 share 폼에서 미노출.
 */
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
// 발신자 측 액션
// ─────────────────────────────────────────────────

export interface CreateShareLinkInput {
  caseId: string
  template: string | null
  fieldKeys: string[]
  fieldIds?: string[]
  destinationScope?: string | null
  title?: string | null
  expiresInDays?: number
}

export async function createShareLink(
  input: CreateShareLinkInput,
): Promise<Result<{ id: string; token: string; expiresAt: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const orgId = await getActiveOrgId()

    if (input.fieldKeys.length === 0) {
      return { ok: false, error: '최소 1개 이상의 필드를 선택해주세요' }
    }

    // 케이스 소유 확인
    const { data: caseRow, error: cErr } = await supabase
      .from('cases')
      .select('id, org_id')
      .eq('id', input.caseId)
      .maybeSingle()
    if (cErr) return { ok: false, error: cErr.message }
    if (!caseRow || (caseRow as { org_id: string }).org_id !== orgId) {
      return { ok: false, error: '본인 조직의 케이스만 공유 링크를 만들 수 있습니다' }
    }

    const days = Math.max(1, Math.min(input.expiresInDays ?? 30, 365))
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('case_share_links')
      .insert({
        case_id: input.caseId,
        org_id: orgId,
        template: input.template,
        field_keys: input.fieldKeys,
        field_ids: input.fieldIds ?? input.fieldKeys,
        destination_scope: input.destinationScope?.trim() || null,
        title: input.title?.trim() || null,
        created_by: user.id,
        expires_at: expiresAt,
      })
      .select('id, token, expires_at')
      .single()
    if (error) return { ok: false, error: error.message }

    revalidatePath('/cases')
    return {
      ok: true,
      value: {
        id: data.id as string,
        token: data.token as string,
        expiresAt: data.expires_at as string,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function listShareLinksForCase(caseId: string): Promise<Result<ShareLinkRow[]>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('case_share_links')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as ShareLinkRow[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function revokeShareLink(id: string): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const { error } = await supabase
      .from('case_share_links')
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq('id', id)
      .is('revoked_at', null)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/cases')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─────────────────────────────────────────────────
// 수신자 측 액션 (anon)
// ─────────────────────────────────────────────────

/** 토큰으로 폼 표시용 데이터 로드. service role 우회. */
export async function getShareLinkByToken(
  token: string,
): Promise<Result<ShareLinkPublicView>> {
  try {
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

    // 추가정보 표시 순서를 case-detail 과 일치시키려면 destination 별 extraFields entries 가
    // 필요. 조직 custom override 까지 합쳐 effective entries 를 산출.
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

    // 합성 백신·구충 그룹 — merge 단계에서 케이스 현재 데이터와 결합해야 하므로
    // 여기서는 그룹별 정규화된 entries 만 모아둔다.
    //   - has_other_hospital=true: 본인 기록(other_hospital !== true) 보존 + 타병원 부분만 교체.
    //   - has_other_hospital=false: 본인/타병원 구분 없이 기존 기록에 단순 append.
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
        // split_singles 는 현재 SHARE_VACCINE_GROUPS 에 없지만 타입상 보존.
        const max = group.max_entries ?? group.split_keys.length
        for (let i = 0; i < group.split_keys.length; i++) {
          dataUpdate[group.split_keys[i]] = i < max && entries[i] ? entries[i].date : null
        }
      }
    }

    for (const [key, raw] of Object.entries(input.values)) {
      if (!allowed.has(key)) continue
      if (VACCINE_GROUP_BY_KEY.has(key)) continue // 위에서 처리됨
      const value = normalizeValue(key, raw)
      if (value === undefined) continue
      // 빈 값으로 기존 데이터를 덮어쓰지 않기 — share 폼은 "입력"용 (삭제 의도 X).
      // 사용자 실수(예: 일부만 채워서 제출)로 다른 필드가 NULL 되는 사고 방지.
      if (value === null) continue
      if (typeof value === 'string' && value.trim() === '') continue
      if (Array.isArray(value) && value.length === 0) continue
      if (SHARE_COLUMN_FIELDS.has(key)) {
        colUpdate[key] = value
      } else {
        dataUpdate[key] = value
      }
    }

    // breed/color 한글 → 영문 자동 보정 (SHARE_EXCLUDED_KEYS 의 "영문은 자동 보정" 의도).
    // share form 은 ko 만 저장 → PDF 의 breed_en/color_en 을 함께 채워줘야 ID 등 영문 양식이 비지 않음.
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
      // 백신 array_key 합치기 — 그룹별 분기:
      //   - has_other_hospital=true (광견병/종합백신/독감/켄넬코프): 본인 기록 보존,
      //     타병원 부분만 수신자 제출로 교체. 빈 제출은 기존 타병원 기록 삭제 의미.
      //   - has_other_hospital=false (외부구충/내부구충): prefill 로 기존 기록을 그대로
      //     수신자에게 보여줬으므로 제출값으로 전체 array 를 replace 한다. (append 하면
      //     prefill 된 기록과 중복 발생.) 본인/타병원 구분이 없는 그룹이라 안전.
      for (const { group, entries } of vaccineSubmissions) {
        if (!group.array_key) continue
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

    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await admin
        .from('cases')
        .update(updates)
        .eq('id', row.case_id)
      if (upErr) {
        if (upErr.message.includes('cases_org_microchip_unique')) {
          return { ok: false, error: '이미 등록된 마이크로칩 번호입니다' }
        }
        return { ok: false, error: upErr.message }
      }
    }

    const { error: markErr } = await admin
      .from('case_share_links')
      .update({
        submitted_at: new Date().toISOString(),
        submitter_name: input.submitterName?.trim() || null,
        submitter_note: input.submitterNote?.trim() || null,
      })
      .eq('id', row.id)
    if (markErr) return { ok: false, error: markErr.message }

    // 발신자 측 케이스 상세에 즉시 반영되도록 캐시 무효화
    revalidatePath('/cases')
    revalidatePath(`/cases/${row.case_id}`)

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
