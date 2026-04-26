'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/supabase/active-org'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** 첨부 signed URL TTL — 1 시간 (목록 한 번 가져오면 그 안엔 유효) */
const CHAT_FILE_URL_TTL = 60 * 60

/**
 * Phase A — 1:1 DM. 채널 = (user_a_id < user_b_id) 정렬된 두 사용자 짝.
 * "상대" 는 항상 본인이 아닌 user_a/user_b 쪽.
 */
export interface ConversationListItem {
  id: string
  other_user: {
    id: string
    name: string | null
    email: string | null
    org_name: string | null
  }
  last_message:
    | {
        content: string | null
        has_file: boolean
        sender_name: string | null
        created_at: string
      }
    | null
  unread_count: number
  last_message_at: string | null
  created_at: string
  pinned_message_id: string | null
}

export interface MessageRow {
  id: string
  conv_id: string
  sender_user_id: string | null
  sender_name: string | null
  case_id: string | null
  case_label: string | null
  content: string | null
  file_url: string | null
  file_name: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

export interface ConversationMessagesResult {
  messages: MessageRow[]
  /** 상대방이 마지막으로 읽은 시각 — 본인 메시지의 "읽음" 표시 기준. */
  other_last_read_at: string | null
  /** 공지로 지정된 메시지 (200개 limit 밖이어도 별도 조회) */
  pinned_message: MessageRow | null
}

export interface CasePickerItem {
  id: string
  label: string
}

export interface OrgPickerItem {
  id: string
  name: string
}

export interface MemberPickerItem {
  user_id: string
  name: string | null
  email: string | null
}

async function requireUser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  return { ok: true, userId: user.id }
}

/** 케이스 식별 라벨 — picker / 메시지 칩에서 사용 */
function caseLabelFrom(c: {
  pet_name: string | null
  pet_name_en: string | null
  destination: string | null
  microchip: string | null
}): string {
  const name = c.pet_name || c.pet_name_en || ''
  const dest = c.destination || ''
  const chip = c.microchip ? `#${c.microchip.slice(-3)}` : ''
  const parts = [name, dest, chip].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '(이름 없음)'
}

/**
 * 인박스용 채널 목록 — 상대 사용자 정보 + 안 읽은 카운트 포함.
 * RLS 가 본인이 한 쪽인 채널만 통과시킴.
 */
