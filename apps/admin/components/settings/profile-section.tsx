'use client'

import { useEffect, useState, useTransition } from 'react'
import { getMyProfile, updateMyProfile, type MyProfile } from '@/lib/actions/profile'
import { updateMyDmVisibility } from '@/lib/actions/chat'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'

function formatSavedAgo(date: Date | null): string {
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return '자동 저장됨 · 방금 전'
  if (sec < 60) return `자동 저장됨 · ${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `자동 저장됨 · ${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `자동 저장됨 · ${hour}시간 전`
  return `자동 저장됨 · ${date.toLocaleDateString()}`
}

function displayName(p: MyProfile | null): string {
  if (!p) return ''
  if (!p.name || p.name === p.email) return ''
  return p.name
}

export function ProfileSection({
  initialProfile = null,
}: {
  initialProfile?: MyProfile | null
} = {}) {
  const [profile, setProfile] = useState<MyProfile | null>(initialProfile)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [, setTick] = useState(0)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (initialProfile && !profile) setProfile(initialProfile)
  }, [initialProfile])

  useEffect(() => {
    if (profile || initialProfile) return
    let alive = true
    getMyProfile().then((p) => { if (alive) setProfile(p) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!lastSaved) return
    const id = setInterval(() => setTick((n) => n + 1), 10_000)
    return () => clearInterval(id)
  }, [lastSaved])

  function handleSave() {
    if (!profile || draft === null) return
    const current = displayName(profile)
    if (draft === current) {
      setDraft(null)
      return
    }
    setSaving(true)
    setError(null)
    startTransition(async () => {
      const r = await updateMyProfile({ name: draft })
      setSaving(false)
      if (r.ok) {
        setProfile(r.profile)
        setDraft(null)
        setLastSaved(new Date())
      } else {
        setError(r.error)
      }
    })
  }

  if (!profile) {
    return (
      <div className="max-w-3xl">
        <p className="font-serif italic text-sm text-muted-foreground">불러오는 중…</p>
      </div>
    )
  }

  const nameValue = draft ?? displayName(profile)

  return (
    <div className="max-w-3xl pb-2xl">
      {/* Header */}
      <header className="pb-xl">
        <SectionHeader>내 프로필</SectionHeader>
      </header>

      {/* Profile fields */}
      <section className="mb-xl">
        <SectionLabel>Account</SectionLabel>
        <div className="border-t border-border/80">
          {/* Name (editable) */}
          <div className="grid grid-cols-[150px_1fr] items-baseline gap-md py-3 border-b border-dotted border-border/80">
            <label className="font-serif text-[13px] text-muted-foreground pt-0.5 leading-none">
              이름
            </label>
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setDraft(null)
              }}
              placeholder="—"
              className={cn(
                'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 transition-colors placeholder:text-muted-foreground/30',
                saving && 'opacity-60',
              )}
            />
          </div>

          {/* Email (read-only) */}
          <div className="grid grid-cols-[150px_1fr] items-baseline gap-md py-3 border-b border-dotted border-border/80">
            <label className="font-serif text-[13px] text-muted-foreground pt-0.5 leading-none">
              이메일
            </label>
            <div className="flex items-baseline gap-xs">
              <span className="font-serif text-[15px] text-foreground">{profile.email}</span>
              <span className="font-mono text-[10px] tracking-[1.3px] uppercase text-muted-foreground/60">
                인증됨
              </span>
            </div>
          </div>

          {/* Provider (read-only) */}
          {profile.provider && (
            <div className="grid grid-cols-[150px_1fr] items-baseline gap-md py-3 border-b border-dotted border-border/80">
              <label className="font-serif text-[13px] text-muted-foreground pt-0.5 leading-none">
                로그인 방식
              </label>
              <span className="font-serif text-[15px] text-muted-foreground">
                {providerLabel(profile.provider)}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* DM visibility toggle */}
      <section className="mb-xl">
        <SectionLabel>Messaging</SectionLabel>
        <div className="border-t border-border/80">
          <DmVisibilityRow
            value={profile.dm_visible}
            onChange={(next) => setProfile((p) => (p ? { ...p, dm_visible: next } : p))}
            onError={(msg) => setError(msg)}
            onSaved={() => setLastSaved(new Date())}
          />
        </div>
      </section>

      {error && (
        <p className="font-serif text-[13px] text-destructive mb-md">{error}</p>
      )}

      {/* Footer — save status */}
      <div className="flex items-center justify-end pt-md border-t border-border/80">
        <span className="font-serif italic text-[12px] text-muted-foreground/60">
          {formatSavedAgo(lastSaved)}
        </span>
      </div>
    </div>
  )
}

function providerLabel(provider: string): string {
  switch (provider) {
    case 'email': return '이메일 · 비밀번호'
    case 'google': return 'Google'
    case 'kakao': return 'Kakao'
    case 'naver': return 'Naver'
    default: return provider
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <span className="font-mono text-[11px] tracking-[1.8px] uppercase text-muted-foreground/70">
        {children}
      </span>
    </div>
  )
}

function DmVisibilityRow({
  value,
  onChange,
  onError,
  onSaved,
}: {
  value: boolean
  onChange: (next: boolean) => void
  onError: (msg: string | null) => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !value
    onChange(next)
    onError(null)
    startTransition(async () => {
      const r = await updateMyDmVisibility({ visible: next })
      if (!r.ok) {
        onChange(!next)
        onError(r.error)
      } else {
        onSaved()
      }
    })
  }

  return (
    <div className="grid grid-cols-[150px_1fr] items-baseline gap-md py-3 border-b border-dotted border-border/80">
      <label className="font-serif text-[13px] text-muted-foreground pt-0.5 leading-none">
        검색 노출
      </label>
      <div className="flex items-baseline gap-md">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={cn(
            'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
            value
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            pending && 'opacity-60',
          )}
        >
          {value ? '검색 노출' : '검색 숨김'}
        </button>
        <span className="font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed">
          끄면 다른 사용자가 새 대화 만들기에서 본인을 찾을 수 없습니다. 기존 대화는 영향 없음.
        </span>
      </div>
    </div>
  )
}
