'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { downloadFile } from '@/lib/native/download'

/**
 * 이미지 첨부를 앱 안에서 전체화면으로 보여주는 뷰어 — 브라우저를 열지 않는다.
 * (PDF·엑셀·HWP 등은 WebView 가 못 그려서 다운로드로 처리. 이미지만 <img> 로 인앱 표시.)
 *
 * 어디서든 useMediaViewer().openImage(url, filename) 으로 연다. 닫기(X) + 저장 버튼 제공.
 * 저장은 downloadFile — 네이티브는 공유·저장 시트, 웹은 바로 다운로드.
 */

type ViewerState = { url: string; filename: string } | null

const MediaViewerContext = createContext<{
  openImage: (url: string, filename: string) => void
} | null>(null)

export function MediaViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewerState>(null)
  const [saving, setSaving] = useState(false)

  const openImage = useCallback((url: string, filename: string) => {
    setState({ url, filename })
  }, [])

  const close = useCallback(() => setState(null), [])

  async function handleSave() {
    if (!state || saving) return
    setSaving(true)
    try {
      await downloadFile(state.url, state.filename)
    } finally {
      setSaving(false)
    }
  }

  return (
    <MediaViewerContext.Provider value={{ openImage }}>
      {children}
      {state && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            flexDirection: 'column',
            // 노치/홈바 안전영역.
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* 상단 바 — 저장 / 닫기. 이미지 탭과 분리되게 클릭 전파 차단. */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                borderRadius: 999,
                border: 0,
                background: 'rgba(255,255,255,0.16)',
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 999,
                border: 0,
                background: 'rgba(255,255,255,0.16)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 이미지 — 화면에 맞춰 비율 유지. 배경 탭하면 닫힘. */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              alt={state.filename}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 8,
              }}
            />
          </div>
        </div>
      )}
    </MediaViewerContext.Provider>
  )
}

export function useMediaViewer() {
  const ctx = useContext(MediaViewerContext)
  if (!ctx) throw new Error('useMediaViewer must be used within MediaViewerProvider')
  return ctx
}
