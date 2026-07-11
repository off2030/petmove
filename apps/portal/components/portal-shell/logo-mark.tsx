/**
 * PETMOVE 로고 마크 — 상단바 좌측. PetMove-icon-3A 원안 그대로(하늘 그라데이션 +
 * 흰 구름 언덕), 타일(둥근 사각) 자체에 소프트 섀도를 얹어 배경 위에 떠 있는 입체감.
 * (2026-07-11: 아이콘 내부는 무변경 — 그림자만. 홈 화면 아이콘 목업 기준.)
 * 색은 아이콘 원본 고정(하늘 블루) — 다크에서도 그대로.
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
          <rect x="0" y="160" width="200" height="40" fill="#ffffff" />
          <circle cx="46" cy="168" r="52" fill="#ffffff" />
          <circle cx="72" cy="120" r="48" fill="#ffffff" />
          <circle cx="112" cy="148" r="34" fill="#ffffff" />
          <circle cx="146" cy="138" r="38" fill="#ffffff" />
          <circle cx="178" cy="154" r="24" fill="#ffffff" />
        </g>
      </g>
    </svg>
  )
}
