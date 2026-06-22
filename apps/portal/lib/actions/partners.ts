'use server'

/**
 * 보호자가 [내 정보 > 담당 동물병원·운송업체] 카드에서 조직을 연결·해제하는
 * server actions. 보호자 단위 통일 정책 — 본인 모든 케이스에 일괄 적용.
 *
 * - listAvailableOrgs(role): 카탈로그 조회 (hospital/transport/both)
 * - setVetOrg / setTransportOrg(orgId): 일괄 연결
 * - unsetVetOrg / unsetTransportOrg(): 일괄 해제
 *
 * RLS 컨텍스트:
 *   - organizations SELECT 는 보호자 카탈로그 노출 정책으로 hospital/transport/both 허용.
 *   - cases UPDATE 정책은 조직 멤버만 허용 → 보호자(어느 조직 멤버 아님)는 직접 UPDATE
 *     못함. service-role admin 클라이언트로 우회. 안전선은 case_customer_links 범위
 *     제한(본인이 링크된 케이스만 갱신).
 *
 * 봇 알림(연결·해제 시 운영자 봇방 메시지) 은 다음 단계에서 추가 — Step 5.
 */

import { createClient, getCurrentUser } from '@petmove/auth/server'
import { revalidatePath } from 'next/cache'

// 펫무브 직영(platform) — 담당 동물병원 미정 상태. org_id 가 이 값이면 담당 병원 없음.
const PLATFORM_ORG_ID = '00000000-0000-0000-0000-000000000002'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export type PartnerRole = 'vet' | 'transport'

export interface PartnerOrg {
  id: string
  name: string
  name_en: string | null
  org_type: 'hospital' | 'transport' | 'both'
  /** 조직 아바타/로고 public URL — 펫무브워크 조직정보에서 설정. 없으면 null(이니셜 fallback). */
  avatar_url: string | null
}

const PARTNER_TYPES_BY_ROLE: Record<PartnerRole, readonly string[]> = {
  vet: ['hospital', 'both'],
  transport: ['transport', 'both'],
}

/**
 * 보호자의 현재 연결 조직 — 본인 첫 케이스의 org_id(담당 병원) / transport_org_id 를 보고
 * 조직 정보를 한 번에 반환. 통일 정책 전제(모든 본인 케이스 동일 값). 케이스 없거나
 * 미연결이면 해당 키 null. [내 정보] 허브에서 카드별 이름 표시용.
 */
export async function getMyPartnerOrgs(): Promise<
  Result<{ vet: PartnerOrg | null; transport: PartnerOrg | null }>
> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()
    const { data: links, error: linksError } = await supabase
      .from('case_customer_links')
      .select('case_id')
      .eq('user_id', user.id)
      .limit(1)
    if (linksError) return { ok: false, error: linksError.message }
    if (!links?.length) return { ok: true, value: { vet: null, transport: null } }

    const caseId = (links[0] as { case_id: string }).case_id
    const { data: caseRow, error: caseError } = await supabase
      .from('cases')
      .select('org_id, transport_org_id')
      .eq('id', caseId)
      .maybeSingle()
    if (caseError) return { ok: false, error: caseError.message }

    // 담당 병원 = org_id, 운송 = transport_org_id. 둘 다 platform = 담당 미정 → null 표시.
    const orgId = (caseRow as { org_id: string | null } | null)?.org_id ?? null
    const vetId = orgId && orgId !== PLATFORM_ORG_ID ? orgId : null
    const tspRaw =
      (caseRow as { transport_org_id: string | null } | null)?.transport_org_id ?? null
    const tspId = tspRaw && tspRaw !== PLATFORM_ORG_ID ? tspRaw : null
    const ids = [vetId, tspId].filter((v): v is string => !!v)
    if (ids.length === 0) return { ok: true, value: { vet: null, transport: null } }

    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, name_en, org_type, avatar_url')
      .in('id', ids)
    if (orgsError) return { ok: false, error: orgsError.message }

    const byId = new Map((orgs ?? []).map((o) => [(o as PartnerOrg).id, o as PartnerOrg]))
    return {
      ok: true,
      value: {
        vet: vetId ? byId.get(vetId) ?? null : null,
        transport: tspId ? byId.get(tspId) ?? null : null,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export interface PartnerOrgInfo {
  /** 주소 (한글) — 없으면 null. */
  address: string | null
  /** 대표 전화 — 없으면 null. */
  phone: string | null
  /** 이메일 — 없으면 null. */
  email: string | null
  /** 네이버예약 링크 — 병원만. 없으면 null. */
  naverBookingUrl: string | null
  /** 카카오톡 채널 chat 링크 — 병원만. 없으면 null. */
  kakaoChatUrl: string | null
}

/**
 * 보호자에게 보여줄 담당 조직(병원·운송업체)의 공개 연락 정보 — 주소·전화·이메일.
 * [내 정보 > 담당 동물병원] 카드(/me/vet)에서 조직 상세 표시용.
 *
 * organization_settings.company_info(VetInfo blob)에서 role 별 필드만 추출:
 *   - vet: address_ko / phone / email
 *   - transport: transport_address_ko / transport_phone / transport_email
 *
 * organization_settings 의 SELECT RLS 는 조직 멤버만 허용하므로 보호자(비멤버)는 직접
 * 못 읽는다 → service-role 로 읽되, **본인 첫 케이스에 실제 연결된 org** 한정으로만
 * 조회(범위 제한)해 안전선을 둔다. 미연결이거나 정보 없으면 빈 값(모두 null).
 */
export async function getPartnerOrgInfo(
  role: PartnerRole,
): Promise<Result<PartnerOrgInfo | null>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()
    const { data: links, error: linksError } = await supabase
      .from('case_customer_links')
      .select('case_id')
      .eq('user_id', user.id)
      .limit(1)
    if (linksError) return { ok: false, error: linksError.message }
    if (!links?.length) return { ok: true, value: null }

    const caseId = (links[0] as { case_id: string }).case_id
    const { data: caseRow, error: caseError } = await supabase
      .from('cases')
      .select('org_id, transport_org_id')
      .eq('id', caseId)
      .maybeSingle()
    if (caseError) return { ok: false, error: caseError.message }

    const raw =
      role === 'vet'
        ? (caseRow as { org_id: string | null } | null)?.org_id ?? null
        : (caseRow as { transport_org_id: string | null } | null)?.transport_org_id ?? null
    const orgId = raw && raw !== PLATFORM_ORG_ID ? raw : null
    if (!orgId) return { ok: true, value: null }

    // organization_settings 는 조직 멤버만 RLS SELECT 허용 → service-role 로 읽는다.
    // 위에서 본인 케이스에 연결된 org 로만 한정했으므로 타 조직 정보는 새지 않는다.
    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()
    const { data: settings } = await admin
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', 'company_info')
      .maybeSingle()
    const info = ((settings as { value: Record<string, unknown> } | null)?.value ?? {}) as Record<
      string,
      unknown
    >
    const pick = (k: string): string | null => {
      const v = info[k]
      return typeof v === 'string' && v.trim() ? v.trim() : null
    }
    const value: PartnerOrgInfo =
      role === 'vet'
        ? {
            address: pick('address_ko'),
            phone: pick('phone'),
            email: pick('email'),
            // 네이버예약·카카오톡은 병원(hospital) 전용 안내 링크.
            naverBookingUrl: pick('naver_booking_url'),
            kakaoChatUrl: pick('kakao_chat_url'),
          }
        : {
            address: pick('transport_address_ko'),
            phone: pick('transport_phone'),
            email: pick('transport_email'),
            naverBookingUrl: null,
            kakaoChatUrl: null,
          }
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 카드 바텀시트에 노출할 조직 목록. role 에 따라 hospital/both 또는 transport/both 만.
 * platform(펫무브 직영) 은 id 로 명시 제외 — org_type 이 드리프트('both' 등)로 바뀌어도
 * 보호자 카탈로그에 새지 않도록. (직영을 담당으로 고르면 org_id 가 platform 으로 돌아가
 * "담당 미정"=연결 해제처럼 동작하는 결함 방지. 해제는 unset* 로만.)
 */
export async function listAvailableOrgs(role: PartnerRole): Promise<Result<PartnerOrg[]>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, name_en, org_type, avatar_url')
      .in('org_type', PARTNER_TYPES_BY_ROLE[role] as unknown as string[])
      .neq('id', PLATFORM_ORG_ID)
      .order('name', { ascending: true })
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: (data ?? []) as PartnerOrg[] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 본인 모든 케이스에 담당 병원(org_id) 일괄 갱신. */
export async function setVetOrg(orgId: string): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('vet', orgId)
}

/** 본인 모든 케이스에 transport_org_id 일괄 갱신. */
export async function setTransportOrg(orgId: string): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('transport', orgId)
}

/** 담당 병원 해제 — 본인 모든 케이스의 org_id 를 직영(platform)으로. */
export async function unsetVetOrg(): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('vet', null)
}

/** transport_org_id 해제 — 본인 모든 케이스의 컬럼을 NULL. */
export async function unsetTransportOrg(): Promise<Result<{ updated: number }>> {
  return setPartnerOrg('transport', null)
}

// ─────────────────────────────────────────────────
// 공용 헬퍼
// ─────────────────────────────────────────────────

