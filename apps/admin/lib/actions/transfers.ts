'use server'

/**
 * 케이스 핸드오프 (다른 조직으로 정보 전달) 서버 액션.
 *
 * 모델: 단방향 fork. 보낸 쪽 원본 케이스 유지, 받는 쪽 조직에 새 케이스 생성.
 *   - 복사 데이터: 고객 + 반려동물 정보만 (절차/검사/메모 등 미복사)
 *   - 분리 후 재전송 불가 (DB unique 인덱스 + 앱 단 검증)
 *   - 송신·수신·취소: 조직 멤버 누구나 가능 (admin 제한 없음)
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import type { CaseRow } from '@/lib/supabase/types'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export type TransferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export interface TransferRow {
  id: string
  source_case_id: string
  target_case_id: string | null
  from_org_id: string
  from_user_id: string
  to_org_id: string
  to_user_id: string | null
  payload_snapshot: TransferSnapshot
  status: TransferStatus
  note: string | null
  response_note: string | null
  responded_at: string | null
  responded_by: string | null
  created_at: string
}

export interface TransferSnapshot {
  // top-level columns
  microchip: string | null
  microchip_extra: string[]
  customer_name: string
  customer_name_en: string | null
  pet_name: string | null
  pet_name_en: string | null
  // 기본정보 + 동물정보 그룹의 data jsonb 키만 화이트리스트로 복사
  data: Record<string, unknown>
}

export interface TransferWithContext extends TransferRow {
  source_case: { id: string; customer_name: string; pet_name: string | null; microchip: string | null } | null
  from_org_name: string | null
  to_org_name: string | null
  from_user_name: string | null
  to_user_name: string | null
  responded_by_name: string | null
}

export interface OrgSearchResult {
  id: string
  name: string
}

export interface OrgMemberSearchResult {
  user_id: string
  email: string
  name: string | null
}

/** 전체 조직을 가로지르는 멤버 검색 결과 — 멤버의 소속 조직 정보 포함. */
export interface GlobalMemberSearchResult {
  user_id: string
  email: string
  name: string | null
  org_id: string
  org_name: string
}

// ─────────────────────────────────────────────────
// 화이트리스트: 복사할 data jsonb 키 (기본정보 + 동물정보 그룹)
// 절차/검사/메모는 송신 대상에서 제외 — 수신측에서 새로 진행해야 함.
// ─────────────────────────────────────────────────

const COPYABLE_DATA_KEYS = new Set([
  // 기본정보 (연락처·주소)
  'phone', 'email', 'address_kr', 'address_en', 'address_overseas',
  // 동물정보
  'birth_date', 'age', 'species', 'breed', 'breed_en',
  'sex', 'sex_en', 'color', 'color_en', 'weight',
])

function buildSnapshot(source: CaseRow): TransferSnapshot {
  const sourceData = (source.data ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(sourceData)) {
    if (!COPYABLE_DATA_KEYS.has(k)) continue
    if (v === null || v === undefined || v === '') continue
    data[k] = v
  }
  return {
    microchip: source.microchip ?? null,
    microchip_extra: source.microchip_extra ?? [],
    customer_name: source.customer_name,
    customer_name_en: source.customer_name_en ?? null,
    pet_name: source.pet_name ?? null,
    pet_name_en: source.pet_name_en ?? null,
    data,
  }
}

// ─────────────────────────────────────────────────
// 조직 / 멤버 검색 (수신처 picker 용)
// ─────────────────────────────────────────────────

/**
 * 조직 이름으로 검색. 본인 조직 제외, 결과 20개 제한.
 * RLS 가 organizations select 를 본인 멤버 + super_admin 으로 제한하므로
 * service role 로 검색하되, 노출 정보는 id + name 만.
 */
