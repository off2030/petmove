'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/portal-shell/theme-provider'

/**
 * 개발 전용 — '주의' 상태색(--pm-warn) 후보 비교 스위처. 실제 화면(배지·칩·상세 카드)에
 * 라이브로 반영해 보고 결정하기 위함. 결정 나면 이 파일과 Shell 마운트를 제거하고
 * globals.css 의 --pm-warn 라이트/다크 값을 확정 값으로 바꿀 것.
 * (안내 --pm-info 는 2026-07-12 '맑은 슬레이트'로 확정되어 후보 제거됨.)
 *
 * documentElement 인라인 style 로 토큰을 덮어써 color-mix(...) 파생색(warnBg 등)도
 * 함께 재계산된다. 라이트/다크는 useTheme().resolved 로 추적.
 */

const WARN_CANDIDATES = [
  { id: 'current', label: '지금(테라코타)', light: '#C26A4A', dark: '#D67E5C' },
  { id: 'yellow', label: '순수 노랑', light: '#EAB308', dark: '#FACC15' },
  { id: 'gold', label: '골드 앰버', light: '#D97706', dark: '#F59E0B' },
  { id: 'orange', label: '오렌지 앰버', light: '#E5A100', dark: '#F5B400' },
] as const

export function WarnColorSwitcher() {
  const { resolved } = useTheme()
  const [selected, setSelected] = useState<string>('current')

  useEffect(() => {
    const candidate = WARN_CANDIDATES.find((c) => c.id === selected)
    if (!candidate) return
    document.documentElement.style.setProperty('--pm-warn', candidate[resolved])
    return () => {
      document.documentElement.style.removeProperty('--pm-warn')
    }
  }, [selected, resolved])

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
      <span style={{ fontSize: 10, color: '#fff', opacity: 0.6, padding: '0 2px' }}>주의 색 후보</span>
      {WARN_CANDIDATES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setSelected(c.id)}
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
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 6,
              background: c[resolved],
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, color: '#fff', whiteSpace: 'nowrap' }}>{c.label}</span>
        </button>
      ))}
    </div>
  )
}
