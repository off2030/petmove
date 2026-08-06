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
  // 이메일 로그인 2단계 — 'email'(주소 입력) → 'otp'(6자리 인증번호 입력).
  // 메일 템플릿이 인증번호 방식(펫무브와 공용, 2026-08 교체)이라 링크 대기가 아니라
  // 번호 입력이 주 경로다. 메일의 예비 링크(ConfirmationURL)도 여전히 동작한다.
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [sentEmail, setSentEmail] = useState('')
  const [otp, setOtp] = useState('')

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

  // 인증번호 발송 — 이메일 로그인의 유일한 방식. 비번 운영 X.
  async function sendOtp(e: React.FormEvent) {
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
    const target = email.trim().toLowerCase()
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email: target,
      // 메일 템플릿의 예비 링크({{ .ConfirmationURL }})용 — 주 경로는 인증번호 입력.
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(null)
    if (error) {
      setError(error.message)
      return
    }
    setSentEmail(target)
    setOtp('')
    setStep('otp')
    setInfo(`${target} 로 6자리 인증번호를 보냈습니다. 메일을 확인하세요.`)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = otp.replace(/\D/g, '')
    if (token.length !== 6) {
      setError('메일로 받은 6자리 인증번호를 입력하세요.')
      return
    }
    setError(null)
    setInfo(null)
    setLoading('verify')
    const { error } = await supabaseBrowser.auth.verifyOtp({
      email: sentEmail,
      token,
      type: 'email',
    })
    if (error) {
      setLoading(null)
      setError('인증번호가 올바르지 않거나 만료되었습니다. 다시 확인해 주세요.')
      return
    }
    // 세션 쿠키가 생긴 상태 → callback 이 next 쿠키를 읽어 목적지로 이동.
    window.location.href = '/auth/callback'
  }

  async function resendOtp() {
    setError(null)
    setInfo(null)
    setLoading('magic')
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email: sentEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(null)
    if (error) {
      setError(error.message)
      return
    }
    setOtp('')
    setInfo('인증번호를 다시 보냈습니다. 메일을 확인하세요.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-md">
      <div className="w-full max-w-sm space-y-lg rounded-lg border bg-card p-lg shadow-sm">
        <div className="space-y-xs text-center">
          <h1 className="text-xl font-semibold">펫무브워크 로그인</h1>
          <p className="text-sm text-muted-foreground">
            소셜 계정 또는 이메일 인증번호로 로그인하세요.
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

        {step === 'email' ? (
          <form onSubmit={sendOtp} className="space-y-sm">
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
              {loading === 'magic' ? '발송 중…' : '이메일로 인증번호 받기'}
            </Button>
            <p className="text-center text-xs text-muted-foreground/80">
              처음이신가요? 초대받은 이메일로 인증번호를 받아 입장하세요.
            </p>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-sm">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6자리 인증번호"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoFocus
              className="text-center tracking-[0.4em] font-mono text-base"
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loading !== null || otp.length !== 6}
            >
              {loading === 'verify' ? '확인 중…' : '인증하고 로그인'}
            </Button>
            <div className="flex items-center justify-center gap-md text-xs text-muted-foreground">
              <button
                type="button"
                onClick={resendOtp}
                disabled={loading !== null}
                className="underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-50"
              >
                인증번호 다시 보내기
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setOtp('')
                  setInfo(null)
                  setError(null)
                }}
                disabled={loading !== null}
                className="underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-50"
              >
                다른 이메일로
              </button>
            </div>
          </form>
        )}

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
