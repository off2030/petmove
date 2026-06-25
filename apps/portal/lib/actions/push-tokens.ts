'use server'

/**
 * 네이티브 앱 푸시 디바이스 토큰 저장 — 본인 토큰만(RLS self_insert/self_update).
 *
 * 앱이 켜질 때(설정 알림 ON) registerPushNotifications() 로 받은 FCM/APNs 토큰을 여기에 upsert.
 * 발송 측(서버)은 service-role 로 push_device_tokens 를 읽어 해당 보호자 기기로 푸시한다.
 */

import { createClient, getCurrentUser } from '@petmove/auth/server'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export async function saveDeviceToken(
  token: string,
  platform: 'android' | 'ios',
): Promise<Result<true>> {
  try {
    const t = (token ?? '').trim()
    if (!t) return { ok: false, error: '빈 토큰' }
    if (platform !== 'android' && platform !== 'ios') {
      return { ok: false, error: '알 수 없는 플랫폼' }
    }
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()

    // token 이 unique — 같은 기기 재등록 시 user_id·platform·갱신시각만 최신화.
    const { error } = await supabase.from('push_device_tokens').upsert(
      {
        user_id: user.id,
        platform,
        token: t,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