export async function listMyConversations(): Promise<Result<ConversationListItem[]>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const supabase = await createClient()
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, user_a_id, user_b_id, last_message_at, created_at, pinned_message_id')
    .order('last_message_at', { ascending: false, nullsFirst: false })
  if (error) return { ok: false, error: error.message }
  if (!convs || convs.length === 0) return { ok: true, value: [] }

  const convIds = convs.map((c) => c.id as string)
  const otherUserIds = Array.from(
    new Set(
      convs.map((c) =>
        (c.user_a_id as string) === auth.userId ? (c.user_b_id as string) : (c.user_a_id as string),
      ),
    ),
  )

  // 상대 사용자 — admin 클라이언트로 조회 (RLS 우회 — 검색 picker 와 달리 dm_visible 무관, 이미 채널 멤버임)
  const admin = createAdminClient()
  const [profRes, lastMsgRes, readsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, name, email')
      .in('id', otherUserIds),
    supabase
      .from('messages')
      .select('id, conv_id, sender_user_id, content, file_url, created_at')
      .in('conv_id', convIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('message_reads').select('conv_id, last_read_at').in('conv_id', convIds),
  ])

  if (profRes.error) return { ok: false, error: profRes.error.message }
  if (lastMsgRes.error) return { ok: false, error: lastMsgRes.error.message }
  if (readsRes.error) return { ok: false, error: readsRes.error.message }

  // 상대 사용자별 첫 조직 이름 — 단순화: memberships 첫 조직 사용
  const memRes = await admin
    .from('memberships')
    .select('user_id, org_id')
    .in('user_id', otherUserIds)
  const orgIds = Array.from(new Set((memRes.data ?? []).map((m) => m.org_id as string)))
  const orgNameMap = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgs } = await admin.from('organizations').select('id, name').in('id', orgIds)
    for (const o of orgs ?? []) orgNameMap.set(o.id as string, o.name as string)
  }
  const userOrgName = new Map<string, string>()
  for (const m of memRes.data ?? []) {
    const uid = m.user_id as string
    if (userOrgName.has(uid)) continue
    const oid = m.org_id as string
    const name = orgNameMap.get(oid)
    if (name) userOrgName.set(uid, name)
  }

  const profMap = new Map<string, { name: string | null; email: string | null }>()
  for (const p of profRes.data ?? []) {
    profMap.set(p.id as string, {
      name: (p.name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
    })
  }

  const lastByConv = new Map<
    string,
    { content: string | null; file_url: string | null; sender_user_id: string | null; created_at: string }
  >()
  for (const m of lastMsgRes.data ?? []) {
    const k = m.conv_id as string
    if (!lastByConv.has(k)) {
      lastByConv.set(k, {
        content: m.content as string | null,
        file_url: m.file_url as string | null,
        sender_user_id: m.sender_user_id as string | null,
        created_at: m.created_at as string,
      })
    }
  }

  const readsByConv = new Map<string, string>()
  for (const r of readsRes.data ?? [])
    readsByConv.set(r.conv_id as string, r.last_read_at as string)

  const unreadByConv = new Map<string, number>()
  for (const m of lastMsgRes.data ?? []) {
    const k = m.conv_id as string
    const lastRead = readsByConv.get(k)
    if (!lastRead || (m.created_at as string) > lastRead) {
      if ((m.sender_user_id as string | null) !== auth.userId) {
        unreadByConv.set(k, (unreadByConv.get(k) ?? 0) + 1)
      }
    }
  }

  // 마지막 메시지 sender 이름 — 본인이거나 상대 (둘뿐)
  const senderNameMap = new Map<string, string | null>()
  senderNameMap.set(auth.userId, null) // 본인 — 표시 불필요
  for (const [uid, p] of profMap) senderNameMap.set(uid, p.name ?? p.email ?? null)

  const value: ConversationListItem[] = convs.map((c) => {
    const otherId =
      (c.user_a_id as string) === auth.userId ? (c.user_b_id as string) : (c.user_a_id as string)
    const last = lastByConv.get(c.id as string) ?? null
    const prof = profMap.get(otherId)
    return {
      id: c.id as string,
      other_user: {
        id: otherId,
        name: prof?.name ?? null,
        email: prof?.email ?? null,
        org_name: userOrgName.get(otherId) ?? null,
      },
      last_message: last
        ? {
            content: last.content,
            has_file: !!last.file_url,
            sender_name: last.sender_user_id ? senderNameMap.get(last.sender_user_id) ?? null : null,
            created_at: last.created_at,
          }
        : null,
      unread_count: unreadByConv.get(c.id as string) ?? 0,
      last_message_at: (c.last_message_at as string | null) ?? null,
      created_at: c.created_at as string,
      pinned_message_id: (c.pinned_message_id as string | null) ?? null,
    }
  })

  return { ok: true, value }
}

/**
 * 채널의 메시지 목록 — case_id 옵션 필터.
 * messages.file_url 은 storage 경로 (`{conv_id}/...`) — 여기서 signed URL 로 변환.
 */
