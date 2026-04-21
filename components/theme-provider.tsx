'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** 외부 고객용 페이지 — OS 다크 모드 설정 무시하고 항상 라이트 강제. */
const FORCE_LIGHT_PATHS = ['/apply']

type Mode = 'system' | 'light' | 'dark'

function readMode(): Mode {
  try {
    const v = localStorage.getItem('theme')
    if (v === 'light' || v === 'dark') return v
  } catch {}
  return 'system'
}

function applyEffective(mode: Mode) {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function ThemeProvider() {
  const pathname = usePathname()

  useEffect(() => {
    try {
      const html = document.documentElement
      if (FORCE_LIGHT_PATHS.some((p) => pathname?.startsWith(p))) {
        html.classList.remove('dark')
        return
      }
      applyEffective(readMode())

      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const onMq = () => { if (readMode() === 'system') applyEffective('system') }
      const onTheme = () => applyEffective(readMode())
      mq.addEventListener('change', onMq)
      window.addEventListener('themechange', onTheme)
      window.addEventListener('storage', onTheme)
      return () => {
        mq.removeEventListener('change', onMq)
        window.removeEventListener('themechange', onTheme)
        window.removeEventListener('storage', onTheme)
      }
    } catch (e) {}
  }, [pathname])

  return null
}
