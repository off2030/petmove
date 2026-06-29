'use client'

import { useEffect } from 'react'

/**
 * 네이티브 알림(푸시·로컬) 탭 → 해당 동물의 일정 페이지로 딥링크.
 *
 * 안 그러면 알림을 눌러도 앱 기본 화면(동물 선택)으로만 열린다. 알림이 가리키는 케이스의
 * 일정(`/cases/[id]/journey`)으로 바로 보낸다.
 *
 *  - 푸시(FCM, @capacitor-firebase/messaging notificationActionPerformed): notification.data.path
 *  - 로컬(LocalNotifications, localNotificationActionPerformed): notification.extra.path
 *
 * 안전: 내부 케이스 경로('/cases/...')만 허용(알림 데이터로 임의 URL 이동 차단).
 * 일반 웹/PWA 에서는 no-op. 마운트: 루트 레이아웃(어느 화면에서나 탭될 수 있어 전역).
 *
 * 리스너는 마운트 **즉시** 등록한다 — 콜드스타트 탭일수록 빨리 등록해야 '선택 화면 깜빡임'
 * 없이 바로 일정으로 넘어간다. (플러그인의 무거운 초기화는 네이티브 launch 시 한 번 일어나고,
 * addListener 는 가벼워 로그인 진입과 경쟁하지 않는다. 토큰 등록 같은 무거운 작업은 별도로
 * case-data-provider 에서 지연/옵트인 처리한다.) 콜드스타트 액션은 플러그인이 retain 했다가
 * 리스너 등록 시 전달하므로 놓치지 않는다.
 *
 * ⚠️ Android 콜드스타트(앱 완전 종료 상태 탭): @capacitor-firebase/messaging 은 탭을
 * onNewIntent 로만 처리해 launch 인텐트(onCreate)를 못 받는다 → MainActivity.onCreate 에서
 * onNewIntent 로 재전달해 보완(네이티브). 그래야 이 리스너로 액션이 전달된다.
 */
export function NotificationTapListener() {
  useEffect(() => {
    const removers: Array<() => void> = []
    let cancelled = false

    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return

        // 푸시 알림(FCM) 탭 — @capacitor-firebase/messaging
        try {
          const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
          const h = await FirebaseMessaging.addListener(
            'notificationActionPerformed',
            (action) => {
              const data = action.notification?.data as Record<string, unknown> | undefined
              navigateTo(typeof data?.path === 'string' ? data.path : null)
            },
          )
          if (cancelled) void h.remove()
          else removers.push(() => void h.remove())
        } catch {
          /* 푸시 플러그인 미존재 — 무시 */
        }

        // 로컬 알림(일정 리마인더) 탭
        try {
          const { LocalNotifications } = await import('@capacitor/local-notifications')
          const h = await LocalNotifications.addListener(
            'localNotificationActionPerformed',
            (action) => {
              const extra = action.notification?.extra as Record<string, unknown> | undefined
              navigateTo(typeof extra?.path === 'string' ? extra.path : null)
            },
          )
          if (cancelled) void h.remove()
          else removers.push(() => void h.remove())
        } catch {
          /* 로컬 알림 플러그인 미존재 — 무시 */
        }
      } catch {
        /* 네이티브 미존재 — 무시 */
      }
    })()

    return () => {
      cancelled = true
      removers.forEach((f) => f())
    }
  }, [])
  return null
}

/** 내부 케이스 경로만 허용해 이동(외부 URL 차단). 풀 내비게이션이라 콜드스타트에도 안정적. */
function navigateTo(path: string | null) {
  if (!path || !path.startsWith('/cases/')) return // 안전: 내부 케이스 경로만
  try {
    if (window.location.pathname + window.location.search === path) return // 이미 그 화면이면 생략
    // 콜드스타트 깜빡임 방지: NativeSplash 가 이 플래그를 보고 스플래시를 안 내린다 →
    // 아래 리로드가 스플래시 아래에서 일어나 '동물 선택' 화면을 안 거치고 일정으로 직행.
    ;(window as unknown as { __pmHoldSplash?: boolean }).__pmHoldSplash = true
    window.location.href = path
  } catch {
    /* 무시 */
  }
}