// 담당 병원은 org_id 컬럼(= 케이스 소유 조직)으로 일원화. 운송은 transport_org_id.
const COLUMN_BY_ROLE: Record<PartnerRole, 'org_id' | 'transport_org_id'> = {
  vet: 'org_id',
  transport: 'transport_org_id',
}

/**
 * role 에 따라 cases.org_id(담당 병원) 또는 transport_org_id 를 일괄 갱신.
 *
 * - orgId 가 null 이면 해제, 값이면 유효성 검증 후 갱신.
 * - 검증: 조직 존재 + org_type 가 role 에 허용된 타입인지 확인 (RLS 도 차단하지만
 *   사용자 친화 에러 메시지를 위해 server 단에서 먼저 검사).
 * - 본인이 링크된 케이스 범위(case_customer_links.user_id = auth.uid()) 로 제한.
 *   service-role 우회는 이 범위 안에서만 안전.
 */
async function setPartnerOrg(
  role: PartnerRole,
  orgId: string | null,
): Promise<Result<{ updated: number }>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }

    if (orgId !== null) {
      // 플랫폼(직영)은 담당으로 설정 불가 — org_id=platform 은 "담당 미정" 의미라
      // 연결이 아니라 해제가 된다. 해제는 unsetVetOrg/unsetTransportOrg 로만.
      if (orgId === PLATFORM_ORG_ID) {
        return { ok: false, error: '펫무브 직영은 담당으로 선택할 수 없습니다.' }
      }
      const supabase = await createClient()
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, org_type')
        .eq('id', orgId)
        .maybeSingle()
      if (orgError) return { ok: false, error: orgError.message }
      if (!org) return { ok: false, error: '조직을 찾을 수 없습니다.' }
      if (!PARTNER_TYPES_BY_ROLE[role].includes((org as { org_type: string }).org_type)) {
        return { ok: false, error: '선택할 수 없는 조직 유형입니다.' }
      }
    }

    // service-role 로 case 업데이트 — 본인 case_customer_links 범위 제한.
    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()
    const { data: links, error: linksError } = await admin
      .from('case_customer_links')
      .select('case_id')
      .eq('user_id', user.id)
    if (linksError) return { ok: false, error: linksError.message }

    const caseIds = (links ?? []).map((l) => (l as { case_id: string }).case_id)
    if (caseIds.length === 0) return { ok: true, value: { updated: 0 } }

    // UPDATE 전 prev 값 + customer_name 수집 — 알림 분기 계산용.
    const column = COLUMN_BY_ROLE[role]
    const { data: prevCases } = await admin
      .from('cases')
      .select(`id, customer_name, ${column}`)
      .in('id', caseIds)
    const prevRows = (prevCases ?? []) as Array<Record<string, unknown>>
    const prevOrgIds = new Set(
      prevRows
        .map((r) => r[column])
        .filter((v): v is string => typeof v === 'string' && !!v && v !== PLATFORM_ORG_ID),
    )
    const customerName = ((prevRows[0]?.customer_name as string | null) ?? '').trim()

    // 5b. 담당 병원을 다른 병원으로 바꾸기 직전 — 본병원 광견병 접종의 약품을 "변경 전"
    // 카탈로그로 케이스에 복사 저장(snapshot)하고 타병원(other_hospital=true)으로 전환한다.
    // 안 하면 새 병원 카탈로그 기준으로 약품 표시가 바뀌어 과거 기록이 변질된다. 새 병원
    // 입장에선 그 접종이 타병원 접종이기도 하다. (광견병 한정 — 다른 백신 snapshot 은 후속.)
    // co_progress 트리거는 형제로 전파하지만, 형제도 같은 caseIds 라 동일 snapshot → 멱등.
    if (role === 'vet' && orgId !== null) {
      const { createVaccineLookups } = await import('@petmove/domain')
      const { getCaseVaccineData } = await import('./cases')
      for (const r of prevRows) {
        const cid = r.id as string
        const prevOrg = r[column] as string | null
        if (!cid || !prevOrg || prevOrg === PLATFORM_ORG_ID || prevOrg === orgId) continue
        const vd = await getCaseVaccineData(cid)
        if (!vd.ok) continue
        const lookups = createVaccineLookups(vd.value)
        const { data: cr } = await admin.from('cases').select('data').eq('id', cid).maybeSingle()
        const cdata = ((cr as { data: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>
        const rabies = Array.isArray(cdata.rabies_dates)
          ? (cdata.rabies_dates as Array<Record<string, unknown>>)
          : []
        let touched = false
        const nextRabies = rabies.map((e) => {
          if (!e || typeof e !== 'object' || (e as { other_hospital?: boolean }).other_hospital === true) return e
          const date = typeof e.date === 'string' ? e.date : ''
          const hint = date ? lookups.lookupRabies(date) : null
          touched = true
          return {
            ...e,
            product: e.product || hint?.vaccine || hint?.product || '',
            manufacturer: e.manufacturer || hint?.manufacturer || '',
            lot: e.lot || hint?.batch || '',
            expiry: e.expiry || hint?.expiry || '',
            other_hospital: true,
          }
        })
        if (touched) {
          await admin.from('cases').update({ data: { ...cdata, rabies_dates: nextRabies } }).eq('id', cid)
        }
      }
    }

    // 담당 병원(vet)은 org_id 컬럼 — 해제(null)면 직영(platform)으로 되돌림(org_id 는 NOT NULL).
    // 운송(transport)은 transport_org_id — null(해제) 허용.
    const nextValue = role === 'vet' ? (orgId ?? PLATFORM_ORG_ID) : orgId
    const { error: updateError } = await admin
      .from('cases')
      .update({ [column]: nextValue })
      .in('id', caseIds)
    if (updateError) return { ok: false, error: updateError.message }

    // 알림 — 옛 조직(새 값과 다른) 에 '해제', 새 조직에 '연결'. best-effort.
    try {
      await notifyPartnerChange(admin, {
        role,
        prevOrgIds: [...prevOrgIds].filter((id) => id !== orgId),
        newOrgId: orgId,
        customerName: customerName || '보호자',
        caseCount: caseIds.length,
      })
    } catch {
      /* 알림 실패가 UPDATE 성공을 막지 않음 */
    }

    revalidatePath('/me')
    revalidatePath('/me/vet')
    revalidatePath('/me/agency')
    return { ok: true, value: { updated: caseIds.length } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─────────────────────────────────────────────────
// 봇 알림 — 연결/해제 시 운영자 system 대화방에 펫무브워크 봇 메시지
// notify_new_apply_case 패턴(20260516000001) 재사용. row 별 트리거가 아니라
// 보호자 단위로 1회만 발송 — 케이스 N개여도 메시지는 조직별 1건.
// ─────────────────────────────────────────────────

const ROLE_LABEL: Record<PartnerRole, string> = {
  vet: '담당 동물병원',
  transport: '운송업체',
}

type AdminClient = ReturnType<
  typeof import('@petmove/auth') extends { createAdminClient: () => infer R } ? () => R : never
>

async function notifyPartnerChange(
  admin: AdminClient,
  args: {
    role: PartnerRole
    prevOrgIds: string[]
    newOrgId: string | null
    customerName: string
    caseCount: number
  },
): Promise<void> {
  // 봇 사용자 — 없으면 알림 skip (super-admin 의 봇 설정에서 생성됨).
  const { data: bot } = await admin
    .from('profiles')
    .select('id')
    .eq('email', 'bot@petmove.work')
    .maybeSingle()
  const botId = (bot as { id: string } | null)?.id
  if (!botId) return

  const label = ROLE_LABEL[args.role]
  const sizeNote = args.caseCount > 1 ? ` (케이스 ${args.caseCount}건)` : ''

  for (const orgId of args.prevOrgIds) {
    await sendBotMessageToOrg(
      admin,
      botId,
      orgId,
      `${label} 연결 해제 — ${args.customerName} 보호자가 ${label} 연결을 해제했습니다.${sizeNote}`,
    )
  }
  if (args.newOrgId) {
    await sendBotMessageToOrg(
      admin,
      botId,
      args.newOrgId,
      `새 ${label} 연결 — ${args.customerName} 보호자가 ${label} 로 연결했습니다.${sizeNote}`,
    )
  }
}

/** 조직의 모든 멤버에게 system 대화방을 통해 봇 메시지 1건씩. */
async function sendBotMessageToOrg(
  admin: AdminClient,
  botId: string,
  orgId: string,
  body: string,
): Promise<void> {
  const { data: members } = await admin
    .from('memberships')
    .select('user_id')
    .eq('org_id', orgId)
  for (const m of (members ?? []) as Array<{ user_id: string }>) {
    const userId = m.user_id
    // system 대화방 — 사용자별 1개, 없으면 생성.
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('kind', 'system')
      .eq('created_by', userId)
      .limit(1)
      .maybeSingle()
    let convId = (existing as { id: string } | null)?.id ?? null
    if (!convId) {
      const { data: created } = await admin
        .from('conversations')
        .insert({ kind: 'system', created_by: userId, name: null })
        .select('id')
        .single()
      convId = (created as { id: string } | null)?.id ?? null
    }
    if (!convId) continue
    await admin
      .from('conversation_participants')
      .upsert(
        [
          { conversation_id: convId, user_id: userId },
          { conversation_id: convId, user_id: botId },
        ],
        { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
      )
    await admin
      .from('messages')
      .insert({ conversation_id: convId, sender_user_id: botId, content: body })
  }
}
