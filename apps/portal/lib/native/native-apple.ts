'use client'

import { supabaseBrowser } from '@/lib/supabase/browser'

/**
 * 네이티브 앱(Capacitor, iOS) Sign in with Apple.
 *
 * 구글(native-oauth.ts)과 달리 Custom Tab 왕복이 없다 — iOS 네이티브 Apple 시트가
 * identityToken 을 바로 돌려주고, 그걸 supabase.signInWithIdToken 으로 교환해 세션을
 * (쿠키에) 설정한다. 그래서 딥링크/리스너가 필요 없고 이 함수 안에서 로그인이 끝난다.
 *
 * iOS 전용: Apple 로그인은 Apple 플랫폼에서만 네이티브로 동작한다. 안드로이드/웹은
 * handled=false 로 빠진다(호출부가 버튼 자체를 iOS 에서만 노출하므로 보통 안 불림).
 *
 * nonce: Apple 에는 sha256(raw) 해시를 넘기고, Supabase 에는 raw 를 넘긴다. Supabase 가
 * raw 를 해시해 토큰의 nonce 클레임과 대조한다(재생 공격 방지). 플러그인은 nonce 를 그대로
 * Apple 요청에 싣고 해시하지 않으므로 여기서 미리 해시해 넘긴다.
 *
 * 선행조건:
 *  - App ID 에 Sign in with Apple capability — 완료(2026-06-26).
 *  - Supabase Apple provider Client IDs 에 com.petmove.portal — 완료(2026-06-26).
 *  - iOS 프로젝트 엔타이틀먼트 `com.apple.developer.applesignin` — cap add ios/클라우드 빌드 때.
 */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomNonce(length = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  let out = ''
  for (let i = 0; i < length; i += 1) out += charset[values[i] % charset.length]
  return out
}

/**
 * @returns handled=false → iOS 네이티브가 아님(호출부가 무시).
 *          handled=true  → 처리함. error 있으면 표시, 없으면 성공(navigate) 또는 사용자 취소.
 */
export async function nativeAppleLogin(
  next: string,
): Promise<{ handled: boolean; error?: string }> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      return { handled: false }
    }

    const rawNonce = randomNonce()
    const hashedNonce = await sha256Hex(rawNonce)

    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
    const result = await SignInWithApple.authorize({
      clientId: 'com.petmove.portal',
      redirectURI: 'com.petmove.portal://auth/callback',
      scopes: 'email name',
      nonce: hashedNonce,
    })

    const idToken = result.response?.identityToken
    if (!idToken) return { handled: true, error: 'Apple 로그인 토큰을 받지 못했어요.' }

    const { error } = await supabaseBrowser.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
      nonce: rawNonce,
    })
    if (error) return { handled: true, error: error.message }

    // 세션이 쿠키에 설정됨 → 서버가 인식. next 로 전체 이동(서버 세션 반영).
    window.location.href = next && next !== '/' ? next : '/'
    return { handled: true }
  } catch (e) {
    // 사용자가 Apple 시트를 취소하면 플러그인이 에러를 던진다 — 조용히 폼으로 복귀.
    const msg = (e as { message?: string })?.message ?? ''
    const code = (e as { code?: string })?.code ?? ''
    if (code === '1001' || /cancel/i.test(msg)) return { handled: true }
    return { handled: true, error: msg || 'Apple 로그인에 실패했어요.' }
  }
}
