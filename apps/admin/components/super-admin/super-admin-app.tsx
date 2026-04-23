'use client'

import { useState, useTransition } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import {
  createOrg,
  getOrgDetail,
  listAllOrgs,
  updateOrgBusinessNumber,
  type OrgDetail,
  type OrgSummary,
} from '@/lib/actions/super-admin'
import { TopBar } from '@/components/layout/topbar'
import { cn } from '@/lib/utils'

interface Props {
  initialOrgs: OrgSummary[]
  userEmail: string | null
}

export function SuperAdminApp({ initialOrgs, userEmail }: Props) {
  const [orgs, setOrgs] = useState<OrgSummary[]>(initialOrgs)
  const [selected, setSelected] = useState<OrgDetail | null>(null)
  const [newOrgName, setNewOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      const r = await listAllOrgs()
      if (r.ok) setOrgs(r.value)
    })
  }

  function select(id: string) {
    setError(null)
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
      <TopBar isSuperAdmin userEmail={userEmail} superAdminActive />
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
                      <h2 className="font-serif text-[22px] leading-tight text-foreground">
                        {selected.name}
                      </h2>
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
                          {selected.members.map((m) => (
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
                              <span className="shrink-0 font-sans text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
                                {m.role}
                              </span>
                            </li>
                          ))}
                        </ul>
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
                            </li>
                          ))}
                        </ul>
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
