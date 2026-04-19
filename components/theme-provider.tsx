'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** 외부 고객용 페이지 — OS 다크 모드 설정 무시하고 항상 라이트 강제. */
const FORCE_LIGHT_PATHS = ['/apply']

export function ThemeProvider() {
  const pathname = usePathname()

  useEffect(() => {
    try {
      const html = document.documentElement
      if (FORCE_LIGHT_PATHS.some(p => pathname?.startsWith(p))) {
        html.classList.remove('dark')
        return
      }
      const theme = localStorage.getItem('theme')
      const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
      if (isDark) {
        html.classList.add('dark')
      } else {
        html.classList.remove('dark')
      }
    } catch (e) {}
  }, [pathname])

  return null
}
