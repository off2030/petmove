'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { nativeGoogleLogin } from '@/lib/native/native-oauth'
import { nativeAppleLogin } from '@/lib/native/native-apple'

const buttonBaseClass =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-md h-10 px-md text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D99A58]/40 disabled:pointer-events-none disabled:opacity-50 select-none'
const socialButtonClass = `${buttonBaseClass} border border-[rgba(42,38,32,0.16)] bg-[#FBF7F1] text-[#2A2620] hover:bg-[#F0E8DC]`
const primaryButtonClass = `${buttonBaseClass} bg-[#D99A58] text-[#FBF7F1] hover:bg-[#C98B45]`
// Apple 가이드라인: Sign in with Apple 버튼은 검정/흰색 + Apple 로고, 다른 소셜 버튼과
// 동등한 크기·위치(Guideline 4.8). iOS 네이티브에서만 노출.
const appleButtonClass = `${buttonBaseClass} bg-black text-white hover:bg-[#1A1A1A]`

export function LoginForm({
  next,
  initialError = null,
}: {
  next: string
  initialError?: string | null
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  // Apple 로그인은 iOS 네이티브에서만 동작 — 그 환경에서만 버튼을 노출한다.
  const [isIOSNative, setIsIOSNative] = useState(false)

  useEffect(() => {
    void import('@capacitor/core').then(({ Capacitor }) => {
      setIsIOSNative(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios')
    })
  }, [])

  useEffect(() => {
    if (!initialError || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.has('error')) {
      url.searchParams.delete('error')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [initialError])

  // Google·카카오는 둘 다 Supabase builtin OAuth — provider 만 다름.
  async function oauthLogin(provider: 'google' | 'kakao') {
    setLoading(provider)
    setError(null)
    setInfo(null)

    // 구글은 네이티브 앱에서 WebView OAuth 가 차단됨(disallowed_useragent) → Custom Tab +
    // 딥링크 경로로 처리. 웹/PWA 면 handled=false 라 아래 builtin 흐름으로 이어진다.
    if (provider === 'google') {
      const res = await nativeGoogleLogin(next)
      if (res.handled) {
        if (res.error) {
          setError(res.error)
          setLoading(null)
        }
        // 성공: Custom Tab 열림 → 복귀는 NativeAuthListener 가 처리. loading 유지.
        return
      }
    }

    // next 는 cookie 로 — Supabase OAuth 의 redirect_to allowlist 가 query 포함
    // URL 을 정확 매칭 못 해서 query 는 비우고 callback 에서 cookie 로 읽음.
    const redirectTo = `${window.location.origin}/auth/callback`
    if (next && next !== '/') {
      document.cookie = `pm_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
    }

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // 카카오는 프로필 사진을 명시적으로 요청해야 동의 화면에 뜨고 반환됨 (구글은 기본 제공).
        ...(provider === 'kakao'
          ? { scopes: 'account_email profile_nickname profile_image' }
          : {}),
      },
    })

    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  function naverOAuth() {
    // 네이버는 Supabase builtin 이 아니라 자체 라우트 사용 (apps/portal/app/api/auth/naver).
    setLoading('naver')
    setError(null)
    setInfo(null)
    window.location.href = `/api/auth/naver?next=${encodeURIComponent(next)}`
  }

  async function appleLogin() {
    // iOS 네이티브 시트로 인라인 완결 — 성공이면 nativeAppleLogin 이 navigate 한다.
    // 여기 도달하면 = 사용자 취소(에러 없음) 또는 실패. 어느 쪽이든 loading 해제.
    setLoading('apple')
    setError(null)
    setInfo(null)
    const res = await nativeAppleLogin(next)
    if (res.error) setError(res.error)
    setLoading(null)
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setError('이메일을 먼저 입력하세요.')
      return
    }
    setLoading('magic')
    setError(null)
    setInfo(null)

    if (next && next !== '/') {
      document.cookie = `pm_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
    }

    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setLoading(null)
    if (error) {
      setError(error.message)
      return
    }
    setInfo(`${email} 로 로그인 링크를 발송했습니다. 메일을 확인하세요.`)
  }

  // 소셜 로그인 진행 중(특히 구글은 외부 브라우저를 다녀오는 ~2초)에는 로그인 폼 대신 깔끔한
  // "로그인 중…" 화면을 보여준다 — 구글 복귀 시 로그인 폼이 다시 뜬 것처럼 보이던 것을 방지.
  // (2초 자체는 구글의 외부 브라우저 강제라 못 줄임 — 그 동안의 '되돌아간 느낌'만 없앤다.)
  // 매직링크(magic)는 같은 화면에서 끝나며 안내문을 보여줘야 하므로 제외.
  if (loading === 'google' || loading === 'kakao' || loading === 'naver' || loading === 'apple') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-md bg-[#F5EFE8] px-md py-xl">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[#D99A58]/30 border-t-[#D99A58]"
          aria-hidden
        />
        <p className="text-sm text-[#9A9286]">로그인 중…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F5EFE8] px-md py-xl">
      <div className="w-full max-w-sm space-y-lg">
        <div className="space-y-md text-center">
          <h1 className="font-display text-[28px] leading-tight text-[#2A2620]">펫무브</h1>
          <p className="text-sm leading-snug text-[#9A9286]">
            반려동물과 함께하는 해외여행
            <br />
            펫무브 앱으로 쉽게 준비하세요!
          </p>
        </div>

        <div className="space-y-sm">
          {isIOSNative && (
            <button
              type="button"
              className={appleButtonClass}
              disabled={loading !== null}
              onClick={appleLogin}
            >
              <svg viewBox="0 0 384 512" width="15" height="15" fill="currentColor" aria-hidden>
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C32.7 141.5-8 184.6-8 270.7c0 25.4 4.6 51.7 13.9 78.8 12.4 35.7 57.2 123.3 103.9 121.9 24.4-.6 41.7-17.3 73.5-17.3 30.8 0 46.8 17.3 73.9 17.3 47.1-.7 87.6-80.3 99.4-116.1-63.1-29.7-59.8-87-58.8-86.6zM255.2 80.9c30.6-36.3 27.8-69.4 26.9-81.3-26.9 1.6-58 18.4-75.7 39.1-19.5 22.2-31 49.7-28.5 80.2 29.1 2.2 55.6-12.7 77.3-38z" />
              </svg>
              {loading === 'apple' ? '로그인 중…' : 'Apple로 계속하기'}
            </button>
          )}
          <button
            type="button"
            className={socialButtonClass}
            disabled={loading !== null}
            onClick={() => oauthLogin('kakao')}
          >
            {loading === 'kakao' ? '이동 중…' : '카카오 계정으로 계속'}
          </button>
          <button
            type="button"
            className={socialButtonClass}
            disabled={loading !== null}
            onClick={naverOAuth}
          >
            {loading === 'naver' ? '이동 중…' : '네이버 계정으로 계속'}
          </button>
          <button
            type="button"
            className={socialButtonClass}
            disabled={loading !== null}
            onClick={() => oauthLogin('google')}
          >
            {loading === 'google' ? '이동 중…' : 'Google 계정으로 계속'}
          </button>
        </div>

        <div className="flex items-center gap-sm text-xs text-[#9A9286]">
          <div className="h-px flex-1 bg-[rgba(42,38,32,0.12)]" />
          <span>또는 이메일</span>
          <div className="h-px flex-1 bg-[rgba(42,38,32,0.12)]" />
        </div>

        <form onSubmit={sendMagicLink} className="space-y-sm">
          <input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border border-[rgba(42,38,32,0.16)] bg-[#FBF7F1] px-sm py-2 text-sm text-[#2A2620] placeholder:text-[#9A9286]/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D99A58]/40"
          />
          <button type="submit" className={primaryButtonClass} disabled={loading !== null || !email}>
            {loading === 'magic' ? '발송 중…' : '이메일로 로그인 링크 받기'}
          </button>
        </form>

        {info && (
          <p className="rounded-md border border-[#D99A58]/30 bg-[#D99A58]/10 p-sm text-xs text-[#6B6457]">
            {info}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-[#C26A4A]/30 bg-[#C26A4A]/10 p-sm text-xs text-[#C26A4A]">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
