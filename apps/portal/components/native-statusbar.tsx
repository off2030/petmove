'use client'

import { useEffect } from 'react'

/**
 * 네이티브 앱(Capacitor) 상태바 아이콘 색 제어 — Capacitor 환경에서만 동작, 웹은 no-op.
 *
 * 왜 필요한가: 안드로이드 15+(API 35+)는 테마의 `windowLightStatusBar` 를 무시한다.
 * 라이트 배경(stone)에 흰 상태바 아이콘이 깔려 안 보이던 문제를, 실행 중에
 * StatusBar.setStyle 로 강제 지정해 해결한다(내부적으로 WindowInsetsController 사용 —
 * 신버전 안드로이드에서도 동작).
 *
 * 라이트 테마 → Style.Light(어두운 아이콘), 다크 테마 → Style.Dark(밝은 아이콘).
 * 웹이 <html data-theme> 로 노출하는 현재 테마를 읽고, 변경도 MutationObserver 로 따라간다.
 */
export function NativeStatusBar() {
  useEffect(() => {
    let observer: MutationObserver | undefined
    let cancelled = false
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform() || cancelled) return
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        if (cancelled) return

        const apply = () => {
          const dark = document.documentElement.dataset.theme === 'dark'
          // Style.Light = 라이트 배경(어두운 아이콘), Style.Dark = 다크 배경(밝은 아이콘).
          void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
          // 배경색은 edge-to-edge 강제 환경(신버전)에선 무시될 수 있어 best-effort.
          StatusBar.setBackgroundColor({ color: dark ? '#1C1916' : '#F5EFE8' }).catch(() => {})
        }
        apply()
        observer = new MutationObserver(apply)
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        })
      } catch {
        /* 플러그인/네이티브 미존재 — 무시 */
      }
    })()
    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [])
  return null
}
