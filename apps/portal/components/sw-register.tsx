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
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('PetmoveApp')) return true
  // 브릿지 직접 감지 — 서비스워커가 아직 없는 첫 로드(앱 데이터 비운 직후)엔 Capacitor
  // 네이티브 브릿지가 살아 있어 isNativePlatform()=true 다. 이때 SW 를 등록하지 않으면
  // 이후로 브릿지가 계속 주입돼 정상 작동(부트스트랩). appendUserAgent 표식이 안 먹는
  // 환경 대비 1차 감지 수단.
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return !!cap?.isNativePlatform?.()
  } catch {
    return false
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const unregisterExisting = () => {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {})

      if ('caches' in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith('portal-'))
                .map((key) => caches.delete(key)),
            ),
          )
          .catch(() => {})
      }
    }

    // 네이티브 앱: SW 등록 금지 + 기존 SW 해제(브릿지 주입 복구).
    if (isNativeApp()) {
      unregisterExisting()
      return
    }

    if (process.env.NODE_ENV !== 'production') {
      unregisterExisting()
      return
    }

    // 새 SW 가 활성화되어 페이지를 넘겨받으면(controllerchange) 한 번만 자동 새로고침 →
    // 배포 후 옛 캐시를 비운 최신 자산으로 즉시 교체(사용자가 수동 새로고침 안 해도 됨).
    // 단, 최초 방문(기존 컨트롤러 없음)엔 새로고침 불필요 — 기존 SW 가 있던 경우만.
    const hadController = !!navigator.serviceWorker.controller
    let refreshing = false
    const onControllerChange = () => {
      if (refreshing || !hadController) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => reg.update())
        .catch((err) => console.warn('[sw] register failed', err))
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad)
    return () => {
      window.removeEventListener('load', onLoad)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])
  return null
}
