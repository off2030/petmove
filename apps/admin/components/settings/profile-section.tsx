'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getMyProfile, updateMyProfile, type MyProfile } from '@/lib/actions/profile'
import {
  SettingsActionButton,
  SettingsCard,
  SettingsControlGroup,
  SettingsShell,
  SettingsSection,
  SettingsFooter,
  SettingsField,
  formatSavedAgo,
} from './settings-layout'
import { Avatar, avatarInitial } from '@/components/ui/avatar'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { resizeSquareJpeg } from '@/lib/image/resize-avatar'
import { cn } from '@/lib/utils'

const AVATAR_MAX_BYTES = 20 * 1024 * 1024
const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

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
  const router = useRouter()
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
        // dashboard layout 의 conversations / topbar avatar 갱신.
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  if (!profile) {
    return (
      <SettingsShell>
        <p className="font-serif text-sm text-muted-foreground">불러오는 중…</p>
      </SettingsShell>
    )
  }

  const nameValue = draft ?? displayName(profile)

  return (
    <SettingsShell>
      <SettingsSection title="내 프로필">
        <div className="space-y-lg">
        {/* Profile fields */}
        <SettingsCard title="계정">
          <div>
            {/* Avatar */}
            <AvatarRow
              profile={profile}
              onChange={(url) =>
                setProfile((p) => (p ? { ...p, avatar_url: url } : p))
              }
              onSaved={() => setLastSaved(new Date())}
              onError={(msg) => setError(msg)}
            />
            {/* Name (editable) */}
            <SettingsField label="이름">
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
            </SettingsField>

            {/* Email (read-only) */}
            <SettingsField label="이메일">
              <div className="flex items-baseline gap-xs">
                <span className="font-serif text-[15px] text-foreground">{profile.email}</span>
                <span className="font-mono text-[10px] tracking-[1.3px] uppercase text-muted-foreground/60">
                  인증됨
                </span>
              </div>
            </SettingsField>

            {/* '로그인 방식' 행 제거(2026-08-06) — 읽기 전용인데다 이메일 로그인을
                '로그인 링크'로 표기해 실제(인증번호)와 어긋나 있었다. */}
          </div>
        </SettingsCard>

        {/* '알림' 카드 제거(2026-08-06) — 브라우저 푸시는 구독만 저장될 뿐 서버에
            발송 코드가 없어(라이브러리 제거 시 함께 사라짐) 켜도 알림이 오지 않는다.
            발송 인프라를 붙일 때 PushPermission 과 함께 되살릴 것. */}
        </div>

        {error && (
          <p className="font-serif text-[13px] text-destructive mt-md">{error}</p>
        )}
      </SettingsSection>

      <SettingsFooter className="border-t-0">
        <span className="font-serif text-[12px] text-muted-foreground/60">
          {formatSavedAgo(lastSaved)}
        </span>
      </SettingsFooter>
    </SettingsShell>
  )
}

function AvatarRow({
  profile,
  onChange,
  onSaved,
  onError,
}: {
  profile: MyProfile
  onChange: (url: string | null) => void
  onSaved: () => void
  onError: (msg: string | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const label = avatarInitial(profile.name || profile.email || '?')

  function pickFile() {
    fileInputRef.current?.click()
  }

  async function handleFile(file: File) {
    if (file.size > AVATAR_MAX_BYTES) {
      onError(`파일이 너무 큽니다 (최대 20MB). 현재 ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      return
    }
    setBusy(true)
    onError(null)
    try {
      let blob: Blob
      try {
        blob = await resizeSquareJpeg(file)
      } catch (e) {
        onError(`이미지 처리 실패: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      const path = `${profile.id}/${crypto.randomUUID()}.jpg`
      const up = await supabaseBrowser.storage
        .from('user-avatars')
        .upload(path, blob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' })
      if (up.error) {
        onError(`업로드 실패: ${up.error.message}`)
        return
      }
      const { data: pub } = supabaseBrowser.storage.from('user-avatars').getPublicUrl(path)
      const publicUrl = pub.publicUrl
      const oldUrl = profile.avatar_url
      const r = await updateMyProfile({ avatar_url: publicUrl })
      if (!r.ok) {
        onError(r.error)
        await supabaseBrowser.storage.from('user-avatars').remove([path])
        return
      }
      onChange(publicUrl)
      onSaved()
      // 이전 파일 정리 (실패해도 무시)
      if (oldUrl) {
        const oldPath = oldUrl.split('/user-avatars/')[1]
        if (oldPath) await supabaseBrowser.storage.from('user-avatars').remove([oldPath])
      }
    } finally {
      setBusy(false)
    }
  }

  function handleRemove() {
    const oldUrl = profile.avatar_url
    if (!oldUrl) return
    setBusy(true)
    onError(null)
    startTransition(async () => {
      const r = await updateMyProfile({ avatar_url: null })
      setBusy(false)
      if (!r.ok) {
        onError(r.error)
        return
      }
      onChange(null)
      onSaved()
      const oldPath = oldUrl.split('/user-avatars/')[1]
      if (oldPath) await supabaseBrowser.storage.from('user-avatars').remove([oldPath])
    })
  }

  return (
    <SettingsField label="프로필 이미지" align="center">
      <SettingsControlGroup size="md" className="gap-md">
        <div className="relative">
          <Avatar
            label={label}
            imageUrl={profile.avatar_url}
            size="md"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.target.value = ''
          }}
        />
        <SettingsActionButton onClick={pickFile} disabled={busy}>
          {profile.avatar_url ? '이미지 변경' : '이미지 업로드'}
        </SettingsActionButton>
        {profile.avatar_url && (
          <SettingsActionButton variant="destructive" onClick={handleRemove} disabled={busy}>
            제거
          </SettingsActionButton>
        )}
      </SettingsControlGroup>
    </SettingsField>
  )
}

