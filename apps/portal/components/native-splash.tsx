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
// 알림 탭 콜드스타트 깜빡임 방지용 grace(ms). 앱이 켜진 뒤 이 시간 안에 tap-listener 가
// 딥링크로 이동(window.__pmHoldSplash=true + window.location.href)하면, 스플래시를 안 내려
// 리로드가 그 아래에서 일어난다 → 사용자는 '동물 선택' 화면을 안 거치고 스플래시→일정으로 직행.
// 일반 실행이면 이 시간만큼만 스플래시가 더 보인 뒤 내려간다(실기기에서 값 조정 가능).
// iOS 는 WKWebView 로드+알림 액션 전달이 안드로이드보다 느려 grace 를 더 길게 잡는다
// (700ms 면 액션 오기 전에 스플래시가 내려가 깜빡임). 못 내려도 launchAutoHide 3초 백스톱.
const SPLASH_HOLD_GRACE_MS = { ios: 1800, android: 700 } as const

export function NativeSplash() {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const isAndroid = Capacitor.getPlatform() === 'android'
        const grace = isAndroid ? SPLASH_HOLD_GRACE_MS.android : SPLASH_HOLD_GRACE_MS.ios
        const { SplashScreen } = await import('@capacitor/splash-screen')
        // grace 동안 딥링크 이동을 기다린다. 이동하면 페이지가 리로드되며 이 타이머/컴포넌트가
        // 사라지고 스플래시는 그대로 유지된다(리로드된 일정 페이지의 새 NativeSplash 가 내림).
        await new Promise((r) => setTimeout(r, grace))
        if (cancelled) return
        // 딥링크 이동이 진행 중이면 내리지 않는다(리로드가 처리). 그 외엔 정상적으로 내린다.
        if ((window as unknown as { __pmHoldSplash?: boolean }).__pmHoldSplash) return
        // paint 후 내려 흰 깜빡임 방지(2x rAF). 못 내려도 네이티브 백스톱(3초)이 처리.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (cancelled) return
            // iOS(및 안드로이드 구빌드): 플러그인 런치 스플래시.
            void SplashScreen.hide({ fadeOutDuration: 200 })
            // 안드로이드 새 빌드: MainActivity 부트 스플래시(풀화면 시안). Android 12+ 는
            // @capacitor/splash-screen 이 풀화면 이미지를 런치에 못 띄워 앱이 직접 띄운다.
            // 플러그인이 없는 구빌드에선 reject — 조용히 무시.
            if (isAndroid) {
              registerPlugin<{ hide(): Promise<void> }>('BootSplash')
                .hide()
                .catch(() => {})
            }
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
