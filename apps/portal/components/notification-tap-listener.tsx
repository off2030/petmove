'use client'

import { useEffect } from 'react'

/**
 * 네이티브 알림(푸시·로컬) 탭 → 해당 동물의 일정 페이지로 딥링크.
 *
 * 안 그러면 알림을 눌러도 앱 기본 화면(동물 선택)으로만 열린다. 알림이 가리키는 케이스의
 * 일정(`/cases/[id]/journey`)으로 바로 보낸다.
 *
 *  - 푸시(FCM, pushNotificationActionPerformed): notification.data.path
 *  - 로컬(LocalNotifications, localNotificationActionPerformed): notification.extra.path
 *
 * 안전: 내부 케이스 경로('/cases/...')만 허용(알림 데이터로 임의 URL 이동 차단).
 * 일반 웹/PWA 에서는 no-op. 마운트: 루트 레이아웃(어느 화면에서나 탭될 수 있어 전역).
 */
export function NotificationTapListener() {
  useEffect(() => {
    const removers: Array<() => void> = []
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return

        // 푸시 알림(FCM) 탭
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications')
          const h = await PushNotifications.addListener(
            'pushNotificationActionPerformed',
            (action) => {
              const data = action.notification?.data as Record<string, unknown> | undefined
              navigateTo(typeof data?.path === 'string' ? data.path : null)
            },
          )
          removers.push(() => void h.remove())
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
          removers.push(() => void h.remove())
        } catch {
          /* 로컬 알림 플러그인 미존재 — 무시 */
        }
      } catch {
        /* 네이티브 미존재 — 무시 */
      }
    })()
    return () => {
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
    window.location.href = path
  } catch {
    /* 무시 */
  }
}
