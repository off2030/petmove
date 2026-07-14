/**
 * 상태 아이콘 — 브랜드(하늘 구름)의 날씨 문법.
 *
 * 구름(안내) → 뇌우(주의) 두 단계. 검증 룰이 실제 어긋났을 때만 뇌우가 뜬다.
 * 색은 호출부가 currentColor 로 정한다(주의=--pm-warn, 안내=--pm-info).
 * 나중에 심각도 단계를 늘리면 비(cloud-rain)가 중간 자리 후보.
 */

type IconProps = {
  size?: number
  strokeWidth?: number
  /** 접근성 라벨. 옆에 '주의'/'안내' 텍스트가 함께 있는 자리는 생략(aria-hidden). */
  label?: string
}

/** 주의 = 뇌우 구름. */
export function StormCloudIcon({ size = 14, strokeWidth = 2.2, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M6.657 16c-2.572 0-4.657-2.007-4.657-4.483 0-2.475 2.085-4.482 4.657-4.482.393-1.762 1.794-3.2 3.675-3.773 1.88-.572 3.956-.193 5.444 1 1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486 0 1.927-1.551 3.487-3.465 3.487h-11.878" />
      {/* 번개 — 작은 크기(13~15px)에서 선 지그재그는 뭉개져 안 보인다. 채운 면 번개로
          교체 + 구름 아래로 길게 내려 실루엣을 또렷하게(2026-07-12 가시성 개선). */}
      <path
        d="M13.6 13 L8.8 19.4 L11.7 19.4 L10.3 24.4 L15.4 17.8 L12.4 17.8 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

/** 안내 = 구름. */
export function CloudIcon({ size = 13, strokeWidth = 2.2, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M6.657 18c-2.572 0-4.657-2.007-4.657-4.483 0-2.475 2.085-4.482 4.657-4.482.393-1.762 1.794-3.2 3.675-3.773 1.88-.572 3.956-.193 5.444 1 1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.487 0 1.926-1.551 3.486-3.465 3.486h-11.878" />
    </svg>
  )
}
