'use client'

import type { CSSProperties } from 'react'
import type { CaseRow } from '@petmove/domain'
import { avatarGlyph, avatarGradient, avatarIsEmoji } from '@/lib/avatar'

/**
 * 읽기 전용 펫 아바타 — 설정 hub 의 동물 카드 등 미리보기용.
 * 인터랙티브 picker 는 PetAvatarPicker 가 담당 (상세 페이지에서).
 * 시각은 PetAvatarPicker 의 hero 원과 동일 — gradient + glyph/emoji 흰색.
 */
export function PetAvatarDisplay({
  case_,
  size = 52,
  index,
}: {
  case_: CaseRow
  size?: number
  index?: number
}) {
  const isEmoji = avatarIsEmoji(case_)
  const circleStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: avatarGradient(case_, index),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.06)',
  }
  const glyphStyle: CSSProperties = {
    color: '#fff',
    fontFamily: isEmoji
      ? "-apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
      : 'var(--pm-font-display)',
    fontWeight: 600,
    fontSize: isEmoji ? Math.round(size * 0.5) : Math.round(size * 0.36),
    lineHeight: 1,
  }
  return (
    <div style={circleStyle}>
      <span style={glyphStyle}>{avatarGlyph(case_)}</span>
    </div>
  )
}
