'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setMyPassword } from '@/lib/actions/profile'

export function SetPasswordForm({ email, next }: { email: string; next: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (password !== confirm) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setLoading(true)
    setError(null)
    const r = await setMyPassword(password)
    setLoading(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-md">
      <div className="w-full max-w-sm space-y-lg rounded-lg border bg-card p-lg shadow-sm">
        <div className="space-y-xs text-center">
          <h1 className="text-xl font-semibold">비밀번호 설정</h1>
          <p className="text-sm text-muted-foreground">
            {email}
          </p>
          <p className="text-xs text-muted-foreground italic">
            다음 로그인부터 이메일 링크 없이 비밀번호로 빠르게 접속할 수 있어요.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-sm">
          <input
            type="password"
            placeholder="비밀번호 (8자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40"
          />
          <input
            type="password"
            placeholder="비밀번호 확인"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40"
          />
          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {loading ? '저장 중…' : '저장하고 계속'}
          </button>
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
