'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Provider = 'google' | 'kakao' | 'naver'

const ERROR_MESSAGES: Record<string, string> = {
  invite_required: '이 서비스는 초대받은 사용자만 사용할 수 있습니다. 관리자에게 초대를 요청하세요.',
}

function resolveError(raw: string | null): string | null {
  if (!raw) return null
  return ERROR_MESSAGES[raw] ?? raw
}

export function LoginForm({ next, initialError = null }: { next: string; initialError?: string | null }) {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
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
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    // 네이버는 Supabase builtin 이 아니라 "커스텀 OIDC" provider 로 등록 예정.
    // Provider ID 는 Supabase Dashboard 에 설정한 slug ('naver') 와 맞춰야 함.
    // Kakao: account_email 은 별도 검수 필요 — 일반 앱은 nickname+image 만.
    const scopes =
      provider === 'kakao' ? 'profile_nickname profile_image' : undefined

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: provider === 'naver' ? ('naver' as 'google') : provider,
      options: { redirectTo, scopes },
    })

    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading('email')
    setError(null)
    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setError(error.message)
      setLoading(null)
      return
    }
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-md">
      <div className="w-full max-w-sm space-y-lg rounded-lg border bg-card p-lg shadow-sm">
        <div className="space-y-xs text-center">
          <h1 className="text-xl font-semibold">펫무브워크 로그인</h1>
          <p className="text-sm text-muted-foreground">
            소셜 계정으로 로그인하세요.
          </p>
        </div>

        <div className="space-y-sm">
          <Button
            className="w-full"
            variant="outline"
            disabled={loading !== null}
            onClick={() => oauth('naver')}
          >
            {loading === 'naver' ? '이동 중…' : '네이버로 로그인'}
          </Button>
          {/* 카카오 로그인: 비즈앱 검수 통과 전까지 비활성화 (KOE205).
              Provider 설정/시크릿은 Bitwarden 백업 + Seoul Supabase 에 OFF 상태로 보관. */}
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

        <form onSubmit={emailLogin} className="space-y-sm">
          <Input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Button
            type="submit"
            className="w-full"
            disabled={loading !== null || !email || !password}
          >
            {loading === 'email' ? '로그인 중…' : '이메일로 로그인'}
          </Button>
        </form>

        {error && (
          <p className="rounded border border-destructive/40 bg-destructive/10 p-sm text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
