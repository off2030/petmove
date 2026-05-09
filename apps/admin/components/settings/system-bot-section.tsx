'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ensurePetmoveBot,
  getPetmoveBotProfile,
  updatePetmoveBotProfile,
  uploadPetmoveBotAvatar,
  removePetmoveBotAvatar,
  type PetmoveBotProfile,
} from '@/lib/actions/petmove-bot'
import {
  SettingsShell,
  SettingsSection,
  SettingsField,
  SettingsSubsectionTitle as SectionLabel,
} from './settings-layout'
import { Avatar, avatarInitial } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const AVATAR_MAX_BYTES = 20 * 1024 * 1024
const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
const AVATAR_TARGET_PX = 512
const AVATAR_JPEG_QUALITY = 0.9

async function resizeAvatar(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
      el.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2
    const sy = (img.naturalHeight - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_TARGET_PX
    canvas.height = AVATAR_TARGET_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D 미지원 브라우저')
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_TARGET_PX, AVATAR_TARGET_PX)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('이미지 변환 실패'))),
        'image/jpeg',
        AVATAR_JPEG_QUALITY,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 펫무브워크 봇 프로필 — 슈퍼 어드민 전용. 시스템 메시지(검증 실패 알림 등)의 발신자.
 * 내 프로필과 동일한 형태(아바타 업로드 + 이름 인라인 편집).
 */
export function SystemBotSection() {
  const router = useRouter()
  const [profile, setProfile] = useState<PetmoveBotProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [creating, setCreating] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    void getPetmoveBotProfile().then((r) => {
      if (!alive) return
      if (r.ok) setProfile(r.value)
      else setError(r.error)
    })
    return () => { alive = false }
  }, [])

  function handleCreate() {
    setError(null)
    setCreating(true)
    startTransition(async () => {
      const r = await ensurePetmoveBot()
      if (!r.ok) {
        setCreating(false)
        setError(r.error)
        return
      }
      const p = await getPetmoveBotProfile()
      setCreating(false)
      if (p.ok) setProfile(p.value)
      else setError(p.error)
    })
  }

  function handleSaveName() {
    if (!profile || draftName === null) return
    if (draftName === profile.name) {
      setDraftName(null)
      return
    }
    setSavingName(true)
    setError(null)
    startTransition(async () => {
      const r = await updatePetmoveBotProfile({ name: draftName })
      setSavingName(false)
      if (r.ok) {
        setProfile(r.value)
        setDraftName(null)
        // dashboard layout 의 conversations prefetch 갱신 — 메시지 모듈 즉시 반영.
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  if (!profile) {
    return (
      <SettingsShell>
        {error ? (
          <p className="font-serif text-sm text-destructive">{error}</p>
        ) : (
          <p className="font-serif italic text-sm text-muted-foreground">불러오는 중…</p>
        )}
      </SettingsShell>
    )
  }

  if (!profile.exists) {
    return (
      <SettingsShell>
        <SettingsSection
          title="펫무브워크 봇"
          description="검증 실패 알림 등 시스템 메시지의 발신자 프로필. 슈퍼 어드민만 편집할 수 있습니다."
        >
          <div className="flex flex-col gap-md">
            <p className="font-serif text-[14px] text-muted-foreground">
              아직 봇 계정이 없습니다. 처음 한 번 생성해 주세요.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="self-start h-9 px-4 rounded-full border border-border/80 bg-card text-[14px] hover:border-foreground/40 transition-colors disabled:opacity-50"
            >
              {creating ? '생성 중…' : '봇 생성'}
            </button>
            {error && <p className="font-serif text-[13px] text-destructive">{error}</p>}
          </div>
        </SettingsSection>
      </SettingsShell>
    )
  }

  const nameValue = draftName ?? profile.name

  return (
    <SettingsShell>
      <SettingsSection
        title="펫무브워크 봇"
        description="검증 실패 알림 등 시스템 메시지의 발신자 프로필. 슈퍼 어드민만 편집할 수 있습니다."
      >
        <section className="mb-xl">
          <SectionLabel className="mb-2">계정</SectionLabel>
          <div className="border-t border-border/80">
            <BotAvatarRow
              profile={profile}
              onChange={(p) => setProfile(p)}
              onError={setError}
            />
            <SettingsField label="이름">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setDraftName(null)
                }}
                placeholder="—"
                className={cn(
                  'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 transition-colors placeholder:text-muted-foreground/30',
                  savingName && 'opacity-60',
                )}
              />
            </SettingsField>
          </div>
        </section>

        {error && <p className="font-serif text-[13px] text-destructive">{error}</p>}
      </SettingsSection>
    </SettingsShell>
  )
}

function BotAvatarRow({
  profile,
  onChange,
  onError,
}: {
  profile: PetmoveBotProfile
  onChange: (p: PetmoveBotProfile) => void
  onError: (msg: string | null) => void
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const label = avatarInitial(profile.name || '?')

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
        blob = await resizeAvatar(file)
      } catch (e) {
        onError(`이미지 처리 실패: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      const fd = new FormData()
      fd.set('file', blob, 'bot-avatar.jpg')
      const r = await uploadPetmoveBotAvatar(fd)
      if (!r.ok) {
        onError(r.error)
        return
      }
      onChange(r.value)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function handleRemove() {
    if (!profile.avatar_url) return
    setBusy(true)
    onError(null)
    startTransition(async () => {
      const r = await removePetmoveBotAvatar()
      setBusy(false)
      if (!r.ok) {
        onError(r.error)
        return
      }
      onChange(r.value)
      router.refresh()
    })
  }

  return (
    <SettingsField label="프로필 이미지" align="center">
      <div className="flex items-center gap-md">
        <div className="relative">
          <Avatar label={label} imageUrl={profile.avatar_url} size="md" bot />
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
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className={cn(
            'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
            'border-border/80 text-foreground hover:bg-muted/40',
            busy && 'opacity-60',
          )}
        >
          {profile.avatar_url ? '이미지 변경' : '이미지 업로드'}
        </button>
        {profile.avatar_url && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className={cn(
              'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
              'border-border/80 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40',
              busy && 'opacity-60',
            )}
          >
            제거
          </button>
        )}
        <span className="font-serif italic text-[12px] text-muted-foreground/70">
          PNG · JPG · WebP · GIF · 자동 512px 리사이즈
        </span>
      </div>
    </SettingsField>
  )
}
