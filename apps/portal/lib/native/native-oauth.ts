'use client'

import { supabaseBrowser } from '@/lib/supabase/browser'

/**
 * 네이티브 앱(Capacitor) 구글 로그인.
 *
 * 왜 별도 경로인가: 구글은 임베디드 WebView 의 OAuth 를 보안상 차단한다
 * (`disallowed_useragent`). 그래서 카카오·네이버처럼 WebView 안(allowNavigation)에서
 * 진행할 수 없다. 대신:
 *   1) supabase.signInWithOAuth(skipBrowserRedirect) 로 인증 URL 만 받고(이 시점에 PKCE
 *      verifier 가 WebView 의 쿠키에 저장됨),
 *   2) 그 URL 을 Custom Tab(시스템 브라우저)으로 연다 — 구글이 허용하는 환경,
 *   3) 인증이 끝나면 Supabase 가 딥링크 `com.petmove.portal://auth/callback?code=...` 로
 *      앱을 깨운다. 복귀 처리는 native-auth-listener 가 한다(→ 기존 /auth/callback 서버
 *      라우트가 PKCE 교환·세션 설정, 웹 흐름과 동일).
 *
 * 딥링크 주소는 Supabase Auth → Redirect URLs 화이트리스트에 등록돼 있어야 한다.
 */
export const NATIVE_OAUTH_REDIRECT = 'com.petmove.portal://auth/callback'

/**
 * @returns handled=false → 웹 환경이라 미처리(호출부가 기존 웹 흐름으로 진행).
 *          handled=true  → 네이티브 경로로 처리함(error 있으면 표시, 없으면 Custom Tab 열림).
 */
export async function nativeGoogleLogin(
  next: string,
): Promise<{ handled: boolean; error?: string }> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return { handled: false }

    // next 는 cookie 로 전달 — /auth/callback 이 읽어 리다이렉트(웹 흐름과 동일).
    if (next && next !== '/') {
      document.cookie = `pm_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
    }

    const { data, error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: NATIVE_OAUTH_REDIRECT,
        skipBrowserRedirect: true,
      },
    })
    if (error) return { handled: true, error: error.message }
    if (!data?.url) return { handled: true, error: '로그인 주소를 만들지 못했어요.' }

    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: data.url })
    return { handled: true }
  } catch (e) {
    return { handled: true, error: (e as Error).message }
  }
}
