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
import { EXTRA_FIELD_DEFS } from '@petmove/domain'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import {
  SHARE_COLUMN_FIELDS as COLUMN_FIELDS,
  SHARE_COLUMN_META as COLUMN_META,
  SHARE_RECIPIENT_LABEL_OVERRIDE as RECIPIENT_LABEL_OVERRIDE,
  shareLinkStatus,
  SHARE_VACCINE_GROUPS,
  type ShareFieldSpec,
  type ShareLinkPublicView,
  type ShareLinkRow,
  type ShareVaccineEntry,
  type ShareVaccineGroup,
} from '@/lib/share-links-types'

const VACCINE_GROUP_BY_KEY = new Map<string, ShareVaccineGroup>(
  SHARE_VACCINE_GROUPS.map((g) => [g.key, g]),
)

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ─────────────────────────────────────────────────
// 헬퍼 — field_definitions 기반 spec 생성
// ─────────────────────────────────────────────────

/** column 키 → 카테고리 매핑 (share-link-dialog 와 동일한 좌표계). destination 은 외부 수신자 입력 대상 아님 → 매핑 없음. */
const COLUMN_CATEGORY: Record<string, string> = {
  customer_name:    '고객정보',
  customer_name_en: '고객정보',
  pet_name:         '동물정보',
  pet_name_en:      '동물정보',
  microchip:        '동물정보',
  departure_date:   '절차정보',
}
/** field_definitions.group_name → 카테고리. */
const FIELD_DEF_CATEGORY: Record<string, string> = {
  '기본정보': '고객정보',
  '동물정보': '동물정보',
  '절차/식별': '절차정보',
  '절차/예방접종': '절차정보',
  '절차/검사': '절차정보',
  '절차/구충': '절차정보',
}

