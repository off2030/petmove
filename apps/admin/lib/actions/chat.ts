'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/supabase/active-org'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const CHAT_FILE_URL_TTL = 60 * 60
const NAME_MAX = 50

// ─────────────────────────────────────────────────
// 타입
// 1:1 = participants.length === 1 (본인 외 1명)
// N:N = participants.length >= 2 (본인 외 2+)
// ─────────────────────────────────────────────────

export interface Participant {
  user_id: string
  name: string | null
  email: string | null
  org_name: string | null
  avatar_url: string | null
}

export interface ConversationListItem {
  id: string
  name: string | null
  /** 본인 제외 참여자. 1:1 이면 length 1, 그룹이면 2+. */
  participants: Participant[]
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
  conversation_id: string
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
  /** 본인 제외 참여자. */
  participants: Participant[]
  /** 모든 참여자(본인 포함)의 last_read_at — 본인 메시지의 "읽음 N명" 계산용. */
  reads: Array<{ user_id: string; last_read_at: string }>
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

// ─────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────

async function requireUser(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  return { ok: true, userId: user.id }
}

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

function normalizeName(input: string | null | undefined): string | null {
  if (!input) return null
  const t = input.trim()
  if (!t) return null
  return t.slice(0, NAME_MAX)
}

/** 사용자 ID 들의 프로필 + 조직명 매핑. admin client 로 RLS 우회. */
type ParticipantInfo = {
  name: string | null
  email: string | null
  org_name: string | null
  avatar_url: string | null
}

async function loadParticipantInfo(
  userIds: string[],
): Promise<Map<string, ParticipantInfo>> {
  const result = new Map<string, ParticipantInfo>()
  if (userIds.length === 0) return result

  const admin = createAdminClient()
  const [profsRes, memsRes] = await Promise.all([
    admin.from('profiles').select('id, name, email, avatar_url').in('id', userIds),
    admin.from('memberships').select('user_id, org_id').in('user_id', userIds),
  ])

  const orgIds = Array.from(new Set((memsRes.data ?? []).map((m) => m.org_id as string)))
  const orgNameMap = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgs } = await admin.from('organizations').select('id, name').in('id', orgIds)
    for (const o of orgs ?? []) orgNameMap.set(o.id as string, o.name as string)
  }
  const userOrgName = new Map<string, string>()
  for (const m of memsRes.data ?? []) {
    const uid = m.user_id as string
    if (userOrgName.has(uid)) continue
    const oid = m.org_id as string
    const name = orgNameMap.get(oid)
    if (name) userOrgName.set(uid, name)
  }

  for (const p of profsRes.data ?? []) {
    const uid = p.id as string
    result.set(uid, {
      name: (p.name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      org_name: userOrgName.get(uid) ?? null,
      avatar_url: (p.avatar_url as string | null) ?? null,
    })
  }
  // 프로필 없는 사용자도 빈 항목으로
  for (const uid of userIds) {
    if (!result.has(uid))
      result.set(uid, { name: null, email: null, org_name: null, avatar_url: null })
  }
  return result
}

// ─────────────────────────────────────────────────
// 인박스
// ─────────────────────────────────────────────────

