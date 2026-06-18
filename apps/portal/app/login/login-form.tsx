'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'

const buttonBaseClass =
  'inline-flex w-full items-center justify-center rounded-md h-10 px-md text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D99A58]/40 disabled:pointer-events-none disabled:opacity-50 select-none'
const socialButtonClass = `${buttonBaseClass} border border-[rgba(42,38,32,0.16)] bg-[#FBF7F1] text-[#2A2620] hover:bg-[#F0E8DC]`
const primaryButtonClass = `${buttonBaseClass} bg-[#D99A58] text-[#FBF7F1] hover:bg-[#C98B45]`

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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F5EFE8] px-md py-xl">
      <div className="w-full max-w-sm space-y-lg">
        <div className="space-y-md text-center">
          <h1 className="font-display text-[28px] leading-tight text-[#2A2620]">펫무브</h1>
          <p className="text-sm leading-snug text-[#9A9286]">
            반려동물과 함께 떠나는 해외여행
            <br />
            펫무브 앱으로 쉽게 준비하세요!
          </p>
        </div>

        <div className="space-y-sm">
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
            onClick={() => oauthLogin('google')}
          >
            {loading === 'google' ? '이동 중…' : 'Google 계정으로 계속'}
          </button>
          <button
            type="button"
            className={socialButtonClass}
            disabled={loading !== null}
            onClick={naverOAuth}
          >
            {loading === 'naver' ? '이동 중…' : '네이버 계정으로 계속'}
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
