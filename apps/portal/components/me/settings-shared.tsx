'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { C } from '@/lib/palette'

/**
 * 설정 sub-page 공유 컴포넌트: 팔레트 / 헤더+뒤로 / 섹션 카드 / 하단 sticky 저장 바.
 * 원본 톤: components/cases/info-view.tsx 및 me/profile-view.tsx (Stone 팔레트).
 */

// 색 팔레트는 @/lib/palette 가 단일 출처. 여기선 re-export 만 (이 파일에서 C 를
// import 하던 기존 코드 호환). 색을 바꾸려면 globals.css 의 --pm-* 토큰만 고치면 됨.
export { C }

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

/**
 * 조직(담당 동물병원·운송업체) 아바타. 펫무브워크 조직정보에서 설정한 로고를 표시.
 * 보호자·반려동물(원형)과 구분하려 둥근 사각형(로고 톤). url 없으면 이름 이니셜 fallback.
 */
export function OrgAvatar({
  name,
  url,
  size = 40,
}: {
  name: string
  url?: string | null
  size?: number
}) {
  const radius = Math.round(size * 0.28)
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: 'cover',
          flexShrink: 0,
          background: C.soft,
          border: `.5px solid ${C.line}`,
        }}
      />
    )
  }
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: C.soft,
        color: C.ink2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.4),
        flexShrink: 0,
        ...serif,
      }}
    >
      {initial}
    </div>
  )
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
  backLabel = '내 정보',
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
            fontSize: 20,
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

  // 모바일 키보드가 올라오면 fixed bar 가 viewport bottom 에 붙은 채 input 위로 올라와
  // 입력 필드를 가린다.
  //
  // 안드로이드 크롬: viewport meta interactiveWidget=resizes-content 가 layout viewport
  // 도 같이 작아지게 해 visualViewport 차이로는 감지 불가 → focusin/focusout 으로 잡는다.
  // input·textarea 포커스 시 키보드 올라옴 = 동등 신호.
  // iOS Safari: focusin 도 정상 발화 → 같은 처리로 커버.
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    function isEditable(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      if (t.tagName === 'INPUT') {
        const type = (t as HTMLInputElement).type
        const nonEditable = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden', 'range', 'color']
        return !nonEditable.includes(type)
      }
      return t.tagName === 'TEXTAREA' || t.isContentEditable
    }
    function onFocusIn(e: FocusEvent) {
      if (isEditable(e.target)) setKeyboardOpen(true)
    }
    function onFocusOut(e: FocusEvent) {
      if (isEditable(e.target)) setKeyboardOpen(false)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // 키보드 올라오면 bar 자체를 unmount — bottom 음수·transform·display 처리 모두 일부
  // 안드로이드 크롬에서 무시되는 케이스가 있어 가장 확실한 컴포넌트 미렌더로 처리.
  if (keyboardOpen) return null

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
          'linear-gradient(180deg, rgb(var(--pm-bg-rgb) / 0) 0%, rgb(var(--pm-bg-rgb) / .92) 30%, rgb(var(--pm-bg-rgb) / .92) 100%)',
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
            border: `.5px solid color-mix(in srgb, ${C.warn} 33%, transparent)`,
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
          background: justSaved ? C.sage : canSave ? C.accent : C.line,
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
