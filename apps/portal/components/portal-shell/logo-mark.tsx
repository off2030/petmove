/**
 * PETMOVE 로고 마크 — 상단바 좌측. '떠오르는 P' 확정안 (2026-07-12, P-1 투명):
 * 하늘 그라데이션 타일 + 흰 구름 언덕 뒤에서 노란 P가 해처럼 떠오르고, 구름에 가린
 * 기둥(132→118)은 34% 투명으로 은은하게 비친다. 타일 플로팅 섀도.
 * 색은 아이콘 원본 고정(하늘 블루·노랑) — 다크에서도 그대로.
 * 원본 SVG: docs/brand/logo-rising-p1-transparent.svg
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      // 타일 그림자가 svg 캔버스 밖으로 번지도록 — 기본(hidden)이면 그림자가 잘린다.
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <defs>
        <clipPath id="pm-logo-sq">
          <rect width="200" height="200" rx="46" />
        </clipPath>
        <linearGradient id="pm-logo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#63C9FF" />
          <stop offset="1" stopColor="#0BAEFF" />
        </linearGradient>
        {/* 타일 플로팅 섀도 — 클리핑된 결과(둥근 사각) 전체가 그림자를 드리운다. */}
        <filter id="pm-logo-float" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#0868A8" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#pm-logo-float)">
        <g clipPath="url(#pm-logo-sq)">
          <rect width="200" height="200" fill="url(#pm-logo-sky)" />
          {/* 떠오르는 P — 구름보다 먼저 그려 구름 언덕 뒤로 가려진다. */}
          <path
            d="M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106"
            fill="none"
            stroke="#FFC93C"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="0" y="160" width="200" height="40" fill="#ffffff" />
          <circle cx="46" cy="168" r="52" fill="#ffffff" />
          <circle cx="72" cy="120" r="48" fill="#ffffff" />
          <circle cx="112" cy="148" r="34" fill="#ffffff" />
          <circle cx="146" cy="138" r="38" fill="#ffffff" />
          <circle cx="178" cy="154" r="24" fill="#ffffff" />
          {/* 비침 기둥 — 구름에 가린 구간을 34% 투명으로 겹쳐, 빛이 배어나는 느낌. */}
          <path
            d="M116 132 L116 118"
            fill="none"
            stroke="#FFC93C"
            strokeWidth="18"
            strokeLinecap="round"
            opacity="0.34"
          />
        </g>
      </g>
    </svg>
  )
}
