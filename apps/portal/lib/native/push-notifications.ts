'use client'

/**
 * Capacitor 푸시 알림 등록 헬퍼 — 네이티브 앱(iOS/Android)에서만 동작.
 *
 * **@capacitor-firebase/messaging 사용** — iOS·Android 양쪽 모두 **FCM 토큰**을 돌려준다.
 * (이전엔 @capacitor/push-notifications 였는데, iOS 에선 raw APNs 토큰을 줘서 firebase-admin
 * 의 FCM 발송(getMessaging().send)과 토큰 종류가 안 맞았다. 이 플러그인은 iOS 도 내부적으로
 * APNs→FCM 교환을 처리해 항상 FCM 토큰을 준다.)
 *
 * 일반 웹 브라우저(PWA)에서는 no-op — isNativePlatform() 으로 먼저 걸러 플러그인 import 자체를
 * 피한다(웹 구현이 firebase JS SDK 를 끌어오므로 진입 전 차단).
 *
 * 흐름:
 *   1. Capacitor 네이티브 환경 확인
 *   2. 권한 요청 (FirebaseMessaging.requestPermissions)
 *   3. FCM 토큰 획득 (FirebaseMessaging.getToken) — iOS 는 플러그인이 APNs 등록까지 처리
 *
 * 필요한 platform 설정 (별도, codemagic.yaml / android):
 *   - iOS: Apple Developer App ID 에 Push Notifications capability + APNs 키를 Firebase 에
 *          업로드 + GoogleService-Info.plist 를 앱 번들에 포함 + FirebaseApp.configure()
 *   - Android: google-services.json (apps/portal/android/app/) — 이미 배치됨
 */

export interface PushRegistrationResult {
  /** 네이티브 환경 아님 (브라우저) — 등록 시도 안 함 */
  skipped?: true
  /** 사용자가 권한 거부 */
  denied?: true
  /** 정상 등록 후 받은 FCM 디바이스 토큰 */
  token?: string
  /** 등록 실패 — error.message */
  error?: string
}

export async function registerPushNotifications(): Promise<PushRegistrationResult> {
  // 브라우저 환경에서는 skip — 네이티브가 아니면 플러그인을 import 하지 않는다.
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) {
      return { skipped: true }
    }

    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')

    // 1) 권한 요청 (이미 허용돼 있으면 추가 팝업 없이 통과)
    const perm = await FirebaseMessaging.requestPermissions()
    if (perm.receive !== 'granted') {
      return { denied: true }
    }

    // 2) FCM 토큰 — iOS 는 플러그인이 APNs 등록 후 FCM 토큰으로 교환해 돌려준다.
    const { token } = await FirebaseMessaging.getToken()
    if (!token) return { error: 'no token returned' }
    return { token }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
