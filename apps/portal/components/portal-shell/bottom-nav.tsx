'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 보호자 앱 하단 4탭 — docs/portal-preview/app.jsx 의 BottomNav 포팅.
 * 여정/서류/정보/프로필 — Stone 톤. fixed bottom, safe-area 고려.
 */

type Tab = { href: string; label: string; icon: 'route' | 'doc' | 'info' | 'user' }

const TABS: Tab[] = [
  { href: '/journey', label: '여정', icon: 'route' },
  { href: '/docs', label: '서류', icon: 'doc' },
  { href: '/info', label: '정보', icon: 'info' },
  { href: '/profile', label: '프로필', icon: 'user' },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        paddingTop: 8,
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        display: 'flex',
        justifyContent: 'space-around',
        background: 'linear-gradient(180deg, rgba(242,237,230,0) 0%, rgba(242,237,230,.95) 60%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/')
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 12px',
              flex: 1,
              textDecoration: 'none',
              color: active ? '#2A2620' : '#9A9286',
            }}
          >
            <NavIcon name={t.icon} stroke={active ? 2 : 1.7} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function NavIcon({ name, stroke = 1.7 }: { name: Tab['icon']; stroke?: number }) {
  const p = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'route':
      return (
        <svg {...p} strokeWidth={stroke + 0.7}>
          <circle cx="12" cy="12" r="9" opacity=".3" />
          <path d="M12 3a9 9 0 0 1 6.4 15.4" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...p}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h6" />
        </svg>
      )
    case 'info':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v5h1" />
        </svg>
      )
    case 'user':
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )
  }
}
