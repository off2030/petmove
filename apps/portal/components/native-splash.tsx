'use client'

import { useEffect } from 'react'

/**
 * 네이티브 스플래시 내리기 — Capacitor(iOS/Android) 환경에서만 동작. 일반 웹 브라우저
 * (PWA/Vercel) 에서는 no-op (push-notifications.ts 와 동일하게 dynamic import + isNativePlatform 가드).
 *
 * 왜 필요한가: portal 은 Remote URL 모드라 앱을 켜면 native WebView 가 app.petmove.co.kr 을
 * 처음부터 받아온다(네트워크+JS+force-dynamic 인증 레이아웃). 그동안 흰 화면이 보였다.
 * capacitor.config 의 SplashScreen(launchAutoHide:true)이 그 구간을 스플래시로 덮고,
 * 이 컴포넌트가 웹 셸의 첫 페인트 직후 hide() 로 내려 스켈레톤/콘텐츠를 드러낸다.
 *
 * paint 보장: useEffect 는 commit 후·paint 전에 돌 수 있어, 바로 hide() 하면 스플래시 ↔
 * 콘텐츠 사이 흰 깜빡임이 생길 수 있다. 두 번의 requestAnimationFrame 으로 실제 페인트가
 * 끝난 뒤 내린다.
 */
export function NativeSplash() {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const { SplashScreen } = await import('@capacitor/splash-screen')
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!cancelled) void SplashScreen.hide({ fadeOutDuration: 200 })
          }),
        )
      } catch {
        // 플러그인/네이티브 미존재 — 무시. config 의 launchAutoHide 백스톱이 처리.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return null
}
