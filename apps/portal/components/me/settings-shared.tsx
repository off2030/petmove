'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

/**
 * 설정 sub-page 공유 컴포넌트: 팔레트 / 헤더+뒤로 / 섹션 카드 / 하단 sticky 저장 바.
 * 원본 톤: components/cases/info-view.tsx 및 me/profile-view.tsx (Stone 팔레트).
 */

export const C = {
  bg: '#F5EFE8',
  surface: '#FBF7F1',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
  line: 'rgba(42,38,32,.10)',
  accent: '#B89968',
  soft: '#E8DCC4',
  sage: '#8FA68C',
  warn: '#C26A4A',
} as const

export const serif: CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
}

export const monoCap: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: C.ink3,
  fontWeight: 500,
}

/** 좌측 화살표 + 라벨로 부모 페이지로 복귀. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        ...monoCap,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: C.ink2,
        textDecoration: 'none',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </Link>
  )
}

/**
 * sub-page 외곽 셸. 뒤로 + 타이틀 + 본문 + 하단 sticky bar 슬롯.
 * sticky bar 가 없으면 paddingBottom 작게.
 */
export function EditPageShell({
  backHref = '/me',
  backLabel = '설정',
  title,
  children,
  bottomBar,
}: {
  backHref?: string
  backLabel?: string
  title: string
  children: ReactNode
  bottomBar?: ReactNode
}) {
  const hasBar = !!bottomBar
  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 24,
        paddingBottom: hasBar ? 132 : 80,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <BackLink href={backHref} label={backLabel} />
        <h1
          style={{
            ...serif,
            fontSize: 28,
            lineHeight: 1.12,
            margin: '12px 0 0',
            color: C.ink,
          }}
        >
          {title}
        </h1>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
      {hasBar && bottomBar}
    </div>
  )
}

/** mono-cap 라벨 + 라운드 surface 카드. label 없으면 카드만. */
export function SectionCard({
  label,
  children,
  marginTop = 24,
}: {
  label?: string
  children: ReactNode
  marginTop?: number
}) {
  return (
    <>
      {label && (
        <div
          style={{
            ...monoCap,
            marginTop,
            marginBottom: 10,
            padding: '0 4px',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          marginTop: label ? 0 : marginTop,
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 18,
          padding: '2px 16px',
        }}
      >
        {children}
      </div>
    </>
  )
}

/**
 * 하단 sticky 저장 바 — bottom-nav 위에 떠 있음.
 * InfoView 패턴과 동일.
 */
export function StickySaveBar({
  dirty,
  status,
  error,
  onSave,
}: {
  dirty: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  error: string | null
  onSave: () => void
}) {
  const justSaved = status === 'saved' && !dirty
  const canSave = dirty && status !== 'saving'

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 12,
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 12px) + 53px)',
        background:
          'linear-gradient(180deg, rgba(245,239,232,0) 0%, rgba(245,239,232,.92) 30%, rgba(245,239,232,.92) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 39,
        pointerEvents: 'none',
      }}
    >
      {status === 'error' && (
        <div
          role="alert"
          style={{
            pointerEvents: 'auto',
            marginBottom: 8,
            padding: '9px 12px',
            borderRadius: 10,
            background: C.surface,
            border: `.5px solid ${C.warn}55`,
            color: C.warn,
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          {error ?? '저장 실패'}
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        aria-live="polite"
        style={{
          pointerEvents: 'auto',
          width: '100%',
          padding: '14px 0',
          borderRadius: 14,
          border: 0,
          background: justSaved ? C.sage : canSave ? C.accent : 'rgba(42,38,32,.10)',
          color: justSaved || canSave ? '#fff' : C.ink3,
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          cursor: canSave ? 'pointer' : 'not-allowed',
          transition: 'background .15s, color .15s',
        }}
      >
        {status === 'saving' ? '저장 중…' : justSaved ? '✓ 저장됨' : '저장'}
      </button>
    </div>
  )
}
