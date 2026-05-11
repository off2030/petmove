/**
 * Phase 11.0.7 에서 셸 + 여정만 먼저 구현, 나머지 3탭은 placeholder.
 * 디자인은 docs/portal-preview/{docs,app}.jsx 에 freeze 되어 있음 — 추후 portal-plan
 * 11.1+ 에서 구현.
 */
export function ComingSoon({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      className="pm-fade-up"
      style={{
        padding: '64px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: '#9A9286',
          fontWeight: 500,
        }}
      >
        준비 중
      </span>
      <h1
        style={{
          fontFamily: "'Fraunces', 'Pretendard Variable', serif",
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          margin: 0,
        }}
      >
        {title}
      </h1>
      {hint && <p style={{ fontSize: 13, lineHeight: 1.55, color: '#6B6457', maxWidth: 300 }}>{hint}</p>}
    </div>
  )
}
