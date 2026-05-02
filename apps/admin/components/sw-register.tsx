'use client'

import { useEffect } from 'react'

/**
 * Service Worker 등록 — `/sw.js` (public/) 를 origin scope 로 등록.
 * dev 모드에선 등록 안 함 (HMR/소스맵 캐시 문제 회피).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('[sw] register failed', err))
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])
  return null
}
