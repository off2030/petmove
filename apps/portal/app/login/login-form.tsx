'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { nativeGoogleLogin } from '@/lib/native/native-oauth'
import { nativeAppleLogin } from '@/lib/native/native-apple'

const buttonBaseClass =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-md h-10 px-md text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#212124]/30 disabled:pointer-events-none disabled:opacity-50 select-none'
const socialButtonClass = `${buttonBaseClass} border border-[rgba(33,33,36,0.16)] bg-white text-[#212124] hover:bg-[#F2F2F4]`
const primaryButtonClass = `${buttonBaseClass} bg-[#212124] text-white hover:bg-[#3A3A3E]`
// Apple 가이드라인: Sign in with Apple 버튼은 검정/흰색 + Apple 로고, 다른 소셜 버튼과
// 동등한 크기·위치(Guideline 4.8). 흰색(아웃라인) 변형 — 카카오·네이버·구글의 크림 톤과
// 어울리도록. 로고·글자는 검정(currentColor). iOS 네이티브에서만 노출.
const appleButtonClass = `${buttonBaseClass} border border-[rgba(0,0,0,0.18)] bg-white text-black hover:bg-[#F4F4F4]`

// 앱스토어/플레이 심사용 숨김 로그인 — 이 이메일을 입력할 때만 비밀번호칸이 나타나고
// 비밀번호 로그인으로 전환된다. 일반 사용자는 평소처럼 매직링크. (계정 비번은 코드에 없음)
const REVIEW_EMAIL = 'review@petmove.co.kr'

export function LoginForm({
  next,
  initialError = null,
}: {
  next: string
  initialError?: string | null
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    setLoading('apple')
    setError(null)
    setInfo(null)
    const res = await nativeAppleLogin(next)
    if (res.error) {
      setError(res.error)
      setLoading(null)
      return
    }
    // 성공(success): nativeAppleLogin 이 window.location.href 로 전체 리로드를 건 상태 →
    // loading 을 풀지 않고 '로그인 중…' 스피너를 유지한다(리로드가 끝날 때까지). 풀면 그 사이
    // 로그인 폼(첫 화면)이 잠깐 보였다가 로그인됨. 구글(handled 시 return)과 동일한 처리.
    if (res.success) return
    // 성공도 에러도 아니면 = 사용자가 Apple 시트를 취소 → 폼으로 복귀.
    setLoading(null)
  }

  const isReviewLogin = email.trim().toLowerCase() === REVIEW_EMAIL

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setError('이메일을 먼저 입력하세요.')
      return
    }
    setError(null)
    setInfo(null)

    // 심사용 비밀번호 로그인 (숨김) — 지정 이메일일 때만.
    if (isReviewLogin) {
      if (!password) {
        setError('비밀번호를 입력하세요.')
        return
      }
      setLoading('magic')
      const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password })
      setLoading(null)
      if (error) {
        setError(error.message)
        return
      }
      window.location.href = next && next !== '/' ? next : '/cases'
      return
    }

    setLoading('magic')

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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-md bg-white px-md py-xl">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[#212124]/20 border-t-[#212124]"
          aria-hidden
        />
        <p className="text-sm text-[#97979C]">로그인 중…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-md py-xl">
      <div className="w-full max-w-sm space-y-lg">
        <div className="space-y-md text-center">
          <h1 className="font-display text-[28px] leading-tight text-[#212124]">펫무브</h1>
          <p className="text-sm leading-snug text-[#97979C]">
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

        <div className="flex items-center gap-sm text-xs text-[#97979C]">
          <div className="h-px flex-1 bg-[rgba(33,33,36,0.12)]" />
          <span>또는 이메일</span>
          <div className="h-px flex-1 bg-[rgba(33,33,36,0.12)]" />
        </div>

        <form onSubmit={sendMagicLink} className="space-y-sm">
          <input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border border-[rgba(33,33,36,0.16)] bg-white px-sm py-2 text-sm text-[#212124] placeholder:text-[#97979C]/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#212124]/30"
          />
          {isReviewLogin && (
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-[rgba(33,33,36,0.16)] bg-white px-sm py-2 text-sm text-[#212124] placeholder:text-[#97979C]/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#212124]/30"
            />
          )}
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={loading !== null || !email || (isReviewLogin && !password)}
          >
            {isReviewLogin
              ? loading === 'magic'
                ? '로그인 중…'
                : '로그인'
              : loading === 'magic'
                ? '발송 중…'
                : '이메일로 로그인 링크 받기'}
          </button>
        </form>

        {info && (
          <p className="rounded-md border border-[rgba(33,33,36,0.16)] bg-[#F7F7F8] p-sm text-xs text-[#5C5C60]">
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
