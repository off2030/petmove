'use client'

import { useEffect, useState } from 'react'

/**
 * PETMOVE 로고 마크 — 상단바 좌측. PetMove-icon-3A 원안(하늘 그라데이션 + 흰 구름 언덕)
 * + 타일 플로팅 섀도. 색은 아이콘 원본 고정(하늘 블루) — 다크에서도 그대로.
 *
 * 개발 전용 variant 비교(2026-07-12 재시도): '떠오르는 P'(노란 P가 구름 뒤에서 떠오름)
 * 1·2안 — LogoSwitcher(components/dev) 가 localStorage['pm-dev-logo'] + 커스텀 이벤트로
 * 전환. 프로덕션은 항상 구름 원안. 확정되면 variant 분기·스위처 제거.
 */

export type LogoVariant = 'cloud' | 'rising1' | 'rising2'

export const LOGO_DEV_KEY = 'pm-dev-logo'
export const LOGO_DEV_EVENT = 'pm-dev-logo-change'

function readDevVariant(): LogoVariant {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return 'cloud'
  const v = window.localStorage.getItem(LOGO_DEV_KEY)
  return v === 'rising1' || v === 'rising2' ? v : 'cloud'
}

export function LogoMark({ size = 22 }: { size?: number }) {
  // hydration mismatch 방지 — 서버/첫 렌더는 'cloud', mount 후 dev 선택 반영.
  const [variant, setVariant] = useState<LogoVariant>('cloud')
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    setVariant(readDevVariant())
    const onChange = () => setVariant(readDevVariant())
    window.addEventListener(LOGO_DEV_EVENT, onChange)
    return () => window.removeEventListener(LOGO_DEV_EVENT, onChange)
  }, [])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      // 타일 그림자가 svg 캔버스 밖으로 번지도록 — 기본(hidden)이면 그림자가 잘린다.
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <defs>
        <clipPath id="pm-logo-sq">
          <rect width="200" height="200" rx="46" />
        </clipPath>
        <linearGradient id="pm-logo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#63C9FF" />
          <stop offset="1" stopColor="#0BAEFF" />
        </linearGradient>
        {/* 타일 플로팅 섀도 — 클리핑된 결과(둥근 사각) 전체가 그림자를 드리운다. */}
        <filter id="pm-logo-float" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#0868A8" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#pm-logo-float)">
        <g clipPath="url(#pm-logo-sq)">
          <rect width="200" height="200" fill="url(#pm-logo-sky)" />
          {/* 떠오르는 P — 노란 P 가 구름 언덕 뒤에서 해처럼 떠오른다(구름보다 먼저 그려 뒤로).
              1안=수평선 걸침, 2안=한 뼘 더 떠오름(translate -16). */}
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
      </g>
    </svg>
  )
}
