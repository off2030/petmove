'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCases } from './case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { readLastCaseId, readLastDest, writeLastCaseId, writeLastDest } from './last-case'

/**
 * 보호자 앱 하단 4탭 — case-aware.
 *
 * 현재 path 가 /cases/<id>/... 이면 그 id 를 보존하면서 다른 탭으로 전환.
 * /me/... · /services (case-외) 같은 화면에선 sessionStorage 의 마지막 caseId 로 복귀
 *   — swipe-tabs 와 동일한 키 공유. 이게 없으면 내 정보 탭에서 일정/서류 탭을
 *   누를 때마다 /cases (다중 케이스 선택 화면) 로 튕겨나가는 버그가 됨.
 * sessionStorage 도 비어 있으면 /cases 로 보냄 (1건이면 자동 redirect).
 * 서비스·내 정보 탭은 caseId 와 무관하게 항상 /services · /me (case-외 hub).
 * 앱 설정(계정·테마·약관 등)은 상단바 ⚙ → /settings.
 */

type Icon = 'route' | 'doc' | 'grid' | 'user'
type Tab = { key: 'journey' | 'docs' | 'services' | 'me'; label: string; icon: Icon }

const TABS: Tab[] = [
  { key: 'journey', label: '일정', icon: 'route' },
  { key: 'docs', label: '서류', icon: 'doc' },
  { key: 'services', label: '서비스', icon: 'grid' },
  { key: 'me', label: '내 정보', icon: 'user' },
]

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

export function BottomNav() {
  const pathname = usePathname()
  const caseIdInPath = caseIdFromPath(pathname)
  const { cases } = useCases()
  const [lastCaseId, setLastCaseId] = useState<string | null>(null)
  // 다중 목적지 — 활성 목적지(?dest=)를 케이스별로 기억해 탭 전환 시 링크에 붙인다.
  // 안 붙이면 탭을 누를 때마다 기본(첫) 목적지로 리셋된다. { id, dest } 쌍으로 들고
  // 최종 caseId 와 일치할 때만 사용 (다른 케이스의 dest 가 새는 것 방지).
  const searchParams = useSearchParams()
  const destInUrl = searchParams.get('dest')
  const [lastDest, setLastDest] = useState<{ id: string; dest: string } | null>(null)

  useEffect(() => {
    if (caseIdInPath) {
      writeLastCaseId(caseIdInPath)
      setLastCaseId(caseIdInPath)
      if (destInUrl) {
        writeLastDest(caseIdInPath, destInUrl)
        setLastDest({ id: caseIdInPath, dest: destInUrl })
      } else {
        const d = readLastDest(caseIdInPath)
        setLastDest(d ? { id: caseIdInPath, dest: d } : null)
      }
    } else {
      const id = readLastCaseId()
      setLastCaseId(id)
      const d = id ? readLastDest(id) : null
      setLastDest(id && d ? { id, dest: d } : null)
    }
  }, [caseIdInPath, destInUrl])

  // 모바일 키보드가 올라오면 fixed nav 가 viewport bottom 에 붙어 input 위로 떠올라
  // 가린다. input/textarea 포커스 동안 nav 자체를 미렌더 (StickySaveBar 와 동일 패턴).
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    function isEditable(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      if (t.tagName === 'INPUT') {
        const type = (t as HTMLInputElement).type
        const nonEditable = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden', 'range', 'color']
        return !nonEditable.includes(type)
      }
      return t.tagName === 'TEXTAREA' || t.isContentEditable
    }
    function onFocusIn(e: FocusEvent) {
      if (isEditable(e.target)) setKeyboardOpen(true)
    }
    function onFocusOut(e: FocusEvent) {
      if (isEditable(e.target)) setKeyboardOpen(false)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  if (keyboardOpen) return null

  // 일정·서류 탭 진입 케이스 = '여정(목적지) 있는 동물'만. 목적지 다 지운 동물은 제외 —
  // lastCaseId 가 여정 케이스가 아니면(삭제됐거나 목적지 0개) 첫 여정 케이스로 폴백한다.
  // (동물 상세에서 마지막 목적지를 지우면, 일정 탭이 자동으로 다른 여정 동물로 전환됨.)
  // 여정 케이스가 하나도 없으면 null → /cases 가 '준비 중인 여정 없음' 빈 상태를 보여준다.
  const journeyCases = cases.filter(hasJourney)
  const lastIdValid = lastCaseId && journeyCases.some((c) => c.id === lastCaseId)
  const fallbackId = lastIdValid ? lastCaseId : journeyCases[0]?.id ?? null
  const caseId = caseIdInPath ?? fallbackId

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
        background: 'rgb(var(--pm-bg-rgb) / 0.60)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(42, 38, 32, 0.06)',
        boxShadow:
          '0 12px 28px -10px rgba(0, 0, 0, 0.16),' +
          ' 0 2px 6px -2px rgba(0, 0, 0, 0.06)',
      }}
    >
      {TABS.map((t) => {
        const href = hrefFor(t.key, caseId, lastDest?.id === caseId ? lastDest.dest : null)
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

function hrefFor(key: Tab['key'], caseId: string | null, dest: string | null): string {
  if (key === 'me') return '/me'
  if (key === 'services') return '/services'
  if (!caseId) return '/cases'
  return `/cases/${caseId}/${key}${dest ? `?dest=${encodeURIComponent(dest)}` : ''}`
}

function isActive(key: Tab['key'], pathname: string): boolean {
  if (key === 'me') return pathname === '/me' || pathname.startsWith('/me/')
  if (key === 'services') return pathname === '/services' || pathname.startsWith('/services/')
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
    case 'grid':
      return (
        <svg {...p}>
          <rect x="4" y="4" width="7" height="7" rx="1.6" />
          <rect x="13" y="4" width="7" height="7" rx="1.6" />
          <rect x="4" y="13" width="7" height="7" rx="1.6" />
          <rect x="13" y="13" width="7" height="7" rx="1.6" />
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
