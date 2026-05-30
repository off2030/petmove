'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@petmove/auth'
import { PillButton } from '@petmove/ui'

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

  async function googleOAuth() {
    setLoading('google')
    setError(null)
    setInfo(null)

    // next 는 cookie 로 — Supabase OAuth 의 redirect_to allowlist 가 query 포함
    // URL 을 정확 매칭 못 해서 query 는 비우고 callback 에서 cookie 로 읽음.
    const redirectTo = `${window.location.origin}/auth/callback`
    if (next && next !== '/') {
      document.cookie = `pm_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
    }

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
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
    <div className="flex min-h-dvh items-center justify-center px-md py-xl">
      <div className="w-full max-w-sm space-y-lg">
        <div className="space-y-xs text-center">
          <h1 className="font-serif text-[28px] leading-tight text-foreground">펫무브</h1>
          <p className="text-sm text-muted-foreground leading-snug">
            반려동물과 함께하는 해외 여행, 이민, 유학
            <br />
            펫무브앱으로 준비하세요!
          </p>
          <p className="pt-xs text-xs text-muted-foreground/80">
            처음이신가요? 같은 버튼으로 가입까지 한 번에 진행됩니다.
          </p>
        </div>

        <div className="space-y-sm">
          <PillButton
            variant="solid"
            className="w-full justify-center h-10 px-md text-[14px]"
            disabled={loading !== null}
            onClick={googleOAuth}
          >
            {loading === 'google' ? '이동 중…' : 'Google 계정으로 계속'}
          </PillButton>
          <PillButton
            variant="solid"
            className="w-full justify-center h-10 px-md text-[14px]"
            disabled={loading !== null}
            onClick={naverOAuth}
          >
            {loading === 'naver' ? '이동 중…' : '네이버 계정으로 계속'}
          </PillButton>
        </div>

        <div className="flex items-center gap-sm text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>또는 이메일</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={sendMagicLink} className="space-y-sm">
          <input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border border-border bg-background px-sm py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          <PillButton
            variant="solid"
            type="submit"
            className="w-full justify-center h-10 px-md text-[14px]"
            disabled={loading !== null || !email}
          >
            {loading === 'magic' ? '발송 중…' : '이메일로 로그인 링크 받기'}
          </PillButton>
        </form>

        {info && (
          <p className="rounded border border-pmw-positive/40 bg-pmw-positive/10 p-sm text-xs text-pmw-positive">
            {info}
          </p>
        )}
        {error && (
          <p className="rounded border border-destructive/40 bg-destructive/10 p-sm text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
