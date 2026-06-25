'use client'

import { useEffect } from 'react'

/**
 * 네이티브 앱(Capacitor) 딥링크 로그인 복귀 처리.
 *
 * 구글 로그인이 Custom Tab 에서 끝나면 Supabase 가
 * `com.petmove.portal://auth/callback?code=...` 로 앱을 깨운다(appUrlOpen 이벤트).
 * 그 code 를 받아 WebView 를 `/auth/callback?code=...` 로 보내면, 기존 서버 콜백 라우트가
 * PKCE 교환·세션 설정 후 next 로 보낸다(웹 흐름과 완전히 동일). 일반 웹/PWA 에서는 no-op.
 *
 * 마운트 위치: 루트 레이아웃(모든 화면). 로그인 화면에서 트리거되지만, 어디서든 복귀를
 * 받을 수 있게 전역에 둔다.
 */
export function NativeAuthListener() {
  useEffect(() => {
    let remove: (() => void) | undefined
    let handledUrl: string | null = null
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('appUrlOpen', ({ url }) => {
          if (url === handledUrl) return
          handledUrl = url
          void handleAuthDeepLink(url)
        })
        remove = () => void handle.remove()
      } catch {
        /* 플러그인/네이티브 미존재 — 무시 */
      }
    })()
    return () => {
      remove?.()
    }
  }, [])
  return null
}

function closeCustomTabBestEffort() {
  void (async () => {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.close()
    } catch {
      /* 무시 */
    }
  })()
}

function navigateReplace(path: string) {
  window.location.replace(path)
}

function handleAuthDeepLink(url: string) {
  // 우리 인증 딥링크만 처리.
  if (!url.includes('auth/callback')) return

  // 커스텀 스킴(com.petmove.portal://)은 일부 환경에서 URL 파싱이 불안정하므로
  // 쿼리 문자열만 떼어 직접 파싱한다.
  const query = url.split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  const code = params.get('code')
  const err = params.get('error_description') ?? params.get('error')

  // Custom Tab 닫기는 베스트에포트로 뒤에서 처리한다. Android 일부 환경에서 close() 가
  // 늦게 resolve 되면 로그인 화면의 "이동 중..." 잔상이 길어지므로 콜백 이동을 먼저 건다.
  closeCustomTabBestEffort()

  if (code) {
    // 기존 서버 콜백이 PKCE 교환·세션 설정·next 리다이렉트까지 처리.
    navigateReplace(`/auth/callback?code=${encodeURIComponent(code)}`)
  } else if (err) {
    navigateReplace(`/login?error=${encodeURIComponent(err)}`)
  }
}
