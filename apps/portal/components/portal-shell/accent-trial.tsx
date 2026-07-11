'use client'

import { useState } from 'react'

/**
 * 배경↔카드 반전 비교 스위처 — 개발 모드 전용 (프로덕션 빌드에선 렌더 안 됨).
 * 라이트 테마 한정: '반전(기본)' = 회색 캔버스 + 흰 카드 / '흰 배경' = 흰 캔버스 + 회색 카드.
 * 방향 확정 후 이 파일과 layout 의 <AccentTrial /> 을 함께 삭제할 것.
 * (색 후보 스위처는 트래블월렛 블루 #0BAEFF 채택 방향으로 정리하며 제거 — 2026-07-11.)
 */

const MODES: {
  name: string
  vars: Record<string, string>
}[] = [
  {
    name: '반전(기본)',
    vars: {
      '--pm-bg': '#F4F6F8',
      '--pm-bg-rgb': '244 246 248',
      '--pm-card-soft': '#FFFFFF',
      '--pm-card-list': '#FFFFFF',
      '--pm-card-hero': '#FFFFFF',
      '--pm-card-sage-base': '#FFFFFF',
    },
  },
  {
    name: '흰 배경',
    vars: {
      '--pm-bg': '#FFFFFF',
      '--pm-bg-rgb': '255 255 255',
      '--pm-card-soft': '#F7F7F8',
      '--pm-card-list': '#F7F7F8',
      '--pm-card-hero': '#F7F7F8',
      '--pm-card-sage-base': '#F7F7F8',
    },
  },
]

export function AccentTrial() {
  const [active, setActive] = useState(0)
  if (process.env.NODE_ENV !== 'development') return null

  function apply(i: number) {
    setActive(i)
    for (const [k, v] of Object.entries(MODES[i].vars)) {
      document.documentElement.style.setProperty(k, v)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 14,
        bottom: 96,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
      }}
    >
      {MODES.map((m, i) => (
        <button
          key={m.name}
          type="button"
          onClick={() => apply(i)}
          style={{
            padding: '5px 10px',
            borderRadius: 999,
            border: 'none',
            background: active === i ? '#212124' : 'transparent',
            color: active === i ? '#FFFFFF' : '#5C5C60',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {m.name}
        </button>
      ))}
    </div>
  )
}
