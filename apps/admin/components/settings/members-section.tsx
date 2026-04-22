'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  createInvite,
  listInvites,
  listMembers,
  revokeInvite,
  type InviteRole,
  type InviteRow,
  type MemberRow,
} from '@/lib/actions/invites'

const ROLE_LABEL: Record<InviteRole, string> = {
  owner: '소유자',
  admin: '관리자',
  member: '멤버',
}

export function MembersSection() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('member')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function refresh() {
    setLoading(true)
    const [m, i] = await Promise.all([listMembers(), listInvites()])
    if (m.ok) setMembers(m.value)
    if (i.ok) setInvites(i.value)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  function inviteLink(token: string): string {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/invite/${token}`
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token))
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      // 복사 실패 무시
    }
  }

  function onCreate() {
    setInviteError(null)
    startTransition(async () => {
      const r = await createInvite({ email, role })
      if (!r.ok) {
        setInviteError(r.error)
        return
      }
      setEmail('')
      setRole('member')
      await refresh()
      await copy(r.value.token)
    })
  }

  function onRevoke(id: string) {
    if (!confirm('초대를 취소하시겠습니까?')) return
    startTransition(async () => {
      await revokeInvite(id)
      await refresh()
    })
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-md shadow-sm max-w-3xl space-y-6">
      {/* 멤버 */}
      <section>
        <h3 className="font-medium text-base mb-2">멤버</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">로딩 중…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">멤버가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="px-md py-2 flex items-center justify-between gap-md"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.name || m.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {ROLE_LABEL[m.role]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 대기 중 초대 */}
      <section>
        <h3 className="font-medium text-base mb-2">대기 중 초대</h3>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">대기 중인 초대가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {invites.map((inv) => {
              const expired = new Date(inv.expires_at).getTime() < Date.now()
              return (
                <li
                  key={inv.id}
                  className="px-md py-2 flex items-center justify-between gap-md"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {ROLE_LABEL[inv.role]} ·{' '}
                      {expired ? (
                        <span className="text-destructive">만료됨</span>
                      ) : (
                        `만료: ${new Date(inv.expires_at).toLocaleDateString()}`
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => copy(inv.token)}
                      className="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80 transition-colors"
                      disabled={expired}
                    >
                      {copiedToken === inv.token ? '복사됨' : '링크 복사'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevoke(inv.id)}
                      className="px-2 py-1 text-xs rounded bg-muted hover:bg-destructive/10 hover:text-destructive transition-colors"
                      disabled={pending}
                    >
                      취소
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 초대 생성 */}
      <section>
        <h3 className="font-medium text-base mb-2">초대하기</h3>
        <div className="flex gap-2 items-start">
          <input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 px-md py-2 text-sm rounded-md border border-border/60 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={pending}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as InviteRole)}
            className="px-md py-2 text-sm rounded-md border border-border/60 bg-background"
            disabled={pending}
          >
            <option value="member">멤버</option>
            <option value="admin">관리자</option>
            <option value="owner">소유자</option>
          </select>
          <button
            type="button"
            onClick={onCreate}
            disabled={pending || !email}
            className="px-md py-2 text-sm rounded-md bg-accent hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            초대 생성
          </button>
        </div>
        {inviteError && (
          <p className="mt-2 text-sm text-destructive">{inviteError}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          초대 생성 시 링크가 자동 복사됩니다. 초대 대상에게 직접 전달해 주세요. 유효기간 7일.
        </p>
      </section>
    </div>
  )
}
