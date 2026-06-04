'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'
import { avatarGlyph, avatarGradient, avatarIsEmoji } from '@/lib/avatar'
import { useCases } from './case-data-provider'

/**
 * 상단바 바로 아래 동물 전환 영역.
 *
 * 좌측 정렬:
 *   1) 활성 동물 — 56px 아바타 + 이름(16, weight 600)
 *   2) 비활성 동물들 — 32px 아바타만 (가로 스크롤)
 *
 * 케이스 1건이면 영역 자체 숨김. sticky top: safe-area + 48px 라 스크롤 시
 * 상단바 바로 아래에 붙어 있음. 색은 cases 배열 index 기반 — TopBar 우측 작은
 * 아바타와 같은 색 유지.
 *
 * 클릭 시 현재 탭(journey/docs/info) 유지하며 caseId 만 교체.
 */

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

function currentTab(pathname: string): 'journey' | 'docs' | 'info' {
  if (pathname.includes('/docs')) return 'docs'
  if (pathname.includes('/info')) return 'info'
  return 'journey'
}

export function PetSwitcher() {
  const pathname = usePathname()
  const { cases } = useCases()
  const activeCaseId = caseIdFromPath(pathname)

  if (cases.length < 2) return null

  const activeIdx = cases.findIndex((c) => c.id === activeCaseId)
  const active = activeIdx >= 0 ? cases[activeIdx] : cases[0]
  const activeIndex = activeIdx >= 0 ? activeIdx : 0
  const others = cases
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.id !== active.id)
  const tab = currentTab(pathname)

  return (
    <div
      className="pm-noscroll"
      style={{
        position: 'sticky',
        top: 'calc(env(safe-area-inset-top, 0px) + 48px)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 22px 10px',
        background:
          'linear-gradient(180deg, rgb(var(--pm-bg-rgb) / .85) 0%, rgb(var(--pm-bg-rgb) / .70) 70%, rgb(var(--pm-bg-rgb) / .50) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflowX: 'auto',
      }}
    >
      {/* 활성 동물 — 아바타(56) + 이름. 클릭 대상 아님(이미 선택됨). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          paddingRight: 6,
        }}
      >
        <AvatarBubble c={active} size={56} index={activeIndex} active />
        <span
          style={{
            fontFamily: 'var(--pm-font-display)',
            fontWeight: 600,
            fontSize: 16,
            color: 'var(--pm-ink)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {active.pet_name ?? '동물'}
        </span>
      </div>
      {/* 비활성 동물들 — 32px 아바타만. */}
      {others.map(({ c, i }) => (
        <Link
          key={c.id}
          href={`/cases/${c.id}/${tab}`}
          prefetch
          aria-label={c.pet_name ?? '케이스'}
          title={c.pet_name ?? '케이스'}
          className="pm-pressable"
          style={{
            flexShrink: 0,
            textDecoration: 'none',
            display: 'inline-flex',
          }}
        >
          <AvatarBubble c={c} size={32} index={i} />
        </Link>
      ))}
    </div>
  )
}

function AvatarBubble({
  c,
  size,
  index,
  active = false,
}: {
  c: CaseRow
  size: number
  index: number
  active?: boolean
}) {
  const isEmoji = avatarIsEmoji(c)
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarGradient(c, index),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#fff',
        fontFamily: isEmoji
          ? "-apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
          : 'var(--pm-font-display)',
        fontWeight: 600,
        fontSize: isEmoji ? Math.round(size * 0.55) : Math.round(size * 0.4),
        lineHeight: 1,
        opacity: active ? 1 : 0.55,
        boxShadow: active
          ? '0 0 0 1.5px var(--pm-ring-bg), 0 0 0 3px var(--pm-ring-accent), 0 1px 2px rgb(var(--pm-ink-rgb) / .10)'
          : 'inset 0 1px 1px rgba(255,255,255,.25)',
        transition: 'opacity .2s, box-shadow .2s',
      }}
    >
      {avatarGlyph(c)}
    </span>
  )
}
