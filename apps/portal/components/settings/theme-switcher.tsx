'use client'

import { useTheme, type ThemeMode } from '@/components/portal-shell/theme-provider'
import { C } from '@/components/me/settings-shared'

/**
 * 3단 테마 스위처 (시스템/라이트/다크) — 설정 > 화면.
 * iOS 세그먼티드 컨트롤 톤: 옅은 inset 트랙 + 활성 pill(surface + 그림자).
 * 값은 ThemeProvider(localStorage 'pm-theme') 에 즉시 반영 → --pm-* 토큰 교체.
 */

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

export function ThemeSwitcher() {
  const { mode, setMode } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="테마"
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 12,
        background: 'rgb(var(--pm-ink-rgb) / .06)',
      }}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(o.value)}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 9,
              border: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              background: active ? C.surface : 'transparent',
              color: active ? C.ink : C.ink3,
              boxShadow: active ? '0 1px 2px rgb(var(--pm-ink-rgb) / .12)' : 'none',
              transition: 'background .15s, color .15s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
