'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  createInvite,
  listInvites,
  listMembers,
  revokeInvite,
  type InviteRole,
  type InviteRow,
  type MemberRow,
} from '@/lib/actions/invites'
import { Avatar, avatarInitial } from '@/components/ui/avatar'
import { PillButton } from '@/components/ui/pill-button'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<InviteRole, string> = {
  admin: '관리자',
  member: '멤버',
}

const ROLE_OPTIONS: InviteRole[] = ['member', 'admin']

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\./g, '-').replace(/ /g, '').replace(/-$/, '')
}

export function MembersSection({
  initialMembers = null,
  initialInvites = null,
  isAdmin = false,
}: {
  initialMembers?: MemberRow[] | null
  initialInvites?: InviteRow[] | null
  isAdmin?: boolean
} = {}) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers ?? [])
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites ?? [])
  const [loading, setLoading] = useState(initialMembers === null && initialInvites === null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('member')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
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
    if (initialMembers) setMembers(initialMembers)
    if (initialInvites) setInvites(initialInvites)
    if (initialMembers || initialInvites) setLoading(false)
  }, [initialMembers, initialInvites])

  useEffect(() => {
    if (initialMembers !== null || initialInvites !== null) return
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
    setInviteNotice(null)
    startTransition(async () => {
      const r = await createInvite({ email, role })
      if (!r.ok) {
        setInviteError(r.error)
        return
      }
      const targetEmail = email
      setEmail('')
      setRole('member')
      await refresh()
      await copy(r.value.token)
      if (r.value.emailSent) {
        setInviteNotice(`${targetEmail} 로 초대 이메일 발송 완료. 링크도 복사됨.`)
      } else if (r.value.emailError) {
        setInviteNotice(`이메일 발송 실패 (${r.value.emailError}) — 링크 복사는 완료.`)
      } else {
        setInviteNotice('링크가 복사되었습니다. 초대 대상에게 직접 전달해 주세요.')
      }
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
    <div className="max-w-3xl pb-2xl">
      {/* Header */}
      <header className="pb-xl">
        <SectionHeader>멤버</SectionHeader>
      </header>

      {/* Active members */}
      <section className="mb-xl">
        <div className="mb-2">
          <span className="font-serif text-[13px] text-muted-foreground/80">
            활성 멤버 · {members.length}
          </span>
        </div>
        <div className="border-t border-border/70">
          {loading ? (
            <p className="font-serif italic text-[14px] text-muted-foreground py-4">불러오는 중…</p>
          ) : members.length === 0 ? (
            <p className="font-serif italic text-[14px] text-muted-foreground py-4">멤버가 없습니다.</p>
          ) : (
            members.map((m) => {
              const hasRealName = !!m.name && m.name.trim() !== '' && m.name !== m.email
              return (
                <div
                  key={m.user_id}
                  className="flex items-center gap-md py-3 border-b border-dotted border-border/60"
                >
                  <Avatar label={avatarInitial(hasRealName ? m.name! : m.email)} />
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-[16px] text-foreground truncate leading-tight">
                      {hasRealName ? m.name : m.email}
                    </div>
                    {hasRealName && (
                      <div className="font-serif italic text-[13px] text-muted-foreground truncate mt-0.5">
                        {m.email}
                      </div>
                    )}
                  </div>
                  <span className="font-serif text-[12px] px-2.5 py-0.5 rounded-full border border-border/60 text-muted-foreground shrink-0">
                    {ROLE_LABEL[m.role]}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Pending invites */}
      <section className="mb-xl">
        <div className="mb-2">
          <span className="font-serif text-[13px] text-muted-foreground/80">
            대기 중 초대 · {invites.length}
          </span>
        </div>
        <div className="border-t border-border/70">
          {invites.length === 0 ? (
            <p className="font-serif italic text-[14px] text-muted-foreground py-4">대기 중인 초대가 없습니다.</p>
          ) : (
            invites.map((inv) => {
              const expired = new Date(inv.expires_at).getTime() < Date.now()
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-md py-3 border-b border-dotted border-border/60"
                >
                  <Avatar label="?" muted />
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-[16px] text-foreground truncate leading-tight">
                      {inv.email}
                    </div>
                    <div className="font-serif text-[13px] text-muted-foreground mt-0.5">
                      {ROLE_LABEL[inv.role]}
                      {' · '}
                      {expired ? (
                        <span className="italic text-destructive">만료됨</span>
                      ) : (
                        <span>만료 {formatExpiry(inv.expires_at)}</span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1.5 shrink-0">
                      <PillButton
                        onClick={() => copy(inv.token)}
                        disabled={expired}
                        className="disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                      >
                        {copiedToken === inv.token ? '복사됨' : '링크 복사'}
                      </PillButton>
                      <button
                        type="button"
                        onClick={() => onRevoke(inv.id)}
                        disabled={pending}
                        className="font-serif text-[12px] px-2.5 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors disabled:opacity-40"
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Invite form — admin only */}
      {isAdmin ? (
        <section className="pt-md border-t border-border/60">
          <div className="flex items-center gap-sm">
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email && !pending) onCreate()
              }}
              disabled={pending}
              className="flex-1 bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/40 disabled:opacity-60"
            />
            <RoleSelect value={role} onChange={setRole} disabled={pending} />
            <PillButton variant="solid" onClick={onCreate} disabled={pending || !email}>
              초대 보내기
            </PillButton>
          </div>
          {inviteError && (
            <p className="mt-sm font-serif text-[13px] text-destructive">{inviteError}</p>
          )}
          {inviteNotice && (
            <p className="mt-sm font-serif italic text-[13px] text-muted-foreground">{inviteNotice}</p>
          )}
          <p className="mt-sm font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed">
            유효기간 7일. 초대 생성 시 링크가 클립보드에 복사되고 이메일로도 발송됩니다.
          </p>
        </section>
      ) : (
        <p className="pt-md border-t border-border/60 font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed">
          멤버 초대는 관리자만 가능합니다.
        </p>
      )}
    </div>
  )
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: InviteRole
  onChange: (v: InviteRole) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full border border-border/60 bg-transparent font-serif text-[14px] text-foreground transition-colors',
          'hover:bg-muted/40 focus:outline-none focus:border-primary/50',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          open && 'border-foreground/40 bg-muted/30',
        )}
      >
        <span>{ROLE_LABEL[value]}</span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')}
        >
          <path
            d="M2 4.5l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[120px] rounded-md border border-border bg-popover py-1 shadow-md">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                onChange(r)
                setOpen(false)
              }}
              className={cn(
                'w-full text-left px-3 py-1.5 font-serif text-[14px] transition-colors',
                value === r
                  ? 'text-foreground bg-muted/40'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