export async function searchOrganizations(query: string): Promise<Result<OrgSearchResult[]>> {
  try {
    const trimmed = query.trim()
    if (trimmed.length < 1) return { ok: true, value: [] }
    const myOrgId = await getActiveOrgId()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .select('id, name')
      .ilike('name', `%${trimmed}%`)
      .neq('id', myOrgId)
      .order('name', { ascending: true })
      .limit(20)
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      value: (data ?? []).map((o) => ({ id: o.id as string, name: o.name as string })),
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 모든 조직의 멤버를 가로질러 검색 (이름/이메일/조직명).
 * 본인·본인 조직 제외. 결과 30개 제한.
 */
export async function searchMembersGlobal(
  query: string,
): Promise<Result<GlobalMemberSearchResult[]>> {
  try {
    const trimmed = query.trim()
    if (trimmed.length < 1) return { ok: true, value: [] }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const myOrgId = await getActiveOrgId()

    const admin = createAdminClient()
    // 1) 이름/이메일 매칭 프로필
    const { data: profs, error: pErr } = await admin
      .from('profiles')
      .select('id, name, email')
      .or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
      .neq('id', user.id)
      .limit(30)
    if (pErr) return { ok: false, error: pErr.message }

    // 2) 이름 매칭 조직의 멤버도 포함 (사용자가 조직명으로 찾은 뒤 멤버 보고 싶을 때)
    const { data: orgs, error: oErr } = await admin
      .from('organizations')
      .select('id, name')
      .ilike('name', `%${trimmed}%`)
      .neq('id', myOrgId)
      .limit(10)
    if (oErr) return { ok: false, error: oErr.message }

    const orgUserSet = new Set<string>()
    if ((orgs ?? []).length > 0) {
      const { data: orgMems } = await admin
        .from('memberships')
        .select('user_id')
        .in('org_id', (orgs ?? []).map((o) => (o as { id: string }).id))
        .neq('user_id', user.id)
      for (const m of orgMems ?? []) {
        orgUserSet.add((m as { user_id: string }).user_id)
      }
    }

    const allUserIds = Array.from(new Set([
      ...(profs ?? []).map((p) => (p as { id: string }).id),
      ...orgUserSet,
    ]))
    if (allUserIds.length === 0) return { ok: true, value: [] }

    // 멤버 → 조직 매핑 (본인 조직은 제외)
    const { data: mems, error: mErr } = await admin
      .from('memberships')
      .select('user_id, org_id')
      .in('user_id', allUserIds)
    if (mErr) return { ok: false, error: mErr.message }
    const filteredMems = (mems ?? []).filter(
      (m) => (m as { org_id: string }).org_id !== myOrgId,
    )
    if (filteredMems.length === 0) return { ok: true, value: [] }

    // 조직명 lookup
    const orgIds = Array.from(new Set(filteredMems.map((m) => (m as { org_id: string }).org_id)))
    const { data: allOrgs } = await admin
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
    const orgNameMap = new Map<string, string>()
    for (const o of allOrgs ?? []) {
      orgNameMap.set((o as { id: string }).id, (o as { name: string }).name)
    }

    // 프로필 lookup (전체 검색 결과 + 조직 검색으로 추가된 멤버 모두)
    const { data: allProfs } = await admin
      .from('profiles')
      .select('id, name, email')
      .in('id', allUserIds)
    const profMap = new Map<string, { name: string | null; email: string }>()
    for (const p of allProfs ?? []) {
      profMap.set((p as { id: string }).id, {
        name: ((p as { name: string | null }).name) ?? null,
        email: (p as { email: string }).email,
      })
    }

    // (user_id, org_id) 페어를 결과로 — 같은 사용자가 여러 조직 소속이면 여러 행
    const out: GlobalMemberSearchResult[] = []
    const seen = new Set<string>()
    for (const m of filteredMems) {
      const uid = (m as { user_id: string }).user_id
      const oid = (m as { org_id: string }).org_id
      const key = `${uid}|${oid}`
      if (seen.has(key)) continue
      seen.add(key)
      const prof = profMap.get(uid)
      const orgName = orgNameMap.get(oid)
      if (!prof || !orgName) continue
      out.push({
        user_id: uid,
        email: prof.email,
        name: prof.name,
        org_id: oid,
        org_name: orgName,
      })
    }
    // 이름→이메일→조직명 순 정렬
    out.sort((a, b) => {
      const an = (a.name || a.email).toLowerCase()
      const bn = (b.name || b.email).toLowerCase()
      if (an !== bn) return an.localeCompare(bn)
      return a.org_name.localeCompare(b.org_name)
    })
    return { ok: true, value: out.slice(0, 30) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 특정 조직의 멤버 목록 (검색 키워드 옵션). 인증 필요. 결과 20개 제한. */
export async function searchOrgMembers(
  orgId: string,
  query?: string,
): Promise<Result<OrgMemberSearchResult[]>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const admin = createAdminClient()
    const { data: memRows, error: memErr } = await admin
      .from('memberships')
      .select('user_id')
      .eq('org_id', orgId)
    if (memErr) return { ok: false, error: memErr.message }
    const userIds = (memRows ?? []).map((r) => (r as { user_id: string }).user_id)
    if (userIds.length === 0) return { ok: true, value: [] }

    let q = admin
      .from('profiles')
      .select('id, email, name')
      .in('id', userIds)
      .order('name', { ascending: true })
      .limit(20)
    const trimmed = (query ?? '').trim()
    if (trimmed.length > 0) {
      q = q.or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
    }
    const { data, error } = await q
    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      value: (data ?? []).map((p) => ({
        user_id: p.id as string,
        email: p.email as string,
        name: (p.name as string | null) ?? null,
      })),
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─────────────────────────────────────────────────
// 송신
// ─────────────────────────────────────────────────

export interface CreateTransferInput {
  sourceCaseId: string
  toOrgId: string
  toUserId?: string | null
  note?: string | null
}

export async function createTransfer(
  input: CreateTransferInput,
): Promise<Result<{ id: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const fromOrgId = await getActiveOrgId()
    if (input.toOrgId === fromOrgId) {
      return { ok: false, error: '같은 조직으로는 전달할 수 없습니다' }
    }

    // 원본 케이스 조회 (RLS 로 본인 조직 케이스만 조회됨)
    const { data: source, error: srcErr } = await supabase
      .from('cases')
      .select('*')
      .eq('id', input.sourceCaseId)
      .maybeSingle()
    if (srcErr) return { ok: false, error: srcErr.message }
    if (!source) return { ok: false, error: '원본 케이스를 찾을 수 없습니다' }
    if ((source as CaseRow).org_id !== fromOrgId) {
      return { ok: false, error: '본인 조직의 케이스만 전달할 수 있습니다' }
    }

    // 이미 pending 또는 accepted 인 전송이 있으면 차단 (DB unique 인덱스도 있지만 친절한 메시지)
    const { data: existing } = await supabase
      .from('case_transfers')
      .select('id, status')
      .eq('source_case_id', input.sourceCaseId)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()
    if (existing) {
      const s = (existing as { status: TransferStatus }).status
      return {
        ok: false,
        error:
          s === 'pending'
            ? '이미 전달 대기 중인 케이스입니다 — 먼저 취소하거나 수신측 응답을 기다려주세요'
            : '이미 다른 조직으로 전달 완료된 케이스입니다 (재전송 불가)',
      }
    }

    // 수신 멤버 지정 시 해당 조직의 멤버인지 검증
    if (input.toUserId) {
      const admin = createAdminClient()
      const { data: mem } = await admin
        .from('memberships')
        .select('user_id')
        .eq('org_id', input.toOrgId)
        .eq('user_id', input.toUserId)
        .maybeSingle()
      if (!mem) return { ok: false, error: '지정한 멤버가 해당 조직에 속해있지 않습니다' }
    }

    const snapshot = buildSnapshot(source as CaseRow)

    const { data: inserted, error: insErr } = await supabase
      .from('case_transfers')
      .insert({
        source_case_id: input.sourceCaseId,
        from_org_id: fromOrgId,
        from_user_id: user.id,
        to_org_id: input.toOrgId,
        to_user_id: input.toUserId ?? null,
        payload_snapshot: snapshot,
        note: input.note?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) return { ok: false, error: insErr.message }

    revalidatePath('/cases')
    return { ok: true, value: { id: inserted.id as string } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─────────────────────────────────────────────────
// 취소 (보낸 쪽)
// ─────────────────────────────────────────────────

export async function cancelTransfer(id: string): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('case_transfers')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    revalidatePath('/cases')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─────────────────────────────────────────────────
// 거부 (받는 쪽)
// ─────────────────────────────────────────────────

export async function rejectTransfer(
  id: string,
  responseNote?: string,
): Promise<Result<null>> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('case_transfers')
      .update({
        status: 'rejected',
        response_note: responseNote?.trim() || null,
      })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    revalidatePath('/cases')
    return { ok: true, value: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─────────────────────────────────────────────────
// 수락 (받는 쪽) — 새 케이스 생성 + 전송 행 status accepted + target_case_id 채움
// ─────────────────────────────────────────────────

export async function acceptTransfer(
  id: string,
  responseNote?: string,
): Promise<Result<{ caseId: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }

    const myOrgId = await getActiveOrgId()

    const { data: transfer, error: tErr } = await supabase
      .from('case_transfers')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (tErr) return { ok: false, error: tErr.message }
    if (!transfer) return { ok: false, error: '전송 기록을 찾을 수 없습니다' }
    const t = transfer as TransferRow
    if (t.to_org_id !== myOrgId) {
      return { ok: false, error: '받는 쪽 조직의 멤버만 수락할 수 있습니다' }
    }
    if (t.status !== 'pending') {
      return { ok: false, error: `이미 처리된 전송입니다 (현재 상태: ${t.status})` }
    }

    const snap = t.payload_snapshot

    // assignee 기능 on/off 확인 — to_user_id 있어도 off 이면 미반영
    const { data: setting } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', myOrgId)
      .eq('key', 'case_assignee')
      .maybeSingle()
    const assigneeEnabled = (setting?.value as { enabled?: boolean } | null)?.enabled === true

    // microchip 충돌 확인 — 같은 org 안에서 중복 시 microchip 만 비워서 생성
    let microchip = snap.microchip
    if (microchip) {
      const { data: dup } = await supabase
        .from('cases')
        .select('id')
        .eq('org_id', myOrgId)
        .eq('microchip', microchip)
        .maybeSingle()
      if (dup) microchip = null
    }

    const insertRow: Record<string, unknown> = {
      org_id: myOrgId,
      customer_name: snap.customer_name || '',
      customer_name_en: snap.customer_name_en,
      pet_name: snap.pet_name,
      pet_name_en: snap.pet_name_en,
      microchip,
      microchip_extra: snap.microchip_extra ?? [],
      data: snap.data ?? {},
    }
    if (assigneeEnabled && t.to_user_id) {
      insertRow.assigned_to = t.to_user_id
    }

    const { data: newCase, error: insErr } = await supabase
      .from('cases')
      .insert(insertRow)
      .select('id')
      .single()
    if (insErr) return { ok: false, error: insErr.message }

    // 전송 행을 accepted 로 마킹 + target_case_id 연결
    const { error: updErr } = await supabase
      .from('case_transfers')
      .update({
        status: 'accepted',
        target_case_id: newCase.id as string,
        response_note: responseNote?.trim() || null,
      })
      .eq('id', id)
    if (updErr) {
      // 원자성 부족 — 로그만 남기고 케이스는 그대로 둠 (사용자가 재시도 가능)
      return { ok: false, error: `케이스는 생성됐으나 전송 마킹 실패: ${updErr.message}` }
    }

    revalidatePath('/cases')
    return { ok: true, value: { caseId: newCase.id as string } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─────────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────────

/** 현재 조직의 받은 전송 (pending + history 모두). */
export async function listReceivedTransfers(): Promise<Result<TransferWithContext[]>> {
  try {
    const orgId = await getActiveOrgId()
    return await listTransfersByOrg('to', orgId)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 현재 조직의 보낸 전송 (pending + history 모두). */
export async function listSentTransfers(): Promise<Result<TransferWithContext[]>> {
  try {
    const orgId = await getActiveOrgId()
    return await listTransfersByOrg('from', orgId)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 특정 케이스에 묶인 전송 기록 (보낸/받은 모두). */
export async function listTransfersForCase(caseId: string): Promise<Result<TransferWithContext[]>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('case_transfers')
      .select('*')
      .or(`source_case_id.eq.${caseId},target_case_id.eq.${caseId}`)
      .order('created_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    const enriched = await enrichTransfers((data ?? []) as TransferRow[])
    return { ok: true, value: enriched }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

async function listTransfersByOrg(
  side: 'from' | 'to',
  orgId: string,
): Promise<Result<TransferWithContext[]>> {
  const supabase = await createClient()
  const col = side === 'from' ? 'from_org_id' : 'to_org_id'
  const { data, error } = await supabase
    .from('case_transfers')
    .select('*')
    .eq(col, orgId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { ok: false, error: error.message }
  const enriched = await enrichTransfers((data ?? []) as TransferRow[])
  return { ok: true, value: enriched }
}

/** 전송 행에 조직명·유저명·원본 케이스 일부를 붙임. service role 사용 (상대 조직 정보 조회 위해). */
async function enrichTransfers(rows: TransferRow[]): Promise<TransferWithContext[]> {
  if (rows.length === 0) return []
  const admin = createAdminClient()

  const orgIds = new Set<string>()
  const userIds = new Set<string>()
  const sourceCaseIds = new Set<string>()

  for (const r of rows) {
    orgIds.add(r.from_org_id)
    orgIds.add(r.to_org_id)
    userIds.add(r.from_user_id)
    if (r.to_user_id) userIds.add(r.to_user_id)
    if (r.responded_by) userIds.add(r.responded_by)
    sourceCaseIds.add(r.source_case_id)
  }

  const [orgsRes, usersRes, casesRes] = await Promise.all([
    admin.from('organizations').select('id, name').in('id', Array.from(orgIds)),
    admin.from('profiles').select('id, name, email').in('id', Array.from(userIds)),
    admin.from('cases').select('id, customer_name, pet_name, microchip').in('id', Array.from(sourceCaseIds)),
  ])

  const orgMap = new Map<string, string>()
  for (const o of orgsRes.data ?? []) {
    orgMap.set((o as { id: string }).id, (o as { name: string }).name)
  }
  const userMap = new Map<string, string>()
  for (const u of usersRes.data ?? []) {
    const row = u as { id: string; name: string | null; email: string }
    userMap.set(row.id, row.name?.trim() || row.email)
  }
  const caseMap = new Map<
    string,
    { id: string; customer_name: string; pet_name: string | null; microchip: string | null }
  >()
  for (const c of casesRes.data ?? []) {
    const row = c as { id: string; customer_name: string; pet_name: string | null; microchip: string | null }
    caseMap.set(row.id, row)
  }

  return rows.map((r) => ({
    ...r,
    source_case: caseMap.get(r.source_case_id) ?? null,
    from_org_name: orgMap.get(r.from_org_id) ?? null,
    to_org_name: orgMap.get(r.to_org_id) ?? null,
    from_user_name: userMap.get(r.from_user_id) ?? null,
    to_user_name: r.to_user_id ? userMap.get(r.to_user_id) ?? null : null,
    responded_by_name: r.responded_by ? userMap.get(r.responded_by) ?? null : null,
  }))
}

// ─────────────────────────────────────────────────
// 메시지 통합 — 케이스를 DM 으로 전달
// ─────────────────────────────────────────────────

export interface SendHandoffMessageInput {
  sourceCaseId: string
  toUserId: string
  note?: string | null
}

/**
 * 케이스 핸드오프를 메시지로 발송.
 *
 * 흐름: 케이스 검증 → 수신자 조직 조회 → DM conversation get-or-create →
 *      case_transfers insert → messages insert (transfer_id 연결).
 *
 * 받는 쪽은 채팅 화면에서 "핸드오프 카드" 형태로 메시지를 받고
 * 카드 안의 수락/거부 버튼으로 응답.
 */
export async function sendHandoffMessage(
  input: SendHandoffMessageInput,
): Promise<Result<{ transferId: string; conversationId: string; messageId: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }
    if (input.toUserId === user.id) {
      return { ok: false, error: '본인에게는 전달할 수 없습니다' }
    }

    const fromOrgId = await getActiveOrgId()

    // 1) 원본 케이스 검증
    const { data: source, error: srcErr } = await supabase
      .from('cases')
      .select('*')
      .eq('id', input.sourceCaseId)
      .maybeSingle()
    if (srcErr) return { ok: false, error: srcErr.message }
    if (!source) return { ok: false, error: '원본 케이스를 찾을 수 없습니다' }
    if ((source as CaseRow).org_id !== fromOrgId) {
      return { ok: false, error: '본인 조직의 케이스만 전달할 수 있습니다' }
    }

    // 2) 중복 전송 체크 (같은 source 의 pending/accepted)
    const { data: existing } = await supabase
      .from('case_transfers')
      .select('id, status')
      .eq('source_case_id', input.sourceCaseId)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()
    if (existing) {
      const s = (existing as { status: TransferStatus }).status
      return {
        ok: false,
        error:
          s === 'pending'
            ? '이미 전달 대기 중인 케이스입니다'
            : '이미 다른 조직으로 전달 완료된 케이스입니다 (재전송 불가)',
      }
    }

    // 3) 수신자 조직 조회 — admin client 로 RLS 우회 (상대 조직 정보 필요)
    const admin = createAdminClient()
    const { data: toMems, error: memErr } = await admin
      .from('memberships')
      .select('org_id')
      .eq('user_id', input.toUserId)
    if (memErr) return { ok: false, error: memErr.message }
    if (!toMems || toMems.length === 0) {
      return { ok: false, error: '수신자가 속한 조직이 없습니다' }
    }
    if (toMems.length > 1) {
      // 다중 조직 멤버십 — 어느 조직으로 보낼지 결정 불가. 추후 picker 필요.
      return { ok: false, error: '수신자가 여러 조직에 속해있어 자동 결정이 불가합니다' }
    }
    const toOrgId = (toMems[0] as { org_id: string }).org_id
    if (toOrgId === fromOrgId) {
      return { ok: false, error: '같은 조직으로는 전달할 수 없습니다' }
    }

    // 4) DM 대화 get-or-create
    const { getOrCreateDM } = await import('./chat')
    const dmRes = await getOrCreateDM({ otherUserId: input.toUserId })
    if (!dmRes.ok) return { ok: false, error: `대화 생성 실패: ${dmRes.error}` }
    const convId = dmRes.value.id

    // 5) case_transfers 생성
    const snapshot = buildSnapshot(source as CaseRow)
    const { data: inserted, error: insErr } = await supabase
      .from('case_transfers')
      .insert({
        source_case_id: input.sourceCaseId,
        from_org_id: fromOrgId,
        from_user_id: user.id,
        to_org_id: toOrgId,
        to_user_id: input.toUserId,
        payload_snapshot: snapshot,
        note: input.note?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) return { ok: false, error: insErr.message }
    const transferId = inserted.id as string

    // 6) 케이스 라벨 생성 (메시지의 case_label 도 채워서 일반 case 태그 메시지처럼 보이게)
    const caseLabel = caseLabelOf(source as CaseRow)

    // 7) messages 행 삽입 (transfer_id 연결)
    const { data: msg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_user_id: user.id,
        case_id: input.sourceCaseId,
        case_label: caseLabel,
        content: input.note?.trim() || null,
        transfer_id: transferId,
      })
      .select('id')
      .single()
    if (msgErr) {
      // 메시지 실패 시 transfer 도 cancel — 사용자가 다시 시도 가능하게
      await supabase
        .from('case_transfers')
        .update({ status: 'cancelled', responded_at: new Date().toISOString() })
        .eq('id', transferId)
      return { ok: false, error: `메시지 발송 실패: ${msgErr.message}` }
    }

    revalidatePath('/messages')
    revalidatePath('/cases')
    return {
      ok: true,
      value: {
        transferId,
        conversationId: convId,
        messageId: msg.id as string,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function caseLabelOf(c: CaseRow): string {
  const name = c.pet_name || c.pet_name_en || ''
  const dest = c.destination || ''
  const chip = c.microchip ? `#${c.microchip.slice(-3)}` : ''
  const parts = [name, dest, chip].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '(이름 없음)'
}

/** 단일 전송 행 + 컨텍스트 — 메시지 카드용. RLS 가 from/to org 멤버만 select 허용. */
export async function getTransfer(id: string): Promise<Result<TransferWithContext | null>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('case_transfers')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: true, value: null }
    const enriched = await enrichTransfers([data as TransferRow])
    return { ok: true, value: enriched[0] ?? null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 받은 전송 중 pending 개수 — 헤더 뱃지용. */
export async function countPendingReceived(): Promise<Result<number>> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { count, error } = await supabase
      .from('case_transfers')
      .select('id', { count: 'exact', head: true })
      .eq('to_org_id', orgId)
      .eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: count ?? 0 }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
