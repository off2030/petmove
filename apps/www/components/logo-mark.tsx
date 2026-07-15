// 브랜드 로고 — 하늘 그라데이션 라운드 스퀘어 + 흰 구름 + 노란 P (떠오르는 P).
// 지오메트리 = docs/brand SVG 그대로 (프로토타입 생성기 LOGO 상수에서 이식).
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id="pmlg-sq">
          <rect width="200" height="200" rx="46" />
        </clipPath>
        <linearGradient id="pmlg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#63C9FF" />
          <stop offset="1" stopColor="#0BAEFF" />
        </linearGradient>
        <filter id="pmlg-float" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#0868A8" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#pmlg-float)">
        <g clipPath="url(#pmlg-sq)">
          <rect width="200" height="200" fill="url(#pmlg-sky)" />
          <path
            d="M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106"
            fill="none"
            stroke="#FFC93C"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="0" y="160" width="200" height="40" fill="#fff" />
          <circle cx="46" cy="168" r="52" fill="#fff" />
          <circle cx="72" cy="120" r="48" fill="#fff" />
          <circle cx="112" cy="148" r="34" fill="#fff" />
          <circle cx="146" cy="138" r="38" fill="#fff" />
          <circle cx="178" cy="154" r="24" fill="#fff" />
          <path d="M116 132 L116 118" fill="none" stroke="#FFC93C" strokeWidth="18" strokeLinecap="round" opacity="0.34" />
        </g>
      </g>
    </svg>
  )
}
