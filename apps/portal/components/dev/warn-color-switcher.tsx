'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/portal-shell/theme-provider'

/**
 * 개발 전용 — '주의'(--pm-warn)·'안내'(--pm-info) 상태색 후보 비교 스위처.
 * 실제 화면(배지·칩·상세 카드)에 라이브로 반영해 보고 결정하기 위함. 결정 나면
 * 이 파일과 Shell 마운트를 제거하고 globals.css 의 해당 토큰을 확정 값으로 바꿀 것.
 *
 * documentElement 인라인 style 로 토큰을 덮어써 color-mix(...) 파생색(warnBg·infoBg 등)도
 * 함께 재계산된다. 라이트/다크는 useTheme().resolved 로 추적.
 */

const WARN_CANDIDATES = [
  { id: 'current', label: '지금(테라코타)', light: '#C26A4A', dark: '#D67E5C' },
  { id: 'yellow', label: '순수 노랑', light: '#EAB308', dark: '#FACC15' },
  { id: 'gold', label: '골드 앰버', light: '#D97706', dark: '#F59E0B' },
  { id: 'orange', label: '오렌지 앰버', light: '#E5A100', dark: '#F5B400' },
] as const

const INFO_CANDIDATES = [
  { id: 'current', label: '지금(슬레이트)', light: '#5E83A6', dark: '#84A6C6' },
  { id: 'clear', label: '맑은 슬레이트', light: '#4B8CBF', dark: '#7FB5DC' },
  { id: 'coolgray', label: '쿨 그레이', light: '#708CA0', dark: '#9AAEBC' },
] as const

function Section({
  title,
  candidates,
  selected,
  onSelect,
  resolved,
}: {
  title: string
  candidates: readonly { id: string; label: string; light: string; dark: string }[]
  selected: string
  onSelect: (id: string) => void
  resolved: 'light' | 'dark'
}) {
  return (
    <>
      <span style={{ fontSize: 10, color: '#fff', opacity: 0.6, padding: '0 2px' }}>{title}</span>
      {candidates.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
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
    </>
  )
}

export function WarnColorSwitcher() {
  const { resolved } = useTheme()
  const [warnSelected, setWarnSelected] = useState<string>('current')
  const [infoSelected, setInfoSelected] = useState<string>('current')

  useEffect(() => {
    const candidate = WARN_CANDIDATES.find((c) => c.id === warnSelected)
    if (!candidate) return
    document.documentElement.style.setProperty('--pm-warn', candidate[resolved])
    return () => {
      document.documentElement.style.removeProperty('--pm-warn')
    }
  }, [warnSelected, resolved])

  useEffect(() => {
    const candidate = INFO_CANDIDATES.find((c) => c.id === infoSelected)
    if (!candidate) return
    document.documentElement.style.setProperty('--pm-info', candidate[resolved])
    return () => {
      document.documentElement.style.removeProperty('--pm-info')
    }
  }, [infoSelected, resolved])

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
      <Section
        title="주의 색 후보"
        candidates={WARN_CANDIDATES}
        selected={warnSelected}
        onSelect={setWarnSelected}
        resolved={resolved}
      />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', margin: '4px 0' }} />
      <Section
        title="안내 색 후보"
        candidates={INFO_CANDIDATES}
        selected={infoSelected}
        onSelect={setInfoSelected}
        resolved={resolved}
      />
    </div>
  )
}
