/**
 * 보호자 앱 상단 chrome — docs/portal-preview/app.jsx 의 ThemeControls 포팅.
 *
 * 디자인 시안에선 iOS 디바이스 프레임 안 다이내믹아일랜드 양옆에 워드마크/토글이
 * 떠 있는 형태. 모바일 웹/Capacitor 에선 status bar 가 별도라, 같은 라인은
 * `env(safe-area-inset-top)` 만큼 내려서 배치.
 *
 * MVP 에선 좌측 PETMOVE 워드마크만. 우측 팔레트/다크모드 토글은 디자인 freeze
 * 단계에서 시안의 placeholder 였음 — 실제 기능(테마 전환) 은 별도 트랙.
 */
export function TopChrome() {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        height: 'calc(env(safe-area-inset-top) + 44px)',
        paddingTop: 'env(safe-area-inset-top)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'env(safe-area-inset-top) 22px 0',
        background: 'linear-gradient(180deg, rgba(242,237,230,.96) 0%, rgba(242,237,230,.7) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', 'Pretendard', serif",
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '0.22em',
          color: '#9A9286',
          textTransform: 'uppercase',
        }}
      >
        PETMOVE
      </div>
    </div>
  )
}
