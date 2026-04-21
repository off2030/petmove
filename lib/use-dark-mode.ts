'use client'

import { useEffect, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme'
const EVENT = 'themechange'

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {}
  return 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function effectiveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemPrefersDark()
}

/** 모드 변경 (전역) — localStorage 저장 + themechange 이벤트로 모든 구독자 동기화. */
export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, mode)
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}

export function useDarkMode() {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    function refresh() {
      const m = readMode()
      setModeState(m)
      setIsDark(effectiveDark(m))
    }
    refresh()
    setMounted(true)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = () => { if (readMode() === 'system') refresh() }
    mq.addEventListener('change', onMq)
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      mq.removeEventListener('change', onMq)
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  /** system → light → dark → system 순환. */
  function cycle() {
    const next: ThemeMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'
    setThemeMode(next)
  }

  return { mode, isDark, mounted, setMode: setThemeMode, cycle }
}
