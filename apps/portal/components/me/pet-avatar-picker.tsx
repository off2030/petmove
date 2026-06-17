'use client'


import { C } from '@/lib/palette'
import { useRef, useState, useTransition } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { updateCaseAvatar } from '@/lib/actions/cases'
import {
  AVATAR_COLOR_IDS,
  AVATAR_GRADIENTS,
  avatarColorId,
  avatarGlyph,
  avatarGlyphColor,
  avatarGradient,
  type AvatarColorId,
} from '@/lib/avatar'
import { resizeImage } from '@/lib/image'

/**
 * /me 동물 카드의 hero 행 — 보호자 아바타(GuardianAvatarPicker)와 동일 모델.
 * 우선순위: 사진 > 색상 원 + 이름 이니셜. (이모지 picker 제거.)
 *
 * - 아바타 자체가 hero 의 큰 원형(52px). 탭하면 인라인으로 사진·색상 picker 펼침.
 * - 사진 업로드는 user-avatars 버킷({user_id}/pets/{caseId}/...)으로 직접 — RLS 통과.
 *   URL 은 updateCaseAvatar 의 user-avatars 도메인 검증을 통과해 cases.avatar_photo_url 저장.
 * - 선택 즉시 server action → 응답 case 로 Context 업데이트(헤더 스위처도 동시 갱신).
 */


export function PetAvatarPicker({ case_ }: { case_: CaseRow }) {
  const { cases, profile, updateCase } = useCases()
  const idx = cases.findIndex((c) => c.id === case_.id)
  const userId = profile?.user_id ?? ''

  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentColor: AvatarColorId | null = (case_.avatar_color as AvatarColorId | null) ?? null
  const currentPhoto = case_.avatar_photo_url || null

  function commit(patch: Parameters<typeof updateCaseAvatar>[1]) {
    setError(null)
    startTransition(async () => {
      const r = await updateCaseAvatar(case_.id, patch)
      if (r.ok) updateCase(r.value)
      else setError(r.error)
    })
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    if (!userId) {
      setError('로그인 정보를 확인할 수 없습니다.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const blob = await resizeImage(file, 400, 0.85)
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const path = `${userId}/pets/${case_.id}/${id}.jpg`
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
      const r = await updateCaseAvatar(case_.id, { avatar_photo_url: pub.publicUrl })
      if (r.ok) updateCase(r.value)
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
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: currentPhoto ? '#0000' : avatarGradient(case_, idx),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: currentPhoto
              ? 'none'
              : 'inset 0 1px 1px rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.06)',
          }}
        >
          {currentPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span
              style={{
                color: avatarGlyphColor(case_, idx),
                fontFamily: 'var(--pm-font-display)',
                fontWeight: 500,
                fontSize: Math.round(52 * 0.36),
                lineHeight: 1,
              }}
            >
              {avatarGlyph(case_)}
            </span>
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
            case_={case_}
            index={idx}
            currentColor={currentColor}
            currentPhoto={currentPhoto}
            busy={busy}
            onPickColor={(c) => commit({ avatar_color: c })}
            onResetColor={() => commit({ avatar_color: null })}
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
          {error && <div style={{ fontSize: 12, color: '#B45C5C' }}>{error}</div>}
        </>
      )}
    </div>
  )
}

// ── Picker grid ─────────────────────────────────────────────────────────

function PickerGrid({
  case_,
  index,
  currentColor,
  currentPhoto,
  busy,
  onPickColor,
  onResetColor,
  onPickPhotoClick,
  onRemovePhoto,
}: {
  case_: CaseRow
  index: number
  currentColor: AvatarColorId | null
  currentPhoto: string | null
  busy: boolean
  onPickColor: (c: AvatarColorId) => void
  onResetColor: () => void
  onPickPhotoClick: () => void
  onRemovePhoto: () => void
}) {
  const monoCap: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
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

  // '기본' 색 = avatar_color 미설정 시 실제 적용되는 cyclic/hash 색 — 그 색을 미리보기로.
  const defaultColor = avatarColorId({ id: case_.id, avatar_color: null }, index)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: busy ? 0.6 : 1 }}>
      <div style={monoCap}>사진</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" disabled={busy} onClick={onPickPhotoClick} style={actionBtn}>
          {currentPhoto ? '사진 바꾸기' : '사진 올리기'}
        </button>
        {currentPhoto && (
          <button type="button" disabled={busy} onClick={onRemovePhoto} style={{ ...actionBtn, color: C.ink3 }}>
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
                  ? '0 0 0 1.5px var(--pm-surface), 0 0 0 3px #735B3D'
                  : 'inset 0 1px 1px rgba(255,255,255,.25)',
              }}
            />
          )
        })}
        {/* 기본(색상 자동) — 다른 swatch 와 동일한 원형. 실제 자동색 미리보기 + 사선으로 "자동". */}
        <button
          type="button"
          disabled={busy}
          onClick={onResetColor}
          aria-label="기본 색상"
          aria-pressed={currentColor === null}
          style={{
            ...slotBase,
            background: AVATAR_GRADIENTS[defaultColor],
            boxShadow:
              currentColor === null
                ? '0 0 0 1.5px var(--pm-surface), 0 0 0 3px #735B3D'
                : `inset 0 0 0 .5px ${C.line}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
