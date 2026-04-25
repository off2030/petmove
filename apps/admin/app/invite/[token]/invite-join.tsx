'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { sendInviteMagicLink, type InviteSummary } from '@/lib/actions/invites'

const ROLE_LABEL: Record<'admin' | 'member', string> = { admin: '관리자', member: '멤버' }

export function InviteJoin({ token, summary }: { token: string; summary: InviteSummary }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  const inviteNext = `/invite/${encodeURIComponent(token)}`

  function setOAuthNextCookie() {
    document.cookie = `pm_oauth_next=${encodeURIComponent(inviteNext)}; path=/; max-age=600; samesite=lax`
  }

  async function onGoogle() {
    setLoading('google')
    setError(null)
    setOAuthNextCookie()
    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  function onNaver() {
    setLoading('naver')
    // 네이버는 자체 라우트. cookie 는 거기서 별도 처리.
    window.location.href = `/api/auth/naver?next=${encodeURIComponent(inviteNext)}`
  }

  async function onMagicLink() {
    setLoading('magic')
    setError(null)
    setOAuthNextCookie()
    const r = await sendInviteMagicLink({ token, origin: window.location.origin })
    setLoading(null)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setMagicSent(true)
  }

  if (magicSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-lg">
        <div className="max-w-md w-full space-y-md rounded-xl border border-border/60 bg-card p-xl shadow-sm text-center">
          <h1 className="text-xl font-semibold">메일을 확인하세요</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{summary.email}</span> 로 로그인 링크를 보냈습니다.
          </p>
          <p className="text-xs text-muted-foreground italic">
            메일을 못 받으셨다면 스팸함을 확인하거나 잠시 후 다시 시도하세요.
          </p>
          <button
            type="button"
            onClick={() => setMagicSent(false)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            다른 방법으로 로그인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-lg">
      <div className="max-w-md w-full space-y-lg rounded-xl border border-border/60 bg-card p-xl shadow-sm">
        <div className="text-center space-y-xs">
          <h1 className="text-xl font-semibold">{summary.orgName}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-serif italic">{ROLE_LABEL[summary.role]}</span> 로 초대받았습니다
          </p>
          <p className="text-xs text-muted-foreground font-mono">{summary.email}</p>
        </div>

        <div className="space-y-sm">
          <button
            type="button"
            onClick={onNaver}
            disabled={loading !== null}
            className="w-full rounded-md border border-border py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-40"
          >
            {loading === 'naver' ? '이동 중…' : '네이버로 가입/로그인'}
          </button>
          <button
            type="button"
            onClick={onGoogle}
            disabled={loading !== null}
            className="w-full rounded-md border border-border py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-40"
          >
            {loading === 'google' ? '이동 중…' : 'Google 로 가입/로그인'}
          </button>
          <button
            type="button"
            onClick={onMagicLink}
            disabled={loading !== null}
            className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {loading === 'magic' ? '발송 중…' : '이메일로 로그인 링크 받기'}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground italic">
          이미 가입했다면{' '}
          <a href={`/login?next=${encodeURIComponent(inviteNext)}`} className="underline hover:text-foreground">
            비밀번호로 로그인
          </a>
        </p>

        {error && (
          <p className="rounded border border-destructive/40 bg-destructive/10 p-sm text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
