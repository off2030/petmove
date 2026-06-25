'use client'

import { useEffect } from 'react'

/**
 * Service Worker 등록 — `/sw.js` (public/) 를 origin scope 로 등록.
 * dev 모드에선 등록 안 함 (HMR/소스맵 캐시 문제 회피).
 *
 * ⚠️ Capacitor 네이티브 앱(원격 URL 모드)에서는 SW 를 등록하지 않고, 이미 등록된 것도
 * 해제한다 — SW 가 페이지를 제어하면 Capacitor 네이티브 브릿지가 주입되지 않아
 * isNativePlatform()=false 가 되고 로컬 알림 등 모든 플러그인이 죽는다(Capacitor #5278).
 * 네이티브 식별은 capacitor.config 의 appendUserAgent('PetmoveApp') 표식으로 한다.
 * (브릿지 자체가 안 떠도 UA 는 항상 보이므로 부트스트랩 가능 — SW 해제 후 다음 로드부터
 * 브릿지가 정상 주입된다.)
 */
function isNativeApp(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('PetmoveApp')
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // 네이티브 앱: SW 등록 금지 + 기존 SW 해제(브릿지 주입 복구).
    if (isNativeApp()) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {})
      return
    }

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
