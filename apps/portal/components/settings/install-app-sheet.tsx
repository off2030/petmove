'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { C } from '@/lib/palette'
import { LogoMark } from '@/components/portal-shell/logo-mark'

/**
 * 앱 설치 안내 바텀시트 — 웹(브라우저)에서 '일정 알림'을 켜려 할 때 띄운다.
 * 일정 알림(LocalNotifications)은 네이티브 앱에서만 동작하므로, 단순 문구 대신
 * 스토어 설치로 유도한다. PWA('홈 화면에 추가')는 웹 껍데기라 알림이 안 와 대안이 아님.
 *
 * ⚠️ 스토어 URL — 앱 출시(스토어 등록) 시점에 채운다.
 *  - android: 번들 ID(com.petmove.portal)로 주소가 결정돼 미리 채워둠(출시 전엔 404).
 *  - ios: App Store Connect 에서 앱 생성 시 숫자 ID 부여 → 그때 STORE_URL.ios 에 입력.
 *    (출시 전엔 빈 값 → 버튼은 보이되 눌러도 이동 X. 출시 전 실사용자 없음.)
 */
const STORE_URL = {
  // App Store Connect 앱 "펫무브" Apple ID = 6784567864 (2026-06-26 앱 생성 시 부여).
  ios: 'https://apps.apple.com/app/id6784567864',
  android: 'https://play.google.com/store/apps/details?id=com.petmove.portal',
} as const

type Target = 'ios' | 'android' | 'both'

/** 접속 기기 추정 — iPhone/iPad → App Store, Android → Google Play, 그 외(데스크톱) → 둘 다. */
function detectTarget(): Target {
  if (typeof navigator === 'undefined') return 'both'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'both'
}

const AppleGlyph = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.564 13.327c-.01-1.79.802-3.14 2.44-4.135-.916-1.312-2.3-2.034-4.124-2.175-1.726-.135-3.615 1.014-4.305 1.014-.73 0-2.402-.97-3.716-.97C5.14 7.107 2.5 9.236 2.5 13.566c0 1.28.234 2.602.703 3.966.625 1.793 2.88 6.19 5.232 6.118 1.23-.029 2.1-.873 3.7-.873 1.552 0 2.357.873 3.716.873 2.373-.035 4.414-4.03 5.008-5.828-3.184-1.5-3.295-4.394-3.295-4.493zM14.95 5.21c1.262-1.498 1.147-2.862 1.11-3.354-1.114.064-2.402.758-3.136 1.612-.808.92-1.283 2.058-1.181 3.292 1.203.093 2.302-.526 3.207-1.55z" />
  </svg>
)

const PlayGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 2.5v19l16-9.5z" />
  </svg>
)

function StoreButton({ label, glyph, url }: { label: string; glyph: ReactNode; url: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        // 강조색(amber) 알약 + 흰 글씨 — 토글·저장 버튼·로고와 같은 primary 액션 색(라이트/다크 공통).
        background: C.accent,
        color: '#fff',
        border: 'none',
        borderRadius: 14,
        padding: '13px 10px',
        fontSize: 13.5,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {glyph}
      {label}
    </button>
  )
}

export function InstallAppSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [target, setTarget] = useState<Target>('both')

  // 기기 추정은 마운트 후 1회 — SSR/첫 렌더는 'both'(버튼 둘)로 그려 하이드레이션 불일치를 피하고,
  // 마운트 뒤 실제 기기로 좁힌다. (settings-view 의 remindersOn 동기화와 같은 패턴)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(detectTarget())
  }, [])

  // 열렸을 때 본문 스크롤 잠금.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const showIos = target === 'ios' || target === 'both'
  const showAndroid = target === 'android' || target === 'both'
  const twoUp = showIos && showAndroid

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="펫무브 앱 설치 안내"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(24,21,16,.46)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'pmInstallScrimIn .25s ease both',
      }}
    >
      <style>{
        '@keyframes pmInstallScrimIn{from{opacity:0}to{opacity:1}}' +
        '@keyframes pmInstallSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}'
      }</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: C.surface,
          borderRadius: '26px 26px 0 0',
          borderTop: `.5px solid ${C.line}`,
          padding: '14px 22px',
          paddingBottom: 'calc(26px + env(safe-area-inset-bottom, 0px))',
          animation: 'pmInstallSheetUp .28s cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <div
          style={{ width: 38, height: 4, borderRadius: 999, background: C.line2, margin: '0 auto 20px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <LogoMark size={60} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: 21,
            fontWeight: 500,
            textAlign: 'center',
            color: C.ink,
            lineHeight: 1.3,
            marginBottom: 10,
          }}
        >
          앱에서 알림을 받아보세요
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.ink2,
            textAlign: 'center',
            lineHeight: 1.6,
            marginBottom: 22,
            padding: '0 6px',
          }}
        >
          펫무브 앱을 설치하고 일정 알림을 받으세요.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: twoUp ? '1fr 1fr' : '1fr',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {showIos && <StoreButton label="App Store" glyph={AppleGlyph} url={STORE_URL.ios} />}
          {showAndroid && <StoreButton label="Google Play" glyph={PlayGlyph} url={STORE_URL.android} />}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            fontSize: 13,
            color: C.ink3,
            background: 'transparent',
            border: 0,
            padding: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          나중에 할게요
        </button>
      </div>
    </div>
  )
}
