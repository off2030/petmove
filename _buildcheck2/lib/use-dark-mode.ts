'use client'

import { useEffect, useState } from 'react'

export function useDarkMode() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const html = document.documentElement
    const stored = localStorage.getItem('theme')

    const shouldBeDark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches

    setIsDark(shouldBeDark)
    if (shouldBeDark) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    setMounted(true)
  }, [])

  const toggle = () => {
    const html = document.documentElement
    const newValue = !isDark
    setIsDark(newValue)

    if (newValue) {
      html.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      html.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  return { isDark, toggle, mounted }
}
