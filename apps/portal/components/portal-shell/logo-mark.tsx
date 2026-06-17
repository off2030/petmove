/**
 * PETMOVE 로고 마크 — 상단바 좌측. ribbon-p (둥근 사각 + 흰 리본 P).
 * 색은 강조색 토큰(--pm-accent)을 따른다 → 로고 = 브랜드 강조색 (라이트/다크 자동).
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="100" height="100" rx="22.5" fill="var(--pm-accent)" />
      <path
        d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45"
        fill="none"
        stroke="#ffffff"
        strokeWidth="9.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