export async function listConversationMessages(input: {
  convId: string
  caseId?: string | null
  limit?: number
}): Promise<Result<ConversationMessagesResult>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()

  let q = supabase
    .from('messages')
    .select(
      'id, conv_id, sender_user_id, case_id, content, file_url, file_name, created_at, edited_at, deleted_at',
    )
    .eq('conv_id', input.convId)
    .order('created_at', { ascending: true })
    .limit(input.limit ?? 200)

  if (input.caseId) {
    q = q.eq('case_id', input.caseId)
  }

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  const rows = data ?? []

  const senderIds = Array.from(
    new Set(rows.map((r) => r.sender_user_id as string | null).filter((v): v is string => !!v)),
  )
  const caseIds = Array.from(
    new Set(rows.map((r) => r.case_id as string | null).filter((v): v is string => !!v)),
  )
  const filePaths = Array.from(
    new Set(rows.map((r) => r.file_url as string | null).filter((v): v is string => !!v)),
  )

  const admin = createAdminClient()
  const [profsRes, casesRes, signedUrls] = await Promise.all([
    senderIds.length > 0
      ? admin.from('profiles').select('id, name, email').in('id', senderIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; email: string | null }[], error: null }),
    caseIds.length > 0
      ? supabase
          .from('cases')
          .select('id, pet_name, pet_name_en, destination, microchip')
          .in('id', caseIds)
      : Promise.resolve({
          data: [] as {
            id: string
            pet_name: string | null
            pet_name_en: string | null
            destination: string | null
            microchip: string | null
          }[],
          error: null,
        }),
    filePaths.length > 0
      ? admin.storage.from('chat-files').createSignedUrls(filePaths, CHAT_FILE_URL_TTL)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[], error: null }),
  ])

  const nameMap = new Map<string, string>()
  for (const p of profsRes.data ?? [])
    nameMap.set(
      (p as { id: string }).id,
      ((p as { name: string | null }).name ?? (p as { email: string | null }).email ?? '') as string,
    )

  const labelMap = new Map<string, string>()
  for (const c of casesRes.data ?? [])
    labelMap.set(
      (c as { id: string }).id,
      caseLabelFrom(c as Parameters<typeof caseLabelFrom>[0]),
    )

  const fileUrlMap = new Map<string, string>()
  for (const u of signedUrls.data ?? []) {
    if (u.path && u.signedUrl) fileUrlMap.set(u.path, u.signedUrl)
  }

  const messages: MessageRow[] = rows.map((r) => ({
    id: r.id as string,
    conv_id: r.conv_id as string,
    sender_user_id: (r.sender_user_id as string | null) ?? null,
    sender_name: r.sender_user_id ? nameMap.get(r.sender_user_id as string) ?? null : null,
    case_id: (r.case_id as string | null) ?? null,
    case_label: r.case_id ? labelMap.get(r.case_id as string) ?? null : null,
    content: (r.content as string | null) ?? null,
    file_url: r.file_url ? fileUrlMap.get(r.file_url as string) ?? null : null,
    file_name: (r.file_name as string | null) ?? null,
    created_at: r.created_at as string,
    edited_at: (r.edited_at as string | null) ?? null,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }))

  // 상대방의 last_read_at — 본인 메시지의 "읽음" 표시용. message_reads RLS 가
  // user_id=auth.uid() 제약이라 admin client 로 조회 (대화 멤버는 알 권리가 있음).
  const { data: convRow } = await supabase
    .from('conversations')
    .select('user_a_id, user_b_id, pinned_message_id')
    .eq('id', input.convId)
    .maybeSingle()
  let otherLastReadAt: string | null = null
  if (convRow) {
    const otherUserId =
      (convRow.user_a_id as string) === auth.userId
        ? (convRow.user_b_id as string)
        : (convRow.user_a_id as string)
    const { data: read } = await admin
      .from('message_reads')
      .select('last_read_at')
      .eq('conv_id', input.convId)
      .eq('user_id', otherUserId)
      .maybeSingle()
    otherLastReadAt = (read?.last_read_at as string | null) ?? null
  }

  // 공지 메시지 — 현재 messages 배열에서 먼저 찾고, 없으면 별도 조회 (limit 밖일 수 있음)
  let pinnedMessage: MessageRow | null = null
  const pinnedId = (convRow?.pinned_message_id as string | null) ?? null
  if (pinnedId) {
    pinnedMessage = messages.find((m) => m.id === pinnedId) ?? null
    if (!pinnedMessage) {
      const { data: pinnedRow } = await supabase
        .from('messages')
        .select(
          'id, conv_id, sender_user_id, case_id, content, file_url, file_name, created_at, edited_at, deleted_at',
        )
        .eq('id', pinnedId)
        .maybeSingle()
      if (pinnedRow) {
        const senderId = pinnedRow.sender_user_id as string | null
        let senderName: string | null = null
        if (senderId) {
          if (nameMap.has(senderId)) {
            senderName = nameMap.get(senderId) ?? null
          } else {
            const { data: prof } = await admin
              .from('profiles')
              .select('name, email')
              .eq('id', senderId)
              .maybeSingle()
            senderName =
              (prof?.name as string | null) ?? (prof?.email as string | null) ?? null
          }
        }
        let caseLabel: string | null = null
        const cid = pinnedRow.case_id as string | null
        if (cid) {
          if (labelMap.has(cid)) {
            caseLabel = labelMap.get(cid) ?? null
          } else {
            const { data: caseRow } = await supabase
              .from('cases')
              .select('id, pet_name, pet_name_en, destination, microchip')
              .eq('id', cid)
              .maybeSingle()
            if (caseRow) caseLabel = caseLabelFrom(caseRow as Parameters<typeof caseLabelFrom>[0])
          }
        }
        let signedFileUrl: string | null = null
        const fp = pinnedRow.file_url as string | null
        if (fp) {
          if (fileUrlMap.has(fp)) {
            signedFileUrl = fileUrlMap.get(fp) ?? null
          } else {
            const { data: signed } = await admin.storage
              .from('chat-files')
              .createSignedUrl(fp, CHAT_FILE_URL_TTL)
            signedFileUrl = signed?.signedUrl ?? null
          }
        }
        pinnedMessage = {
          id: pinnedRow.id as string,
          conv_id: pinnedRow.conv_id as string,
          sender_user_id: senderId,
          sender_name: senderName,
          case_id: cid,
          case_label: caseLabel,
          content: (pinnedRow.content as string | null) ?? null,
          file_url: signedFileUrl,
          file_name: (pinnedRow.file_name as string | null) ?? null,
          created_at: pinnedRow.created_at as string,
          edited_at: (pinnedRow.edited_at as string | null) ?? null,
          deleted_at: (pinnedRow.deleted_at as string | null) ?? null,
        }
      }
    }
  }

  return {
    ok: true,
    value: { messages, other_last_read_at: otherLastReadAt, pinned_message: pinnedMessage },
  }
}

