'use client'

import { supabaseBrowser } from '@/lib/supabase/browser'

/**
 * 네이티브 앱(Capacitor, iOS) Sign in with Apple — @capgo/capacitor-social-login 사용.
 *
 * 왜 capgo: 기존 @capacitor-community/apple-sign-in 은 Capacitor 7 전용(capacitor-swift-pm
 * 7.x)이라 Cap8 SPM 그래프와 버전 충돌(빌드 막힘)이었다. capgo 는 Cap8(capacitor-swift-pm
 * 8.x) 호환. → [[project_portal_native_app_login]]
 *
 * 흐름: iOS 네이티브 Apple 시트가 identityToken(JWT)을 돌려주면 supabase.signInWithIdToken
 * 으로 교환해 세션을(쿠키에) 설정한다. Custom Tab/딥링크 불필요, 이 함수 안에서 완결.
 *
 * nonce: Apple 에는 sha256(raw) 해시를 넘기고 Supabase 에는 raw 를 넘긴다(재생공격 방지).
 *
 * 선행조건: App ID 에 Sign in with Apple capability(완료) + Supabase Apple provider Client IDs
 * 에 com.petmove.portal(완료) + iOS 엔타이틀먼트 com.apple.developer.applesignin(codemagic.yaml
 * 빌드 때 주입). iOS 전용 — 안드로이드/웹은 handled=false(버튼도 iOS 에서만 노출).
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

let initialized = false
async function ensureInitialized(): Promise<void> {
  if (initialized) return
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  // iOS 네이티브는 clientId=번들 ID, redirectUrl='' (리다이렉트 없음).
  await SocialLogin.initialize({
    apple: { clientId: 'com.petmove.portal', redirectUrl: '' },
  })
  initialized = true
}

/**
 * @returns handled=false → iOS 네이티브가 아님(호출부가 무시).
 *          handled=true  → 처리함. error 있으면 표시, 없으면 성공(navigate) 또는 사용자 취소.
 */
export async function nativeAppleLogin(
  next: string,
): Promise<{ handled: boolean; error?: string; success?: boolean }> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      return { handled: false }
    }

    const rawNonce = randomNonce()
    const hashedNonce = await sha256Hex(rawNonce)

    await ensureInitialized()
    const { SocialLogin } = await import('@capgo/capacitor-social-login')
    const res = await SocialLogin.login({
      provider: 'apple',
      options: { scopes: ['name', 'email'], nonce: hashedNonce },
    })

    if (res.provider !== 'apple') return { handled: true, error: 'Apple 로그인 응답이 올바르지 않아요.' }
    const idToken = res.result.idToken
    if (!idToken) return { handled: true, error: 'Apple 로그인 토큰을 받지 못했어요.' }

    const { error } = await supabaseBrowser.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
      nonce: rawNonce,
    })
    if (error) return { handled: true, error: error.message }

    // 세션이 쿠키에 설정됨 → 서버가 인식. next 로 전체 이동(서버 세션 반영).
    window.location.href = next && next !== '/' ? next : '/'
    // success=true → 호출부가 '로그인 중…' 스피너를 유지(전체 리로드가 끝날 때까지). 구글과 동일.
    // 이 신호가 없으면 호출부가 loading 을 풀어 리로드 도중 로그인 폼(첫 화면)이 잠깐 보인다.
    return { handled: true, success: true }
  } catch (e) {
    // 사용자가 Apple 시트를 취소하면 에러를 던진다 — 조용히 폼으로 복귀.
    const msg = (e as { message?: string })?.message ?? ''
    if (/cancel/i.test(msg) || /1001/.test(msg)) return { handled: true }
    return { handled: true, error: msg || 'Apple 로그인에 실패했어요.' }
  }
}
