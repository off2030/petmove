'use client'

import { useEffect, useState } from 'react'
import { InstallAppSheet } from '@/components/settings/install-app-sheet'

/**
 * 모바일 웹 접속 시 자동으로 뜨는 앱 설치 유도 시트 — 당근·배민 식.
 * PWA 설치를 막은 대신(manifest.ts / layout.tsx) 네이티브 스토어 앱으로 유도한다.
 *
 * 띄우는 조건(전부 충족):
 *  - Capacitor 네이티브 앱이 **아님** (이미 앱 안인데 설치 권유는 무의미)
 *  - 모바일 브라우저 (iOS/Android UA) — 데스크톱은 모바일 앱 설치 불가라 제외
 *  - 최근에 닫지 않음 (DISMISS_DAYS 안에 '나중에' 누르면 다시 안 뜸 — 매 방문 도배 방지)
 *
 * 설정의 '일정 알림' 토글에서 띄우는 InstallAppSheet 와 같은 시트를 재사용하되, 문구만
 * 일반 설치 유도용으로 바꿔 넘긴다.
 */

const DISMISS_KEY = 'pm_app_promo_dismissed_at'
const DISMISS_DAYS = 7
const SHOW_DELAY_MS = 700 // 첫 페인트 후 살짝 뒤에 슬라이드업 — 진입과 동시는 거슬림

function isNativeApp(): boolean {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('PetmoveApp')) return true
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return !!cap?.isNativePlatform?.()
  } catch {
    return false
  }
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

export function AppInstallPromo() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isNativeApp() || !isMobileBrowser() || recentlyDismissed()) return
    const t = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [])

  function close() {
    setOpen(false)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* localStorage 불가(시크릿 등) — 닫기만 하고 무시 */
    }
  }

  return (
    <InstallAppSheet
      open={open}
      onClose={close}
      title="펫무브 앱에서 더 편하게"
      subtitle="알림·서류 등 모든 기능은 앱에서 매끄럽게 이용할 수 있어요."
      closeLabel="웹으로 둘러볼게요"
    />
  )
}
