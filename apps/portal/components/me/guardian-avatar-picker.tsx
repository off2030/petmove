'use client'


import { C as PM } from '@/lib/palette'
import { useRef, useState, useTransition } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import {
  AVATAR_COLOR_IDS,
  AVATAR_GRADIENTS,
  avatarTextColor,
  isAvatarColorId,
  type AvatarColorId,
} from '@/lib/avatar'
import { resizeImage } from '@/lib/image'
import { updateMyProfile, type CustomerProfileRow } from '@/lib/actions/profile'

/**
 * 보호자 아바타 picker — PetAvatarPicker 의 패턴 + 사진 업로드 옵션.
 *
 * 표시 우선순위: avatar_photo_url > avatar_emoji + avatar_color > 이니셜(기본).
 * 사진 업로드는 user-avatars bucket (RLS: 본인 폴더만 INSERT 허용) 으로 직접 — server 액션
 * 우회. URL 은 updateMyProfile 의 user-avatars 도메인 검증을 통과해 저장.
 */

interface Props {
  profile: CustomerProfileRow | null
  userId: string
  /** 이니셜 (한글 이름 끝 2자 등). photo·emoji 둘 다 없을 때 표시. */
  initials: string
  onUpdated: (profile: CustomerProfileRow) => void
}

const C = {
  ...PM,
  accentSoft: 'var(--pm-accent-soft)',
} as const

export function GuardianAvatarPicker({ profile, userId, initials, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentColor: AvatarColorId | null = isAvatarColorId(profile?.avatar_color ?? null)
    ? (profile!.avatar_color as AvatarColorId)
    : null
  const currentPhoto = profile?.avatar_photo_url ?? null

  function commit(patch: Parameters<typeof updateMyProfile>[0]) {
    setError(null)
    startTransition(async () => {
      const r = await updateMyProfile(patch)
      if (r.ok) onUpdated(r.value)
      else setError(r.error)
    })
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const blob = await resizeImage(file, 400, 0.85)
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const path = `${userId}/${id}.jpg`
      const { error: upErr } = await supabaseBrowser.storage.from('user-avatars').upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      })
      if (upErr) {
        setError(upErr.message)
        return
      }
      const { data: pub } = supabaseBrowser.storage.from('user-avatars').getPublicUrl(path)
      const r = await updateMyProfile({ avatar_photo_url: pub.publicUrl })
      if (r.ok) onUpdated(r.value)
      else setError(r.error)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const busy = pending || uploading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 헤더 영역 전체가 토글 — 아바타·텍스트 어느 쪽 눌러도 picker 열림/닫힘. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="프로필 이미지 변경"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
        className="pm-pressable"
        style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
      >
        <div
          style={{
            ...avatarCircleStyle(52, currentColor, currentPhoto),
            overflow: 'hidden',
          }}
        >
          {currentPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={glyphSpanStyle(52, currentColor)}>{initials}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.ink2, fontWeight: 500 }}>
            {open ? '사진·색상 선택' : '프로필 이미지 설정'}
          </div>
        </div>
      </div>

      {open && (
        <>
          <div style={{ height: 0.5, background: C.line }} />
          <PickerGrid
            currentColor={currentColor}
            currentPhoto={currentPhoto}
            busy={busy}
            onPickColor={(c) => commit({ avatar_color: c })}
            onPickPhotoClick={() => fileRef.current?.click()}
            onRemovePhoto={() => commit({ avatar_photo_url: null })}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          {error && (
            <div style={{ fontSize: 12, color: PM.warn }}>{error}</div>
          )}
        </>
      )}
    </div>
  )
}

// ── Picker grid ─────────────────────────────────────────────────────────

function PickerGrid({
  currentColor,
  currentPhoto,
  busy,
  onPickColor,
  onPickPhotoClick,
  onRemovePhoto,
}: {
  currentColor: AvatarColorId | null
  currentPhoto: string | null
  busy: boolean
  onPickColor: (c: AvatarColorId) => void
  onPickPhotoClick: () => void
  onRemovePhoto: () => void
}) {
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    color: C.ink3,
    fontWeight: 600,
  }
  const slotBase: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 'none',
    cursor: busy ? 'progress' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
    transition: 'transform .15s, box-shadow .15s',
  }
  const actionBtn: React.CSSProperties = {
    height: 32,
    padding: '0 14px',
    borderRadius: 999,
    border: `.5px solid ${C.line}`,
    background: C.surface,
    color: C.ink,
    fontSize: 12,
    fontWeight: 500,
    cursor: busy ? 'progress' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: busy ? 0.6 : 1 }}>
      <div style={monoCap}>사진</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" disabled={busy} onClick={onPickPhotoClick} style={actionBtn}>
          {currentPhoto ? '사진 바꾸기' : '사진 올리기'}
        </button>
        {currentPhoto && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemovePhoto}
            // '사진 바꾸기' 와 같은 actionBtn 톤으로 통일. destructive 는 색만 약하게.
            style={{ ...actionBtn, color: C.ink3 }}
          >
            사진 제거
          </button>
        )}
      </div>

      <div style={{ ...monoCap, marginTop: 4 }}>색상</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {AVATAR_COLOR_IDS.map((id) => {
          const selected = currentColor === id
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => onPickColor(id)}
              aria-label={`색상 ${id}`}
              aria-pressed={selected}
              style={{
                ...slotBase,
                background: AVATAR_GRADIENTS[id],
                boxShadow: selected
                  ? '0 0 0 1.5px var(--pm-surface), 0 0 0 3px var(--pm-ink)'
                  : 'inset 0 1px 1px rgba(255,255,255,.25)',
              }}
            />
          )
        })}
        {/* '색상 해제(사선)' 버튼 제거(2026-07-11) — 기본값이 곧 브랜드 하늘이라 해제와
            하늘색 선택이 사실상 동일, 의미 전달 안 되는 미스터리 버튼이었음. */}
      </div>
    </div>
  )
}

// ── Avatar circle 스타일 ─────────────────────────────────────────────────

function avatarCircleStyle(
  size: number,
  color: AvatarColorId | null,
  photo: string | null,
): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    background: photo
      ? '#0000'
      : color
        ? AVATAR_GRADIENTS[color]
        : 'var(--pm-accent-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: photo ? 'none' : 'inset 0 1px 1px rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.06)',
  }
}

function glyphSpanStyle(size: number, color: AvatarColorId | null): React.CSSProperties {
  return {
    color: avatarTextColor(color),
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    fontSize: Math.round(size * 0.36),
    lineHeight: 1,
  }
}
