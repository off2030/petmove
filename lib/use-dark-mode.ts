'use client'

import { useEffect, useState } from 'react'

/** OS 다크 모드 설정을 그대로 반영. 수동 토글 없음 — 시스템 설정 변경은 실시간 반영. */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (dark: boolean) => {
      setIsDark(dark)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply(mq.matches)
    setMounted(true)
    const onChange = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return { isDark, mounted }
}
