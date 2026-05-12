'use client'

/**
 * Portal 상단 chrome — portal-preview/app.jsx 의 ThemeControls 포팅.
 *
 * - 좌측: PETMOVE 워드마크 (Fraunces serif, letterSpacing 0.22em — 브랜드 시그니처)
 * - 우측: 팔레트(테마) + 다크모드 토글 버튼 — onClick 미구현 (Phase 11.0.8 이후)
 * - position: fixed top. safe-area-inset-top 보정 (iOS PWA 다이내믹 아일랜드).
 *
 * height(=safe-area + 36) 만큼 본문 paddingTop 필요. (authed) layout 에서 처리.
 */
export function TopBar() {
  const btn: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6B6457',
    padding: 0,
  }
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(env(safe-area-inset-top, 0px) + 36px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 22px',
        paddingBlock: 0,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', 'Pretendard Variable', serif",
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '0.22em',
          color: '#9A9286',
          textTransform: 'uppercase',
          pointerEvents: 'auto',
        }}
      >
        PETMOVE
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'auto' }}
      >
        <button aria-label="테마" title="테마" style={btn} type="button">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4 4h-2a2 2 0 0 0-2 2v.5a2.5 2.5 0 0 1-2 2.5z" />
            <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="18" cy="11" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button aria-label="다크모드" title="다크모드" style={btn} type="button">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