async function buildFieldSpecs(
  fieldKeys: string[],
  caseRow: CaseRow,
): Promise<ShareFieldSpec[]> {
  // data jsonb 키만 골라서 field_definitions lookup (합성 키·컬럼 키 제외)
  const dataKeys = fieldKeys.filter(
    (k) => !COLUMN_FIELDS.has(k) && !VACCINE_GROUP_BY_KEY.has(k),
  )
  const admin = createAdminClient()
  let defs: FieldDefinition[] = []
  if (dataKeys.length > 0) {
    const { data } = await admin
      .from('field_definitions')
      .select('*')
      .is('org_id', null)
      .in('key', dataKeys)
    defs = (data ?? []) as FieldDefinition[]
  }
  const defByKey = new Map<string, FieldDefinition>()
  for (const d of defs) defByKey.set(d.key, d)

  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const out: ShareFieldSpec[] = []
  for (const key of fieldKeys) {
    // 1) 합성 백신·구충 그룹
    const vax = VACCINE_GROUP_BY_KEY.get(key)
    if (vax) {
      out.push({
        key: vax.key,
        label: vax.label,
        storage: 'synthetic',
        type: 'date_array',
        max_entries: vax.max_entries,
        hide_valid_until: vax.hide_valid_until,
        current_value: extractVaccineEntries(vax, data),
        category: '절차정보',
      })
      continue
    }
    // 2) 정규 컬럼
    if (COLUMN_FIELDS.has(key)) {
      const meta = COLUMN_META[key]
      if (!meta) continue
      out.push({
        key,
        label: RECIPIENT_LABEL_OVERRIDE[key] ?? meta.label,
        storage: 'column',
        type: meta.type,
        current_value: (caseRow as unknown as Record<string, unknown>)[key] ?? null,
        category: COLUMN_CATEGORY[key],
      })
      continue
    }
    // 3) data jsonb 필드 (field_definitions)
    const def = defByKey.get(key)
    if (def) {
      out.push({
        key,
        label: RECIPIENT_LABEL_OVERRIDE[key] ?? def.label,
        storage: 'data',
        type: def.type,
        options: def.options ?? undefined,
        current_value: data[key] ?? null,
        category: FIELD_DEF_CATEGORY[def.group_name ?? ''],
      })
      continue
    }
    // 4) 목적지별 추가 필드 (EXTRA_FIELD_DEFS — 일본 입국일·항공편, 해외주소 등)
    const extra = EXTRA_FIELD_DEFS[key]
    if (extra) {
      out.push({
        key,
        label: extra.label,
        storage: 'data',
        type: mapExtraType(extra.type),
        options: extra.options?.map((o) => ({ value: o.value, label_ko: o.label })),
        current_value: data[key] ?? null,
        category: '추가정보',
        subgroup: extra.group,
      })
      continue
    }
  }
  return out
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

/**
 * 백신·구충 그룹의 현재 값을 ShareVaccineEntry[] 로 추출 — UI 미리채우기용.
 * 케이스 데이터의 객체 entry({date, product, lot, expiry, ...}) 를 그대로 보존,
 * 레거시 단일 키(rabies_1 등)는 date 만 있는 entry 로 변환.
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
        if (typeof item === 'string') {
          entries.push({ date: item })
        } else if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          const date = typeof obj.date === 'string' ? obj.date : ''
          if (!date) continue
          entries.push({
            date,
            valid_until: typeof obj.valid_until === 'string' ? obj.valid_until : null,
            product: typeof obj.product === 'string' ? obj.product : null,
            manufacturer: typeof obj.manufacturer === 'string' ? obj.manufacturer : null,
            lot: typeof obj.lot === 'string' ? obj.lot : null,
            expiry: typeof obj.expiry === 'string' ? obj.expiry : null,
          })
        }
      }
    }
    // legacy 단일 키 (1차/2차/3차) 포함
    for (const k of group.source_keys) {
      if (k === group.array_key) continue
      const v = data[k]
      if (typeof v === 'string' && v) entries.push({ date: v })
    }
  } else if (group.storage_mode === 'split_singles' && group.split_keys) {
    for (const k of group.split_keys) {
      const v = data[k]
      if (typeof v === 'string' && v) entries.push({ date: v })
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
      .select('name')
      .eq('id', row.org_id)
      .maybeSingle()

    const fields = await buildFieldSpecs(row.field_keys, caseRow as CaseRow)

    return {
      ok: true,
      value: {
        token: row.token,
        case_label: caseLabelFrom(caseRow as CaseRow),
        org_name: (orgRow?.name as string | undefined) ?? '',
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

    // 합성 백신·구충 키 → 실제 저장 키 매핑 먼저 처리 (data 영역에 누적)
    for (const group of SHARE_VACCINE_GROUPS) {
      if (!allowed.has(group.key)) continue
      const raw = input.values[group.key]
      if (!Array.isArray(raw)) continue
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
          })
        } else if (typeof item === 'string' && item.trim()) {
          entries.push({ date: item.trim() })
        }
      }
      if (group.storage_mode === 'array' && group.array_key) {
        // VacRecord 호환 객체 배열로 저장 — 외부 입력은 항상 타병원 접종 플래그
        dataUpdate[group.array_key] = entries.map((e) => {
          const rec: Record<string, unknown> = { date: e.date, other_hospital: true }
          if (e.valid_until) rec.valid_until = e.valid_until
          if (e.product) rec.product = e.product
          if (e.manufacturer) rec.manufacturer = e.manufacturer
          if (e.lot) rec.lot = e.lot
          if (e.expiry) rec.expiry = e.expiry
          return rec
        })
        // legacy 단일 키 (rabies_1/2/3, civ, parasite_1/2 등) 정리
        for (const k of group.source_keys) {
          if (k === group.array_key) continue
          dataUpdate[k] = null
        }
      } else if (group.storage_mode === 'split_singles' && group.split_keys) {
        // 종합백신 패턴 — 각 차수별 단일 필드로. 상세는 미저장(케이스 상세에 표시 위치 없음).
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
      if (COLUMN_FIELDS.has(key)) {
        colUpdate[key] = value
      } else {
        dataUpdate[key] = value
      }
    }

    // 현재 case data 와 머지 — null 은 키 삭제로 취급
    const updates: Record<string, unknown> = { ...colUpdate }
    if (Object.keys(dataUpdate).length > 0) {
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
