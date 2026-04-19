'use client'

import { useEffect } from 'react'

export function ThemeProvider() {
  useEffect(() => {
    try {
      const theme = localStorage.getItem('theme')
      const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    } catch (e) {}
  }, [])

  return null
}
