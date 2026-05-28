/**
 * 펫 아바타 placeholder — Stone/peach gradient + shiba 실루엣 SVG.
 * 일정(TimelineCalm)·서류(DocsView)·정보(InfoView) 헤더 공용.
 * 시각 소스: docs/portal-preview/shared.jsx.
 */
export function PetAvatar({ size = 44 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #F2C9A4 0%, #E5A776 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,.4), 0 1px 2px rgba(0,0,0,.06)',
      }}
    >
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 40 40">
        <path
          d="M20 8c-7 0-12 4.5-12 11 0 5 3 9 8 10.5 1.2.3 2.6.5 4 .5s2.8-.2 4-.5c5-1.5 8-5.5 8-10.5 0-6.5-5-11-12-11z"
          fill="#FFF6EE"
        />
        <path d="M11 11l3.5 5.5L9 16l2-5z" fill="#C9824D" />
        <path d="M29 11l-3.5 5.5L31 16l-2-5z" fill="#C9824D" />
        <path d="M11.5 12l2.5 4L10.5 16l1-4z" fill="#FFD9B5" />
        <path d="M28.5 12l-2.5 4L29.5 16l-1-4z" fill="#FFD9B5" />
        <path
          d="M14 18c-1 3-1 6 0 8 1 2 3.5 3 6 3s5-1 6-3c1-2 1-5 0-8-2-1-4-1.5-6-1.5s-4 .5-6 1.5z"
          fill="#F5DCC1"
        />
        <circle cx="16" cy="20" r="1.2" fill="#1F1B2E" />
        <circle cx="24" cy="20" r="1.2" fill="#1F1B2E" />
        <ellipse cx="20" cy="24" rx="1.4" ry="1" fill="#1F1B2E" />
        <path
          d="M20 25v1.5M18 27c.5.5 1.2.7 2 .7s1.5-.2 2-.7"
          stroke="#1F1B2E"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
