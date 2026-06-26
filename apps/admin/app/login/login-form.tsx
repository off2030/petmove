'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Provider = 'google' | 'naver' | 'kakao'

const ERROR_MESSAGES: Record<string, string> = {
  invite_required: '이 서비스는 초대받은 사용자만 사용할 수 있습니다. 관리자에게 초대를 요청하세요.',
}

function resolveError(raw: string | null): string | null {
  if (!raw) return null
  return ERROR_MESSAGES[raw] ?? raw
}

export function LoginForm({ next, initialError = null }: { next: string; initialError?: string | null }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(resolveError(initialError))

  // 차단 결과로 표시된 에러 파라미터는 한 번만 보여주고 URL 에서 제거.
  // 새로고침/공유 시 미리 차단된 것처럼 보이는 UX 문제 방지.
  useEffect(() => {
    if (!initialError || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.has('error')) {
      url.searchParams.delete('error')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [initialError])

  async function oauth(provider: Provider) {
    setLoading(provider)
    setError(null)
    setInfo(null)

    // 네이버는 Supabase builtin 이 아니라 자체 라우트 사용.
    if (provider === 'naver') {
      window.location.href = `/api/auth/naver?next=${encodeURIComponent(next)}`
      return
    }

    // redirectTo 에 query 를 포함하면 Supabase 가 Redirect URLs allowlist 와 정확히
    // 매칭 못 해서 Site URL 로 fallback. 따라서 callback URL 은 query 없이 base 만 사용하고,
    // next 는 cookie 로 전달.
    const redirectTo = `${window.location.origin}/auth/callback`
    if (next && next !== '/cases') {
      document.cookie = `pm_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
    }

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    })

    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  // 매직링크 발송 — 이메일 로그인의 유일한 방식. 비번 운영 X.
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setError('이메일을 먼저 입력하세요.')
      return
    }
    setLoading('magic')
    setError(null)
    setInfo(null)
    if (next && next !== '/cases') {
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
    <div className="flex min-h-screen items-center justify-center p-md">
      <div className="w-full max-w-sm space-y-lg rounded-lg border bg-card p-lg shadow-sm">
        <div className="space-y-xs text-center">
          <h1 className="text-xl font-semibold">펫무브워크 로그인</h1>
          <p className="text-sm text-muted-foreground">
            소셜 계정 또는 이메일 링크로 로그인하세요.
          </p>
        </div>

        <div className="space-y-sm">
          <Button
            className="w-full"
            variant="outline"
            disabled={loading !== null}
            onClick={() => oauth('kakao')}
          >
            {loading === 'kakao' ? '이동 중…' : '카카오로 로그인'}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            disabled={loading !== null}
            onClick={() => oauth('naver')}
          >
            {loading === 'naver' ? '이동 중…' : '네이버로 로그인'}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            disabled={loading !== null}
            onClick={() => oauth('google')}
          >
            {loading === 'google' ? '이동 중…' : 'Google 로 로그인'}
          </Button>
        </div>

        <div className="flex items-center gap-sm text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>또는 이메일</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={sendMagicLink} className="space-y-sm">
          <Input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Button
            type="submit"
            className="w-full"
            disabled={loading !== null || !email}
          >
            {loading === 'magic' ? '발송 중…' : '이메일로 로그인 링크 받기'}
          </Button>
          <p className="text-center text-xs text-muted-foreground/80">
            처음이신가요? 초대받은 이메일로 링크를 받아 입장하세요.
          </p>
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
