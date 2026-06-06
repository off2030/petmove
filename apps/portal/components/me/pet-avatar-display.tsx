'use client'

import type { CSSProperties } from 'react'
import type { CaseRow } from '@petmove/domain'
import { avatarGlyph, avatarGlyphColor, avatarGradient, avatarPhoto } from '@/lib/avatar'

/**
 * 읽기 전용 펫 아바타 — 설정 hub 의 동물 카드 등 미리보기용.
 * 인터랙티브 picker 는 PetAvatarPicker 가 담당 (상세 페이지에서).
 * 우선순위: 사진 > 색상 원 + 이름 이니셜 (보호자 아바타와 동일 모델).
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
  const photo = avatarPhoto(case_)
  const circleStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: photo ? '#0000' : avatarGradient(case_, index),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    boxShadow: photo ? 'none' : 'inset 0 1px 1px rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.06)',
  }
  if (photo) {
    return (
      <div style={circleStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  const glyphStyle: CSSProperties = {
    color: avatarGlyphColor(case_, index),
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    fontSize: Math.round(size * 0.36),
    lineHeight: 1,
  }
  return (
    <div style={circleStyle}>
      <span style={glyphStyle}>{avatarGlyph(case_)}</span>
    </div>
  )
}
