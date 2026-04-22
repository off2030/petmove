'use client'

import { useState, useTransition } from 'react'
import {
  createOrg,
  getOrgDetail,
  listAllOrgs,
  type OrgDetail,
  type OrgSummary,
} from '@/lib/actions/super-admin'

interface Props {
  initialOrgs: OrgSummary[]
}

export function SuperAdminApp({ initialOrgs }: Props) {
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
    <div className="min-h-screen px-lg py-10 2xl:px-xl">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Super Admin</h1>
            <p className="text-sm text-muted-foreground">전체 조직 관리. super_admin 전용.</p>
          </div>
          <a href="/cases" className="text-sm text-muted-foreground hover:text-foreground underline">
            ← 대시보드로
          </a>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-md py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 좌: 조직 목록 + 생성 폼 */}
          <section className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-border/60 bg-card p-md">
              <h2 className="font-medium text-base mb-2">조직 ({orgs.length})</h2>
              {orgs.length === 0 ? (
                <p className="text-sm text-muted-foreground">조직이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                  {orgs.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => select(o.id)}
                        disabled={pending}
                        className={`w-full text-left px-md py-2 transition-colors hover:bg-muted/60 ${
                          selected?.id === o.id ? 'bg-muted/60' : ''
                        }`}
                      >
                        <div className="text-sm font-medium truncate">{o.name}</div>
                        <div className="text-xs text-muted-foreground">
                          멤버 {o.member_count} · 대기 초대 {o.pending_invite_count}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-md">
              <h2 className="font-medium text-base mb-2">새 조직 생성</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="조직 이름"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="flex-1 px-md py-2 text-sm rounded-md border border-border/60 bg-background"
                  disabled={pending}
                />
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={pending || !newOrgName.trim()}
                  className="px-md py-2 text-sm rounded-md bg-accent hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  생성
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                생성 후 해당 조직에 멤버를 초대하려면 멤버 가입이 필요합니다. 본인(super_admin)은 별도 membership 없이도 모든 조직 접근 가능.
              </p>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              새로고침
            </button>
          </section>

          {/* 우: 선택된 조직 상세 */}
          <section className="lg:col-span-3">
            {!selected ? (
              <div className="rounded-xl border border-border/60 bg-card p-xl text-center text-sm text-muted-foreground">
                왼쪽에서 조직을 선택하세요.
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-card p-md space-y-6">
                <header>
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{selected.id}</p>
                  <p className="text-xs text-muted-foreground">
                    생성: {new Date(selected.created_at).toLocaleDateString()}
                  </p>
                </header>

                <section>
                  <h3 className="font-medium text-sm mb-2">멤버 ({selected.members.length})</h3>
                  {selected.members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">멤버 없음</p>
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                      {selected.members.map((m) => (
                        <li
                          key={m.user_id}
                          className="px-md py-2 flex items-center justify-between gap-md"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{m.name || m.email}</div>
                            <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {m.role}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="font-medium text-sm mb-2">
                    대기 초대 ({selected.invites.length})
                  </h3>
                  {selected.invites.length === 0 ? (
                    <p className="text-sm text-muted-foreground">대기 중 초대 없음</p>
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                      {selected.invites.map((i) => (
                        <li
                          key={i.id}
                          className="px-md py-2 flex items-center justify-between gap-md"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{i.email}</div>
                            <div className="text-xs text-muted-foreground">
                              {i.role} · 만료{' '}
                              {new Date(i.expires_at).toLocaleDateString()}
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
  )
}
