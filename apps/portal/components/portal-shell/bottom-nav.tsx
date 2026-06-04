'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { readLastCaseId, writeLastCaseId } from './last-case'

/**
 * 보호자 앱 하단 3탭 — case-aware.
 *
 * 현재 path 가 /cases/<id>/... 이면 그 id 를 보존하면서 다른 탭으로 전환.
 * /me/... (case-외) 같은 화면에선 sessionStorage 의 마지막 caseId 로 복귀
 *   — swipe-tabs 와 동일한 키 공유. 이게 없으면 내 정보 탭에서 일정/서류 탭을
 *   누를 때마다 /cases (다중 케이스 선택 화면) 로 튕겨나가는 버그가 됨.
 * sessionStorage 도 비어 있으면 /cases 로 보냄 (1건이면 자동 redirect).
 * 내 정보 탭은 항상 /me (case-외 hub). 앱 설정(계정·테마·약관 등)은 상단바 ⚙ → /settings.
 */

type Icon = 'route' | 'doc' | 'user'
type Tab = { key: 'journey' | 'docs' | 'me'; label: string; icon: Icon }

const TABS: Tab[] = [
  { key: 'journey', label: '일정', icon: 'route' },
  { key: 'docs', label: '서류', icon: 'doc' },
  { key: 'me', label: '내 정보', icon: 'user' },
]

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

export function BottomNav() {
  const pathname = usePathname()
  const caseIdInPath = caseIdFromPath(pathname)
  const [lastCaseId, setLastCaseId] = useState<string | null>(null)

  useEffect(() => {
    if (caseIdInPath) {
      writeLastCaseId(caseIdInPath)
      setLastCaseId(caseIdInPath)
    } else {
      setLastCaseId(readLastCaseId())
    }
  }, [caseIdInPath])

  const caseId = caseIdInPath ?? lastCaseId

  // 둥근 카드형 플로팅 바 — 좌우·아래 마진, 라벨 항상 보임. Calm 톤.
  // portal-preview/app.jsx 의 BottomNav 와 동일 디자인 (truth source).
  return (
    <nav
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(env(safe-area-inset-bottom), 14px)',
        zIndex: 40,
        display: 'flex',
        padding: '6px 4px',
        borderRadius: 22,
        background: 'rgb(var(--pm-bg-rgb) / 0.75)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(42, 38, 32, 0.06)',
        boxShadow:
          '0 12px 28px -10px rgba(0, 0, 0, 0.16),' +
          ' 0 2px 6px -2px rgba(0, 0, 0, 0.06)',
      }}
    >
      {TABS.map((t) => {
        const href = hrefFor(t.key, caseId)
        const active = isActive(t.key, pathname)
        return (
          <Link
            key={t.key}
            href={href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '8px 6px',
              flex: 1,
              borderRadius: 16,
              textDecoration: 'none',
              color: active ? 'var(--pm-ink)' : 'var(--pm-ink-3)',
              transition: 'color 180ms ease',
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

function hrefFor(key: Tab['key'], caseId: string | null): string {
  if (key === 'me') return '/me'
  if (!caseId) return '/cases'
  return `/cases/${caseId}/${key}`
}

function isActive(key: Tab['key'], pathname: string): boolean {
  if (key === 'me') return pathname === '/me' || pathname.startsWith('/me/')
  return new RegExp(`^/cases/[^/]+/${key}(?:/|$)`).test(pathname)
}

function NavIcon({ name, stroke = 1.7 }: { name: Icon; stroke?: number }) {
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
    case 'user':
      return (
        <svg {...p}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
  }
}
