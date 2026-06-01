'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * 포털 테마 (시스템/라이트/다크). 설정 > 화면 의 스위처가 이 컨텍스트를 사용.
 *
 * - mode: 사용자 선택 ('system'|'light'|'dark'), localStorage['pm-theme'] 영속.
 * - resolved: 실제 적용 테마 ('light'|'dark') — mode==='system' 이면 OS 설정 따름.
 * - 적용 = <html data-theme> 속성 + <meta name=theme-color> (PWA/브라우저 chrome).
 *   globals.css 의 :root[data-theme="dark"] 가 --pm-* 토큰을 다크로 교체.
 * - 최초 paint 전 깜빡임(FOUC)은 app/layout.tsx 의 인라인 스크립트가 막음.
 *   이 프로바이더는 hydration 후 상태 동기화 + OS 변경 라이브 반영 + 스위처 연결만 담당.
 *
 * 비로그인 화면(login/apply)은 --pm-* 토큰을 안 쓰고 색을 하드코딩해 다크여도 라이트로 보임 (의도).
 */

export type ThemeMode = 'system' | 'light' | 'dark'
type Resolved = 'light' | 'dark'

const STORAGE_KEY = 'pm-theme'
const BG = { light: '#F5EFE8', dark: '#1C1916' } as const

type ThemeCtx = { mode: ThemeMode; resolved: Resolved; setMode: (m: ThemeMode) => void }
const Ctx = createContext<ThemeCtx | null>(null)

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(mode: ThemeMode): Resolved {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/** <html data-theme> + meta theme-color 동기. (no-flash 스크립트와 동일 결과) */
function apply(resolved: Resolved) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolved
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = BG[resolved]
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 초기값 'system' — hydration mismatch 방지(서버는 항상 동일). 실제 값은 mount 후 localStorage 에서.
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [resolved, setResolved] = useState<Resolved>('light')

  // mount: localStorage 의 저장된 mode 로 동기 (no-flash 스크립트가 이미 DOM 엔 반영함).
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? 'system'
    setModeState(stored)
    setResolved(resolve(stored))
  }, [])

  // OS 다크 설정 변경 라이브 반영 — mode==='system' 일 때만.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as ThemeMode | null ?? 'system') === 'system') {
        const r = mq.matches ? 'dark' : 'light'
        setResolved(r)
        apply(r)
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setMode = useCallback((m: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, m)
    setModeState(m)
    const r = resolve(m)
    setResolved(r)
    apply(r)
  }, [])

  return <Ctx.Provider value={{ mode, resolved, setMode }}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used within ThemeProvider')
  return v
}