/** 메시지 전송. content / fileUrl 둘 중 하나는 필수. */
export async function sendMessage(input: {
  convId: string
  content?: string | null
  caseId?: string | null
  fileUrl?: string | null
  fileName?: string | null
}): Promise<Result<MessageRow>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const content = (input.content ?? '').trim()
  const fileUrl = input.fileUrl ?? null
  if (!content && !fileUrl) {
    return { ok: false, error: '내용 또는 첨부파일이 필요합니다' }
  }

  // case_label snapshot — 케이스가 나중에 삭제되어도 텍스트 보존
  let caseLabel: string | null = null
  const caseId = input.caseId ?? null
  if (caseId) {
    const supabase = await createClient()
    const { data: c } = await supabase
      .from('cases')
      .select('pet_name, pet_name_en, destination, microchip')
      .eq('id', caseId)
      .maybeSingle()
    if (c) caseLabel = caseLabelFrom(c as Parameters<typeof caseLabelFrom>[0])
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conv_id: input.convId,
      sender_user_id: auth.userId,
      case_id: caseId,
      case_label: caseLabel,
      content: content || null,
      file_url: fileUrl,
      file_name: input.fileName ?? null,
    })
    .select(
      'id, conv_id, sender_user_id, case_id, case_label, content, file_url, file_name, created_at, edited_at, deleted_at',
    )
    .single()
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    value: {
      id: data.id as string,
      conv_id: data.conv_id as string,
      sender_user_id: data.sender_user_id as string | null,
      sender_name: null,
      case_id: (data.case_id as string | null) ?? null,
      case_label: (data.case_label as string | null) ?? null,
      content: (data.content as string | null) ?? null,
      file_url: (data.file_url as string | null) ?? null,
      file_name: (data.file_name as string | null) ?? null,
      created_at: data.created_at as string,
      edited_at: (data.edited_at as string | null) ?? null,
      deleted_at: (data.deleted_at as string | null) ?? null,
    },
  }
}

