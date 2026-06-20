'use server'

/**
 * 서비스 탭 '카카오톡 문의' — 고객이 문의를 시작하면 펫무브 직영 운영자에게 봇 알림.
 *
 * 폼 없이(로그인 상태라 이름·이메일을 이미 앎) 카톡 채팅을 열기 직전에 호출한다. 운영자는
 * 고객의 카톡 메시지를 받기 *전에* 누가·무엇을 문의하는지 미리 알 수 있다. (카톡 채팅 링크는
 * 앱 맥락을 prefill 할 수 없어서, 그 맥락을 이 봇 알림으로 운영자에게 전달.)
 *
 * 봇 알림 = partners.ts 의 notifyPartnerChange 와 동일 패턴(bot@petmove.work →
 * 각 멤버 system 대화방 messages insert). 대상 = 펫무브 직영(platform) org 멤버.
 * best-effort — 실패해도 client 는 카톡 열기를 그대로 진행한다.
 */

import { getCurrentUser } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'

const PLATFORM_ORG_ID = '00000000-0000-0000-0000-000000000002' // 펫무브 직영(platform)

type AdminClient = ReturnType<typeof createAdminClient>

export async function notifyServiceInquiry(input: {
  /** 표시용 이름 (client 프로필에서). 이메일은 서버 인증 사용자 기준 — client 값 신뢰 X. */
  name?: string | null
  destination?: string | null
  tripType?: 'round' | 'one_way' | null
  /** 상세페이지의 특정 티어 문의면 '로잔 올케어' 등. 플로팅(일반)은 생략. */
  serviceTier?: string | null
}): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false }

    const admin = createAdminClient()
    const { data: bot } = await admin
      .from('profiles')
      .select('id')
      .eq('email', 'bot@petmove.work')
      .maybeSingle()
    const botId = (bot as { id: string } | null)?.id
    if (!botId) return { ok: false }

    const email = user.email ?? '이메일 미상'
    const name = input.name?.trim() || '보호자'
    const tripLabel =
      input.tripType === 'round' ? '왕복' : input.tripType === 'one_way' ? '편도' : null
    const ctx = [input.destination?.trim() || null, tripLabel].filter(Boolean).join(' · ')
    const what = input.serviceTier?.trim() ? `${input.serviceTier.trim()} 문의` : '서비스 문의'
    const body = `상담 문의 — ${name} 님(${email})이 ${what}를 시작했어요.${ctx ? ` · ${ctx}` : ''}`

    await sendBotMessageToOrg(admin, botId, PLATFORM_ORG_ID, body)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** 조직의 모든 멤버에게 system 대화방을 통해 봇 메시지 1건씩. (partners.ts sendBotMessageToOrg 동일 패턴) */
async function sendBotMessageToOrg(
  admin: AdminClient,
  botId: string,
  orgId: string,
  body: string,
): Promise<void> {
  const { data: members } = await admin.from('memberships').select('user_id').eq('org_id', orgId)
  for (const m of (members ?? []) as Array<{ user_id: string }>) {
    const userId = m.user_id
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
    await admin.from('messages').insert({ conversation_id: convId, sender_user_id: botId, content: body })
  }
}
