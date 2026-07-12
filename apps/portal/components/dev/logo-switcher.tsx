'use client'

import { useEffect, useState } from 'react'
import {
  LOGO_DEV_EVENT,
  LOGO_DEV_KEY,
  type LogoVariant,
} from '@/components/portal-shell/logo-mark'

/**
 * 개발 전용 — 로고 variant 비교 스위처(구름 원안 vs 떠오르는 P 1·2안).
 * localStorage + 커스텀 이벤트로 상단바 LogoMark 가 라이브 전환된다.
 * 확정되면 이 파일·Shell 마운트·LogoMark 의 variant 분기를 제거할 것.
 */

const CANDIDATES: { id: LogoVariant; label: string }[] = [
  { id: 'cloud', label: '구름 (현재)' },
  { id: 'rising1', label: '떠오르는 P-1' },
  { id: 'rising2', label: '떠오르는 P-2 (더 위)' },
]

export function LogoSwitcher() {
  const [selected, setSelected] = useState<LogoVariant>('cloud')

  useEffect(() => {
    const v = window.localStorage.getItem(LOGO_DEV_KEY)
    if (v === 'rising1' || v === 'rising2') setSelected(v)
  }, [])

  function select(id: LogoVariant) {
    setSelected(id)
    window.localStorage.setItem(LOGO_DEV_KEY, id)
    window.dispatchEvent(new Event(LOGO_DEV_EVENT))
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 96,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        borderRadius: 14,
        background: 'rgba(20,20,22,0.85)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      }}
    >
      <span style={{ fontSize: 10, color: '#fff', opacity: 0.6, padding: '0 2px' }}>로고 후보</span>
      {CANDIDATES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => select(c.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            borderRadius: 10,
            border: selected === c.id ? '1.5px solid #fff' : '1px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <MiniLogo variant={c.id} />
          <span style={{ fontSize: 12, color: '#fff', whiteSpace: 'nowrap' }}>{c.label}</span>
        </button>
      ))}
    </div>
  )
}

/** 패널 안 미리보기용 미니 로고 — LogoMark 와 동일 구성(그림자 없이). */
function MiniLogo({ variant }: { variant: LogoVariant }) {
  const uid = `mini-${variant}`
  return (
    <svg width="20" height="20" viewBox="0 0 200 200" aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <clipPath id={`${uid}-sq`}>
          <rect width="200" height="200" rx="46" />
        </clipPath>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#63C9FF" />
          <stop offset="1" stopColor="#0BAEFF" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${uid}-sq)`}>
        <rect width="200" height="200" fill={`url(#${uid}-sky)`} />
        {variant !== 'cloud' && (
          <g transform={variant === 'rising2' ? 'translate(0,-16)' : undefined}>
            <path
              d="M116 150 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106"
              fill="none"
              stroke="#FFC93C"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
        <rect x="0" y="160" width="200" height="40" fill="#ffffff" />
        <circle cx="46" cy="168" r="52" fill="#ffffff" />
        <circle cx="72" cy="120" r="48" fill="#ffffff" />
        <circle cx="112" cy="148" r="34" fill="#ffffff" />
        <circle cx="146" cy="138" r="38" fill="#ffffff" />
        <circle cx="178" cy="154" r="24" fill="#ffffff" />
      </g>
    </svg>
  )
}
