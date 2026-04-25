'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Eye, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  createOrg,
  deleteOrg,
  getOrgDetail,
  inviteToOrg,
  listAllOrgs,
  removeMemberFromOrg,
  revokeOrgInvite,
  setImpersonation,
  updateOrgBusinessNumber,
  updateOrgMemberRole,
  type OrgDetail,
  type OrgSummary,
} from '@/lib/actions/super-admin'
import type { InviteRole } from '@/lib/actions/invites'
import { TopBar } from '@/components/layout/topbar'
import { cn } from '@/lib/utils'

interface Props {
  initialOrgs: OrgSummary[]
  userEmail: string | null
  currentUserId: string | null
  /** DashboardShell 안에 삽입된 경우 내부 TopBar 생략. standalone 렌더링 때만 TopBar 포함. */
  embedded?: boolean
}

const ROLE_LABEL: Record<InviteRole, string> = { admin: '관리자', member: '멤버' }

export function SuperAdminApp({ initialOrgs, userEmail, currentUserId, embedded = false }: Props) {
  const [orgs, setOrgs] = useState<OrgSummary[]>(initialOrgs)
  const [selected, setSelected] = useState<OrgDetail | null>(null)
  const [newOrgName, setNewOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('member')
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      const r = await listAllOrgs()
      if (r.ok) setOrgs(r.value)
    })
  }

  function select(id: string) {
    setError(null)
    setMemberError(null)
    setInviteNotice(null)
    startTransition(async () => {
      const r = await getOrgDetail(id)
      if (!r.ok) {
        setError(r.error)
        setSelected(null)
        return
      }
      setSelected(r.value)
    })
  }

  function reloadSelected() {
    if (!selected) return
    startTransition(async () => {
      const [detail, listed] = await Promise.all([getOrgDetail(selected.id), listAllOrgs()])
      if (detail.ok) setSelected(detail.value)
      if (listed.ok) setOrgs(listed.value)
    })
  }

  function onChangeMemberRole(orgId: string, userId: string, current: InviteRole, next: InviteRole) {
    if (next === current) return
    setMemberError(null)
    startTransition(async () => {
      const r = await updateOrgMemberRole({ orgId, userId, role: next })
      if (!r.ok) {
        setMemberError(r.error)
        return
      }
      reloadSelected()
    })
  }

  function onRemoveMember(orgId: string, userId: string, label: string) {
    if (!confirm(`${label} 님을 조직에서 제거하시겠습니까?`)) return
    setMemberError(null)
    startTransition(async () => {
      const r = await removeMemberFromOrg({ orgId, userId })
      if (!r.ok) {
        setMemberError(r.error)
        return
      }
      reloadSelected()
    })
  }

  function onRevokeInvite(inviteId: string) {
    if (!confirm('초대를 취소하시겠습니까?')) return
    startTransition(async () => {
      const r = await revokeOrgInvite(inviteId)
      if (!r.ok) {
        setMemberError(r.error)
        return
      }
      reloadSelected()
    })
  }

  function onImpersonate(org: OrgDetail) {
    setError(null)
    startTransition(async () => {
      const r = await setImpersonation(org.id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      // hard reload — DashboardShell 의 탭 시스템이 SPA 라 router.push 로는 전환 안 됨.
      // cookie 가 적용된 채로 케이스 페이지를 SSR 재호출.
      window.location.href = '/cases'
    })
  }

  function onDeleteOrg(org: OrgDetail) {
    const typed = window.prompt(
      `이 작업은 되돌릴 수 없습니다.\n조직과 모든 멤버·초대·설정·약품·자동화·이력이 영구 삭제됩니다.\n계속하려면 조직 이름을 정확히 입력하세요:\n\n${org.name}`,
    )
    if (typed === null) return
    if (typed.trim() !== org.name) {
      setError('조직 이름이 일치하지 않습니다')
      return
    }
    setError(null)
    setMemberError(null)
    startTransition(async () => {
      const r = await deleteOrg({ orgId: org.id, expectedName: org.name })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setSelected(null)
      const listed = await listAllOrgs()
      if (listed.ok) setOrgs(listed.value)
    })
  }

  function onCreateInvite(orgId: string) {
    setInviteNotice(null)
    setMemberError(null)
    startTransition(async () => {
      const r = await inviteToOrg({ orgId, email: inviteEmail, role: inviteRole })
      if (!r.ok) {
        setMemberError(r.error)
        return
      }
      const targetEmail = inviteEmail
      setInviteEmail('')
      setInviteRole('member')
      try {
        const url = `${window.location.origin}/invite/${r.value.token}`
        await navigator.clipboard.writeText(url)
      } catch {
        // ignore copy failure
      }
      if (r.value.emailSent) {
        setInviteNotice(`${targetEmail} 로 초대 이메일 발송 완료. 링크도 복사됨.`)
      } else if (r.value.emailError) {
        setInviteNotice(`이메일 발송 실패 (${r.value.emailError}) — 링크 복사는 완료.`)
      } else {
        setInviteNotice('링크가 복사되었습니다. 초대 대상에게 직접 전달해 주세요.')
      }
      reloadSelected()
    })
  }

  function onCreate() {
    setError(null)
    startTransition(async () => {
      const r = await createOrg({ name: newOrgName })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setNewOrgName('')
      const listed = await listAllOrgs()
      if (listed.ok) setOrgs(listed.value)
    })
  }

  return (
    <>
      {!embedded && <TopBar isSuperAdmin userEmail={userEmail} superAdminActive />}
      <main className="flex-1 min-w-0 overflow-auto scrollbar-minimal bg-background">
        <div className="px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
          <div className="mx-auto max-w-4xl 3xl:max-w-5xl 4xl:max-w-6xl flex flex-col gap-lg">
            {/* Page header — editorial title + count + refresh */}
            <div className="shrink-0 flex items-baseline justify-between gap-md">
              <h1 className="font-serif text-[26px] leading-tight tracking-tight text-foreground">
                조직 관리
              </h1>
              <div className="flex items-center gap-sm">
                <button
                  type="button"
                  onClick={refresh}
                  disabled={pending}
                  title="새로고침"
                  aria-label="새로고침"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} />
                </button>
                <span className="text-muted-foreground text-[13px]">
                  <span className="font-serif italic">총</span>{' '}
                  <span className="font-mono tabular-nums">{orgs.length.toLocaleString()}</span>{' '}
                  <span className="font-serif italic">개</span>
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-md py-2 text-[13px] text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-lg">
              {/* 좌: 조직 목록 + 생성 폼 */}
              <section className="lg:col-span-2 flex flex-col gap-lg">
                {/* Orgs card — Editorial borderless */}
                <div className="rounded-xl bg-card px-lg pt-md pb-sm">
                  <div className="flex items-baseline justify-between pb-sm border-b border-border/60 mb-sm">
                    <h2 className="font-serif text-[17px] text-foreground">목록</h2>
                    <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                      {orgs.length}
                    </span>
                  </div>
                  {orgs.length === 0 ? (
                    <p className="py-6 text-center font-serif italic text-[14px] text-muted-foreground">
                      조직이 없습니다
                    </p>
                  ) : (
                    <ul>
                      {orgs.map((o) => {
                        const isSel = selected?.id === o.id
                        return (
                          <li key={o.id}>
                            <button
                              type="button"
                              onClick={() => select(o.id)}
                              disabled={pending}
                              className={cn(
                                'block w-full text-left py-3 -mx-sm px-sm rounded-sm transition-colors border-b border-dotted border-border/70 last:border-b-0',
                                isSel ? 'bg-accent' : 'hover:bg-accent/60',
                                pending && 'disabled:opacity-70',
                              )}
                            >
                              <div className="font-serif font-semibold text-[17px] leading-tight text-foreground truncate">
                                {o.name}
                              </div>
                              <div className="mt-1 text-[12px] text-muted-foreground flex items-center gap-2">
                                <span>
                                  <span className="font-serif italic">멤버</span>{' '}
                                  <span className="font-mono tabular-nums">{o.member_count}</span>
                                </span>
                                <span className="opacity-40">·</span>
                                <span>
                                  <span className="font-serif italic">대기</span>{' '}
                                  <span className="font-mono tabular-nums">
                                    {o.pending_invite_count}
                                  </span>
                                </span>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {/* New org */}
                <div className="rounded-xl bg-card px-lg pt-md pb-md">
                  <h2 className="font-serif text-[17px] text-foreground mb-sm">새 조직 추가</h2>
                  <div className="flex items-center gap-sm">
                    <input
                      type="text"
                      placeholder="조직 이름"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newOrgName.trim()) {
                          e.preventDefault()
                          onCreate()
                        }
                      }}
                      disabled={pending}
                      className="flex-1 h-10 bg-transparent px-0 font-serif font-semibold text-[17px] text-foreground placeholder:font-serif placeholder:italic placeholder:font-normal placeholder:text-[14px] placeholder:text-muted-foreground/50 border-b border-border focus:border-foreground/40 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={onCreate}
                      disabled={pending || !newOrgName.trim()}
                      aria-label="추가"
                      title="추가"
                      className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </section>

              {/* 우: 선택된 조직 상세 */}
              <section className="lg:col-span-3">
                {!selected ? (
                  <div className="rounded-xl bg-card px-lg py-16 text-center font-serif italic text-[14px] text-muted-foreground">
                    왼쪽에서 조직을 선택하세요
                  </div>
                ) : (
                  <div className="rounded-xl bg-card px-lg pt-md pb-md flex flex-col gap-lg">
                    {/* Org header */}
                    <header className="pb-md border-b border-border/60">
                      <div className="flex items-start justify-between gap-md">
                        <h2 className="font-serif text-[22px] leading-tight text-foreground">
                          {selected.name}
                        </h2>
                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onImpersonate(selected)}
                            disabled={pending}
                            title="이 조직으로 보기 (임시 전환)"
                            aria-label="이 조직으로 보기"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteOrg(selected)}
                            disabled={pending}
                            title="조직 삭제"
                            aria-label="조직 삭제"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-baseline gap-md flex-wrap text-[12px] text-muted-foreground">
                        <span className="inline-flex items-baseline gap-xs">
                          <span className="font-serif italic">사업자번호</span>
                          <BusinessNumberField
                            orgId={selected.id}
                            value={selected.business_number}
                            onSaved={(next) =>
                              setSelected((prev) =>
                                prev && prev.id === selected.id
                                  ? { ...prev, business_number: next }
                                  : prev,
                              )
                            }
                          />
                        </span>
                        <span>
                          <span className="font-serif italic">생성</span>{' '}
                          <span className="font-mono tabular-nums">
                            {new Date(selected.created_at).toLocaleDateString('ko-KR')}
                          </span>
                        </span>
                      </div>
                    </header>

                    {/* Members */}
                    <section>
                      <div className="flex items-baseline justify-between pb-sm border-b border-border/60 mb-sm">
                        <h3 className="font-serif text-[17px] text-foreground">멤버</h3>
                        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                          {selected.members.length}
                        </span>
                      </div>
                      {selected.members.length === 0 ? (
                        <p className="py-4 text-center text-[13px] font-serif italic text-muted-foreground">
                          멤버 없음
                        </p>
                      ) : (
                        <ul>
                          {selected.members.map((m) => {
                            const isSelf = currentUserId !== null && m.user_id === currentUserId
                            return (
                              <li
                                key={m.user_id}
                                className="flex items-center justify-between gap-md py-3 border-b border-dotted border-border/70 last:border-b-0"
                              >
                                <div className="min-w-0">
                                  <div className="font-serif font-semibold text-[17px] leading-tight truncate">
                                    {m.name || m.email}
                                  </div>
                                  <div className="text-[13px] text-muted-foreground truncate">
                                    {m.email}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isSelf ? (
                                    <>
                                      <span className="font-sans text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
                                        {m.role}
                                      </span>
                                      <span className="font-serif italic text-[12px] text-muted-foreground/70">나</span>
                                    </>
                                  ) : (
                                    <>
                                      <RoleSelect
                                        value={m.role as InviteRole}
                                        onChange={(next) =>
                                          onChangeMemberRole(selected.id, m.user_id, m.role as InviteRole, next)
                                        }
                                        disabled={pending}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => onRemoveMember(selected.id, m.user_id, m.name || m.email)}
                                        disabled={pending}
                                        className="font-serif text-[12px] px-2.5 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors disabled:opacity-40"
                                      >
                                        제거
                                      </button>
                                    </>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {memberError && (
                        <p className="font-serif text-[13px] text-destructive py-2">{memberError}</p>
                      )}
                    </section>

                    {/* Invites */}
                    <section>
                      <div className="flex items-baseline justify-between pb-sm border-b border-border/60 mb-sm">
                        <h3 className="font-serif text-[17px] text-foreground">대기 초대</h3>
                        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                          {selected.invites.length}
                        </span>
                      </div>
                      {selected.invites.length === 0 ? (
                        <p className="py-4 text-center text-[13px] font-serif italic text-muted-foreground">
                          대기 중 초대 없음
                        </p>
                      ) : (
                        <ul>
                          {selected.invites.map((i) => (
                            <li
                              key={i.id}
                              className="flex items-center justify-between gap-md py-3 border-b border-dotted border-border/70 last:border-b-0"
                            >
                              <div className="min-w-0">
                                <div className="font-serif font-semibold text-[16px] leading-tight truncate">
                                  {i.email}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[12px] text-muted-foreground">
                                  <span className="font-sans uppercase tracking-[0.14em]">
                                    {i.role}
                                  </span>
                                  <span className="opacity-40">·</span>
                                  <span>
                                    <span className="font-serif italic">만료</span>{' '}
                                    <span className="font-mono tabular-nums">
                                      {new Date(i.expires_at).toLocaleDateString('ko-KR')}
                                    </span>
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => onRevokeInvite(i.id)}
                                disabled={pending}
                                className="shrink-0 font-serif text-[12px] px-2.5 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors disabled:opacity-40"
                              >
                                취소
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* New invite form */}
                      <div className="pt-md mt-sm border-t border-border/60 flex items-center gap-sm">
                        <input
                          type="email"
                          placeholder="email@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && inviteEmail && !pending) {
                              e.preventDefault()
                              onCreateInvite(selected.id)
                            }
                          }}
                          disabled={pending}
                          className="flex-1 bg-transparent font-serif text-[15px] text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/40 disabled:opacity-60"
                        />
                        <RoleSelect value={inviteRole} onChange={setInviteRole} disabled={pending} />
                        <button
                          type="button"
                          onClick={() => onCreateInvite(selected.id)}
                          disabled={pending || !inviteEmail}
                          className="shrink-0 inline-flex h-8 items-center px-3 rounded-full border border-foreground/40 bg-transparent font-serif text-[13px] text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                        >
                          초대 보내기
                        </button>
                      </div>
                      {inviteNotice && (
                        <p className="mt-sm font-serif italic text-[13px] text-muted-foreground">{inviteNotice}</p>
                      )}
                    </section>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
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

  const options: InviteRole[] = ['member', 'admin']

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
          <path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-20 min-w-[120px] rounded-md border border-border bg-popover py-1 shadow-md">
          {options.map((r) => (
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

function BusinessNumberField({
  orgId,
  value,
  onSaved,
}: {
  orgId: string
  value: string | null
  onSaved: (next: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commit() {
    const next = draft.trim()
    const normalized = next === '' ? null : next
    if (normalized === (value ?? null)) return
    setSaving(true)
    setError(null)
    const r = await updateOrgBusinessNumber({ orgId, businessNumber: normalized })
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      setDraft(value ?? '')
      return
    }
    onSaved(r.value.business_number)
    setDraft(r.value.business_number ?? '')
  }

  return (
    <span className="inline-flex items-baseline gap-xs">
      <input
        type="text"
        inputMode="numeric"
        placeholder="XXX-XX-XXXXX"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setDraft(value ?? '')
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        disabled={saving}
        className="font-mono tabular-nums bg-transparent text-foreground placeholder:text-muted-foreground/50 border-b border-dotted border-border/70 focus:border-foreground/40 focus:outline-none w-[120px] disabled:opacity-60"
      />
      {error && <span className="text-destructive">{error}</span>}
    </span>
  )
}
