'use client'

/**
 * Capacitor 푸시 알림 등록 헬퍼 — Capacitor 환경 (iOS/Android 네이티브 앱) 에서만 동작.
 * 일반 웹 브라우저 (PWA) 에서는 no-op — Web Push 는 portal/components/sw-register 의
 * service worker 가 별도 처리.
 *
 * 흐름:
 *   1. Capacitor 환경인지 확인 (`Capacitor.isNativePlatform()`)
 *   2. 권한 요청 (`PushNotifications.requestPermissions()`)
 *   3. APNs/FCM 등록 (`PushNotifications.register()`) — 이벤트로 token 수신
 *   4. token 을 서버로 전송 (Supabase push_subscriptions 테이블 — 미래 작업)
 *   5. 푸시 수신 리스너 등록 (`pushNotificationReceived` / `pushNotificationActionPerformed`)
 *
 * 사용자 액션 (가입 시·설정 페이지):
 *   import { registerPushNotifications } from '@/lib/native/push-notifications'
 *   const result = await registerPushNotifications()
 *   if (result.token) saveTokenToServer(result.token)
 *
 * 필요한 platform 설정 (별도):
 *   - iOS: Apple Developer Portal → Identifiers → com.petmove.portal → Capabilities →
 *          Push Notifications 활성화 + APNs Key 발급
 *   - Android: Firebase Console → 프로젝트 생성 → Android 앱 추가 (applicationId
 *              com.petmove.portal) → google-services.json 다운로드 →
 *              apps/portal/android/app/ 에 배치
 *   - Supabase: push_subscriptions 테이블 추가 (user_id, platform, token, created_at)
 *   - 발송 인프라: Web Push 와 통합하거나 별도 worker (Vercel Edge Function 등)
 */

export interface PushRegistrationResult {
  /** 네이티브 환경 아님 (브라우저) — 등록 시도 안 함 */
  skipped?: true
  /** 사용자가 권한 거부 */
  denied?: true
  /** 정상 등록 후 받은 디바이스 토큰 (APNs/FCM) */
  token?: string
  /** 등록 실패 — error.message */
  error?: string
}

export async function registerPushNotifications(): Promise<PushRegistrationResult> {
  // 브라우저 환경에서는 skip — Capacitor 가 없으면 import 자체가 실패할 수 있어서 dynamic.
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) {
      return { skipped: true }
    }

    const { PushNotifications } = await import('@capacitor/push-notifications')

    // 1) 권한 요청
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') {
      return { denied: true }
    }

    // 2) 등록 — 결과 token 은 'registration' 이벤트로 비동기 전달
    return await new Promise<PushRegistrationResult>((resolve) => {
      let resolved = false
      const cleanup: Array<() => void> = []

      const onReg = (token: { value: string }) => {
        if (resolved) return
        resolved = true
        cleanup.forEach((f) => f())
        resolve({ token: token.value })
      }
      const onErr = (e: { error: string }) => {
        if (resolved) return
        resolved = true
        cleanup.forEach((f) => f())
        resolve({ error: e.error })
      }

      PushNotifications.addListener('registration', onReg).then((h) =>
        cleanup.push(() => h.remove()),
      )
      PushNotifications.addListener('registrationError', onErr).then((h) =>
        cleanup.push(() => h.remove()),
      )

      void PushNotifications.register()

      // 10초 타임아웃 — APNs/FCM 응답 못 받으면 fail-soft
      setTimeout(() => {
        if (resolved) return
        resolved = true
        cleanup.forEach((f) => f())
        resolve({ error: 'registration timeout (10s)' })
      }, 10_000)
    })
  } catch (e) {
    return { error: (e as Error).message }
  }
}