/** 채널 읽음 마킹 — 인박스 안 읽은 카운트 0 으로. */
export async function markConversationRead(convId: string): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('message_reads')
    .upsert(
      { user_id: auth.userId, conv_id: convId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,conv_id' },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

/**
 * 대화방 완전 삭제 — 첨부 + 메시지 + 채널 모두 제거. 양측 모두에서 사라짐.
 * 참여자 또는 super_admin 만 가능.
 */
export async function deleteConversation(input: { convId: string }): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const supabase = await createClient()
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, user_a_id, user_b_id')
    .eq('id', input.convId)
    .maybeSingle()
  if (convErr) return { ok: false, error: convErr.message }
  if (!conv) return { ok: false, error: '대화방을 찾을 수 없습니다' }

  const isParticipant =
    conv.user_a_id === auth.userId || conv.user_b_id === auth.userId
  if (!isParticipant) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', auth.userId)
      .maybeSingle()
    if (!prof?.is_super_admin) {
      return { ok: false, error: '대화 참여자만 삭제할 수 있습니다' }
    }
  }

  // Storage 객체 정리 — {convId}/ 폴더의 모든 파일
  const admin = createAdminClient()
  const { data: files, error: lsErr } = await admin.storage
    .from('chat-files')
    .list(input.convId, { limit: 1000 })
  if (lsErr) return { ok: false, error: `파일 목록 조회 실패: ${lsErr.message}` }
  if (files && files.length > 0) {
    const paths = files.map((f) => `${input.convId}/${f.name}`)
    const rmRes = await admin.storage.from('chat-files').remove(paths)
    if (rmRes.error) return { ok: false, error: `파일 삭제 실패: ${rmRes.error.message}` }
  }

  // 채널 삭제 — messages + message_reads cascade.
  // admin client 사용 (참여자 RLS DELETE 정책 별도로 안 만든 채로 작동).
  const { error: delErr } = await admin
    .from('conversations')
    .delete()
    .eq('id', input.convId)
  if (delErr) return { ok: false, error: delErr.message }

  return { ok: true, value: null }
}

/** 본인 메시지 soft delete. */
export async function deleteMessage(messageId: string): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_user_id', auth.userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

/**
 * 메시지를 채팅방 공지로 지정 (또는 해제 — msgId=null).
 * 양쪽 사용자 모두 등록/해제 가능, 동시 1개만.
 * RLS 가 conversation 참여자만 update 허용. 메시지가 같은 채널인지도 검증.
 */
export async function pinMessage(input: {
  convId: string
  msgId: string | null
}): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()

  if (input.msgId) {
    const { data: msg, error: msgErr } = await supabase
      .from('messages')
      .select('id, conv_id')
      .eq('id', input.msgId)
      .maybeSingle()
    if (msgErr) return { ok: false, error: msgErr.message }
    if (!msg || (msg.conv_id as string) !== input.convId) {
      return { ok: false, error: '메시지를 찾을 수 없거나 다른 채널입니다' }
    }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ pinned_message_id: input.msgId })
    .eq('id', input.convId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

/** 케이스 picker — 본인 active org 의 케이스 (RLS). */
export async function listCasesForPicker(input: { search?: string; limit?: number }): Promise<Result<CasePickerItem[]>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const supabase = await createClient()
  let q = supabase
    .from('cases')
    .select('id, pet_name, pet_name_en, destination, microchip')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 50)

  const search = (input.search ?? '').trim()
  if (search) {
    q = q.or(
      `pet_name.ilike.%${search}%,pet_name_en.ilike.%${search}%,microchip.ilike.%${search}%,destination.ilike.%${search}%`,
    )
  }

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }

  const value: CasePickerItem[] = (data ?? []).map((c) => ({
    id: (c as { id: string }).id,
    label: caseLabelFrom(c as Parameters<typeof caseLabelFrom>[0]),
  }))
  return { ok: true, value }
}

// ─────────────────────────────────────────────────
// DM picker — 조직 → 멤버 drilldown
// ─────────────────────────────────────────────────

/**
 * DM picker 1단계: 조직 목록. dm_visible=true 인 조직만.
 * 본인 소속 조직도 포함 (같은 조직 내부 DM).
 */