export async function listMyConversations(): Promise<Result<ConversationListItem[]>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()

  // 본인 참여 conv id
  const { data: myParts, error: mpErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', auth.userId)
  if (mpErr) return { ok: false, error: mpErr.message }
  const convIds = (myParts ?? []).map((r) => r.conversation_id as string)
  if (convIds.length === 0) return { ok: true, value: [] }

  const [convsRes, allPartsRes, lastMsgRes, readsRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, name, last_message_at, created_at, pinned_message_id')
      .in('id', convIds)
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', convIds),
    supabase
      .from('messages')
      .select('id, conversation_id, sender_user_id, content, file_url, created_at')
      .in('conversation_id', convIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('message_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', auth.userId)
      .in('conversation_id', convIds),
  ])

  if (convsRes.error) return { ok: false, error: convsRes.error.message }
  if (allPartsRes.error) return { ok: false, error: allPartsRes.error.message }
  if (lastMsgRes.error) return { ok: false, error: lastMsgRes.error.message }
  if (readsRes.error) return { ok: false, error: readsRes.error.message }

  const allUserIds = Array.from(new Set((allPartsRes.data ?? []).map((p) => p.user_id as string)))
  const profMap = await loadParticipantInfo(allUserIds)

  // 그룹별 참여자 (본인 제외)
  const partsByConv = new Map<string, Participant[]>()
  for (const p of allPartsRes.data ?? []) {
    const cid = p.conversation_id as string
    const uid = p.user_id as string
    if (uid === auth.userId) continue
    const prof = profMap.get(uid) ?? { name: null, email: null, org_name: null, avatar_url: null }
    const list = partsByConv.get(cid) ?? []
    list.push({ user_id: uid, ...prof })
    partsByConv.set(cid, list)
  }

  // 그룹별 마지막 메시지
  const senderNameMap = new Map<string, string | null>()
  senderNameMap.set(auth.userId, null) // 본인 메시지는 sender_name=null (UI 에서 "나" 처리)
  for (const [uid, prof] of profMap) senderNameMap.set(uid, prof.name ?? prof.email ?? null)

  const lastByConv = new Map<
    string,
    { content: string | null; file_url: string | null; sender_user_id: string | null; created_at: string }
  >()
  for (const m of lastMsgRes.data ?? []) {
    const k = m.conversation_id as string
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
  for (const r of readsRes.data ?? []) readsByConv.set(r.conversation_id as string, r.last_read_at as string)

  const unreadByConv = new Map<string, number>()
  for (const m of lastMsgRes.data ?? []) {
    const k = m.conversation_id as string
    const lastRead = readsByConv.get(k)
    const msgCreated = m.created_at as string
    const sender = m.sender_user_id as string | null
    const isFromOther = sender !== auth.userId
    const isAfterRead = !lastRead || msgCreated > lastRead
    if (isAfterRead && isFromOther) {
      unreadByConv.set(k, (unreadByConv.get(k) ?? 0) + 1)
    }
  }

  const value: ConversationListItem[] = (convsRes.data ?? []).map((c) => {
    const cid = c.id as string
    const last = lastByConv.get(cid) ?? null
    return {
      id: cid,
      name: (c.name as string | null) ?? null,
      participants: partsByConv.get(cid) ?? [],
      last_message: last
        ? {
            content: last.content,
            has_file: !!last.file_url,
            sender_name: last.sender_user_id ? senderNameMap.get(last.sender_user_id) ?? null : null,
            created_at: last.created_at,
          }
        : null,
      unread_count: unreadByConv.get(cid) ?? 0,
      last_message_at: (c.last_message_at as string | null) ?? null,
      created_at: c.created_at as string,
      pinned_message_id: (c.pinned_message_id as string | null) ?? null,
    }
  })

  return { ok: true, value }
}

// ─────────────────────────────────────────────────
// 메시지
// ─────────────────────────────────────────────────

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
      'id, conversation_id, sender_user_id, case_id, content, file_url, file_name, created_at, edited_at, deleted_at',
    )
    .eq('conversation_id', input.convId)
    .order('created_at', { ascending: true })
    .limit(input.limit ?? 200)
  if (input.caseId) q = q.eq('case_id', input.caseId)

  const admin = createAdminClient()

  // Wave 1 — 서로 의존 없는 4개 쿼리를 한번에. 기존엔 messages 를 await
  // 한 뒤 5개 Promise.all 을 또 await 했어서 직렬 RTT 가 많았음.
  const [msgsRes, partsRes, readsRes, convRes] = await Promise.all([
    q,
    supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', input.convId),
    supabase
      .from('message_reads')
      .select('user_id, last_read_at')
      .eq('conversation_id', input.convId),
    supabase
      .from('conversations')
      .select('pinned_message_id')
      .eq('id', input.convId)
      .maybeSingle(),
  ])

  if (msgsRes.error) return { ok: false, error: msgsRes.error.message }
  if (partsRes.error) return { ok: false, error: partsRes.error.message }
  if (readsRes.error) return { ok: false, error: readsRes.error.message }
  const rows = msgsRes.data ?? []

  const senderIds = Array.from(
    new Set(rows.map((r) => r.sender_user_id as string | null).filter((v): v is string => !!v)),
  )
  const caseIds = Array.from(
    new Set(rows.map((r) => r.case_id as string | null).filter((v): v is string => !!v)),
  )
  const filePaths = Array.from(
    new Set(rows.map((r) => r.file_url as string | null).filter((v): v is string => !!v)),
  )
  const memberUserIds = (partsRes.data ?? []).map((r) => r.user_id as string)
  const allUserIdsForName = Array.from(new Set([...senderIds, ...memberUserIds]))

  // Wave 2 — messages 와 participants 결과에 의존하는 4개를 병렬.
  // 기존 loadParticipantInfo 의 profiles+memberships 도 여기로 합쳐 RTT 1회 절감.
  const [signedUrls, casesRes, profsRes, memsRes] = await Promise.all([
    filePaths.length > 0
      ? admin.storage.from('chat-files').createSignedUrls(filePaths, CHAT_FILE_URL_TTL)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[], error: null }),
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
    allUserIdsForName.length > 0
      ? admin.from('profiles').select('id, name, email, avatar_url').in('id', allUserIdsForName)
      : Promise.resolve({
          data: [] as { id: string; name: string | null; email: string | null; avatar_url: string | null }[],
          error: null,
        }),
    allUserIdsForName.length > 0
      ? admin.from('memberships').select('user_id, org_id').in('user_id', allUserIdsForName)
      : Promise.resolve({
          data: [] as { user_id: string; org_id: string }[],
          error: null,
        }),
  ])

  // Wave 3 — orgs (memberships 결과 의존). 한번 더 RTT 지만 회피하려면 schema FK join
  // 이 필요해 일단 유지.
  const orgIds = Array.from(new Set((memsRes.data ?? []).map((m) => m.org_id as string)))
  const orgsRes = orgIds.length > 0
    ? await admin.from('organizations').select('id, name').in('id', orgIds)
    : { data: [] as { id: string; name: string }[], error: null }

  // profMap 조립 — 기존 loadParticipantInfo 와 동일 결과.
  const orgNameMap = new Map<string, string>()
  for (const o of orgsRes.data ?? []) orgNameMap.set(o.id as string, o.name as string)
  const userOrgName = new Map<string, string>()
  for (const m of memsRes.data ?? []) {
    const uid = m.user_id as string
    if (userOrgName.has(uid)) continue
    const oid = m.org_id as string
    const name = orgNameMap.get(oid)
    if (name) userOrgName.set(uid, name)
  }
  const profMap = new Map<string, ParticipantInfo>()
  for (const p of profsRes.data ?? []) {
    const uid = p.id as string
    profMap.set(uid, {
      name: (p.name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      org_name: userOrgName.get(uid) ?? null,
      avatar_url: (p.avatar_url as string | null) ?? null,
    })
  }
  for (const uid of allUserIdsForName) {
    if (!profMap.has(uid))
      profMap.set(uid, { name: null, email: null, org_name: null, avatar_url: null })
  }

  const participants: Participant[] = memberUserIds
    .filter((uid) => uid !== auth.userId)
    .map((uid) => {
      const prof = profMap.get(uid) ?? { name: null, email: null, org_name: null, avatar_url: null }
      return { user_id: uid, ...prof }
    })

  const nameMap = new Map<string, string | null>()
  for (const [uid, prof] of profMap) nameMap.set(uid, prof.name ?? prof.email ?? null)

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
    conversation_id: r.conversation_id as string,
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

  // 공지 — 200개 limit 안에 있으면 재사용, 없으면 별도 조회
  let pinnedMessage: MessageRow | null = null
  const pinnedId = (convRes.data?.pinned_message_id as string | null) ?? null
  if (pinnedId) {
    pinnedMessage = messages.find((m) => m.id === pinnedId) ?? null
    if (!pinnedMessage) {
      const { data: pinnedRow } = await supabase
        .from('messages')
        .select(
          'id, conversation_id, sender_user_id, case_id, content, file_url, file_name, created_at, edited_at, deleted_at',
        )
        .eq('id', pinnedId)
        .maybeSingle()
      if (pinnedRow) {
        const senderId = pinnedRow.sender_user_id as string | null
        let senderName: string | null = null
        if (senderId) {
          if (nameMap.has(senderId)) senderName = nameMap.get(senderId) ?? null
          else {
            const { data: prof } = await admin
              .from('profiles')
              .select('name, email')
              .eq('id', senderId)
              .maybeSingle()
            senderName = (prof?.name as string | null) ?? (prof?.email as string | null) ?? null
          }
        }
        let caseLabel: string | null = null
        const cid = pinnedRow.case_id as string | null
        if (cid) {
          if (labelMap.has(cid)) caseLabel = labelMap.get(cid) ?? null
          else {
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
          if (fileUrlMap.has(fp)) signedFileUrl = fileUrlMap.get(fp) ?? null
          else {
            const { data: signed } = await admin.storage
              .from('chat-files')
              .createSignedUrl(fp, CHAT_FILE_URL_TTL)
            signedFileUrl = signed?.signedUrl ?? null
          }
        }
        pinnedMessage = {
          id: pinnedRow.id as string,
          conversation_id: pinnedRow.conversation_id as string,
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

  const reads = (readsRes.data ?? []).map((r) => ({
    user_id: r.user_id as string,
    last_read_at: r.last_read_at as string,
  }))

  return { ok: true, value: { messages, participants, reads, pinned_message: pinnedMessage } }
}

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
  if (!content && !fileUrl) return { ok: false, error: '내용 또는 첨부파일이 필요합니다' }

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
      conversation_id: input.convId,
      sender_user_id: auth.userId,
      case_id: caseId,
      case_label: caseLabel,
      content: content || null,
      file_url: fileUrl,
      file_name: input.fileName ?? null,
    })
    .select(
      'id, conversation_id, sender_user_id, case_id, case_label, content, file_url, file_name, created_at, edited_at, deleted_at',
    )
    .single()
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    value: {
      id: data.id as string,
      conversation_id: data.conversation_id as string,
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

export async function markConversationRead(convId: string): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('message_reads')
    .upsert(
      { user_id: auth.userId, conversation_id: convId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,conversation_id' },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

export async function pinMessage(input: {
  convId: string
  msgId: string | null
}): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversations')
    .update({ pinned_message_id: input.msgId })
    .eq('id', input.convId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

export async function deleteMessage(messageId: string): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

export async function editMessage(input: {
  messageId: string
  content: string
}): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const content = input.content.trim()
  if (!content) return { ok: false, error: '내용이 비어 있습니다' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('messages')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', input.messageId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

// ─────────────────────────────────────────────────
// 검색 — 대화방 내 메시지 풀텍스트
// ─────────────────────────────────────────────────

export interface MessageSearchHit {
  id: string
  conversation_id: string
  sender_user_id: string | null
  sender_name: string | null
  case_label: string | null
  content: string | null
  has_file: boolean
  created_at: string
}

export async function searchMessagesInConversation(input: {
  convId: string
  query: string
  limit?: number
}): Promise<Result<MessageSearchHit[]>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const q = input.query.trim()
  if (!q) return { ok: true, value: [] }

  // ILIKE wildcard 이스케이프 — 사용자가 '%' / '_' / '\\' 입력해도 리터럴로 매칭
  const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_user_id, content, file_url, case_label, created_at')
    .eq('conversation_id', input.convId)
    .is('deleted_at', null)
    .ilike('content', `%${escaped}%`)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 100)
  if (error) return { ok: false, error: error.message }
  const rows = data ?? []

  const senderIds = Array.from(
    new Set(rows.map((r) => r.sender_user_id as string | null).filter((v): v is string => !!v)),
  )
  const profMap = await loadParticipantInfo(senderIds)
  const nameMap = new Map<string, string | null>()
  for (const [uid, prof] of profMap) nameMap.set(uid, prof.name ?? prof.email ?? null)

  const value: MessageSearchHit[] = rows.map((r) => ({
    id: r.id as string,
    conversation_id: r.conversation_id as string,
    sender_user_id: (r.sender_user_id as string | null) ?? null,
    sender_name: r.sender_user_id ? nameMap.get(r.sender_user_id as string) ?? null : null,
    case_label: (r.case_label as string | null) ?? null,
    content: (r.content as string | null) ?? null,
    has_file: !!(r.file_url as string | null),
    created_at: r.created_at as string,
  }))
  return { ok: true, value }
}

// ─────────────────────────────────────────────────
// 대화방 — 생성/이름/멤버
// ─────────────────────────────────────────────────

/**
 * 1:1 DM 가져오기 또는 생성. 본인+상대 둘만 있는 대화방을 찾고, 없으면 새로 만든다.
 */
export async function getOrCreateDM(input: {
  otherUserId: string
}): Promise<Result<{ id: string; created: boolean }>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  if (input.otherUserId === auth.userId) {
    return { ok: false, error: '본인과는 DM 할 수 없습니다' }
  }

  const supabase = await createClient()
  // 본인이 참여하는 모든 conv 중에서 상대도 참여하고, 참여자가 정확히 2명인 것 찾기
  const { data: myParts, error: mpErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', auth.userId)
  if (mpErr) return { ok: false, error: mpErr.message }
  const myConvIds = (myParts ?? []).map((r) => r.conversation_id as string)

  if (myConvIds.length > 0) {
    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', input.otherUserId)
      .in('conversation_id', myConvIds)
    const sharedConvIds = (shared ?? []).map((r) => r.conversation_id as string)
    if (sharedConvIds.length > 0) {
      const { data: counts } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .in('conversation_id', sharedConvIds)
      const countByConv = new Map<string, number>()
      for (const r of counts ?? []) {
        const cid = r.conversation_id as string
        countByConv.set(cid, (countByConv.get(cid) ?? 0) + 1)
      }
      const dmConvId = sharedConvIds.find((cid) => countByConv.get(cid) === 2) ?? null
      if (dmConvId) {
        return { ok: true, value: { id: dmConvId, created: false } }
      }
    }
  }

  // 새로 생성 — admin client 로 participants 부트스트랩 (RLS chicken-and-egg)
  const { data: convRow, error: convErr } = await supabase
    .from('conversations')
    .insert({ name: null, created_by: auth.userId })
    .select('id')
    .single()
  if (convErr) return { ok: false, error: convErr.message }
  const convId = convRow.id as string

  const admin = createAdminClient()
  const { error: partErr } = await admin
    .from('conversation_participants')
    .insert([
      { conversation_id: convId, user_id: auth.userId },
      { conversation_id: convId, user_id: input.otherUserId },
    ])
  if (partErr) {
    await admin.from('conversations').delete().eq('id', convId)
    return { ok: false, error: partErr.message }
  }
  return { ok: true, value: { id: convId, created: true } }
}

/**
 * N+1 명 대화방 생성 (본인 + memberIds). 1:1 도 가능하지만 보통 getOrCreateDM 이 더 적절.
 */
export async function createConversation(input: {
  name?: string | null
  memberIds: string[]
}): Promise<Result<{ conversationId: string }>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const others = Array.from(new Set(input.memberIds.filter((id) => id && id !== auth.userId)))
  if (others.length < 1) {
    return { ok: false, error: '본인 외 최소 1명이 필요합니다' }
  }

  const supabase = await createClient()
  const { data: convRow, error: convErr } = await supabase
    .from('conversations')
    .insert({
      name: normalizeName(input.name),
      created_by: auth.userId,
    })
    .select('id')
    .single()
  if (convErr) return { ok: false, error: convErr.message }
  const convId = convRow.id as string

  const admin = createAdminClient()
  const rows = [auth.userId, ...others].map((uid) => ({ conversation_id: convId, user_id: uid }))
  const { error: partErr } = await admin.from('conversation_participants').insert(rows)
  if (partErr) {
    await admin.from('conversations').delete().eq('id', convId)
    return { ok: false, error: partErr.message }
  }

  return { ok: true, value: { conversationId: convId } }
}

export async function renameConversation(input: {
  convId: string
  name: string | null
}): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversations')
    .update({ name: normalizeName(input.name) })
    .eq('id', input.convId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

export async function addParticipant(input: {
  convId: string
  userId: string
}): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversation_participants')
    .insert({ conversation_id: input.convId, user_id: input.userId })
  if (error) {
    if (error.code === '23505') return { ok: false, error: '이미 참여 중입니다' }
    return { ok: false, error: error.message }
  }
  return { ok: true, value: null }
}

export async function removeParticipant(input: {
  convId: string
  userId: string
}): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', input.convId)
    .eq('user_id', input.userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}

export async function leaveConversation(convId: string): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth
  return removeParticipant({ convId, userId: auth.userId })
}

/**
 * 대화방 완전 삭제 — 메시지 + 첨부 + 멤버 cascade.
 * 멤버 누구나 삭제 가능 (오너십 개념 없음). super_admin 도 가능.
 */
export async function deleteConversation(input: { convId: string }): Promise<Result<null>> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const supabase = await createClient()
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', input.convId)
    .maybeSingle()
  if (convErr) return { ok: false, error: convErr.message }
  if (!conv) return { ok: false, error: '대화방을 찾을 수 없습니다' }

  const admin = createAdminClient()

  // 첨부 정리 — chat-files/<convId>/...
  const { data: files } = await admin.storage
    .from('chat-files')
    .list(input.convId, { limit: 1000 })
  if (files && files.length > 0) {
    const paths = files.map((f) => `${input.convId}/${f.name}`)
    await admin.storage.from('chat-files').remove(paths)
  }

  const { error: delErr } = await admin
    .from('conversations')
    .delete()
    .eq('id', input.convId)
  if (delErr) return { ok: false, error: delErr.message }

  return { ok: true, value: null }
}

// ─────────────────────────────────────────────────
// Picker — 케이스 / 조직 / 멤버
// ─────────────────────────────────────────────────

export async function listCasesForPicker(input: {
  search?: string
  limit?: number
}): Promise<Result<CasePickerItem[]>> {
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

export async function listOrgsForDmPicker(
  input: { search?: string; limit?: number } = {},
): Promise<Result<OrgPickerItem[]>> {
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
  if (search) q = q.ilike('name', `%${search}%`)

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  const value: OrgPickerItem[] = (data ?? []).map((o) => ({
    id: o.id as string,
    name: o.name as string,
  }))
  return { ok: true, value }
}

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
  if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  const value: MemberPickerItem[] = (data ?? []).map((p) => ({
    user_id: p.id as string,
    name: (p.name as string | null) ?? null,
    email: (p.email as string | null) ?? null,
  }))
  return { ok: true, value }
}

// ─────────────────────────────────────────────────
// dm_visible 토글
// ─────────────────────────────────────────────────

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

export async function updateActiveOrgDmVisibility(input: {
  visible: boolean
}): Promise<Result<null>> {
  let orgId: string
  try {
    orgId = await getActiveOrgId()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  return updateOrgDmVisibility({ orgId, visible: input.visible })
}

export async function updateOrgDmVisibility(input: {
  orgId: string
  visible: boolean
}): Promise<Result<null>> {
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
