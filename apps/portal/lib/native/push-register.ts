'use client'

import { registerPushNotifications } from './push-notifications'
import { saveDeviceToken } from '@/lib/actions/push-tokens'

/**
 * 네이티브 앱 푸시 토큰 등록 + 서버 저장 — 네이티브 전용·웹 no-op.
 *
 * 호출 시점: 설정에서 알림을 켤 때(opt-in 직후), 그리고 앱 시작 시 알림이 ON 이면 1회.
 * 권한이 이미 허용돼 있으면 추가 팝업 없이 토큰만 조용히 갱신한다(POST_NOTIFICATIONS 는
 * 로컬 알림과 공유이므로, 일정 알림을 켤 때 이미 허용된 상태).
 * best-effort — 실패(웹·권한 거부·등록 오류)해도 조용히 무시, 앱을 막지 않는다.
 */
export async function registerAndSaveDeviceToken(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'

    const res = await registerPushNotifications()
    if (!res.token) return // skipped(웹)·denied·error → 조용히 무시
    await saveDeviceToken(res.token, platform)
  } catch {
    /* best-effort */
  }
}
