'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal 전용 바텀시트. Stone 팔레트 — 정보 탭의 날짜·선택·여행지 피커가 사용.
 *
 * 모바일 1순위: 플로팅 popover 대신 화면 하단에서 슬라이드 업. 닫힘 애니메이션 동안
 * mount 유지를 위해 render/shown 2단계 상태. scrim 탭·ESC 로 닫힘, 열림 동안 body 스크롤 잠금.
 */

const C = {
  surface: 'var(--pm-surface)',
  ink: 'var(--pm-ink)',
  line: 'var(--pm-line)',
} as const

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}) {
  const [render, setRender] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setRender(true)
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const t = window.setTimeout(() => setRender(false), 260)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!render) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [render, onClose])

  if (!render || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(42,38,32,.45)',
          opacity: shown ? 1 : 0,
          transition: 'opacity .24s ease',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          background: C.surface,
          borderRadius: '22px 22px 0 0',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          transform: shown ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .26s cubic-bezier(.2,.8,.2,1)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
          boxShadow: '0 -8px 40px rgba(42,38,32,.18)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 10,
            paddingBottom: title ? 4 : 12,
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.line }} />
        </div>
        {title && (
          <div
            style={{
              padding: '4px 22px 12px',
              fontFamily: 'var(--pm-font-display)',
              fontSize: 18,
              fontWeight: 500,
              color: C.ink,
            }}
          >
            {title}
          </div>
        )}
        <div className="pm-noscroll" style={{ overflow: 'auto', padding: '0 22px 12px' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