export async function listOrgsForDmPicker(input: { search?: string; limit?: number } = {}): Promise<Result<OrgPickerItem[]>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const admin = createAdminClient()
  let q = admin
    .from('organizations')
    .select('id, name')
    .eq('dm_visible', true)
    .order('name', { ascending: true })
    .limit(input.limit ?? 100)

  const search = (input.search ?? '').trim()
  if (search) {
    q = q.ilike('name', `%${search}%`)
  }

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  const value: OrgPickerItem[] = (data ?? []).map((o) => ({
    id: o.id as string,
    name: o.name as string,
  }))
  return { ok: true, value }
}

/**
 * DM picker 2단계: 특정 조직의 멤버. 멤버 본인 dm_visible=true 만.
 * 호출자 본인은 제외.
 */
export async function listMembersForDmPicker(input: {
  orgId: string
  search?: string
  limit?: number
}): Promise<Result<MemberPickerItem[]>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const admin = createAdminClient()
  const { data: mems, error: mErr } = await admin
    .from('memberships')
    .select('user_id')
    .eq('org_id', input.orgId)
  if (mErr) return { ok: false, error: mErr.message }
  const userIds = (mems ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== auth.userId)
  if (userIds.length === 0) return { ok: true, value: [] }

  let q = admin
    .from('profiles')
    .select('id, name, email, dm_visible')
    .in('id', userIds)
    .eq('dm_visible', true)
    .order('name', { ascending: true })
    .limit(input.limit ?? 100)

  const search = (input.search ?? '').trim()
  if (search) {
    q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  const value: MemberPickerItem[] = (data ?? []).map((p) => ({
    user_id: p.id as string,
    name: (p.name as string | null) ?? null,
    email: (p.email as string | null) ?? null,
  }))
  return { ok: true, value }
}

/**
 * 상대 사용자와 DM 채널 가져오기 또는 생성 (idempotent).
 * (user_a_id < user_b_id) 자동 정렬.
 */
export async function getOrCreateDM(input: { otherUserId: string }): Promise<Result<{ id: string; created: boolean }>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  if (input.otherUserId === auth.userId) {
    return { ok: false, error: '본인과는 DM 할 수 없습니다' }
  }

  const [a, b] =
    auth.userId < input.otherUserId
      ? [auth.userId, input.otherUserId]
      : [input.otherUserId, auth.userId]

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .maybeSingle()
  if (existing) {
    return { ok: true, value: { id: existing.id as string, created: false } }
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_a_id: a, user_b_id: b })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: { id: data.id as string, created: true } }
}

// ─────────────────────────────────────────────────
// dm_visible 토글
// ─────────────────────────────────────────────────

/** 활성 조직의 dm_visible 값 — 설정 화면 초기값 로드용. */
export async function getActiveOrgDmVisibility(): Promise<Result<boolean>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  let orgId: string
  try {
    orgId = await getActiveOrgId()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organizations')
    .select('dm_visible')
    .eq('id', orgId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: !!data?.dm_visible }
}

/** 본인 검색 노출 토글. */
export async function updateMyDmVisibility(input: { visible: boolean }): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ dm_visible: input.visible })
    .eq('id', auth.userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

/** 활성 조직의 dm_visible 토글 — 활성 조직의 admin 만 가능. */
export async function updateActiveOrgDmVisibility(input: { visible: boolean }): Promise<Result<null>> {
  let orgId: string
  try {
    orgId = await getActiveOrgId()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  return updateOrgDmVisibility({ orgId, visible: input.visible })
}

/** 조직 검색 노출 토글 — 해당 조직의 admin 만 가능. */
export async function updateOrgDmVisibility(input: { orgId: string; visible: boolean }): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const supabase = await createClient()
  const { data: prof } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', auth.userId)
    .maybeSingle()
  const isSuperAdmin = !!prof?.is_super_admin

  if (!isSuperAdmin) {
    const { data: mem } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', auth.userId)
      .eq('org_id', input.orgId)
      .maybeSingle()
    if (mem?.role !== 'admin') {
      return { ok: false, error: '조직 관리자만 변경할 수 있습니다' }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizations')
    .update({ dm_visible: input.visible })
    .eq('id', input.orgId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}
